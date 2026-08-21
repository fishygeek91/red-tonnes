'use client';

/**
 * The real window mass-flow Sankey (replacing the earlier bar-chart stand-in).
 * Left: the two mass sources — Earth cargo landed this window and mass made
 * on Mars. Right: where every kilogram went, by category. Ribbon thickness is
 * mass-true; the animated dashes give the flows their conveyor motion.
 * Categories fed by both sources (food, spares) show converging ribbons —
 * the whole point of the game rendered as one picture.
 */

import { sankeyFlows } from '../lib/sim/derive';
import type { SankeyFlow } from '../lib/sim/derive';
import { useSimStore } from '../store/useSimStore';

/** Format kg smartly: t above 10,000 kg. */
function fmtKg(kg: number): string {
  if (kg >= 10000) {
    return `${(kg / 1000).toFixed(1)} t`;
  }
  return `${kg.toFixed(0)} kg`;
}

/** One ribbon with its resolved vertical slice on both columns. */
interface Ribbon {
  readonly flow: SankeyFlow;
  /** Ribbon thickness, px. */
  readonly px: number;
  /** Vertical center on the source column. */
  readonly y0: number;
  /** Vertical center on the target column. */
  readonly y1: number;
}

/** A right-column category node. */
interface TargetNode {
  readonly label: string;
  readonly totalKg: number;
  readonly y: number;
  readonly height: number;
}

/** A left-column source node (Earth cargo / made on Mars). */
interface SourceNode {
  readonly kind: SankeyFlow['kind'];
  readonly totalKg: number;
  readonly y: number;
  readonly height: number;
}

/** Full computed layout. */
interface SankeyLayout {
  readonly ribbons: Ribbon[];
  readonly sources: SourceNode[];
  readonly targets: TargetNode[];
  readonly height: number;
}

// Geometry constants (panel inner width ~316 px).
const WIDTH = 316;
const LEFT_X = 4;
const RIGHT_X = 204;
const BAR_W = 8;
const PAD = 6;
const SOURCE_GAP = 16;
const TARGET_GAP = 6;
/** Ribbon mass budget: the tallest column's ribbons sum to about this. */
const TARGET_COLUMN_PX = 170;
/** Thinnest visible ribbon, px. */
const MIN_RIBBON_PX = 1.5;
/** Thinnest right-node bar so its label stays legible, px. */
const MIN_TARGET_PX = 9;

/** Compute the full layout from the window's flows. Pure. */
function layoutSankey(flows: SankeyFlow[]): SankeyLayout {
  const totalKg = flows.reduce((a, f) => a + f.kg, 0);
  const scale = TARGET_COLUMN_PX / Math.max(1, totalKg);
  const pxOf = (kg: number): number => Math.max(MIN_RIBBON_PX, kg * scale);

  // Right column: one node per category, sorted by total mass descending.
  const totals = new Map<string, number>();
  for (const f of flows) {
    totals.set(f.label, (totals.get(f.label) ?? 0) + f.kg);
  }
  const targetLabels = [...totals.keys()].sort(
    (a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0),
  );
  const targetIndex = new Map(targetLabels.map((l, i) => [l, i]));

  // Flow order: within each source, top-to-bottom by target position
  // (minimizes crossings); within each target, Earth cargo enters first.
  const ordered = (kind: SankeyFlow['kind']): SankeyFlow[] =>
    flows
      .filter((f) => f.kind === kind)
      .sort((a, b) => (targetIndex.get(a.label) ?? 0) - (targetIndex.get(b.label) ?? 0));
  const imported = ordered('imported');
  const produced = ordered('produced');

  // Left column: stack Earth cargo, a gap, then Mars production.
  const sources: SourceNode[] = [];
  const y0Of = new Map<SankeyFlow, number>();
  let y = PAD;
  for (const [kind, group] of [
    ['imported', imported],
    ['produced', produced],
  ] as const) {
    const start = y;
    for (const f of group) {
      const px = pxOf(f.kg);
      y0Of.set(f, y + px / 2);
      y += px;
    }
    if (group.length > 0) {
      sources.push({
        kind,
        totalKg: group.reduce((a, f) => a + f.kg, 0),
        y: start,
        height: y - start,
      });
      y += SOURCE_GAP;
    }
  }
  const leftEnd = y - (sources.length > 0 ? SOURCE_GAP : 0) + PAD;

  // Right column: per-category bars; ribbons centered inside each bar.
  const targets: TargetNode[] = [];
  const y1Of = new Map<SankeyFlow, number>();
  let ty = PAD;
  for (const label of targetLabels) {
    const inbound = [...imported, ...produced].filter((f) => f.label === label);
    const ribbonSum = inbound.reduce((a, f) => a + pxOf(f.kg), 0);
    const barH = Math.max(ribbonSum, MIN_TARGET_PX);
    let inner = ty + (barH - ribbonSum) / 2;
    for (const f of inbound) {
      const px = pxOf(f.kg);
      y1Of.set(f, inner + px / 2);
      inner += px;
    }
    targets.push({ label, totalKg: totals.get(label) ?? 0, y: ty, height: barH });
    ty += barH + TARGET_GAP;
  }
  const rightEnd = ty - (targets.length > 0 ? TARGET_GAP : 0) + PAD;

  const ribbons: Ribbon[] = flows.map((f) => ({
    flow: f,
    px: pxOf(f.kg),
    y0: y0Of.get(f) ?? PAD,
    y1: y1Of.get(f) ?? PAD,
  }));
  return { ribbons, sources, targets, height: Math.max(leftEnd, rightEnd) };
}

