'use client';

/**
 * Trends drawer: small-multiple charts over the full per-sol history.
 * The sim records 13 metrics every sol; this is where they become legible.
 * Every chart is scrubbable — click or drag on any of them to rewind the
 * whole UI (and the 3D city) to that sol.
 */

import { useMemo } from 'react';
import { SOLS_PER_SYNODIC_WINDOW } from '../lib/constants';
import type { SolSnapshot } from '../lib/sim/state';
import { useSimStore } from '../store/useSimStore';

/** Chart plot-area size in viewBox units (text lives outside this box). */
const W = 200;
const H = 52;

/** Max points drawn per series; longer histories are stride-sampled. */
const MAX_POINTS = 240;

/** One line on a chart. */
interface Series {
  /** Legend label. */
  readonly label: string;
  /** Stroke color (CSS value). */
  readonly color: string;
  /** One value per sampled snapshot. */
  readonly values: readonly number[];
}

/** Build an SVG path across the plot area for one series. */
function linePath(values: readonly number[], min: number, max: number): string {
  if (values.length < 2) {
    return '';
  }
  const span = Math.max(1e-9, max - min);
  const dx = W / (values.length - 1);
  return values
    .map((v, i) => {
      const y = H - ((Math.min(Math.max(v, min), max) - min) / span) * H;
      return `${i === 0 ? 'M' : 'L'}${(i * dx).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Compact number formatting for chart legends and axis hints. */
function fmt(v: number): string {
  if (Math.abs(v) >= 1000) {
    return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  }
  if (Math.abs(v) >= 10) {
    return v.toFixed(0);
  }
  return v.toFixed(1);
}

/** One scrubbable small-multiple chart. */
function Chart(props: {
  title: string;
  unit: string;
  series: readonly Series[];
  /** Optional dashed reference line (a target or quota) in data units. */
  refValue?: number;
  refLabel?: string;
  maxSol: number;
  viewSol: number;
  onScrub: (sol: number) => void;
}): React.ReactElement {
  const { series, refValue } = props;
  // Shared y-range across the chart's series (plus the reference line).
  let min = Infinity;
  let max = -Infinity;
  for (const s of series) {
    for (const v of s.values) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  if (refValue !== undefined) {
    min = Math.min(min, refValue);
    max = Math.max(max, refValue);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (max - min < 1e-9) {
    max = min + 1;
  }
  // Anchor at zero when the data lives near it — fills read better from 0.
  if (min > 0 && min < max * 0.35) {
    min = 0;
  }
  // Pad the range so flat series render inside the box, not on its edges.
  const padY = (max - min) * 0.08;
  max += padY;
  if (min > 0) {
    min = Math.max(0, min - padY);
  } else if (min < 0) {
    min -= padY;
  }

  const scrubFromEvent = (e: React.PointerEvent<SVGSVGElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)));
    props.onScrub(Math.round(frac * props.maxSol));
  };

  const cursorX = (Math.min(props.viewSol, props.maxSol) / Math.max(1, props.maxSol)) * W;
  const span = Math.max(1e-9, max - min);
  const refY = refValue === undefined ? 0 : H - ((refValue - min) / span) * H;
  const windows = Math.floor(props.maxSol / SOLS_PER_SYNODIC_WINDOW);

  // Legend shows the value under the cursor (the viewed sol), not the latest.
  const n = series[0]?.values.length ?? 0;
  const idx = n > 1 ? Math.min(n - 1, Math.round((props.viewSol / Math.max(1, props.maxSol)) * (n - 1))) : 0;

  return (
    <div className="min-w-0">
      <div className="flex justify-between items-baseline mb-0.5">
        <span className="panel-title">{props.title}</span>
        <span className="num text-[9px] text-[var(--dim)]">
          {series.map((s, k) => (
            <span key={s.label} className={k > 0 ? 'ml-2' : ''} style={{ color: s.color }}>
              {s.label} {n > 0 ? fmt(s.values[idx]) : '–'}
            </span>
          ))}
          <span className="ml-1 text-[var(--dim)]">{props.unit}</span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-16 border border-[var(--line)] bg-black/20 cursor-crosshair touch-none"
        onPointerDown={scrubFromEvent}
        onPointerMove={(e) => {
          if (e.buttons === 1) {
            scrubFromEvent(e);
          }
        }}
      >
        {/* synodic window boundaries */}
        {Array.from({ length: windows }, (_, i) => {
          const x = (((i + 1) * SOLS_PER_SYNODIC_WINDOW) / Math.max(1, props.maxSol)) * W;
          return <line key={i} x1={x} y1={0} x2={x} y2={H} stroke="var(--line)" strokeWidth={0.6} />;
        })}
        {refValue !== undefined ? (
          <line x1={0} y1={refY} x2={W} y2={refY} stroke="var(--dim)" strokeWidth={0.6} strokeDasharray="3 3" />
        ) : null}
        {series.map((s) => (
          <path key={s.label} d={linePath(s.values, min, max)} fill="none" stroke={s.color} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
        ))}
        {/* viewed-sol cursor */}
        <line x1={cursorX} y1={0} x2={cursorX} y2={H} stroke="var(--rust-hot)" strokeWidth={0.8} opacity={0.85} />
      </svg>
      <div className="flex justify-between text-[8px] num text-[var(--dim)] leading-tight">
        <span>{fmt(min)}</span>
        {props.refLabel !== undefined ? <span>{props.refLabel}</span> : null}
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
}

/** Stride-sample the history so charts stay cheap on multi-window runs. */
function sample(history: readonly SolSnapshot[]): readonly SolSnapshot[] {
  if (history.length <= MAX_POINTS) {
    return history;
  }
  const stride = Math.ceil(history.length / MAX_POINTS);
  const out: SolSnapshot[] = [];
  for (let i = 0; i < history.length; i += stride) {
    out.push(history[i]);
  }
  // Always keep the newest point so "now" is on every chart.
  if (out[out.length - 1] !== history[history.length - 1]) {
    out.push(history[history.length - 1]);
  }
  return out;
}

/** The drawer itself: six charts over the whole run. */
export function TrendsPanel(): React.ReactElement | null {
  const sim = useSimStore((s) => s.sim);
  const showTrends = useSimStore((s) => s.showTrends);
  const scrubSol = useSimStore((s) => s.scrubSol);
  const setScrubSol = useSimStore((s) => s.setScrubSol);

  const h = useMemo(() => sample(sim.history), [sim.history]);

  if (!showTrends) {
    return null;
  }
  if (h.length < 2) {
    return (
      <div className="panel border-t border-[var(--line)] px-3 py-4 text-[10px] text-[var(--dim)]">
        Trends need a little history — let a few sols run.
      </div>
    );
  }

  const maxSol = sim.sol;
  const viewSol = scrubSol ?? sim.sol;
  const onScrub = (sol: number): void => {
    setScrubSol(sol >= sim.sol ? null : Math.max(0, sol));
  };
  const quotaT = sim.params.methaloxPerShipT * sim.params.returnShipsPerWindow;

  return (
    <div className="panel border-t border-[var(--line)] px-3 pt-2 pb-1">
      <div className="grid grid-cols-3 gap-x-4 gap-y-1">
        <Chart
          title="Power"
          unit="kWe"
          maxSol={maxSol}
          viewSol={viewSol}
          onScrub={onScrub}
          series={[
            { label: 'supply', color: 'var(--rust-hot)', values: h.map((x) => x.powerAvailKwe) },
            { label: 'demand', color: 'var(--ice)', values: h.map((x) => x.powerDemandKwe) },
          ]}
        />
        <Chart
          title="Methalox"
          unit="t"
          maxSol={maxSol}
          viewSol={viewSol}
          onScrub={onScrub}
          refValue={quotaT}
          refLabel={`departure quota ${quotaT.toFixed(0)} t`}
          series={[{ label: 'banked', color: 'var(--ice)', values: h.map((x) => x.methaloxKg / 1000) }]}
        />
        <Chart
          title="Calories"
          unit="kcal/p/sol"
          maxSol={maxSol}
          viewSol={viewSol}
          onScrub={onScrub}
          refValue={3000}
          refLabel="need 3,000"
          series={[{ label: 'eaten', color: 'var(--green)', values: h.map((x) => x.kcalPerPersonSol) }]}
        />
        <Chart
          title="Dust & water"
          unit="τ · t"
          maxSol={maxSol}
          viewSol={viewSol}
          onScrub={onScrub}
          series={[
            { label: 'τ×10', color: 'var(--warn)', values: h.map((x) => x.tau * 10) },
            { label: 'water t', color: 'var(--ice)', values: h.map((x) => x.waterKg / 1000) },
          ]}
        />
        <Chart
          title="Loop closing"
          unit="%"
          maxSol={maxSol}
          viewSol={viewSol}
          onScrub={onScrub}
          series={[
            { label: 'self-suff', color: 'var(--green)', values: h.map((x) => x.selfSufficiency * 100) },
            { label: 'Earth food', color: 'var(--warn)', values: h.map((x) => x.earthFoodFraction * 100) },
          ]}
        />
        <Chart
          title="Nutrient loop"
          unit="kg"
          maxSol={maxSol}
          viewSol={viewSol}
          onScrub={onScrub}
          series={[
            { label: 'N pool', color: 'var(--green)', values: h.map((x) => x.nitrogenKg) },
            { label: 'compost', color: 'var(--rust-hot)', values: h.map((x) => x.compostKg) },
          ]}
        />
      </div>
      <div className="text-[8px] text-[var(--dim)] text-center pt-0.5">
        click or drag any chart to scrub the whole city back in time · vertical lines are synodic windows
      </div>
    </div>
  );
}
