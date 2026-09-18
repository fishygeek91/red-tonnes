"use client";

/**
 * Flight Director HUD: the forecast panel.
 *
 * Forks the live state and runs the REAL engine one synodic window ahead
 * (src/lib/sim/forecast.ts), then reads out what will actually happen if the
 * player does nothing: the departure verdict, the fuel-ready sol, hunger
 * onset, and any storm on the deterministic climate. A dashed sparkline draws
 * the projected methalox climb against the quota with the burn sol marked.
 *
 * Desktop: floats top-right over the city. Phone: lives in the Status sheet.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Forecast, ForecastDelta, ForecastTone } from "../lib/sim/forecast";
import { diffForecasts, forecastHorizonSols, runForecast } from "../lib/sim/forecast";
import { useSimStore } from "../store/useSimStore";

/** Recompute cadence, sols: the forecast refreshes when the clock crosses a bucket (and shortly after any player action, via the action-key deps). */
const REFRESH_SOLS = 20;

/** Refresh bucket at 60×: one projection per real second instead of three. */
const REFRESH_SOLS_FAST = 60;

/** Debounce for recomputes, ms: a slider drag coalesces into one engine run. */
const RECOMPUTE_DEBOUNCE_MS = 250;

/** A forecast plus the inputs it was computed from (for delta attribution). */
interface ComputedForecast {
  /** The projection. */
  readonly forecast: Forecast;
  /** The action key in force when it was computed. */
  readonly key: string;
  /** The run seed it belongs to. */
  readonly seed: number;
}

/** Sparkline plot-area size in viewBox units. */
const SPARK_W = 200;
const SPARK_H = 34;
/** Max points drawn on the sparkline; longer projections are stride-sampled. */
const SPARK_POINTS = 120;

/** Map a finding tone to its theme color. */
function toneColor(tone: ForecastTone): string {
  if (tone === "good") {
    return "var(--green)";
  }
  if (tone === "warn") {
    return "var(--warn)";
  }
  return "var(--rust-hot)";
}

/** Verdict chip label + color for the panel header. */
function verdictChip(f: Forecast): { label: string; color: string } {
  if (f.verdict === "burn") {
    return { label: "ON TRACK", color: "var(--green)" };
  }
  if (f.verdict === "miss") {
    return { label: "BURN AT RISK", color: "var(--warn)" };
  }
  if (f.verdict === "lost") {
    return { label: "CITY LOST", color: "var(--rust-hot)" };
  }
  return { label: "LONG RANGE", color: "var(--dim)" };
}

/**
 * Projected-methalox sparkline: dashed engine projection, dotted quota line,
 * and a vertical marker on the departure-burn sol.
 * @param props.forecast - The current forecast.
 */
