/**
 * Preset landing sites and simplified dust-storm optical-depth (tau) series.
 * Baked data — no live NASA APIs required. Values are geographically
 * plausible for each named region; depth/latitude/elevation are real-ish,
 * everything else is labeled ASSUMED in constants.ts terms.
 */

import { TAU_GLOBAL_STORM_PEAK, TAU_QUIET } from './constants';

/** A candidate landing/settlement site. */
export interface Site {
  /** Stable identifier. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Areocentric latitude, degrees (positive north). */
  readonly latitudeDeg: number;
  /** East longitude, degrees. */
  readonly longitudeDeg: number;
  /** Elevation relative to MOLA datum, meters (lower = more atmosphere for EDL and intake). */
  readonly elevationM: number;
  /** Depth of excavatable ice below surface, meters (drives mining energy multiplier). */
  readonly iceDepthM: number;
  /** Ice purity fraction of excavated mass. */
  readonly icePurity: number;
  /** Regional dustiness multiplier on tau excursions (1 = nominal). */
  readonly dustFactor: number;
  /** One-line rationale shown in the picker. */
  readonly blurb: string;
}

/** The preset site list. */
export const SITES: readonly Site[] = [
  {
    id: 'arcadia',
    name: 'Arcadia Planitia',
    latitudeDeg: 40.5,
    longitudeDeg: -168.0,
    elevationM: -3000,
    iceDepthM: 1.0,
    icePurity: 0.85,
    dustFactor: 1.0,
    blurb: 'Icy plain, shallow excess ice (SWIM survey class). The default: boring, flat, wet.',
  },
  {
    id: 'utopia',
    name: 'Utopia Planitia',
    latitudeDeg: 46.7,
    longitudeDeg: 117.5,
    elevationM: -4000,
    iceDepthM: 2.5,
    icePurity: 0.7,
    dustFactor: 1.1,
    blurb: 'Vast basin with buried ice sheets; deeper overburden, thicker air for landing.',
  },
  {
    id: 'erebus',
    name: 'Erebus Montes',
    latitudeDeg: 39.0,
    longitudeDeg: -174.0,
    elevationM: -3500,
    iceDepthM: 0.6,
    icePurity: 0.9,
    dustFactor: 1.05,
    blurb: 'SpaceX-studied candidate: very shallow clean ice between knobs.',
  },
  {
    id: 'hellas',
    name: 'Hellas Rim',
    latitudeDeg: -35.0,
    longitudeDeg: 65.0,
    elevationM: -6500,
    iceDepthM: 4.0,
    icePurity: 0.55,
    dustFactor: 1.4,
    blurb: 'Deepest air on Mars (better intake, easier EDL) but dusty and ice-poor.',
  },
  {
    id: 'jezero',
    name: 'Jezero Delta',
    latitudeDeg: 18.4,
    longitudeDeg: 77.7,
    elevationM: -2600,
    iceDepthM: 8.0,
    icePurity: 0.35,
    dustFactor: 0.95,
    blurb: 'Low latitude = best solar, worst ice. You will pay for water in kilowatts.',
  },
];

/** Look up a site by id, falling back to Arcadia. */
export function getSite(id: string): Site {
  const found = SITES.find((s) => s.id === id);
  return found ?? SITES[0];
}

/**
 * Simplified optical-depth (tau) time series generator.
 * Deterministic given (sol, stormYear): a quiet year oscillates gently around
 * TAU_QUIET with dusty-season bumps; a global-storm year injects one large
 * storm ramp lasting ~100 sols, scaled by the site dust factor.
 */
export function opticalDepthAtSol(
  sol: number,
  globalStormYear: boolean,
  siteDustFactor: number,
): number {
  const marsYearSols = 668.6;
  const phase = ((sol % marsYearSols) + marsYearSols) % marsYearSols;
  // Dusty season centered near southern-summer (roughly Ls 180-330 -> late phase).
  const seasonBump = 0.25 * Math.exp(-Math.pow((phase - 480) / 90, 2));
  let tau = TAU_QUIET + seasonBump * siteDustFactor;
  if (globalStormYear) {
    // One global storm per storm-year: onset sol 420, ~35-sol ramp up, ~100-sol decay.
    const onset = 420;
    if (phase >= onset) {
      const t = phase - onset;
      const ramp = Math.min(1, t / 35);
      const decay = Math.exp(-Math.max(0, t - 35) / 100);
      tau += (TAU_GLOBAL_STORM_PEAK - TAU_QUIET) * ramp * decay * siteDustFactor;
    }
  }
  return tau;
}
