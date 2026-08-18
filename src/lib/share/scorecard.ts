/**
 * Spoiler-free emoji scorecard for sharing a run. Built entirely from the
 * derived stats in derive.ts plus the end state — it names outcomes, not the
 * decisions that produced them, so the recipient can still play blind.
 */

import { missedWindowTest, topBarStats } from '../sim/derive';
import type { SimState } from '../sim/state';
import { getSite } from '../sites';
import { dayNumberOf } from './daily';

/** Options for scorecard rendering. */
export interface ScorecardOptions {
  /** Daily-challenge date key when the run is a daily. */
  readonly daily?: string;
  /** Permalink to append as the last line, if available. */
  readonly url?: string;
}

/** Outcome emoji per end state ('' = still running). */
const OUTCOME: Record<string, string> = {
  'RETURN FUEL READY': '🚀 RETURN FUEL READY',
  'SURVIVED 3 WINDOWS CLOSED-LOOP': '🌱 CLOSED THE LOOP',
  STARVED: '💀 STARVED',
  'STRANDED (NO METHALOX)': '🏜️ STRANDED',
  'DUST YEAR BLACKOUT': '🌑 BLACKOUT',
};

/** Render an n-slot progress bar of filled/empty squares. */
function bar(fraction: number, slots: number, filled: string, empty: string): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  const on = Math.round(clamped * slots);
  return filled.repeat(on) + empty.repeat(slots - on);
}

/** Build the shareable scorecard text for the current state. */
export function scorecard(s: SimState, opts: ScorecardOptions = {}): string {
  const t = topBarStats(s);
  const mw = missedWindowTest(s);
  const site = getSite(s.siteId);

  const header = opts.daily
    ? `RED TONNES Daily #${dayNumberOf(opts.daily)} — ${site.name}`
    : `RED TONNES — ${site.name}`;
  const outcome = OUTCOME[s.endState] ?? '🔴 STILL RUNNING';

  // Ships fuelable, capped at the return quota so the bar stays short.
  const quota = Math.max(1, s.params.returnShipsPerWindow);
  const shipsWhole = Math.min(quota, Math.floor(t.shipsFuelable));

  const lines: string[] = [
    header,
    `Sol ${s.sol} · Window ${s.window} · ${s.population} crew`,
    outcome,
    `Loop ${bar(t.selfSufficiency, 5, '🟩', '⬛')} ${(t.selfSufficiency * 100).toFixed(0)}%`,
    `Fuel ${'🚀'.repeat(shipsWhole)}${'⬛'.repeat(quota - shipsWhole)} ${t.shipsFuelable.toFixed(1)}/${quota} ships`,
    `2-window test ${mw.passes ? '✅' : '❌'}`,
  ];
  if (opts.url) {
    lines.push(opts.url);
  }
  return lines.join('\n');
}
