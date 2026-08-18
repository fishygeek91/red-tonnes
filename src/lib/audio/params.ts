/**
 * Map simulation state onto a small set of audio-bed parameters.
 * Pure numbers — no AudioContext — so the smoke test can check that a
 * storm is louder than a clear sol and a blackout kills the plant hum.
 */

import type { SimState, SolSnapshot } from '../sim/state';

/** Everything the WebAudio bed needs to set, per frame. */
export interface AudioParams {
  /** Thin-atmosphere wind level, 0–1. */
  readonly windGain: number;
  /** Wind bandpass cutoff, Hz (falls as the storm thickens). */
  readonly windCutoffHz: number;
  /** ISRU / plant hum level, 0–1. */
  readonly humGain: number;
  /** Hum fundamental, Hz. */
  readonly humHz: number;
  /** Life-support tone level — dies in a blackout. */
  readonly lifeGain: number;
}

/** Clamp a number to [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Snapshot under the playhead, or the latest, or null on a brand-new city. */
function viewSnap(s: SimState, viewSol: number | null): SolSnapshot | null {
  if (s.history.length === 0) {
    return null;
  }
  if (viewSol === null) {
    return s.history[s.history.length - 1];
  }
  // History is one snap per sol starting at sol 1; index is sol-1.
  const idx = clamp(viewSol - 1, 0, s.history.length - 1);
  return s.history[idx];
}

/**
 * Derive the audio bed from the city under the playhead. `viewSol` follows
 * the scrubber so rewinding the city also rewinds the weather you hear.
 */
export function audioParamsFromState(s: SimState, viewSol: number | null = null): AudioParams {
  const snap = viewSnap(s, viewSol);
  const tau = snap ? snap.tau : 0.4;
  const storm = clamp((tau - 0.4) / 4.6, 0, 1);
  const demand = snap ? snap.powerDemandKwe : 1;
  const supply = snap ? snap.powerAvailKwe : 1;
  const powerFrac = demand > 0 ? clamp(supply / demand, 0, 1.2) : 1;

  // Methalox climb rate (kg/sol) from the previous snap, if any.
  let climb = 0;
  if (snap !== null && s.history.length >= 2) {
    const prevIdx = clamp(snap.sol - 2, 0, s.history.length - 1);
    const prev = s.history[prevIdx];
    if (prev.sol < snap.sol) {
      climb = snap.methaloxKg - prev.methaloxKg;
    }
  }
  const isru = clamp(climb / 2500, 0, 1);
  const blacked = s.endState === 'DUST YEAR BLACKOUT';
  const starved = s.endState === 'STARVED';

  return {
    windGain: 0.035 + storm * 0.2,
    windCutoffHz: 780 - storm * 460,
    humGain: blacked || starved ? 0 : 0.028 * clamp(powerFrac, 0, 1) * (0.3 + 0.7 * isru),
    humHz: 47 + (1 - clamp(powerFrac, 0, 1)) * 8,
    lifeGain: blacked ? 0 : 0.012 * clamp(powerFrac, 0.15, 1),
  };
}
