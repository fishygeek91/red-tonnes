/**
 * The honest crop set. Yields are controlled-environment values in the range
 * reported by Wheeler (2017, Open Agriculture) and BVAD; where narrowed to a
 * single number the choice is labeled ASSUMED (mid-range, not best-case).
 * All rates are per m2 of growing area per sol at full light and nutrients.
 */

/** One crop's engineering datasheet. */
export interface Crop {
  /** Stable id. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Edible yield, grams (fresh) per m2 per sol, averaged over the cycle. */
  readonly edibleGPerM2Sol: number;
  /** Sols from planting to harvest. */
  readonly harvestSols: number;
  /** Water transpired/incorporated, liters per kg edible (recycled via condensate at recycler efficiency). */
  readonly waterLPerKgEdible: number;
  /** kcal per kg edible fresh mass. */
  readonly kcalPerKg: number;
  /** Protein grams per kg edible. */
  readonly proteinGPerKg: number;
  /** Edible fraction of total biomass (rest is inedible -> compost feedstock). */
  readonly edibleFraction: number;
  /** Dry-matter fraction of total (edible + inedible) fresh biomass. */
  readonly dryMatterFraction: number;
  /** Crew labor, hours per m2 per sol. */
  readonly laborHPerM2Sol: number;
  /** True if the crop fixes nitrogen (legume/cyanobacteria), reducing bed N demand. */
  readonly fixesNitrogen: boolean;
}

/** The playable crop list — small and honest, not a farming tycoon. */
export const CROPS: readonly Crop[] = [
  {
    id: 'potato',
    name: 'Potato / sweet potato',
    edibleGPerM2Sol: 37, // Wheeler: 20-40+ g/m2/day achievable; ASSUMED mid-high (staple priority)
    harvestSols: 110,
    waterLPerKgEdible: 60,
    kcalPerKg: 770,
    proteinGPerKg: 20,
    edibleFraction: 0.55,
    dryMatterFraction: 0.2,
    laborHPerM2Sol: 0.01,
    fixesNitrogen: false,
  },
  {
    id: 'greens',
    name: 'Leafy greens',
    edibleGPerM2Sol: 75, // fresh mass is mostly water; fast cycles
    harvestSols: 30,
    waterLPerKgEdible: 25,
    kcalPerKg: 230,
    proteinGPerKg: 22,
    edibleFraction: 0.8,
    dryMatterFraction: 0.06,
    laborHPerM2Sol: 0.012,
    fixesNitrogen: false,
  },
  {
    id: 'legume',
    name: 'Legumes (soy/pea)',
    edibleGPerM2Sol: 11, // Wheeler soybean ~5-12 g/m2/day dry-basis adjusted
    harvestSols: 95,
    waterLPerKgEdible: 130,
    kcalPerKg: 1400,
    proteinGPerKg: 130,
    edibleFraction: 0.4,
    dryMatterFraction: 0.35,
    laborHPerM2Sol: 0.012,
    fixesNitrogen: true,
  },
  {
    id: 'wheat',
    name: 'Wheat / barley',
    edibleGPerM2Sol: 20, // Wheeler: 10-25 g/m2/day CE wheat
    harvestSols: 70,
    waterLPerKgEdible: 100,
    kcalPerKg: 3300,
    proteinGPerKg: 120,
    edibleFraction: 0.45,
    dryMatterFraction: 0.9,
    laborHPerM2Sol: 0.008,
    fixesNitrogen: false,
  },
  {
    id: 'tomato',
    name: 'Tomato / pepper',
    edibleGPerM2Sol: 55,
    harvestSols: 85,
    waterLPerKgEdible: 45,
    kcalPerKg: 180,
    proteinGPerKg: 9,
    edibleFraction: 0.65,
    dryMatterFraction: 0.07,
    laborHPerM2Sol: 0.015,
    fixesNitrogen: false,
  },
  {
    id: 'spirulina',
    name: 'Spirulina / duckweed',
    edibleGPerM2Sol: 15, // dry-basis photobioreactor; fast protein + O2 helper. ASSUMED conservative.
    harvestSols: 8,
    waterLPerKgEdible: 15,
    kcalPerKg: 2900,
    proteinGPerKg: 570,
    edibleFraction: 0.95,
    dryMatterFraction: 0.95,
    laborHPerM2Sol: 0.006,
    fixesNitrogen: true,
  },
];

/** Look up a crop by id, falling back to potato. */
export function getCrop(id: string): Crop {
  const found = CROPS.find((c) => c.id === id);
  return found ?? CROPS[0];
}

/** Default area mix (fractions summing to 1) used when the player has not customized planting. */
export const DEFAULT_CROP_MIX: Readonly<Record<string, number>> = {
  potato: 0.3,
  greens: 0.15,
  legume: 0.2,
  wheat: 0.2,
  tomato: 0.1,
  spirulina: 0.05,
};
