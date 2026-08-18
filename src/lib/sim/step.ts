/**
 * The RED TONNES simulation engine.
 *
 * `step(state, dtSols, actions)` is a pure function: it never mutates its
 * input and touches no globals. Same seed + same inputs => same history.
 * The engine conserves mass: every kilogram moves between inventory pools,
 * becomes structure, leaves on a ship, or is explicitly logged in
 * `ventedKg`. If you change a flow, keep the books closed.
 */

import {
  ATMOSPHERE_CO2_MASS_FRACTION,
  CO2_INTAKE_KWH_PER_KG,
  CREW_HOURS_PER_SOL,
  DEPARTURE_OFFSET_SOLS,
  HABITAT_M3_PER_PERSON,
  SPARES_CHARACTERISTIC_LIFE_SOLS,
  CO2_PER_KG_DRY_BIOMASS,
  COMPOST_CO2_PER_KG_FEED,
  COMPOST_MATURITY_SOLS,
  COMPOST_N_RETENTION,
  COMPOST_O2_PER_KG_FEED,
  COMPOST_YIELD_FRACTION,
  DIGESTER_CH4_PER_KG_FEED,
  DIGESTER_CO2_PER_KG_FEED,
  DIGESTER_CYCLE_SOLS,
  DIGESTER_DIGESTATE_FRACTION,
  DIGESTER_N_RETENTION,
  DIRTY_SOIL_YIELD_MULTIPLIER,
  EARTH_FOOD_KCAL_PER_KG,
  EARTH_FOOD_PROTEIN_G_PER_KG,
  ELECTROLYSIS_KWH_PER_KG_H2,
  H2_LEAK_PER_SOL,
  H2_PER_KG_H2O,
  HOURS_PER_SOL,
  HUMAN_CO2_KG_PER_SOL,
  HUMAN_KCAL_PER_SOL,
  HUMAN_O2_KG_PER_SOL,
  HUMAN_P_KG_PER_SOL,
  HUMAN_PROTEIN_G_PER_SOL,
  HUMAN_SOLID_WASTE_KG_PER_SOL,
  HUMAN_URINE_KG_PER_SOL,
  HUMAN_WATER_KG_PER_SOL,
  ICE_MINE_KWH_PER_KG_H2O_BASE,
  LED_KWE_PER_M2,
  LIFE_SUPPORT_KWE_PER_PERSON,
  LIQUEFACTION_KWH_PER_KG_CH4,
  LIQUEFACTION_KWH_PER_KG_O2,
  LOX_TO_CH4_RATIO,
  N_PER_KG_DRY_BIOMASS,
  O2_PER_KG_DRY_BIOMASS,
  O2_PER_KG_H2O,
  PERCHLORATE_WASH_KWH_PER_KG,
  PERCHLORATE_WASH_WATER_PER_KG,
  P_PER_KG_DRY_BIOMASS,
  SABATIER_AUX_KWH_PER_KG_CH4,
  SABATIER_CO2_PER_KG_CH4,
  SABATIER_H2O_PER_KG_CH4,
  SABATIER_H2_PER_KG_CH4,
  SOIL_COMPOST_FRACTION,
  SOLAR_DAYLIGHT_FACTOR,
  SOLID_WASTE_N_FRACTION,
  SOLS_PER_SYNODIC_WINDOW,
  SPARES_KG_PER_REPAIR,
  TANK_BOILOFF_PER_SOL,
  UNREPAIRED_FAILURE_PENALTY,
  URINE_N_FRACTION,
  VARIETY_MIN_CROPS,
  WATER_RECYCLE_FRACTION,
} from '../constants';
import { CROPS } from '../crops';
import { rngNext } from '../rng';
import { getSite, opticalDepthAtSol } from '../sites';
import type { StructureId } from '../structures';
import { STRUCTURES, industryTierFor } from '../structures';
import { clamp, safeDiv } from '../types';
import type { Manifest, SimEvent, SimState, SolSnapshot, WindowLedger } from './state';

/** Player actions applied at the start of a step. All optional. */
export interface SimActions {
  /** Replace the crop area mix (fractions; renormalized defensively). */
  readonly cropMix?: Record<string, number>;
  /** Queue/replace the manifest for a future window. */
  readonly manifests?: Record<number, Manifest>;
  /** Update tunable parameters (payload sliders etc.). */
  readonly params?: Partial<SimState['params']>;
}

/** Water buffer the ISRU planner protects for people + crops (sols of demand). ASSUMED. */
const WATER_RESERVE_SOLS = 25;

/** Breathing-gas reserve protected from LOX conversion, kg per person. ASSUMED: ~30 sols. */
const O2_RESERVE_KG_PER_PERSON = 30;

/** Growing-media requirement, kg per m2 of bed. ASSUMED: 30 kg/m2 shallow beds/hydro hybrid. */
const MEDIA_KG_PER_M2 = 30;

/**
 * Deterministically decide whether a given Mars year is a global-storm year.
 * Hash of (seed, marsYear) — roughly 1 in 3 years storm, matching the
 * observed cadence of planet-encircling events.
 */
