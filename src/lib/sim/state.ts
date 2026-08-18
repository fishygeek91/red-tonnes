/**
 * Simulation state model for RED TONNES.
 * The state is a plain serializable object; the engine in step.ts is a pure
 * function of (state, dtSols, actions). The UI never mutates state directly.
 */

import { DEFAULT_METHALOX_PER_SHIP_T, DEFAULT_STARSHIP_PAYLOAD_T } from '../constants';
import { DEFAULT_CROP_MIX } from '../crops';
import type { RngState } from '../rng';
import { rngFromSeed } from '../rng';
import type { StructureCounts, StructureId } from '../structures';
import { STRUCTURES, emptyCounts } from '../structures';

/** Bulk material inventories, all kilograms. Mass is conserved: every flow in step.ts moves mass between these pools or logs it as vented/exported. */
export interface Inventories {
  /** Potable/process water. */
  waterKg: number;
  /** Gaseous O2 available to habitats (breathing + compost demand). */
  o2Kg: number;
  /** Liquid oxygen in the cryo farm (propellant-grade). */
  loxKg: number;
  /** Liquid methane in the cryo farm. */
  ch4Kg: number;
  /** Gaseous hydrogen buffer (seed H2 + electrolysis output awaiting Sabatier). */
  h2Kg: number;
  /** Compressed CO2 buffer feeding Sabatier and greenhouses. */
  co2Kg: number;
  /** Packaged Earth rations. */
  earthFoodKg: number;
  /** Locally grown food by crop id (fresh mass). */
  localFoodKg: Record<string, number>;
  /** Spare parts pool. */
  sparesKg: number;
  /** Plant-available nitrogen (fertilizer pool). */
  nitrogenKg: number;
  /** Plant-available phosphorus. */
  phosphorusKg: number;
  /** Plant-available potassium. */
  potassiumKg: number;
  /** Raw organic feedstock awaiting compost/digestion (inedible biomass, scraps, solids). */
  feedstockKg: number;
  /** Finished, mature compost. */
  compostKg: number;
  /** Imported inert grow substrate / hydroponic media. */
  substrateKg: number;
  /** Manufactured, perchlorate-washed living soil. */
  cleanSoilKg: number;
  /** Unwashed regolith staged at the soil factory. */
  dirtySoilKg: number;
}

/** One in-progress compost or digester batch. */
export interface Batch {
  /** Sol the batch was loaded. */
  readonly startSol: number;
  /** Feedstock mass, kg. */
  readonly feedKg: number;
  /** Nitrogen contained, kg. */
  readonly nKg: number;
  /** Phosphorus contained, kg. */
  readonly pKg: number;
}

/** Per-window mass ledger for self-sufficiency accounting and the Sankey. */
export interface WindowLedger {
  /** Window index. */
  readonly window: number;
  /** Imported mass by category, kg. */
  imported: Record<string, number>;
  /** Locally produced mass by category, kg. */
  produced: Record<string, number>;
  /** Ships landed this window. */
  shipsLanded: number;
  /** Ships that departed (fueled) this window. */
  shipsDeparted: number;
  /** Ships that wanted to depart but had no propellant. */
  shipsStranded: number;
}

/** Cargo manifest for one arriving window. */
export interface Manifest {
  /** Structures to deliver (units). */
  readonly structures: Partial<Record<StructureId, number>>;
  /** Earth rations, kg. */
  readonly earthFoodKg: number;
  /** Spare parts, kg. */
  readonly sparesKg: number;
  /** Seed hydrogen, kg. */
  readonly h2Kg: number;
  /** Grow substrate, kg. */
  readonly substrateKg: number;
  /** Fertilizer nitrogen, kg. */
  readonly fertilizerNKg: number;
  /** Fertilizer P+K blend, kg (split 40/60 P/K on arrival). */
  readonly fertilizerPkKg: number;
  /** Crew arriving on this window's ships. */
  readonly crew: number;
}

/** A timestamped event for the log and failure narration. */
export interface SimEvent {
  readonly sol: number;
  readonly kind: 'info' | 'warning' | 'failure' | 'milestone';
  readonly text: string;
}

/** Terminal outcomes. Empty string while the sim is live. */
export type EndState =
  | ''
  | 'RETURN FUEL READY'
  | 'SURVIVED 3 WINDOWS CLOSED-LOOP'
  | 'STARVED'
  | 'STRANDED (NO METHALOX)'
  | 'DUST YEAR BLACKOUT';

/** Compact per-sol snapshot kept for the time scrubber and charts. */
export interface SolSnapshot {
  readonly sol: number;
  readonly tau: number;
  readonly powerAvailKwe: number;
  readonly powerDemandKwe: number;
  readonly waterKg: number;
  readonly methaloxKg: number;
  readonly o2Kg: number;
  readonly kcalPerPersonSol: number;
  readonly earthFoodFraction: number;
  readonly selfSufficiency: number;
  readonly nitrogenKg: number;
  readonly compostKg: number;
  readonly greenhouseM2: number;
  readonly population: number;
}