/** Cubic ribbon path from the source bar edge to the target bar edge. */
function ribbonPath(y0: number, y1: number): string {
  const x0 = LEFT_X + BAR_W;
  const x1 = RIGHT_X;
  const bend = (x1 - x0) * 0.45;
  return `M ${x0} ${y0} C ${x0 + bend} ${y0}, ${x1 - bend} ${y1}, ${x1} ${y1}`;
}

/** The Sankey panel section. */
export function WindowSankey(): React.ReactElement {
  const sim = useSimStore((s) => s.sim);
  const flows = sankeyFlows(sim);

  if (flows.length === 0) {
    return <div className="text-[10px] text-[var(--dim)]">No mass moved yet this window.</div>;
  }
  const layout = layoutSankey(flows);

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${layout.height}`}
        width="100%"
        role="img"
        aria-label="Mass flow this window: Earth cargo and local production into city categories"
      >
        {/* Ribbons first so the node bars draw over their ends. */}
        {layout.ribbons.map((r) => (
          <path
            key={`${r.flow.kind}-${r.flow.label}`}
            d={ribbonPath(r.y0, r.y1)}
            fill="none"
            stroke={r.flow.kind === 'imported' ? 'var(--rust)' : 'var(--green)'}
            strokeWidth={r.px}
            className="sankey-ribbon"
            tabIndex={0}
          >
            <title>
              {`${r.flow.kind === 'imported' ? 'Earth cargo' : 'Made on Mars'} → ${r.flow.label}: ${fmtKg(r.flow.kg)}`}
            </title>
          </path>
        ))}

        {layout.sources.map((s) => (
          <rect
            key={s.kind}
            x={LEFT_X}
            y={s.y}
            width={BAR_W}
            height={Math.max(2, s.height)}
            fill={s.kind === 'imported' ? 'var(--rust)' : 'var(--green)'}
          >
            <title>
              {`${s.kind === 'imported' ? 'Earth cargo landed' : 'Made on Mars'} this window: ${fmtKg(s.totalKg)}`}
            </title>
          </rect>
        ))}

        {layout.targets.map((t) => (
          <g key={t.label}>
            <rect
              x={RIGHT_X}
              y={t.y}
              width={BAR_W}
              height={t.height}
              fill="var(--panel-2)"
              stroke="var(--line)"
              strokeWidth={1}
            >
              <title>{`${t.label}: ${fmtKg(t.totalKg)} total this window`}</title>
            </rect>
            <text
              x={RIGHT_X + BAR_W + 5}
              y={t.y + t.height / 2}
              dominantBaseline="central"
              fontSize={8}
              fill="var(--dim)"
              className="uppercase"
              style={{ letterSpacing: '0.08em' }}
            >
              {t.label}
              <tspan fill="var(--text)"> {fmtKg(t.totalKg)}</tspan>
            </text>
          </g>
        ))}
      </svg>

      <div className="flex gap-3 pt-1 text-[9px] text-[var(--dim)]">
        <span>
          <span className="inline-block w-2 h-2 mr-1" style={{ background: 'var(--rust)' }} />
          Earth cargo
        </span>
        <span>
          <span className="inline-block w-2 h-2 mr-1" style={{ background: 'var(--green)' }} />
          Made on Mars
        </span>
      </div>
    </div>
  );
}