function FuelProjection(props: { forecast: Forecast }): React.ReactElement | null {
  const f = props.forecast;
  if (f.snapshots.length < 2) {
    return null;
  }
  // Stride-sample so multi-window projections stay cheap to draw.
  const stride = Math.max(1, Math.ceil(f.snapshots.length / SPARK_POINTS));
  const pts: Array<{ sol: number; t: number }> = [];
  for (let i = 0; i < f.snapshots.length; i += stride) {
    pts.push({ sol: f.snapshots[i].sol, t: f.snapshots[i].methaloxKg / 1000 });
  }
  const last = f.snapshots[f.snapshots.length - 1];
  if (pts[pts.length - 1].sol !== last.sol) {
    pts.push({ sol: last.sol, t: last.methaloxKg / 1000 });
  }
  const quotaT = f.quotaKg / 1000;
  const maxT = Math.max(quotaT, ...pts.map((p) => p.t)) * 1.08 || 1;
  const solSpan = Math.max(1, last.sol - f.fromSol);
  const x = (sol: number): number => ((sol - f.fromSol) / solSpan) * SPARK_W;
  const y = (t: number): number => SPARK_H - (Math.min(t, maxT) / maxT) * SPARK_H;
  const path = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.sol).toFixed(1)},${y(p.t).toFixed(1)}`)
    .join(" ");
  const quotaY = y(quotaT);
  const burnInside = f.nextDepartureSol >= f.fromSol && f.nextDepartureSol <= last.sol;

  return (
    <div>
      <svg
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        preserveAspectRatio="none"
        className="w-full h-10 border border-[var(--line)] bg-black/20"
        aria-label="Projected methalox versus departure quota"
      >
        <line x1={0} y1={quotaY} x2={SPARK_W} y2={quotaY} stroke="var(--dim)" strokeWidth={0.6} strokeDasharray="2 3" />
        {burnInside ? (
          <line
            x1={x(f.nextDepartureSol)}
            y1={0}
            x2={x(f.nextDepartureSol)}
            y2={SPARK_H}
            stroke="var(--rust-hot)"
            strokeWidth={0.8}
            opacity={0.8}
          />
        ) : null}
        <path d={path} fill="none" stroke="var(--ice)" strokeWidth={1.1} strokeDasharray="4 3" opacity={0.9} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[8px] num text-[var(--dim)] leading-tight">
        <span>projected methalox · dashed = engine forecast</span>
        <span>quota {quotaT.toFixed(0)} t · burn s{f.nextDepartureSol}</span>
      </div>
    </div>
  );
}

/**
 * The Flight Director panel.
 * @param props.docked - Render as a docked block (phone Status sheet) instead
 * of the floating desktop overlay.
 */
export function FlightDirector(props: { docked?: boolean } = {}): React.ReactElement | null {
  const sim = useSimStore((s) => s.sim);
  const speed = useSimStore((s) => s.speed);
  const playing = useSimStore((s) => s.playing);
  const ghost = useSimStore((s) => s.ghost);
  const sharedNotice = useSimStore((s) => s.sharedNotice);
  // During a ghost race the race HUD owns the spotlight (and, on smaller
  // desktop windows, the same strip of screen): collapse when a race starts.
  // Render-time state adjustment (the React-endorsed pattern), not an effect.
  const [collapsed, setCollapsed] = useState(false);
  const ghostActive = ghost !== null;
  const [wasGhostActive, setWasGhostActive] = useState(ghostActive);
  if (ghostActive !== wasGhostActive) {
    setWasGhostActive(ghostActive);
    if (ghostActive) {
      setCollapsed(true);
    }
  }

  // Refresh keys: the sol bucket (time passing) plus every player-actionable
  // input, stringified so the deep-cloned objects compare by value.
  const bucketSols = playing && speed >= REFRESH_SOLS_FAST ? REFRESH_SOLS_FAST : REFRESH_SOLS;
  const solBucket = Math.floor(sim.sol / bucketSols);
  const actionKey = useMemo(
    () =>
      JSON.stringify([sim.structures, sim.params, sim.cropMix, sim.manifests, sim.population, sim.endState, sim.seed]),
    [sim.structures, sim.params, sim.cropMix, sim.manifests, sim.population, sim.endState, sim.seed],
  );

  // The projection runs the full engine up to two windows ahead, so it is
  // debounced: a slider drag (dozens of input events per second) coalesces
  // into ONE engine run shortly after the drag settles, never one per event.
  // The callback reads the LIVE state from the store, so the projection is
  // always taken from the newest sol even after the debounce delay.
  const [computed, setComputed] = useState<ComputedForecast>(() => ({
    forecast: runForecast(sim, forecastHorizonSols(sim.sol)),
    key: actionKey,
    seed: sim.seed,
  }));
  useEffect(() => {
    const t = window.setTimeout(() => {
      const live = useSimStore.getState().sim;
      setComputed({
        forecast: runForecast(live, forecastHorizonSols(live.sol)),
        key: JSON.stringify([live.structures, live.params, live.cropMix, live.manifests, live.population, live.endState, live.seed]),
        seed: live.seed,
      });
    }, RECOMPUTE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [solBucket, actionKey]);
  const forecast = computed.forecast;

  // ---- plan delta: what did the player's last order buy? --------------------
  // When a fresh projection lands under a NEW action key (a build, crop,
  // slider, or manifest order), diff it against the projection in force
  // before the order. Both are close in time, so the difference IS the
  // order's consequence.
  const prevRef = useRef<ComputedForecast | null>(null);
  const [delta, setDelta] = useState<{ delta: ForecastDelta; atSol: number } | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    if (prev !== null && prev.seed !== computed.seed) {
      setDelta(null); // new game: nothing to attribute
    } else if (
      prev !== null &&
      prev.key !== computed.key &&
      Math.abs(computed.forecast.fromSol - prev.forecast.fromSol) <= REFRESH_SOLS * 2
    ) {
      setDelta({ delta: diffForecasts(prev.forecast, computed.forecast), atSol: computed.forecast.fromSol });
    }
    prevRef.current = computed;
  }, [computed]);

  const lost =
    sim.endState === "STARVED" ||
    sim.endState === "STRANDED (NO METHALOX)" ||
    sim.endState === "DUST YEAR BLACKOUT";
  if (lost || sharedNotice) {
    return null; // the EndBanner / shared-run notice owns the screen
  }

  const chip = verdictChip(forecast);
  const burnIn = forecast.nextDepartureSol - sim.sol;

  const body = (
    <>
      <div className="num text-[10px] text-[var(--dim)] mb-1">
        Next departure burn <span className="text-[var(--text)]">sol {forecast.nextDepartureSol}</span>{" "}
        · T−{Math.max(0, burnIn)} sols
      </div>
      <FuelProjection forecast={forecast} />
      <ul className="mt-1.5 space-y-1">
        {forecast.findings.map((f) => (
          <li key={f.text} className="text-[10px] leading-snug flex gap-1.5">
            <span aria-hidden style={{ color: toneColor(f.tone) }}>
              ▸
            </span>
            <span className="text-[var(--text)]">{f.text}</span>
          </li>
        ))}
      </ul>
      {delta !== null ? (
        <div className="mt-1.5 border border-[var(--rust)] px-2 py-1">
          <div className="flex justify-between items-baseline">
            <span className="text-[9px] uppercase tracking-widest text-[var(--rust-hot)]">
              Your last order · s{delta.atSol}
            </span>
            <button
              type="button"
              onClick={() => setDelta(null)}
              className="text-[9px] text-[var(--dim)] hover:text-[var(--text)] px-1"
              aria-label="Dismiss the plan delta"
            >
              ×
            </button>
          </div>
          {delta.delta.changed ? (
            <ul className="space-y-0.5 mt-0.5">
              {delta.delta.lines.map((l) => (
                <li key={l.text} className="text-[10px] leading-snug flex gap-1.5">
                  <span aria-hidden style={{ color: toneColor(l.tone) }}>
                    {l.tone === "good" ? "▲" : l.tone === "bad" ? "▼" : "▸"}
                  </span>
                  <span className="text-[var(--text)]">{l.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[10px] text-[var(--dim)] mt-0.5">
              No measurable change to the forecast.
            </div>
          )}
        </div>
      ) : null}
      <div className="text-[8px] text-[var(--dim)] mt-1.5 border-t border-[var(--line)] pt-1">
        The engine itself, run {forecast.horizonSols} sols ahead with no new orders — deterministic, so this
        is what happens if you change nothing.
      </div>
    </>
  );

  if (props.docked === true) {
    return (
      <div className="panel border border-[var(--line)] px-3 py-2">
        <div className="flex justify-between items-baseline mb-1">
          <span className="panel-title">Flight Director</span>
          <span className="num text-[9px] tracking-widest" style={{ color: chip.color }}>
            {chip.label}
          </span>
        </div>
        {body}
      </div>
    );
  }

  return (
    <div className="absolute right-2 top-2 z-20 w-72 max-w-[calc(100%-1rem)]">
      <div className="panel border border-[var(--line)] px-3 py-2">
        <div className="flex justify-between items-baseline">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="panel-title hover:text-[var(--rust-hot)] cursor-pointer"
            title={collapsed ? "Expand the forecast" : "Collapse the forecast"}
          >
            Flight Director {collapsed ? "▸" : "▾"}
          </button>
          <span className="num text-[9px] tracking-widest" style={{ color: chip.color }}>
            {chip.label}
          </span>
        </div>
        {collapsed ? null : <div className="mt-1">{body}</div>}
      </div>
    </div>
  );
}