/** Tunable model parameters exposed as sliders (all ASSUMED-class knobs). */
export interface ModelParams {
  /** Landed payload per cargo Starship, tonnes. */
  starshipPayloadT: number;
  /** Methalox tonnes required per departing ship. */
  methaloxPerShipT: number;
  /** Ships landing per window. */
  shipsPerWindow: number;
  /** Ships expected to return per window (crew rotation). */
  returnShipsPerWindow: number;
  /** Planet-overlay toggle (teaching layer only). */
  overlayEnabled: boolean;
}

/** The full simulation state. */
export interface SimState {
  /** RNG seed used to derive all stochastic draws. */
  readonly seed: number;
  /** Current RNG stream state. */
  rng: RngState;
  /** Elapsed sols since first landing. */
  sol: number;
  /** Current synodic window index. */
  window: number;
  /** Selected site id. */
  siteId: string;
  /** Live population. */
  population: number;
  /** Built structures. */
  structures: StructureCounts;
  /** Material pools. */
  inv: Inventories;
  /** Compost batches in progress. */
  compostBatches: Batch[];
  /** Digester batches in progress. */
  digesterBatches: Batch[];
  /** Crop area mix (fractions of total greenhouse area). */
  cropMix: Record<string, number>;
  /** Cumulative local industrial output, tonnes (unlocks industry tiers). */
  localOutputTonnes: number;
  /** Outstanding unrepaired failures (each degrades plant efficiency). */
  pendingFailures: number;
  /** Consecutive sols of caloric deficit. */
  hungerSols: number;
  /** Consecutive sols where power < life-support demand. */
  blackoutSols: number;
  /** Distinct crops harvested in the last 60 sols (variety tracking). */
  recentHarvests: Record<string, number>;
  /** Ledger per window (index = window). */
  ledgers: WindowLedger[];
  /** Manifest queued for each future window arrival. */
  manifests: Record<number, Manifest>;
  /** Event log (append-only). */
  events: SimEvent[];
  /** Per-sol snapshots for the scrubber. */
  history: SolSnapshot[];
  /** Terminal outcome, '' while running. */
  endState: EndState;
  /** Count of consecutive windows with self-sufficiency >= 0.95 (win tracking). */
  closedLoopWindows: number;
  /** Tunable parameters. */
  params: ModelParams;
  /** Mass vented / irrecoverably lost, kg (closes the conservation books). */
  ventedKg: number;
}

/** Named manifest template for the new-game screen. */
export interface ManifestTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly manifest: Manifest;
}

/** Blank manifest helper. */
export function emptyManifest(): Manifest {
  return {
    structures: {},
    earthFoodKg: 0,
    sparesKg: 0,
    h2Kg: 0,
    substrateKg: 0,
    fertilizerNKg: 0,
    fertilizerPkKg: 0,
    crew: 0,
  };
}

/** Total landed mass of a manifest, kg (structures at full imported mass). */
export function manifestMassKg(m: Manifest): number {
  let total = m.earthFoodKg + m.sparesKg + m.h2Kg + m.substrateKg + m.fertilizerNKg + m.fertilizerPkKg;
  for (const [id, count] of Object.entries(m.structures)) {
    const spec = STRUCTURES[id as StructureId];
    total += spec.massKg * (count ?? 0);
  }
  // Crew mass + personal effects + seat hardware. ASSUMED 500 kg/person landed.
  total += m.crew * 500;
  return total;
}

/** Pre-built first-window manifests. Sized to shipsPerWindow x payload. */
export const MANIFEST_TEMPLATES: readonly ManifestTemplate[] = [
  {
    id: 'balanced',
    name: 'Balanced 12-crew',
    description: 'Power, ISRU, food and compost in one package. The demo default.',
    manifest: {
      // Power sizing note: the propellant chain alone needs ~370 kWe
      // continuous for a 1,000 t/window quota (32 kWh per kg CH4 chain
      // energy). 3 reactors + 12 solar blocks ≈ 444 kWe average at Arcadia.
      structures: {
        pad: 1,
        solar: 12,
        nuclear: 3,
        iceMine: 1,
        compressor: 2,
        electrolyzer: 2,
        sabatier: 1,
        cryoPlant: 2,
        habitat: 3,
        ghInflatable: 2,
        ghBuried: 1,
        composter: 3,
        digester: 2,
        soilFactory: 1,
        fabShop: 1,
      },
      earthFoodKg: 14000, // ~12 crew x ~770 sols x 0.75 kg/sol at 4000 kcal/kg minus expected local share
      sparesKg: 4000,
      h2Kg: 1500,
      substrateKg: 6000,
      fertilizerNKg: 800,
      fertilizerPkKg: 600,
      crew: 12,
    },
  },
  {
    id: 'propellant',
    name: 'Propellant first',
    description: 'Max ISRU and power. Thin margins on food — you are betting on window 2.',
    manifest: {
      structures: {
        pad: 1,
        solar: 14,
        nuclear: 4,
        iceMine: 2,
        compressor: 3,
        electrolyzer: 2,
        sabatier: 2,
        cryoPlant: 3,
        habitat: 3,
        ghBuried: 1,
        composter: 2,
        digester: 1,
        fabShop: 1,
      },
      earthFoodKg: 18000,
      sparesKg: 3000,
      h2Kg: 2500,
      substrateKg: 2000,
      fertilizerNKg: 400,
      fertilizerPkKg: 300,
      crew: 12,
    },
  },
  {
    id: 'food',
    name: 'Food first',
    description: 'Greenhouse streets and full nutrient loop. Return fuel waits a window.',
    manifest: {
      structures: {
        pad: 1,
        solar: 10,
        nuclear: 2,
        iceMine: 1,
        compressor: 1,
        electrolyzer: 1,
        sabatier: 1,
        cryoPlant: 1,
        habitat: 3,
        ghInflatable: 3,
        ghRigid: 1,
        ghBuried: 1,
        composter: 4,
        digester: 3,
        soilFactory: 2,
        fabShop: 1,
      },
      earthFoodKg: 10000,
      sparesKg: 3500,
      h2Kg: 1000,
      substrateKg: 9000,
      fertilizerNKg: 1200,
      fertilizerPkKg: 900,
      crew: 12,
    },
  },
];

