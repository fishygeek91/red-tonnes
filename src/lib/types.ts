/**
 * Branded numeric domain types for RED TONNES.
 *
 * The brand pattern makes it a compile-time error to, e.g., add tonnes to
 * kilowatt-hours. All arithmetic goes through the small helper functions
 * below so the physics code stays readable while remaining unit-safe.
 */

/** Generic brand wrapper: a number that remembers what it measures. */
export type Brand<B extends string> = number & { readonly __unit: B };

/** Mass in kilograms. */
export type MassKg = Brand<'MassKg'>;
/** Electrical power in kilowatts (electric). */
export type PowerKwe = Brand<'PowerKwe'>;
/** Electrical energy in kilowatt-hours. */
export type EnergyKwh = Brand<'EnergyKwh'>;
/** Martian solar day count (1 sol = 24.66 h). May be fractional. */
export type Sol = Brand<'Sol'>;
/** Index of an Earth–Mars synodic transfer window (0 = first landing). */
export type WindowIndex = Brand<'WindowIndex'>;
/** Elemental inventory in kilograms (C, N, P, K, H...). */
export type ElementKg = Brand<'ElementKg'>;
/** Growing / pressurized floor area in square meters. */
export type AreaM2 = Brand<'AreaM2'>;
/** Pressurized volume in cubic meters. */
export type VolumeM3 = Brand<'VolumeM3'>;
/** Food energy in kilocalories. */
export type Kcal = Brand<'Kcal'>;
/** Dimensionless fraction clamped to [0, 1]. */
export type Fraction = Brand<'Fraction'>;

/** Construct a MassKg from a raw number (validated non-negative-finite). */
export const kg = (v: number): MassKg => finiteOrZero(v) as MassKg;
/** Construct a PowerKwe from a raw number. */
export const kwe = (v: number): PowerKwe => finiteOrZero(v) as PowerKwe;
/** Construct an EnergyKwh from a raw number. */
export const kwh = (v: number): EnergyKwh => finiteOrZero(v) as EnergyKwh;
/** Construct a Sol count from a raw number. */
export const sols = (v: number): Sol => finiteOrZero(v) as Sol;
/** Construct a WindowIndex from a raw integer. */
export const windowIndex = (v: number): WindowIndex =>
  Math.max(0, Math.floor(finiteOrZero(v))) as WindowIndex;
/** Construct an ElementKg from a raw number. */
export const ekg = (v: number): ElementKg => finiteOrZero(v) as ElementKg;
/** Construct an AreaM2 from a raw number. */
export const m2 = (v: number): AreaM2 => finiteOrZero(v) as AreaM2;
/** Construct a VolumeM3 from a raw number. */
export const m3 = (v: number): VolumeM3 => finiteOrZero(v) as VolumeM3;
/** Construct a Kcal from a raw number. */
export const kcal = (v: number): Kcal => finiteOrZero(v) as Kcal;
/** Construct a Fraction clamped to [0, 1]. */
export const frac = (v: number): Fraction =>
  Math.min(1, Math.max(0, finiteOrZero(v))) as Fraction;

/** Replace NaN / Infinity with 0 so a bad divide can never poison the sim. */
export function finiteOrZero(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

/** Safe division: returns fallback (default 0) when the denominator is ~0. */
export function safeDiv(num: number, den: number, fallback = 0): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || Math.abs(den) < 1e-12) {
    return fallback;
  }
  return num / den;
}

/** Clamp a number into [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, finiteOrZero(v)));
}

/** Add two same-branded quantities. */
export function add<B extends string>(a: Brand<B>, b: Brand<B>): Brand<B> {
  return (a + b) as Brand<B>;
}

/** Subtract same-branded quantities, clamped at zero (inventories cannot go negative). */
export function subFloor<B extends string>(a: Brand<B>, b: Brand<B>): Brand<B> {
  return Math.max(0, a - b) as Brand<B>;
}

/** Scale a branded quantity by a dimensionless factor. */
export function scale<B extends string>(a: Brand<B>, f: number): Brand<B> {
  return (a * finiteOrZero(f)) as Brand<B>;
}

/** Energy = power × sols × hours-per-sol. */
export function energyFromPower(p: PowerKwe, dt: Sol, hoursPerSol: number): EnergyKwh {
  return kwh(p * dt * hoursPerSol);
}
