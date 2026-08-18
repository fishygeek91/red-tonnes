/**
 * Buildable-structure catalog. Every structure has landed (imported) mass,
 * power draw, pressurized volume, crew maintenance hours, spare-parts demand,
 * and a locally-manufacturable fraction that rises as industry unlocks.
 * Masses are ASSUMED engineering estimates sized so a 100 t Starship manifest
 * forces real trade-offs; each is a per-unit figure with capacity semantics
 * documented on `capacity`.
 */

/** Identifier for each structure family. */
export type StructureId =
  | 'pad'
  | 'solar'
  | 'nuclear'
  | 'iceMine'
  | 'compressor'
  | 'electrolyzer'
  | 'sabatier'
  | 'cryoPlant'
  | 'habitat'
  | 'ghInflatable'
  | 'ghRigid'
  | 'ghBuried'
  | 'composter'
  | 'digester'
  | 'soilFactory'
  | 'fabShop';

/** Datasheet for one buildable unit. */
export interface StructureSpec {
  readonly id: StructureId;
  /** Display name. */
  readonly name: string;
  /** Mass that must be landed (or locally made) per unit, kg. */
  readonly massKg: number;
  /** Continuous electrical draw at full duty, kWe per unit. */
  readonly powerKwe: number;
  /** Pressurized volume added, m3 (0 for unpressurized plant). */
  readonly volumeM3: number;
  /** Crew maintenance hours per sol per unit. */
  readonly crewHoursPerSol: number;
  /** What one unit does, with the number that matters. */
  readonly capacity: string;
  /** Numeric capacity used by the sim (units documented in `capacity`). */
  readonly capacityValue: number;
  /** Industry tier required before ANY local-mass fraction applies. */
  readonly localTier: number;
  /** Max fraction of unit mass manufacturable locally once tier unlocked. */
  readonly maxLocalFraction: number;
  /**
   * Relative failure hazard vs the fleet baseline (1 = one failure per
   * characteristic life). Moving parts and thin films fail more: ETFE
   * greenhouses puncture/abrade, miners chew dust, compressors wear seals.
   * Passive structures (pads, panels, shielded reactors) fail less. ASSUMED.
   */
  readonly failureWeight: number;
}

