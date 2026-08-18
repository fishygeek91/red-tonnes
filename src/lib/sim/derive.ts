/**
 * Derived, read-only views over SimState used by the UI, the top bar,
 * and the mission brief. Nothing here mutates state.
 */

import {
  DEPARTURE_OFFSET_SOLS,
  EARTH_FOOD_KCAL_PER_KG,
  HUMAN_KCAL_PER_SOL,
  HUMAN_WATER_KG_PER_SOL,
  LOX_TO_CH4_RATIO,
  MARS_SURFACE_PRESSURE_MBAR,
  SOLS_PER_SYNODIC_WINDOW,
  SPARES_CHARACTERISTIC_LIFE_SOLS,
  SPARES_KG_PER_REPAIR,
  WATER_RECYCLE_FRACTION,
} from '../constants';
import { CROPS } from '../crops';
import { STRUCTURES } from '../structures';
import { safeDiv } from '../types';
import type { SimState } from './state';
import { selfSufficiencyOf } from './step';

/** Everything the top bar shows, precomputed. */
export interface TopBarStats {
  readonly window: number;
  readonly solsToNextArrival: number;
  readonly solsToNextDeparture: number;
  readonly selfSufficiency: number;
  readonly methaloxT: number;
  readonly shipsFuelable: number;
  readonly kcalPerPersonSol: number;
  readonly waterDaysReserve: number;
  readonly pressureMbar: number;
  readonly tau: number;
  readonly earthFoodFraction: number;
}

/** Compute the top-bar stats for the current state. */
export function topBarStats(s: SimState): TopBarStats {
  const last = s.history[s.history.length - 1];
  const nextArrival = (s.window + 1) * SOLS_PER_SYNODIC_WINDOW;
  const nextDeparture = s.window * SOLS_PER_SYNODIC_WINDOW + DEPARTURE_OFFSET_SOLS;
  const methaloxKg = s.inv.ch4Kg + s.inv.loxKg;
  const perShip = Math.max(1, s.params.methaloxPerShipT * 1000);
  // Ships fuelable requires BOTH species at the 3.6:1 ratio, not just total mass.
  const ch4Ships = safeDiv(s.inv.ch4Kg * (1 + LOX_TO_CH4_RATIO), perShip, 0);
  const loxShips = safeDiv((s.inv.loxKg * (1 + LOX_TO_CH4_RATIO)) / LOX_TO_CH4_RATIO, perShip, 0);
  const waterNetPerSol = Math.max(
    0.001,
    s.population * HUMAN_WATER_KG_PER_SOL * (1 - WATER_RECYCLE_FRACTION),
  );
  return {
    window: s.window,
    solsToNextArrival: Math.max(0, nextArrival - s.sol),
    solsToNextDeparture: Math.max(0, nextDeparture - s.sol),
    selfSufficiency: selfSufficiencyOf(s.ledgers[s.ledgers.length - 1]),
    methaloxT: methaloxKg / 1000,
    shipsFuelable: Math.min(ch4Ships, loxShips),
    kcalPerPersonSol: last ? last.kcalPerPersonSol : HUMAN_KCAL_PER_SOL,
    waterDaysReserve: s.inv.waterKg / waterNetPerSol,
    pressureMbar: MARS_SURFACE_PRESSURE_MBAR,
    tau: last ? last.tau : 0.4,
    earthFoodFraction: last ? last.earthFoodFraction : 1,
  };
}

/**
 * The harder resilience test: could the city survive TWO consecutive missed
 * windows (~2 x 759 sols) on current stores plus current local production?
 * Checks food and spares runways independently.
 */
export interface MissedWindowTest {
  readonly passes: boolean;
  readonly foodRunwaySols: number;
  readonly sparesRunwaySols: number;
  readonly requiredSols: number;
}

/** Evaluate the 2-missed-windows survival test. */
export function missedWindowTest(s: SimState): MissedWindowTest {
  const required = 2 * SOLS_PER_SYNODIC_WINDOW;
  const kcalNeedPerSol = Math.max(1, s.population * HUMAN_KCAL_PER_SOL);
  let kcalStored = s.inv.earthFoodKg * EARTH_FOOD_KCAL_PER_KG;
  for (const crop of CROPS) {
    kcalStored += (s.inv.localFoodKg[crop.id] ?? 0) * crop.kcalPerKg;
  }
  // Local production rate: average edible kcal over the last 30 sols of history.
  const recent = s.history.slice(-30);
  const kcalGrownPerSol =
    recent.length > 0
      ? recent.reduce((a, h) => a + h.kcalPerPersonSol * h.population, 0) / recent.length
      : 0;
  const netBurn = Math.max(1, kcalNeedPerSol - Math.min(kcalGrownPerSol, kcalNeedPerSol * 0.98));
  const foodRunway = kcalStored / netBurn + (kcalGrownPerSol >= kcalNeedPerSol ? required : 0);
  const failuresPerSol = Math.max(
    0.0001,
    Object.values(s.structures).reduce((a, b) => a + b, 0) / SPARES_CHARACTERISTIC_LIFE_SOLS,
  );
  const sparesRunway = s.inv.sparesKg / (failuresPerSol * SPARES_KG_PER_REPAIR);
  return {
    passes: foodRunway >= required && sparesRunway >= required * 0.5,
    foodRunwaySols: foodRunway,
    sparesRunwaySols: sparesRunway,
    requiredSols: required,
  };
}

/** One Sankey link: Earth cargo (or local output) into a city subsystem. */
export interface SankeyFlow {
  readonly label: string;
  readonly kg: number;
  readonly kind: 'imported' | 'produced';
}

/** Flows for the current window's Sankey diagram. */
export function sankeyFlows(s: SimState): SankeyFlow[] {
  const ledger = s.ledgers[s.ledgers.length - 1];
  const flows: SankeyFlow[] = [];
  for (const [k, v] of Object.entries(ledger.imported)) {
    flows.push({ label: k, kg: v, kind: 'imported' });
  }
  for (const [k, v] of Object.entries(ledger.produced)) {
    flows.push({ label: k, kg: v, kind: 'produced' });
  }
  return flows.filter((f) => f.kg > 0.5).sort((a, b) => b.kg - a.kg);
}

/** Total pressurized greenhouse area, m2. */
export function greenhouseAreaM2(s: SimState): number {
  return (
    s.structures.ghInflatable * STRUCTURES.ghInflatable.capacityValue +
    s.structures.ghRigid * STRUCTURES.ghRigid.capacityValue +
    s.structures.ghBuried * STRUCTURES.ghBuried.capacityValue
  );
}
