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

import { useMemo, useState } from "react";
import type { Forecast, ForecastTone } from "../lib/sim/forecast";
import { forecastHorizonSols, runForecast } from "../lib/sim/forecast";
import { useSimStore } from "../store/useSimStore";

/** Recompute cadence, sols: the forecast refreshes when the clock crosses a bucket (and instantly on any player action, via the action-key deps). */
const REFRESH_SOLS = 20;

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
  const sharedNotice = useSimStore((s) => s.sharedNotice);
  const [collapsed, setCollapsed] = useState(false);

  // Refresh keys: the sol bucket (time passing) plus every player-actionable
  // input, stringified so the deep-cloned objects compare by value.
  const solBucket = Math.floor(sim.sol / REFRESH_SOLS);
  const actionKey = useMemo(
    () =>
      JSON.stringify([sim.structures, sim.params, sim.cropMix, sim.manifests, sim.population, sim.endState, sim.seed]),
    [sim.structures, sim.params, sim.cropMix, sim.manifests, sim.population, sim.endState, sim.seed],
  );

  const forecast = useMemo(
    () => runForecast(sim, forecastHorizonSols(sim.sol)),
    // `sim` is intentionally read fresh only when a key changes: recomputing a
    // 759-sol projection every rendered sol would be wasted work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [solBucket, actionKey],
  );

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