/** The full catalog, keyed by id. */
export const STRUCTURES: Readonly<Record<StructureId, StructureSpec>> = {
  pad: {
    id: 'pad',
    name: 'Landing pad (sintered)',
    massKg: 2000, // sintering rig + microwave emitters; the pad itself is regolith
    powerKwe: 15,
    volumeM3: 0,
    crewHoursPerSol: 0.2,
    capacity: 'Supports 2 landings per window without debris damage',
    capacityValue: 2,
    localTier: 1,
    maxLocalFraction: 0.9,
    failureWeight: 0.4, // sintered slab: almost nothing to break
  },
  solar: {
    id: 'solar',
    name: 'Solar array block (100 kWe-peak)',
    massKg: 1000, // 10 kg/kWe thin film, see constants
    powerKwe: 0,
    volumeM3: 0,
    crewHoursPerSol: 0.3, // dust cleaning walks
    capacity: '100 kWe peak at tau=0, derated by dust and season',
    capacityValue: 100,
    localTier: 3,
    maxLocalFraction: 0.3,
    failureWeight: 0.5, // no moving parts; connectors and abrasion only
  },
  nuclear: {
    id: 'nuclear',
    name: 'Fission reactor (100 kWe)',
    massKg: 15000, // 150 kg/kWe Kilopower-scaled
    powerKwe: 0,
    volumeM3: 0,
    crewHoursPerSol: 0.1,
    capacity: '100 kWe continuous, dust-immune',
    capacityValue: 100,
    localTier: 99, // never local in this model
    maxLocalFraction: 0,
    failureWeight: 0.5, // engineered for autonomy; Stirling units are sealed
  },
  iceMine: {
    id: 'iceMine',
    name: 'Ice mine + hauler',
    massKg: 8000,
    powerKwe: 60,
    volumeM3: 0,
    crewHoursPerSol: 1.5,
    capacity: '2,000 kg water/sol at full power (site depth modifies energy)',
    capacityValue: 2000,
    localTier: 2,
    maxLocalFraction: 0.4,
    failureWeight: 3, // excavator teeth, haul drivetrain, abrasive regolith
  },
  compressor: {
    id: 'compressor',
    name: 'CO2 intake compressor',
    massKg: 1500,
    powerKwe: 45,
    volumeM3: 0,
    crewHoursPerSol: 0.3,
    capacity: '1,200 kg CO2/sol from ~6 mbar air (thin-air work is real)',
    capacityValue: 1200,
    localTier: 2,
    maxLocalFraction: 0.3,
    failureWeight: 2.5, // high-ratio compression stages eating dust
  },
  electrolyzer: {
    id: 'electrolyzer',
    name: 'Electrolyzer stack',
    massKg: 2500,
    powerKwe: 0, // draws per-kg energy, not fixed
    volumeM3: 0,
    crewHoursPerSol: 0.4,
    capacity: 'Splits up to 1,500 kg H2O/sol given energy',
    capacityValue: 1500,
    localTier: 3,
    maxLocalFraction: 0.2,
    failureWeight: 1.5, // membranes and pumps
  },
  sabatier: {
    id: 'sabatier',
    name: 'Sabatier reactor',
    massKg: 3000,
    powerKwe: 0, // per-kg aux energy
    volumeM3: 0,
    crewHoursPerSol: 0.4,
    capacity: 'Up to 900 kg CH4/sol given H2 + CO2',
    capacityValue: 900,
    localTier: 3,
    maxLocalFraction: 0.2,
    failureWeight: 1.5, // hot catalyst bed, thermal cycling
  },
  cryoPlant: {
    id: 'cryoPlant',
    name: 'Cryo liquefaction + tank farm',
    massKg: 6000,
    powerKwe: 0, // per-kg energy
    volumeM3: 0,
    crewHoursPerSol: 0.5,
    capacity: 'Liquefies/stores 350 t methalox per unit',
    capacityValue: 350000,
    localTier: 2,
    maxLocalFraction: 0.5,
    failureWeight: 2, // cryocoolers run continuously
  },
  habitat: {
    id: 'habitat',
    name: 'Habitat module',
    massKg: 12000,
    powerKwe: 8, // shell systems; per-person ECLSS power added separately
    volumeM3: 240, // 4-person long-duration at 60 m3/person
    crewHoursPerSol: 0.5,
    capacity: 'Pressurized volume for 4 people (240 m3)',
    capacityValue: 240,
    localTier: 2,
    maxLocalFraction: 0.35,
    failureWeight: 1, // ECLSS pumps and fans, baseline
  },
  ghInflatable: {
    id: 'ghInflatable',
    name: 'ETFE street greenhouse',
    massKg: 3500,
    powerKwe: 4, // fans, pumps, thermal
    volumeM3: 750,
    crewHoursPerSol: 0.8,
    capacity: '250 m2 sunlight-grown area; puncture/abrasion prone (spares!)',
    capacityValue: 250,
    localTier: 4,
    maxLocalFraction: 0.3,
    failureWeight: 3, // thin film under dust abrasion and pressure cycling
  },
  ghRigid: {
    id: 'ghRigid',
    name: 'Rigid glasshouse',
    massKg: 9000,
    powerKwe: 5,
    volumeM3: 600,
    crewHoursPerSol: 0.5,
    capacity: '200 m2; dust/radiation tough; local glass at tier 3',
    capacityValue: 200,
    localTier: 3,
    maxLocalFraction: 0.6,
    failureWeight: 1, // heavy but robust — the reason to pay its mass
  },
  ghBuried: {
    id: 'ghBuried',
    name: 'Buried grow hall (LED)',
    massKg: 7000, // liner, LEDs, racks; excavation is crew + energy
    powerKwe: 0, // LED power computed per m2 in sim
    volumeM3: 900,
    crewHoursPerSol: 0.6,
    capacity: '300 m2 full-LED; storm-proof; power hog (0.3 kWe/m2)',
    capacityValue: 300,
    localTier: 2,
    maxLocalFraction: 0.5,
    failureWeight: 1.2, // LED drivers and fans; buried shell is inert
  },
  composter: {
    id: 'composter',
    name: 'Thermophilic compost drum',
    massKg: 1200,
    powerKwe: 3, // aeration + heating to 55C+
    volumeM3: 40,
    crewHoursPerSol: 0.4,
    capacity: 'Processes 30 kg feedstock/sol; 70-sol maturity cycle',
    capacityValue: 30,
    localTier: 2,
    maxLocalFraction: 0.7,
    failureWeight: 1.5, // drum drives and aeration blowers in a corrosive box
  },
  digester: {
    id: 'digester',
    name: 'Anaerobic digester',
    massKg: 1800,
    powerKwe: 2,
    volumeM3: 50,
    crewHoursPerSol: 0.3,
    capacity: '25 kg feedstock/sol -> biogas CH4 + digestate',
    capacityValue: 25,
    localTier: 2,
    maxLocalFraction: 0.7,
    failureWeight: 1, // sealed tank, slow chemistry
  },
  soilFactory: {
    id: 'soilFactory',
    name: 'Soil factory (wash + blend)',
    massKg: 2500,
    powerKwe: 10,
    volumeM3: 60,
    crewHoursPerSol: 0.5,
    capacity: 'Washes 200 kg regolith/sol of perchlorates, blends compost',
    capacityValue: 200,
    localTier: 1,
    maxLocalFraction: 0.6,
    failureWeight: 2, // slurry pumps and abrasive grit
  },
  fabShop: {
    id: 'fabShop',
    name: 'Fabrication shop',
    massKg: 10000,
    powerKwe: 30,
    volumeM3: 200,
    crewHoursPerSol: 2.0,
    capacity: 'Makes 15 kg spare parts/sol + raises local-mass fractions',
    capacityValue: 15,
    localTier: 0,
    maxLocalFraction: 0.2,
    failureWeight: 1, // machine tools break, but the shop fixes itself
  },
};

