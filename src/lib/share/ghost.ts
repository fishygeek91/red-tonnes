/**
 * Ghost racing over shared runs.
 *
 * A permalink already reconstructs the sharer's exact run (replayRun in
 * recording.ts), including its per-sol history snapshots and milestone
 * events. This module distills that replayed state into a read-only
 * GhostRun so a visitor can restart the same seed and race it live:
 * same storms, same windows, their own decisions.
 *
 * The ghost is pure derived data — nothing here touches the engine, the
 * codec, or the permalink format.
 */

import type { EndState, SimEvent, SimState, SolSnapshot } from '../sim/state';
import { getSite } from '../sites';
import { dayNumberOf } from './daily';
import type { RunLog } from './recording';

/** A read-only snapshot of a shared run, raced against the live sim. */
export interface GhostRun {
  /** HUD label, e.g. "Arcadia Planitia" or "Daily #230 — Utopia Planitia". */
  readonly label: string;
  /** Daily-challenge date key when the shared run was a daily. */
  readonly daily?: string;
  /** Per-sol snapshots of the shared run, ascending by sol. */
  readonly history: readonly SolSnapshot[];
  /** Milestone events of the shared run, ascending by sol. */
  readonly milestones: readonly SimEvent[];
  /** Outcome of the shared run ('' if it was still running when shared). */
  readonly endState: EndState;
  /** Sol the run was shared at; the ghost has no data past this. */
  readonly finalSol: number;
}

/**
 * Build a GhostRun from a shared run log and its replayed end state.
 * Arrays are copied so the ghost stays frozen even if the caller keeps
 * stepping the replayed state (step() clones-on-write, but the ghost must
 * not depend on that detail).
 */
export function ghostFromReplay(log: RunLog, replayed: SimState): GhostRun {
  const site = getSite(log.siteId);
  const label = log.daily ? `Daily #${dayNumberOf(log.daily)} — ${site.name}` : site.name;
  return {
    label,
    daily: log.daily,
    history: [...replayed.history],
    milestones: replayed.events.filter((e) => e.kind === 'milestone'),
    endState: replayed.endState,
    finalSol: log.finalSol,
  };
}

/**
 * Latest ghost snapshot at or before the given sol (binary search), or null
 * when the ghost has no data that early. Sols past finalSol clamp to the
 * ghost's last recorded snapshot.
 */
export function ghostSnapshotAt(ghost: GhostRun, sol: number): SolSnapshot | null {
  const h = ghost.history;
  if (h.length === 0 || sol < h[0].sol) {
    return null;
  }
  let lo = 0;
  let hi = h.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (h[mid].sol <= sol) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return h[lo];
}

/**
 * Pace on the fuel race: how many sols ahead (+) or behind (−) the player is,
 * measured as "when did the ghost first bank the fuel I have right now?".
 * Returns null when the player's tank exceeds everything the ghost ever
 * banked — strictly ahead.
 */
export function ghostFuelLeadSols(
  ghost: GhostRun,
  sol: number,
  methaloxKg: number,
): number | null {
  for (const snap of ghost.history) {
    if (snap.methaloxKg >= methaloxKg) {
      return snap.sol - sol;
    }
  }
  return null;
}

/** First sol a RETURN FUEL READY milestone fired in an event list, or null. */
function fuelReadySolOf(events: readonly SimEvent[]): number | null {
  const hit = events.find(
    (e) => e.kind === 'milestone' && e.text.startsWith('RETURN FUEL READY'),
  );
  return hit ? hit.sol : null;
}

/**
 * One-line race verdict for the scorecard, comparing when each side first
 * banked a full return load. Null while the race is still undecided.
 */
export function raceVerdict(ghost: GhostRun, sim: SimState): string | null {
  const yourSol = fuelReadySolOf(sim.events);
  const ghostSol = fuelReadySolOf(ghost.milestones);
  if (yourSol !== null && ghostSol !== null) {
    const delta = ghostSol - yourSol;
    if (delta > 0) {
      return `🏁 Beat the ghost by ${delta} sols`;
    }
    if (delta < 0) {
      return `🏁 Ghost won by ${-delta} sols`;
    }
    return '🏁 Dead heat with the ghost';
  }
  if (yourSol !== null) {
    return '🏁 You banked return fuel — the ghost never did';
  }
  // The ghost fueled and the player provably will not beat that sol.
  if (ghostSol !== null && (sim.endState !== '' || sim.sol > ghostSol)) {
    return `🏁 Ghost banked return fuel at sol ${ghostSol} — you haven't`;
  }
  return null;
}