/** Options accepted when creating a fresh game. */
export interface NewGameOptions {
  readonly seed: number;
  readonly siteId: string;
  readonly templateId: string;
  readonly starshipPayloadT?: number;
  readonly methaloxPerShipT?: number;
  readonly shipsPerWindow?: number;
}

/**
 * Create the initial simulation state: window 0 cargo has just landed and
 * been deployed. The template manifest becomes the first ledger's imports.
 */
export function createInitialState(opts: NewGameOptions): SimState {
  const template =
    MANIFEST_TEMPLATES.find((t) => t.id === opts.templateId) ?? MANIFEST_TEMPLATES[0];
  const m = template.manifest;

  const structures = emptyCounts();
  for (const [id, count] of Object.entries(m.structures)) {
    structures[id as StructureId] += count ?? 0;
  }

  const imported: Record<string, number> = {
    structures: 0,
    food: m.earthFoodKg,
    spares: m.sparesKg,
    hydrogen: m.h2Kg,
    substrate: m.substrateKg,
    fertilizer: m.fertilizerNKg + m.fertilizerPkKg,
    people: m.crew * 500,
  };
  for (const [id, count] of Object.entries(m.structures)) {
    imported.structures += STRUCTURES[id as StructureId].massKg * (count ?? 0);
  }

  const payloadT = opts.starshipPayloadT ?? DEFAULT_STARSHIP_PAYLOAD_T;
  const totalImported = Object.values(imported).reduce((a, b) => a + b, 0);
  const shipsLanded = Math.max(1, Math.ceil(totalImported / (payloadT * 1000)));

  return {
    seed: opts.seed,
    rng: rngFromSeed(opts.seed),
    sol: 0,
    window: 0,
    siteId: opts.siteId,
    population: m.crew,
    structures,
    inv: {
      waterKg: 5000, // landed with ships' residual + initial melt. ASSUMED buffer.
      o2Kg: 2000,
      loxKg: 0,
      ch4Kg: 0,
      h2Kg: m.h2Kg,
      co2Kg: 500,
      earthFoodKg: m.earthFoodKg,
      localFoodKg: {},
      sparesKg: m.sparesKg,
      nitrogenKg: m.fertilizerNKg,
      phosphorusKg: m.fertilizerPkKg * 0.4,
      potassiumKg: m.fertilizerPkKg * 0.6,
      feedstockKg: 0,
      compostKg: 0,
      substrateKg: m.substrateKg,
      cleanSoilKg: 0,
      dirtySoilKg: 0,
    },
    compostBatches: [],
    digesterBatches: [],
    cropMix: { ...DEFAULT_CROP_MIX },
    localOutputTonnes: 0,
    pendingFailures: 0,
    hungerSols: 0,
    blackoutSols: 0,
    recentHarvests: {},
    ledgers: [
      {
        window: 0,
        imported,
        produced: {},
        shipsLanded,
        shipsDeparted: 0,
        shipsStranded: 0,
      },
    ],
    manifests: { 1: { ...m, crew: 4 }, 2: { ...m, crew: 0 } },
    events: [
      {
        sol: 0,
        kind: 'milestone',
        text: `${shipsLanded} Starships down at ${opts.siteId}. ${m.crew} crew. The clock to the next window is running.`,
      },
    ],
    history: [],
    endState: '',
    closedLoopWindows: 0,
    params: {
      starshipPayloadT: payloadT,
      methaloxPerShipT: opts.methaloxPerShipT ?? DEFAULT_METHALOX_PER_SHIP_T,
      shipsPerWindow: opts.shipsPerWindow ?? 3,
      returnShipsPerWindow: 1,
      overlayEnabled: false,
    },
    ventedKg: 0,
  };
}
