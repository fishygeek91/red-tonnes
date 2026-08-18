/**
 * Deterministic seeded RNG (mulberry32). Same seed + same call sequence
 * always yields the same stream, which keeps the whole simulation
 * reproducible: identical seed + identical inputs => identical history.
 */

/** Internal RNG state: a single 32-bit integer, advanced per draw. */
export interface RngState {
  /** Current 32-bit state word. */
  readonly s: number;
}

/** Create an RNG state from an arbitrary integer seed. */
export function rngFromSeed(seed: number): RngState {
  // Mix the seed once so nearby seeds diverge immediately.
  let s = (seed >>> 0) || 0x9e3779b9;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
  return { s };
}

/** Draw one uniform float in [0, 1) and return the advanced state. */
export function rngNext(state: RngState): { value: number; next: RngState } {
  let t = (state.s + 0x6d2b79f5) >>> 0;
  const next: RngState = { s: t };
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, next };
}

/** Draw a uniform float in [lo, hi). */
export function rngRange(
  state: RngState,
  lo: number,
  hi: number,
): { value: number; next: RngState } {
  const { value, next } = rngNext(state);
  return { value: lo + value * (hi - lo), next };
}