/** Count of built units per structure family. */
export type StructureCounts = Record<StructureId, number>;

/** All-zero structure counts. */
export function emptyCounts(): StructureCounts {
  return {
    pad: 0,
    solar: 0,
    nuclear: 0,
    iceMine: 0,
    compressor: 0,
    electrolyzer: 0,
    sabatier: 0,
    cryoPlant: 0,
    habitat: 0,
    ghInflatable: 0,
    ghRigid: 0,
    ghBuried: 0,
    composter: 0,
    digester: 0,
    soilFactory: 0,
    fabShop: 0,
  };
}

/** Ordered list of ids for stable UI iteration. */
export const STRUCTURE_ORDER: readonly StructureId[] = [
  'pad',
  'solar',
  'nuclear',
  'iceMine',
  'compressor',
  'electrolyzer',
  'sabatier',
  'cryoPlant',
  'habitat',
  'ghInflatable',
  'ghRigid',
  'ghBuried',
  'composter',
  'digester',
  'soilFactory',
  'fabShop',
];

/**
 * Industry tiers, unlocked by cumulative tonnes of local output (not XP).
 * Tier N unlocks when `localOutputTonnes >= threshold`.
 */
export interface IndustryTier {
  readonly tier: number;
  readonly name: string;
  readonly thresholdTonnes: number;
  readonly unlocks: string;
}

/** The industry ladder. Thresholds are ASSUMED pacing values. */
export const INDUSTRY_TIERS: readonly IndustryTier[] = [
  { tier: 0, name: 'Bootstrapping', thresholdTonnes: 0, unlocks: 'Everything imported' },
  { tier: 1, name: 'Sintered regolith', thresholdTonnes: 20, unlocks: 'Local pads, washed soil' },
  { tier: 2, name: 'Pressure & plumbing', thresholdTonnes: 120, unlocks: 'Local tanks, drums, liners, berms' },
  { tier: 3, name: 'Glass & chemistry', thresholdTonnes: 500, unlocks: 'Local glasshouse panes, reactor vessels' },
  { tier: 4, name: 'Polymer films', thresholdTonnes: 1500, unlocks: 'Local ETFE-class films from CH4 feedstock' },
  { tier: 5, name: 'Steel & aluminum', thresholdTonnes: 6000, unlocks: 'Heavy structure; imports become optional' },
];

/** Compute the current industry tier from cumulative local output tonnes. */
export function industryTierFor(localOutputTonnes: number): IndustryTier {
  let current = INDUSTRY_TIERS[0];
  for (const t of INDUSTRY_TIERS) {
    if (localOutputTonnes >= t.thresholdTonnes) {
      current = t;
    }
  }
  return current;
}
