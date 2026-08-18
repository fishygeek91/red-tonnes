/**
 * Run recording and replay for shareable permalinks.
 *
 * A run is fully reproducible from its setup (seed, site, template) plus a
 * sol-stamped list of player actions, because the engine in step.ts is a
 * pure function that only consumes RNG inside whole-sol steps: applying an
 * action via `step(state, 0, action)` never advances the RNG stream, so the
 * replayed history is bit-identical to the live one.
 */

import type { Manifest, ModelParams, SimState } from '../sim/state';
import { createInitialState } from '../sim/state';
import { step } from '../sim/step';

/** One recorded player input, applied at the start of the given sol. */
export interface RunAction {
  /** Sol at which the action was applied (sim.sol at dispatch time). */
  readonly sol: number;
  /** Crop-mix replacement, if any. */
  readonly cropMix?: Record<string, number>;
  /** Manifest edits keyed by window index, if any. */
  readonly manifests?: Record<number, Manifest>;
  /** Model-parameter slider changes, if any. */
  readonly params?: Partial<ModelParams>;
}

/** A complete, self-contained description of one run. */
export interface RunLog {
  /** Format version for forward compatibility. */
  readonly v: 1;
  /** RNG seed the run was created with. */
  readonly seed: number;
  /** Landing-site id. */
  readonly siteId: string;
  /** First-window manifest template id. */
  readonly templateId: string;
  /** Daily-challenge date key (YYYY-MM-DD) when the run is a daily. */
  readonly daily?: string;
  /** Sol-ordered player actions. */
  readonly actions: readonly RunAction[];
  /** Sol the run was shared at; replay advances to exactly this sol. */
  readonly finalSol: number;
}

/** Create a fresh, empty run log for a new game. */
export function emptyRunLog(
  seed: number,
  siteId: string,
  templateId: string,
  daily?: string,
): RunLog {
  return { v: 1, seed, siteId, templateId, daily, actions: [], finalSol: 0 };
}

/**
 * Merge two same-sol actions into one. Later fields win, matching the live
 * merge semantics in step.ts: cropMix replaces wholesale, manifests merge
 * per window key, params merge per field.
 */
function mergeSameSol(a: RunAction, b: RunAction): RunAction {
  const merged: {
    sol: number;
    cropMix?: Record<string, number>;
    manifests?: Record<number, Manifest>;
    params?: Partial<ModelParams>;
  } = { sol: a.sol };
  if (a.cropMix || b.cropMix) {
    merged.cropMix = b.cropMix ?? a.cropMix;
  }
  if (a.manifests || b.manifests) {
    merged.manifests = { ...(a.manifests ?? {}), ...(b.manifests ?? {}) };
  }
  if (a.params || b.params) {
    merged.params = { ...(a.params ?? {}), ...(b.params ?? {}) };
  }
  return merged;
}

/**
 * Append an action to a run log, collapsing repeated edits on the same sol
 * into a single entry so slider drags do not bloat the permalink.
 */
export function appendRunAction(log: RunLog, action: RunAction): RunLog {
  const last = log.actions[log.actions.length - 1];
  if (last && last.sol === action.sol) {
    return {
      ...log,
      actions: [...log.actions.slice(0, -1), mergeSameSol(last, action)],
    };
  }
  return { ...log, actions: [...log.actions, action] };
}

/**
 * Reconstruct the exact end state of a recorded run.
 * Walks sol-by-sol: advance to each action's sol, apply it with dtSols = 0
 * (no RNG consumed), then advance the remaining sols to `finalSol`.
 */
export function replayRun(log: RunLog): SimState {
  let s = createInitialState({
    seed: log.seed,
    siteId: log.siteId,
    templateId: log.templateId,
  });
  for (const action of log.actions) {
    const gap = Math.floor(action.sol) - s.sol;
    if (gap > 0) {
      s = step(s, gap, {});
    }
    s = step(s, 0, {
      cropMix: action.cropMix,
      manifests: action.manifests,
      params: action.params,
    });
  }
  const tail = Math.floor(log.finalSol) - s.sol;
  if (tail > 0) {
    s = step(s, tail, {});
  }
  return s;
}