function isStormYear(seed: number, marsYear: number): boolean {
  let h = (seed ^ Math.imul(marsYear + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) >>> 0;
  return (h & 0xffff) / 0xffff < 0.33;
}

/** Effective surface sunlight fraction under dust optical depth tau (direct beam + diffuse floor). */
export function sunlightFraction(tau: number): number {
  // Beer-Lambert direct beam at mean airmass ~2, plus a diffuse component that
  // keeps a storm from being literally pitch black (rovers survived tau ~5-10).
  const direct = 0.9 * Math.exp(-tau * 2.0);
  const diffuse = 0.1 * Math.exp(-tau / 3.0);
  return clamp(direct + diffuse, 0, 1);
}

/** Protected drinking-water buffer the greenhouses may never touch: ~5 sols of gross crew demand. ASSUMED. */
function drinkingBufferKg(population: number): number {
  return population * HUMAN_WATER_KG_PER_SOL * 5;
}

/** Add a mass flow to a ledger category. */
function credit(rec: Record<string, number>, key: string, kg: number): void {
  if (kg <= 0) {
    return;
  }
  rec[key] = (rec[key] ?? 0) + kg;
}

/** Sum a ledger record. */
function ledgerSum(rec: Record<string, number>): number {
  return Object.values(rec).reduce((a, b) => a + b, 0);
}

/** Self-sufficiency of a window ledger: local / (local + imported). */
export function selfSufficiencyOf(l: WindowLedger | undefined): number {
  if (!l) {
    return 0;
  }
  const local = ledgerSum(l.produced);
  const imported = ledgerSum(l.imported);
  return safeDiv(local, local + imported, 0);
}

/** The reliability triple that scales every plant in the city. */
export interface PlantFactors {
  /** Maintenance + farm-labor hours the city needs per sol. */
  readonly laborNeeded: number;
  /** Productive crew hours available per sol. */
  readonly laborAvailable: number;
  /** Labor coverage factor, clamped to [0.4, 1]. */
  readonly laborFactor: number;
  /** Habitat crowding factor, clamped to [0.6, 1]. */
  readonly crowdFactor: number;
  /** Total pressurized habitat volume, m3. */
  readonly habitatVolumeM3: number;
  /** Open-failure penalty factor, clamped to [0.3, 1]. */
  readonly failureFactor: number;
  /** The combined efficiency every capacity is multiplied by. */
  readonly eff: number;
}

/**
 * Compute the plant-efficiency factors for a state. Exported so the UI's
 * inspection cards report the exact numbers the engine uses — one source
 * of truth, no drift.
 */
export function plantFactors(s: SimState): PlantFactors {
  const ghArea =
    s.structures.ghInflatable * STRUCTURES.ghInflatable.capacityValue +
    s.structures.ghRigid * STRUCTURES.ghRigid.capacityValue +
    s.structures.ghBuried * STRUCTURES.ghBuried.capacityValue;
  let laborNeeded = 0;
  for (const id of Object.keys(s.structures) as Array<keyof typeof s.structures>) {
    laborNeeded += s.structures[id] * STRUCTURES[id].crewHoursPerSol;
  }
  for (const crop of CROPS) {
    laborNeeded += ghArea * (s.cropMix[crop.id] ?? 0) * crop.laborHPerM2Sol;
  }
  const laborAvailable = s.population * CREW_HOURS_PER_SOL;
  const laborFactor = laborNeeded <= 0 ? 1 : clamp(safeDiv(laborAvailable, laborNeeded, 0), 0.4, 1);
  const habitatVolumeM3 = s.structures.habitat * STRUCTURES.habitat.capacityValue;
  const crowdFactor = clamp(safeDiv(habitatVolumeM3, s.population * HABITAT_M3_PER_PERSON, 1), 0.6, 1);
  const failureFactor = clamp(1 - s.pendingFailures * UNREPAIRED_FAILURE_PENALTY, 0.3, 1);
  return {
    laborNeeded,
    laborAvailable,
    laborFactor,
    crowdFactor,
    habitatVolumeM3,
    failureFactor,
    eff: failureFactor * laborFactor * crowdFactor,
  };
}

/**
 * Advance the simulation by `dtSols` whole sols.
 * Pure: returns a new state; the input is never mutated.
 */
export function step(state: SimState, dtSols: number, actions: SimActions): SimState {
  // Deep-ish clone of the mutable parts (typed, no `any`).
  let s: SimState = {
    ...state,
    inv: { ...state.inv, localFoodKg: { ...state.inv.localFoodKg } },
    structures: { ...state.structures },
    compostBatches: [...state.compostBatches],
    digesterBatches: [...state.digesterBatches],
    cropMix: { ...state.cropMix },
    recentHarvests: { ...state.recentHarvests },
    ledgers: state.ledgers.map((l) => ({
      ...l,
      imported: { ...l.imported },
      produced: { ...l.produced },
    })),
    manifests: { ...state.manifests },
    events: [...state.events],
    history: [...state.history],
    params: { ...state.params },
  };

  if (actions.cropMix) {
    const total = Object.values(actions.cropMix).reduce((a, b) => a + Math.max(0, b), 0);
    if (total > 0) {
      const mix: Record<string, number> = {};
      for (const [k, v] of Object.entries(actions.cropMix)) {
        mix[k] = Math.max(0, v) / total;
      }
      s.cropMix = mix;
    }
  }
  if (actions.manifests) {
    s.manifests = { ...s.manifests, ...actions.manifests };
  }
  if (actions.params) {
    s.params = { ...s.params, ...actions.params };
  }

  const n = Math.max(0, Math.floor(dtSols));
  for (let i = 0; i < n; i += 1) {
    if (s.endState === 'STARVED' || s.endState === 'STRANDED (NO METHALOX)' || s.endState === 'DUST YEAR BLACKOUT') {
      break; // terminal lose states freeze the clock
    }
    s = stepOneSol(s);
  }
  return s;
}

/** Push an event, capping the log length. */
function logEvent(s: SimState, kind: SimEvent['kind'], text: string): void {
  s.events.push({ sol: s.sol, kind, text });
  if (s.events.length > 250) {
    s.events.splice(0, s.events.length - 250);
  }
}

/** Advance exactly one sol. Called only by `step`; assumes `s` is a private copy. */
function stepOneSol(s: SimState): SimState {
  const site = getSite(s.siteId);
  const marsYear = Math.floor(s.sol / 668.6);
  const stormYear = isStormYear(s.seed, marsYear);
  const tau = opticalDepthAtSol(s.sol, stormYear, site.dustFactor);
  const sun = sunlightFraction(tau);
  const inv = s.inv;
  const ledger = s.ledgers[s.ledgers.length - 1];

  // ---- areas (needed by labor and demand alike) -----------------------------
  const ghAreaSolar =
    s.structures.ghInflatable * STRUCTURES.ghInflatable.capacityValue +
    s.structures.ghRigid * STRUCTURES.ghRigid.capacityValue;
  const ghAreaLed = s.structures.ghBuried * STRUCTURES.ghBuried.capacityValue;
  const ghArea = ghAreaSolar + ghAreaLed;

  // ---- crew labor budget -----------------------------------------------------
  // Maintenance hours per structure plus farm labor per m2, against the crew's
  // productive hours. Overcrowded habitats erode output too: stressed, hot-
  // bunked crews do not hit their maintenance schedules. The math lives in
  // plantFactors (shared with the UI's inspection cards).
  const pf = plantFactors(s);
  if (pf.laborFactor < 0.95 && Math.floor(s.sol) % 50 === 0) {
    logEvent(s, 'warning', `Crew overworked: ${pf.laborNeeded.toFixed(0)} maintenance hours needed vs ${pf.laborAvailable.toFixed(0)} available. Plant efficiency suffering — more crew or less sprawl.`);
  }
  if (pf.crowdFactor < 0.99 && Math.floor(s.sol) % 50 === 1) {
    logEvent(s, 'warning', `Habitats overcrowded: ${pf.habitatVolumeM3.toFixed(0)} m³ for ${s.population} people (need ${s.population * HABITAT_M3_PER_PERSON}). Land another module.`);
  }

  // ---- reliability: failures + labor + crowding fold into one plant factor ---
  const eff = pf.eff;

  // ---- power supply --------------------------------------------------------
  const latFactor = clamp(Math.cos((site.latitudeDeg * Math.PI) / 180), 0.35, 1);
  const solarPeakKwe = s.structures.solar * STRUCTURES.solar.capacityValue;
  const solarKwe = solarPeakKwe * SOLAR_DAYLIGHT_FACTOR * latFactor * sun * eff;
  const nuclearKwe = s.structures.nuclear * STRUCTURES.nuclear.capacityValue * eff;
  const supplyKwe = solarKwe + nuclearKwe;
  let energyKwh = supplyKwe * HOURS_PER_SOL;

  // ---- demand tiers (life support first, industry last) -------------------

  const dLife =
    s.population * LIFE_SUPPORT_KWE_PER_PERSON + s.structures.habitat * STRUCTURES.habitat.powerKwe;
  const dGreenhouse =
    ghAreaLed * LED_KWE_PER_M2 +
    s.structures.ghInflatable * STRUCTURES.ghInflatable.powerKwe +
    s.structures.ghRigid * STRUCTURES.ghRigid.powerKwe;
  const dWaste =
    s.structures.composter * STRUCTURES.composter.powerKwe +
    s.structures.digester * STRUCTURES.digester.powerKwe;
  const dFab = s.structures.fabShop * STRUCTURES.fabShop.powerKwe;
  const totalFixedDemand = dLife + dGreenhouse + dWaste + dFab;

  /** Serve one demand tier; returns fraction served [0,1] and decrements the sol energy budget. */
  const serve = (kwe: number): number => {
    const need = kwe * HOURS_PER_SOL;
    if (need <= 0) {
      return 1;
    }
    const got = Math.min(need, energyKwh);
    energyKwh -= got;
    return got / need;
  };

  const fLife = serve(dLife);
  const fGreenhouse = serve(dGreenhouse);
  const fWaste = serve(dWaste);
  const fFab = serve(dFab);
  // Whatever remains in energyKwh is the ISRU + soil-factory budget.

  // Blackout accounting happens after the human O2 balance below, because a
  // life-support failure is power OR breathing gas — either one counts.

  // ---- greenhouses ---------------------------------------------------------
  // Light: sun-grown area follows sky transmittance; LED area follows power.
  const solarLight = clamp(sun / 0.5, 0, 1); // ~1.0 in a quiet season, collapses in a storm
  const ledLight = fGreenhouse;
  const lightWeighted = safeDiv(ghAreaSolar * solarLight + ghAreaLed * ledLight, ghArea, 0);

  // Growing media: substrate + clean soil count fully; bare regolith keeps
  // beds alive at the perchlorate-stress multiplier (Hecht 2009).
  const mediaEquiv = inv.substrateKg + inv.cleanSoilKg + inv.compostKg * 0.5;
  const mediaNeed = ghArea * MEDIA_KG_PER_M2;
  const mediaFactor =
    ghArea <= 0
      ? 0
      : clamp(
          DIRTY_SOIL_YIELD_MULTIPLIER +
            (1 - DIRTY_SOIL_YIELD_MULTIPLIER) * safeDiv(mediaEquiv, mediaNeed, 0),
          DIRTY_SOIL_YIELD_MULTIPLIER,
          1,
        );

  // First pass: potential dry-biomass demand to size nutrient/CO2/water factors.
  let potDryTotal = 0;
  let potNDemand = 0;
  let potPDemand = 0;
  let potWaterDemand = 0;
  for (const crop of CROPS) {
    const area = ghArea * (s.cropMix[crop.id] ?? 0);
    const freshTotal = (crop.edibleGPerM2Sol / 1000 / crop.edibleFraction) * area;
    const potFresh = freshTotal * lightWeighted * mediaFactor * eff;
    const dry = potFresh * crop.dryMatterFraction;
    potDryTotal += dry;
    potNDemand += dry * N_PER_KG_DRY_BIOMASS * (crop.fixesNitrogen ? 0.25 : 1);
    potPDemand += dry * P_PER_KG_DRY_BIOMASS;
    // Water demand = the water LOCKED INTO fresh tissue (fresh mass is mostly
    // water) + the unrecovered share of transpiration. Biomass is a real
    // water sink: a lush greenhouse street can starve the electrolyzers.
    potWaterDemand +=
      potFresh * (1 - crop.dryMatterFraction) +
      potFresh * crop.edibleFraction * crop.waterLPerKgEdible * (1 - WATER_RECYCLE_FRACTION);
  }
  const co2Demand = potDryTotal * CO2_PER_KG_DRY_BIOMASS;
  const nFactor = potNDemand <= 0 ? 1 : clamp(safeDiv(inv.nitrogenKg, potNDemand, 0), 0, 1);
  const pFactor = potPDemand <= 0 ? 1 : clamp(safeDiv(inv.phosphorusKg, potPDemand, 0), 0, 1);
  const co2Factor = co2Demand <= 0 ? 1 : clamp(safeDiv(inv.co2Kg, co2Demand, 0), 0, 1);
  // Crops may only drink what is above a ~5-sol crew drinking buffer.
  const waterForCrops = Math.max(0, inv.waterKg - drinkingBufferKg(s.population));
  const waterFactor =
    potWaterDemand <= 0 ? 1 : clamp(safeDiv(waterForCrops, potWaterDemand, 0), 0, 1);
  const growFactor = Math.min(nFactor, pFactor, co2Factor, waterFactor);
  if (waterFactor < 0.5 && ghArea > 0 && Math.floor(s.sol) % 40 === 2) {
    logEvent(s, 'warning', 'Greenhouse water-starved: the tank cannot cover tissue water + transpiration losses. Mine more ice or shrink planted area.');
  }

  // Second pass: realized growth, harvests, and the mass bookkeeping.
  let dryFixedTotal = 0;
  let edibleTotal = 0;
  let waterUsedNet = 0;
  const harvestedCrops: string[] = [];
  for (const crop of CROPS) {
    const area = ghArea * (s.cropMix[crop.id] ?? 0);
    if (area <= 0) {
      continue;
    }
    const freshPotential = (crop.edibleGPerM2Sol / 1000 / crop.edibleFraction) * area;
    const fresh = freshPotential * lightWeighted * mediaFactor * eff * growFactor;
    const dry = fresh * crop.dryMatterFraction;
    const edible = fresh * crop.edibleFraction;
    const inedible = fresh - edible;
    dryFixedTotal += dry;
    edibleTotal += edible;
    // Continuous-flow approximation of discrete harvests: a mature stand of a
    // crop with harvestSols cycle yields its cycle average every sol.
    inv.localFoodKg[crop.id] = (inv.localFoodKg[crop.id] ?? 0) + edible;
    inv.feedstockKg += inedible;
    // Transpiration: most water condenses and recycles; only the loss fraction
    // leaves the pool. The water LOCKED INTO fresh tissue also leaves — it
    // comes back later when the food is eaten or the biomass is composted.
    waterUsedNet +=
      edible * crop.waterLPerKgEdible * (1 - WATER_RECYCLE_FRACTION) +
      fresh * (1 - crop.dryMatterFraction);
    if (edible > 0.01) {
      harvestedCrops.push(crop.id);
    }
  }
  // Elemental draws for the fixed biomass.
  inv.nitrogenKg = Math.max(0, inv.nitrogenKg - dryFixedTotal * N_PER_KG_DRY_BIOMASS * 0.85);
  inv.phosphorusKg = Math.max(0, inv.phosphorusKg - dryFixedTotal * P_PER_KG_DRY_BIOMASS);
  inv.potassiumKg = Math.max(0, inv.potassiumKg - dryFixedTotal * 0.025);
  inv.co2Kg = Math.max(0, inv.co2Kg - dryFixedTotal * CO2_PER_KG_DRY_BIOMASS);
  inv.o2Kg += dryFixedTotal * O2_PER_KG_DRY_BIOMASS;
  inv.waterKg = Math.max(0, inv.waterKg - waterUsedNet);
  credit(ledger.produced, 'food', edibleTotal);
  s.localOutputTonnes += edibleTotal / 1000;

  // Variety window: decay old harvest credit, add today's.
  for (const key of Object.keys(s.recentHarvests)) {
    s.recentHarvests[key] = Math.max(0, s.recentHarvests[key] - 1);
    if (s.recentHarvests[key] <= 0) {
      delete s.recentHarvests[key];
    }
  }
  for (const id of harvestedCrops) {
    s.recentHarvests[id] = 60;
  }

  // ---- humans --------------------------------------------------------------
  const pop = s.population;
  const kcalNeed = pop * HUMAN_KCAL_PER_SOL;
  const proteinNeed = pop * HUMAN_PROTEIN_G_PER_SOL;
  let kcalGot = 0;
  let proteinGot = 0;
  let localFoodEaten = 0;
  // Eat local fresh food first (it spoils; Earth rations keep).
  for (const crop of CROPS) {
    if (kcalGot >= kcalNeed) {
      break;
    }
    const avail = inv.localFoodKg[crop.id] ?? 0;
    if (avail <= 0) {
      continue;
    }
    const kcalPerKg = Math.max(1, crop.kcalPerKg);
    const wantKg = (kcalNeed - kcalGot) / kcalPerKg;
    const eatKg = Math.min(avail, wantKg);
    inv.localFoodKg[crop.id] = avail - eatKg;
    kcalGot += eatKg * crop.kcalPerKg;
    proteinGot += eatKg * crop.proteinGPerKg;
    localFoodEaten += eatKg;
    // The water locked in fresh food re-enters the loop through urine and
    // humidity condensate, at recycler efficiency. Earth rations are
    // dehydrated — no water credit there.
    inv.waterKg += eatKg * (1 - crop.dryMatterFraction) * WATER_RECYCLE_FRACTION;
    s.ventedKg += eatKg * (1 - crop.dryMatterFraction) * (1 - WATER_RECYCLE_FRACTION);
  }
  let earthFoodEaten = 0;
  if (kcalGot < kcalNeed && inv.earthFoodKg > 0) {
    const wantKg = (kcalNeed - kcalGot) / EARTH_FOOD_KCAL_PER_KG;
    earthFoodEaten = Math.min(inv.earthFoodKg, wantKg);
    inv.earthFoodKg -= earthFoodEaten;
    kcalGot += earthFoodEaten * EARTH_FOOD_KCAL_PER_KG;
    proteinGot += earthFoodEaten * EARTH_FOOD_PROTEIN_G_PER_KG;
  }
  const earthFoodFraction = safeDiv(
    earthFoodEaten * EARTH_FOOD_KCAL_PER_KG,
    Math.max(1, kcalGot),
    0,
  );

  // Hunger tracks three distinct failures: raw calories, protein, and variety.
  const kcalOk = kcalGot >= kcalNeed * 0.9;
  const proteinOk = proteinGot >= proteinNeed * 0.8;
  const varietyOk =
    earthFoodFraction > 0.25 || Object.keys(s.recentHarvests).length >= VARIETY_MIN_CROPS;
  if (!kcalOk) {
    s.hungerSols += 1;
    if (s.hungerSols === 10) {
      logEvent(s, 'warning', 'Caloric deficit 10 sols running. Rations short, greenhouses not covering.');
    }
  } else if (!proteinOk || !varietyOk) {
    s.hungerSols += 0.34; // deficiency kills slower than starvation
    if (!proteinOk && Math.floor(s.sol) % 40 === 0) {
      logEvent(s, 'warning', 'Calories exist but protein/N fails — legume and spirulina area is too small.');
    }
    if (!varietyOk && Math.floor(s.sol) % 40 === 1) {
      logEvent(s, 'warning', 'Diet variety collapse (scurvy-class risk): fewer than 3 crops harvested in 60 sols.');
    }
  } else {
    s.hungerSols = Math.max(0, s.hungerSols - 0.5);
  }

  // Breathing, water, and wastes. People breathe the same amount whether or
  // not the grid is up — power shortage does NOT scale metabolic O2.
  const o2Need = pop * HUMAN_O2_KG_PER_SOL;
  let o2Unmet = 0;
  if (inv.o2Kg >= o2Need) {
    inv.o2Kg -= o2Need;
  } else {
    // Emergency: gasify LOX for breathing before anyone suffocates. Propellant
    // margin pays for the life-support shortfall — as it should.
    let shortfall = o2Need - inv.o2Kg;
    inv.o2Kg = 0;
    const fromLox = Math.min(inv.loxKg, shortfall);
    inv.loxKg -= fromLox;
    shortfall -= fromLox;
    if (fromLox > 0 && Math.floor(s.sol) % 20 === 0) {
      logEvent(s, 'warning', 'Breathing gas short — gasifying LOX from the propellant farm to keep the crew alive.');
    }
    o2Unmet = shortfall;
  }
  inv.co2Kg += pop * HUMAN_CO2_KG_PER_SOL;
  inv.waterKg = Math.max(0, inv.waterKg - pop * HUMAN_WATER_KG_PER_SOL * (1 - WATER_RECYCLE_FRACTION));
  inv.feedstockKg += pop * HUMAN_SOLID_WASTE_KG_PER_SOL;
  // Urine N recovery: captured to the fertilizer pool; the sim's brine loss is the (1-recycle) water share.
  inv.nitrogenKg += pop * HUMAN_URINE_KG_PER_SOL * URINE_N_FRACTION * 0.85;
  inv.phosphorusKg += pop * HUMAN_P_KG_PER_SOL;

  // Life-support failure accounting: power below ECLSS demand OR unmet
  // breathing gas both count toward the blackout clock.
  if (fLife < 0.999 || o2Unmet > 0) {
    s.blackoutSols += 1;
    if (s.blackoutSols === 5) {
      logEvent(
        s,
        'warning',
        o2Unmet > 0
          ? 'Breathing O2 unmet with LOX exhausted. This is the countdown that matters.'
          : `Power below life-support demand ${s.blackoutSols} sols running (tau=${tau.toFixed(1)}). ISRU is dark; batteries are the plot now.`,
      );
    }
  } else {
    s.blackoutSols = 0;
  }

  // ---- compost & digesters -------------------------------------------------
  const compostCap = s.structures.composter * STRUCTURES.composter.capacityValue * fWaste * eff;
  const digesterCap = s.structures.digester * STRUCTURES.digester.capacityValue * fWaste * eff;
  // Aerobic compost needs O2; the pile cannot load beyond the habitat O2 margin.
  const o2Margin = Math.max(0, inv.o2Kg - pop * O2_RESERVE_KG_PER_PERSON * 0.5);
  const compostLoad = Math.min(compostCap, inv.feedstockKg, safeDiv(o2Margin, COMPOST_O2_PER_KG_FEED, 0));
  if (compostLoad > 0) {
    const nIn = compostLoad * SOLID_WASTE_N_FRACTION * 2; // feedstock is biomass-rich; ASSUMED 3% N wet-basis
    inv.feedstockKg -= compostLoad;
    inv.o2Kg = Math.max(0, inv.o2Kg - compostLoad * COMPOST_O2_PER_KG_FEED);
    inv.co2Kg += compostLoad * COMPOST_CO2_PER_KG_FEED;
    s.compostBatches.push({ startSol: s.sol, feedKg: compostLoad, nKg: nIn, pKg: compostLoad * 0.003 });
  }
  const digestLoad = Math.min(digesterCap, inv.feedstockKg);
  if (digestLoad > 0) {
    inv.feedstockKg -= digestLoad;
    inv.co2Kg += digestLoad * DIGESTER_CO2_PER_KG_FEED;
    s.digesterBatches.push({ startSol: s.sol, feedKg: digestLoad, nKg: digestLoad * 0.03, pKg: digestLoad * 0.003 });
  }
  // Mature batches release their products. Quality is 1.0 at full duration by construction.
  s.compostBatches = s.compostBatches.filter((b) => {
    if (s.sol - b.startSol < COMPOST_MATURITY_SOLS) {
      return true;
    }
    const out = b.feedKg * COMPOST_YIELD_FRACTION;
    inv.compostKg += out;
    inv.nitrogenKg += b.nKg * COMPOST_N_RETENTION;
    inv.phosphorusKg += b.pKg;
    // Closing the water books: feed + O2 in = compost + CO2 + water vapor out.
    // The vapor is condenser-recoverable at recycler efficiency; the rest vents.
    const waterOut =
      b.feedKg * (1 + COMPOST_O2_PER_KG_FEED - COMPOST_YIELD_FRACTION - COMPOST_CO2_PER_KG_FEED);
    inv.waterKg += waterOut * WATER_RECYCLE_FRACTION;
    s.ventedKg += waterOut * (1 - WATER_RECYCLE_FRACTION);
    credit(ledger.produced, 'compost', out);
    s.localOutputTonnes += out / 1000;
    return false;
  });
  s.digesterBatches = s.digesterBatches.filter((b) => {
    if (s.sol - b.startSol < DIGESTER_CYCLE_SOLS) {
      return true;
    }
    const ch4 = b.feedKg * DIGESTER_CH4_PER_KG_FEED;
    inv.ch4Kg += ch4; // biogas methane joins the propellant/heat pool
    inv.compostKg += b.feedKg * DIGESTER_DIGESTATE_FRACTION;
    inv.nitrogenKg += b.nKg * DIGESTER_N_RETENTION;
    inv.phosphorusKg += b.pKg;
    // Remaining mass is process water: recover at recycler efficiency, vent the rest.
    const digWater =
      b.feedKg * (1 - DIGESTER_DIGESTATE_FRACTION - DIGESTER_CH4_PER_KG_FEED - DIGESTER_CO2_PER_KG_FEED);
    inv.waterKg += digWater * WATER_RECYCLE_FRACTION;
    s.ventedKg += digWater * (1 - WATER_RECYCLE_FRACTION);
    credit(ledger.produced, 'compost', b.feedKg * DIGESTER_DIGESTATE_FRACTION);
    credit(ledger.produced, 'methane', ch4);
    s.localOutputTonnes += (ch4 + b.feedKg * DIGESTER_DIGESTATE_FRACTION) / 1000;
    return false;
  });

  // ---- soil factory ----------------------------------------------------------
  const tier = industryTierFor(s.localOutputTonnes).tier;
  const soilCapKg = s.structures.soilFactory * STRUCTURES.soilFactory.capacityValue * eff;
  if (soilCapKg > 0 && tier >= 1) {
    const washEnergy = soilCapKg * PERCHLORATE_WASH_KWH_PER_KG;
    const washFrac = clamp(safeDiv(Math.min(energyKwh, washEnergy), washEnergy, 0), 0, 1);
    const regolithWashed = soilCapKg * washFrac;
    energyKwh -= regolithWashed * PERCHLORATE_WASH_KWH_PER_KG;
    // Blending needs organics: compost at SOIL_COMPOST_FRACTION of the batch.
    const compostNeeded = regolithWashed * SOIL_COMPOST_FRACTION;
    const compostUsed = Math.min(inv.compostKg, compostNeeded);
    const soilMade = compostUsed > 0 ? compostUsed / SOIL_COMPOST_FRACTION + compostUsed : 0;
    if (soilMade > 0) {
      inv.compostKg -= compostUsed;
      inv.cleanSoilKg += soilMade;
      inv.waterKg = Math.max(
        0,
        inv.waterKg - (soilMade - compostUsed) * PERCHLORATE_WASH_WATER_PER_KG * (1 - WATER_RECYCLE_FRACTION),
      );
      credit(ledger.produced, 'soil', soilMade);
      s.localOutputTonnes += soilMade / 1000;
    }
  }

  // ---- ISRU: water, CO2, Sabatier, LOX, electrolysis -------------------------
  // Order matters: Sabatier + LOX run on YESTERDAY's hydrogen/oxygen first
  // (cheap kWh/kg), then electrolysis absorbs whatever energy remains. If
  // electrolysis went first it would starve the reactor every sol and the
  // hydrogen buffer would only ever grow and leak.
  const elCap = s.structures.electrolyzer * STRUCTURES.electrolyzer.capacityValue * eff;
  const sabCap = s.structures.sabatier * STRUCTURES.sabatier.capacityValue * eff;

  // Ice mining: energy per kg grows with overburden depth (ASSUMED linear 20%/m).
  // The mine idles once the tank holds the protected reserve plus ~30 sols of
  // electrolyzer feed — megawatt-hours are too scarce to stockpile water.
  const waterReserve =
    (pop * HUMAN_WATER_KG_PER_SOL + edibleTotal * 40) * WATER_RESERVE_SOLS * (1 - WATER_RECYCLE_FRACTION) +
    pop * 200; // hard floor. ASSUMED.
  const waterCeiling = waterReserve + elCap * 30;
  const icePerKgKwh = ICE_MINE_KWH_PER_KG_H2O_BASE * (1 + 0.2 * site.iceDepthM) / Math.max(0.2, site.icePurity);
  const mineCap = s.structures.iceMine * STRUCTURES.iceMine.capacityValue * eff;
  const waterMined = Math.min(
    mineCap,
    safeDiv(energyKwh, icePerKgKwh, 0),
    Math.max(0, waterCeiling - inv.waterKg),
  );
  if (waterMined > 0) {
    energyKwh -= waterMined * icePerKgKwh;
    inv.waterKg += waterMined;
    credit(ledger.produced, 'water', waterMined);
    s.localOutputTonnes += waterMined / 1000;
  }

  // CO2 intake at ~6 mbar: real compression work, capped by hardware and by a
  // buffer ceiling (~10 sols of Sabatier feed + 20 sols of plant demand).
  const co2Ceiling = sabCap * SABATIER_CO2_PER_KG_CH4 * 10 + co2Demand * 20 + 2000;
  const co2Cap = s.structures.compressor * STRUCTURES.compressor.capacityValue * eff * ATMOSPHERE_CO2_MASS_FRACTION;
  const co2Made = Math.min(
    co2Cap,
    safeDiv(energyKwh, CO2_INTAKE_KWH_PER_KG, 0),
    Math.max(0, co2Ceiling - inv.co2Kg),
  );
  if (co2Made > 0) {
    energyKwh -= co2Made * CO2_INTAKE_KWH_PER_KG;
    inv.co2Kg += co2Made;
  }

  // Sabatier: CO2 + 4 H2 -> CH4 + 2 H2O. Recycled water goes straight back to the tank.
  const sabKwhPerKg = SABATIER_AUX_KWH_PER_KG_CH4 + LIQUEFACTION_KWH_PER_KG_CH4;
  const cryoCapacity = s.structures.cryoPlant * STRUCTURES.cryoPlant.capacityValue;
  const methaloxStored = inv.ch4Kg + inv.loxKg;
  const cryoHeadroom = Math.max(0, cryoCapacity - methaloxStored);
  const ch4Made = Math.min(
    sabCap,
    safeDiv(inv.h2Kg, SABATIER_H2_PER_KG_CH4, 0),
    safeDiv(inv.co2Kg, SABATIER_CO2_PER_KG_CH4, 0),
    safeDiv(energyKwh, sabKwhPerKg, 0),
    cryoHeadroom / (1 + LOX_TO_CH4_RATIO),
  );
  if (ch4Made > 0) {
    energyKwh -= ch4Made * sabKwhPerKg;
    inv.h2Kg -= ch4Made * SABATIER_H2_PER_KG_CH4;
    inv.co2Kg -= ch4Made * SABATIER_CO2_PER_KG_CH4;
    inv.waterKg += ch4Made * SABATIER_H2O_PER_KG_CH4;
    inv.ch4Kg += ch4Made;
    credit(ledger.produced, 'methane', ch4Made);
    s.localOutputTonnes += ch4Made / 1000;
  }

  // LOX: liquefy surplus O2 toward the 3.6:1 mixture ratio, protecting breathing gas.
  const loxTarget = inv.ch4Kg * LOX_TO_CH4_RATIO;
  const o2Spare = Math.max(0, inv.o2Kg - pop * O2_RESERVE_KG_PER_PERSON);
  const loxMake = Math.min(
    Math.max(0, loxTarget - inv.loxKg),
    o2Spare,
    safeDiv(energyKwh, LIQUEFACTION_KWH_PER_KG_O2, 0),
  );
  if (loxMake > 0) {
    energyKwh -= loxMake * LIQUEFACTION_KWH_PER_KG_O2;
    inv.o2Kg -= loxMake;
    inv.loxKg += loxMake;
  }

  // Electrolysis last: split spare water into tomorrow's H2 (Sabatier feed)
  // and O2 (breathing + LOX) with every kWh still on the bus.
  const waterSpare = Math.max(0, inv.waterKg - waterReserve);
  const kwhPerKgH2o = H2_PER_KG_H2O * ELECTROLYSIS_KWH_PER_KG_H2;
  // Do not electrolyze more H2 than ~5 sols of Sabatier demand: H2 leaks.
  const h2Ceiling = Math.max(500, sabCap * SABATIER_H2_PER_KG_CH4 * 5);
  const waterSplit = Math.min(
    elCap,
    waterSpare,
    safeDiv(energyKwh, kwhPerKgH2o, 0),
    safeDiv(Math.max(0, h2Ceiling - inv.h2Kg), H2_PER_KG_H2O, 0),
  );
  if (waterSplit > 0) {
    energyKwh -= waterSplit * kwhPerKgH2o;
    inv.waterKg -= waterSplit;
    inv.h2Kg += waterSplit * H2_PER_KG_H2O;
    inv.o2Kg += waterSplit * O2_PER_KG_H2O;
    credit(ledger.produced, 'oxygen', waterSplit * O2_PER_KG_H2O);
    s.localOutputTonnes += (waterSplit * O2_PER_KG_H2O) / 1000;
  }

  // Boil-off and hydrogen leaks: the open-loop tax.
  const boiloff = (inv.loxKg + inv.ch4Kg) * TANK_BOILOFF_PER_SOL;
  inv.loxKg *= 1 - TANK_BOILOFF_PER_SOL;
  inv.ch4Kg *= 1 - TANK_BOILOFF_PER_SOL;
  const h2Leak = inv.h2Kg * H2_LEAK_PER_SOL;
  inv.h2Kg -= h2Leak;
  s.ventedKg += boiloff + h2Leak;
  if (h2Leak > 1 && inv.h2Kg < 200 && Math.floor(s.sol) % 60 === 0) {
    logEvent(s, 'warning', 'Hydrogen buffer nearly dry — the ISRU loop is opening. Import seed H2 or split more water.');
  }

  // ---- fabrication shop ------------------------------------------------------
  const sparesMade = s.structures.fabShop * STRUCTURES.fabShop.capacityValue * fFab * eff;
  if (sparesMade > 0) {
    inv.sparesKg += sparesMade;
    credit(ledger.produced, 'spares', sparesMade);
    s.localOutputTonnes += sparesMade / 1000;
  }

  // ---- random failures (Weibull-ish wear-out) --------------------------------
  // Fleet-average hazard ~ failureWeight / characteristic life. ETFE films and
  // dust-eating machinery carry weight 2.5-3; sintered slabs ~0.4.
  let weightedUnits = 0;
  for (const id of Object.keys(s.structures) as Array<keyof typeof s.structures>) {
    weightedUnits += s.structures[id] * STRUCTURES[id].failureWeight;
  }
  const expectedFailures = weightedUnits / SPARES_CHARACTERISTIC_LIFE_SOLS;
  const draw = rngNext(s.rng);
  s.rng = draw.next;
  let failures = Math.floor(expectedFailures);
  if (draw.value < expectedFailures - failures) {
    failures += 1;
  }
  s.pendingFailures += failures;
  // Repairs: crew fixes anything spares can cover.
  while (s.pendingFailures > 0 && inv.sparesKg >= SPARES_KG_PER_REPAIR) {
    inv.sparesKg -= SPARES_KG_PER_REPAIR;
    s.pendingFailures -= 1;
  }
  if (failures > 0 && inv.sparesKg < SPARES_KG_PER_REPAIR) {
    logEvent(s, 'warning', `Hardware failure with no spares on the shelf (${s.pendingFailures} open). Plant efficiency degrading.`);
  }

  // ---- clock & window logistics ----------------------------------------------
  s.sol += 1;
  const nextWindow = s.window + 1;
  const arrivalSol = nextWindow * SOLS_PER_SYNODIC_WINDOW;
  if (s.sol >= arrivalSol) {
    arriveWindow(s, nextWindow);
  }
  const departureSol = s.window * SOLS_PER_SYNODIC_WINDOW + DEPARTURE_OFFSET_SOLS;
  if (s.window >= 1 && s.sol === departureSol) {
    attemptDeparture(s);
  }

  // ---- end states --------------------------------------------------------------
  if (s.hungerSols > 30 && s.endState === '') {
    s.endState = 'STARVED';
    logEvent(s, 'failure', 'STARVED. The ledgers were honest; the manifest was not.');
  }
  if (s.blackoutSols > 20 && s.endState === '') {
    s.endState = 'DUST YEAR BLACKOUT';
    logEvent(s, 'failure', 'DUST YEAR BLACKOUT. Solar fell below life support for 20 sols with no reserve.');
  }
  const quota = s.params.methaloxPerShipT * 1000 * s.params.returnShipsPerWindow;
  if (s.endState === '' && inv.ch4Kg + inv.loxKg >= quota && quota > 0) {
    const already = s.events.some((e) => e.text.startsWith('RETURN FUEL READY'));
    if (!already) {
      s.endState = 'RETURN FUEL READY';
      logEvent(s, 'milestone', `RETURN FUEL READY: ${((inv.ch4Kg + inv.loxKg) / 1000).toFixed(0)} t methalox banked — ships can go home.`);
    }
  }

  // ---- snapshot -----------------------------------------------------------------
  const snap: SolSnapshot = {
    sol: s.sol,
    tau,
    powerAvailKwe: supplyKwe,
    powerDemandKwe: totalFixedDemand,
    waterKg: inv.waterKg,
    methaloxKg: inv.ch4Kg + inv.loxKg,
    o2Kg: inv.o2Kg,
    kcalPerPersonSol: safeDiv(kcalGot, pop, 0),
    earthFoodFraction,
    selfSufficiency: selfSufficiencyOf(ledger),
    nitrogenKg: inv.nitrogenKg,
    compostKg: inv.compostKg,
    greenhouseM2: ghArea,
    population: pop,
  };
  s.history.push(snap);
  void localFoodEaten;
  return s;
}

/** Land the queued manifest for `w`, capped to the window's total payload. */
function arriveWindow(s: SimState, w: number): void {
  s.window = w;
  if (s.endState === 'RETURN FUEL READY') {
    s.endState = ''; // a new window reopens the game after a win flag
  }
  const capacityKg = s.params.shipsPerWindow * s.params.starshipPayloadT * 1000;
  const m = s.manifests[w];
  const imported: Record<string, number> = {};
  let landedKg = 0;
  const tierNow = industryTierFor(s.localOutputTonnes).tier;

  if (m) {
    // Structures land first (local industry discounts their import mass), then consumables, until capacity.
    for (const [idRaw, countRaw] of Object.entries(m.structures)) {
      const id = idRaw as StructureId;
      const spec = STRUCTURES[id];
      const localFrac = tierNow >= spec.localTier ? spec.maxLocalFraction : 0;
      const importMassPer = spec.massKg * (1 - localFrac);
      let count = Math.max(0, Math.floor(countRaw ?? 0));
      while (count > 0 && landedKg + importMassPer <= capacityKg) {
        s.structures[id] += 1;
        landedKg += importMassPer;
        credit(imported, 'structures', importMassPer);
        if (localFrac > 0) {
          // The locally-made share is produced mass, not imported mass.
          s.localOutputTonnes += (spec.massKg * localFrac) / 1000;
        }
        count -= 1;
      }
    }
    const consumables: ReadonlyArray<readonly [string, number, (kg: number) => void]> = [
      ['food', m.earthFoodKg, (kgIn) => { s.inv.earthFoodKg += kgIn; }],
      ['spares', m.sparesKg, (kgIn) => { s.inv.sparesKg += kgIn; }],
      ['hydrogen', m.h2Kg, (kgIn) => { s.inv.h2Kg += kgIn; }],
      ['substrate', m.substrateKg, (kgIn) => { s.inv.substrateKg += kgIn; }],
      ['fertilizer', m.fertilizerNKg, (kgIn) => { s.inv.nitrogenKg += kgIn; }],
      ['fertilizer', m.fertilizerPkKg, (kgIn) => {
        s.inv.phosphorusKg += kgIn * 0.4;
        s.inv.potassiumKg += kgIn * 0.6;
      }],
    ];
    for (const [cat, wanted, apply] of consumables) {
      const room = Math.max(0, capacityKg - landedKg);
      const got = Math.min(wanted, room);
      if (got > 0) {
        apply(got);
        landedKg += got;
        credit(imported, cat, got);
      }
    }
    const crewMass = m.crew * 500;
    if (m.crew > 0 && landedKg + crewMass <= capacityKg) {
      s.population += m.crew;
      landedKg += crewMass;
      credit(imported, 'people', crewMass);
    }
  }

  const shipsLanded = landedKg > 0 ? Math.max(1, Math.ceil(landedKg / (s.params.starshipPayloadT * 1000))) : 0;
  const prev = s.ledgers[s.ledgers.length - 1];
  const prevSelf = selfSufficiencyOf(prev);
  if (prevSelf >= 0.8) {
    s.closedLoopWindows += 1;
    if (s.closedLoopWindows >= 3 && s.endState === '') {
      s.endState = 'SURVIVED 3 WINDOWS CLOSED-LOOP';
      logEvent(s, 'milestone', 'SURVIVED 3 WINDOWS CLOSED-LOOP. The city feeds itself. Mars is still red; the streets are green.');
    }
  } else {
    s.closedLoopWindows = 0;
  }

  s.ledgers.push({ window: w, imported, produced: {}, shipsLanded, shipsDeparted: 0, shipsStranded: 0 });
  logEvent(
    s,
    shipsLanded > 0 ? 'milestone' : 'warning',
    shipsLanded > 0
      ? `Window ${w}: ${shipsLanded} ships down, ${(landedKg / 1000).toFixed(1)} t landed. Last window self-sufficiency ${(prevSelf * 100).toFixed(0)}%.`
      : `Window ${w} opened with NO queued cargo. Next chance in ~26 months.`,
  );
}

/** Attempt the crewed return burn: quota methalox or the ships stay. */
function attemptDeparture(s: SimState): void {
  const ledger = s.ledgers[s.ledgers.length - 1];
  const ships = s.params.returnShipsPerWindow;
  const needKg = s.params.methaloxPerShipT * 1000 * ships;
  const ch4Need = needKg / (1 + LOX_TO_CH4_RATIO);
  const loxNeed = needKg - ch4Need;
  if (s.inv.ch4Kg >= ch4Need && s.inv.loxKg >= loxNeed) {
    s.inv.ch4Kg -= ch4Need;
    s.inv.loxKg -= loxNeed;
    ledger.shipsDeparted += ships;
    logEvent(s, 'milestone', `Departure burn: ${ships} ship(s) home on ${(needKg / 1000).toFixed(0)} t of local methalox.`);
  } else {
    ledger.shipsStranded += ships;
    logEvent(s, 'failure', `Departure window MISSED: needed ${(needKg / 1000).toFixed(0)} t methalox, had ${((s.inv.ch4Kg + s.inv.loxKg) / 1000).toFixed(0)} t. Crew waits ~26 months.`);
    if (s.endState === '') {
      s.endState = 'STRANDED (NO METHALOX)';
    }
  }
}
