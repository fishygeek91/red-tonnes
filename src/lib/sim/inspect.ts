/**
 * Inspection cards for the 3D city: click a structure, get its live
 * datasheet. Every number here is computed with the same formulas the
 * engine uses (plantFactors, sunlightFraction, capacity × eff), so the
 * card is a window into the sim, not a decorative tooltip.
 */

import {
  CO2_INTAKE_KWH_PER_KG,
  COMPOST_MATURITY_SOLS,
  DEPARTURE_OFFSET_SOLS,
  DIGESTER_CH4_PER_KG_FEED,
  DIGESTER_CYCLE_SOLS,
  ELECTROLYSIS_KWH_PER_KG_H2,
  H2_PER_KG_H2O,
  HABITAT_M3_PER_PERSON,
  ICE_MINE_KWH_PER_KG_H2O_BASE,
  LED_KWE_PER_M2,
  LOX_TO_CH4_RATIO,
  SABATIER_CO2_PER_KG_CH4,
  SABATIER_H2_PER_KG_CH4,
  SOLAR_DAYLIGHT_FACTOR,
  SOLS_PER_SYNODIC_WINDOW,
  TANK_BOILOFF_PER_SOL,
} from '../constants';
import { CROPS } from '../crops';
import { getSite, opticalDepthAtSol } from '../sites';
import type { StructureId } from '../structures';
import { STRUCTURES, industryTierFor } from '../structures';
import { clamp, safeDiv } from '../types';
import type { SimState } from './state';
import { plantFactors, sunlightFraction } from './step';

/** Everything clickable in the scene: structure families plus scene actors. */
export type InspectId = StructureId | 'starship' | 'rover';

/** One row of the inspection card. */
export interface InspectLine {
  /** Row label. */
  readonly label: string;
  /** Formatted value. */
  readonly value: string;
  /** Optional tone for warn/positive coloring in the UI. */
  readonly tone?: 'warn' | 'good';
}

/** A full inspection card. */
export interface Inspection {
  /** Card heading. */
  readonly title: string;
  /** Units built, or null when count is meaningless (rover, trench). */
  readonly count: number | null;
  /** One-sentence description of the thing's role in the loop. */
  readonly blurb: string;
  /** Live data rows. */
  readonly lines: readonly InspectLine[];
}

/** Format kilograms, switching to tonnes above 10 t. */
function kg(v: number): string {
  return v >= 10000 ? `${(v / 1000).toFixed(1)} t` : `${v.toFixed(0)} kg`;
}

/** Format a fraction as a percentage. */
function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

/** Current dust optical depth for a state (last snapshot, or recomputed at sol 0). */
function currentTau(s: SimState): number {
  const last = s.history[s.history.length - 1];
  return last ? last.tau : opticalDepthAtSol(s.sol, false, getSite(s.siteId).dustFactor);
}

/** Build the live inspection card for one clickable id. */
export function inspect(s: SimState, id: InspectId): Inspection {
  const site = getSite(s.siteId);
  const tau = currentTau(s);
  const sun = sunlightFraction(tau);
  const pf = plantFactors(s);
  const inv = s.inv;

  switch (id) {
    case 'solar': {
      const latFactor = clamp(Math.cos((site.latitudeDeg * Math.PI) / 180), 0.35, 1);
      const peak = s.structures.solar * STRUCTURES.solar.capacityValue;
      const now = peak * SOLAR_DAYLIGHT_FACTOR * latFactor * sun * pf.eff;
      return {
        title: 'Solar array field',
        count: s.structures.solar,
        blurb: 'Thin-film blankets. Cheap tonnes, but the first thing a dust storm takes.',
        lines: [
          { label: 'Peak capacity', value: `${peak.toFixed(0)} kWe` },
          { label: 'Output now', value: `${now.toFixed(0)} kWe`, tone: now < peak * 0.1 ? 'warn' : undefined },
          { label: 'Dust derate (τ)', value: `${pct(sun)} light at τ ${tau.toFixed(1)}`, tone: tau > 2 ? 'warn' : undefined },
          { label: 'Latitude factor', value: pct(latFactor) },
          { label: 'Plant efficiency', value: pct(pf.eff), tone: pf.eff < 0.85 ? 'warn' : undefined },
        ],
      };
    }
    case 'nuclear': {
      const out = s.structures.nuclear * STRUCTURES.nuclear.capacityValue * pf.eff;
      return {
        title: 'Fission reactors',
        count: s.structures.nuclear,
        blurb: 'Kilopower-class. 150 kg/kWe landed — expensive tonnes that ignore the sky.',
        lines: [
          { label: 'Output now', value: `${out.toFixed(0)} kWe`, tone: 'good' },
          { label: 'Dust derate', value: 'immune', tone: 'good' },
          { label: 'Plant efficiency', value: pct(pf.eff), tone: pf.eff < 0.85 ? 'warn' : undefined },
        ],
      };
    }
    case 'iceMine': {
      const capNow = s.structures.iceMine * STRUCTURES.iceMine.capacityValue * pf.eff;
      const kwhPerKg = (ICE_MINE_KWH_PER_KG_H2O_BASE * (1 + 0.2 * site.iceDepthM)) / Math.max(0.2, site.icePurity);
      return {
        title: 'Ice mine + hauler',
        count: s.structures.iceMine,
        blurb: `Excavates the ${site.name} ice table. Every kilogram of water starts here.`,
        lines: [
          { label: 'Mining capacity', value: `${capNow.toFixed(0)} kg/sol` },
          { label: 'Ice table', value: `${site.iceDepthM} m deep · ${pct(site.icePurity)} pure` },
          { label: 'Energy cost', value: `${kwhPerKg.toFixed(2)} kWh/kg water` },
          { label: 'Water tank', value: kg(inv.waterKg) },
          { label: 'Failure hazard', value: `${STRUCTURES.iceMine.failureWeight}× fleet baseline`, tone: 'warn' },
        ],
      };
    }
    case 'compressor': {
      const capNow = s.structures.compressor * STRUCTURES.compressor.capacityValue * pf.eff;
      return {
        title: 'CO2 intake compressors',
        count: s.structures.compressor,
        blurb: 'Swallows ~6 mbar air. Thin-air compression work is real: 0.9 kWh per kg.',
        lines: [
          { label: 'Intake capacity', value: `${capNow.toFixed(0)} kg CO2/sol` },
          { label: 'Energy cost', value: `${CO2_INTAKE_KWH_PER_KG} kWh/kg` },
          { label: 'CO2 buffer', value: kg(inv.co2Kg) },
        ],
      };
    }
    case 'electrolyzer': {
      const capNow = s.structures.electrolyzer * STRUCTURES.electrolyzer.capacityValue * pf.eff;
      const kwhPerKgWater = H2_PER_KG_H2O * ELECTROLYSIS_KWH_PER_KG_H2;
      return {
        title: 'Electrolyzer stacks',
        count: s.structures.electrolyzer,
        blurb: 'Splits water into tomorrow\u2019s H2 (Sabatier feed) and O2 (breathing + LOX).',
        lines: [
          { label: 'Split capacity', value: `${capNow.toFixed(0)} kg H2O/sol` },
          { label: 'Energy cost', value: `${kwhPerKgWater.toFixed(1)} kWh/kg H2O` },
          { label: 'H2 buffer', value: kg(inv.h2Kg), tone: inv.h2Kg < 200 ? 'warn' : undefined },
          { label: 'H2 leak tax', value: '0.2%/sol of the buffer' },
        ],
      };
    }
    case 'sabatier': {
      const capNow = s.structures.sabatier * STRUCTURES.sabatier.capacityValue * pf.eff;
      const h2Limited = safeDiv(inv.h2Kg, SABATIER_H2_PER_KG_CH4, 0);
      const co2Limited = safeDiv(inv.co2Kg, SABATIER_CO2_PER_KG_CH4, 0);
      const binding =
        h2Limited < capNow && h2Limited <= co2Limited
          ? 'hydrogen-limited'
          : co2Limited < capNow
            ? 'CO2-limited'
            : 'hardware-limited';
      return {
        title: 'Sabatier reactors',
        count: s.structures.sabatier,
        blurb: 'CO2 + 4 H2 → CH4 + 2 H2O. The return ticket is cooked here.',
        lines: [
          { label: 'CH4 capacity', value: `${capNow.toFixed(0)} kg/sol` },
          { label: 'Bottleneck now', value: binding, tone: binding === 'hardware-limited' ? undefined : 'warn' },
          { label: 'CH4 banked', value: kg(inv.ch4Kg), tone: 'good' },
          { label: 'Water recycled', value: '2.25 kg back per kg CH4', tone: 'good' },
        ],
      };
    }
    case 'cryoPlant': {
      const capacity = s.structures.cryoPlant * STRUCTURES.cryoPlant.capacityValue;
      const stored = inv.ch4Kg + inv.loxKg;
      const perShip = s.params.methaloxPerShipT * 1000;
      const ch4Ships = safeDiv(inv.ch4Kg * (1 + LOX_TO_CH4_RATIO), perShip, 0);
      const loxShips = safeDiv((inv.loxKg * (1 + LOX_TO_CH4_RATIO)) / LOX_TO_CH4_RATIO, perShip, 0);
      return {
        title: 'Cryo tank farm',
        count: s.structures.cryoPlant,
        blurb: 'Liquefies and stores methalox at the 3.6:1 O2:CH4 Raptor ratio.',
        lines: [
          { label: 'Stored / capacity', value: `${kg(stored)} / ${kg(capacity)}` },
          { label: 'CH4 · LOX', value: `${kg(inv.ch4Kg)} · ${kg(inv.loxKg)}` },
          { label: 'Ships fuelable', value: Math.min(ch4Ships, loxShips).toFixed(2), tone: Math.min(ch4Ships, loxShips) >= 1 ? 'good' : undefined },
          { label: 'Boil-off tax', value: `${kg(stored * TANK_BOILOFF_PER_SOL)}/sol vented` },
        ],
      };
    }
    case 'habitat': {
      const volume = pf.habitatVolumeM3;
      const need = s.population * HABITAT_M3_PER_PERSON;
      return {
        title: 'Habitat modules',
        count: s.structures.habitat,
        blurb: 'Pressurized volume, ECLSS, and bunks. Crowding erodes every plant in the city.',
        lines: [
          { label: 'Volume / need', value: `${volume.toFixed(0)} / ${need.toFixed(0)} m³`, tone: volume < need ? 'warn' : 'good' },
          { label: 'Population', value: `${s.population} crew` },
          { label: 'Crowding factor', value: pct(pf.crowdFactor), tone: pf.crowdFactor < 0.99 ? 'warn' : 'good' },
          { label: 'Crew labor', value: `${pf.laborNeeded.toFixed(0)} h needed / ${pf.laborAvailable.toFixed(0)} h available`, tone: pf.laborFactor < 0.95 ? 'warn' : undefined },
        ],
      };
    }
    case 'ghInflatable':
    case 'ghRigid':
    case 'ghBuried': {
      const spec = STRUCTURES[id];
      const area = s.structures[id] * spec.capacityValue;
      const isLed = id === 'ghBuried';
      const light = isLed ? 1 : clamp(sun / 0.5, 0, 1);
      const topCrops = CROPS.filter((c) => (s.cropMix[c.id] ?? 0) > 0.01)
        .sort((a, b) => (s.cropMix[b.id] ?? 0) - (s.cropMix[a.id] ?? 0))
        .slice(0, 3)
        .map((c) => `${c.name} ${pct(s.cropMix[c.id] ?? 0)}`)
        .join(' · ');
      return {
        title: spec.name,
        count: s.structures[id],
        blurb: isLed
          ? 'Full-LED grow hall under regolith. Storm-proof, but every photon is paid in kWe.'
          : 'Sun-grown area. Free photons on a clear sol; a passenger in a storm.',
        lines: [
          { label: 'Growing area', value: `${area.toFixed(0)} m²` },
          {
            label: isLed ? 'LED power draw' : 'Light now',
            value: isLed ? `${(area * LED_KWE_PER_M2).toFixed(0)} kWe` : `${pct(light)} at τ ${tau.toFixed(1)}`,
            tone: !isLed && light < 0.3 ? 'warn' : undefined,
          },
          { label: 'Crop mix (top)', value: topCrops.length > 0 ? topCrops : 'none planted' },
          { label: 'Failure hazard', value: `${spec.failureWeight}× fleet baseline`, tone: spec.failureWeight >= 2 ? 'warn' : undefined },
        ],
      };
    }
    case 'composter': {
      const capNow = s.structures.composter * STRUCTURES.composter.capacityValue * pf.eff;
      const inWork = s.compostBatches.reduce((a, b) => a + b.feedKg, 0);
      return {
        title: 'Thermophilic compost drums',
        count: s.structures.composter,
        blurb: '55 °C+ aerobic digestion. Slow, O2-hungry, and the only way N comes home.',
        lines: [
          { label: 'Load capacity', value: `${capNow.toFixed(0)} kg feed/sol` },
          { label: 'Batches cooking', value: `${s.compostBatches.length} (${kg(inWork)})` },
          { label: 'Cycle time', value: `${COMPOST_MATURITY_SOLS} sols to maturity` },
          { label: 'Feedstock backlog', value: kg(inv.feedstockKg), tone: inv.feedstockKg > capNow * 20 ? 'warn' : undefined },
          { label: 'Mature compost', value: kg(inv.compostKg), tone: 'good' },
        ],
      };
    }
    case 'digester': {
      const capNow = s.structures.digester * STRUCTURES.digester.capacityValue * pf.eff;
      const inWork = s.digesterBatches.reduce((a, b) => a + b.feedKg, 0);
      return {
        title: 'Anaerobic digesters',
        count: s.structures.digester,
        blurb: 'Sealed tanks turning waste into biogas CH4 and digestate fertilizer.',
        lines: [
          { label: 'Load capacity', value: `${capNow.toFixed(0)} kg feed/sol` },
          { label: 'Batches working', value: `${s.digesterBatches.length} (${kg(inWork)})` },
          { label: 'Cycle time', value: `${DIGESTER_CYCLE_SOLS} sols` },
          { label: 'Biogas yield', value: `${(DIGESTER_CH4_PER_KG_FEED * 100).toFixed(0)} g CH4 per kg feed`, tone: 'good' },
        ],
      };
    }
    case 'soilFactory': {
      const tier = industryTierFor(s.localOutputTonnes);
      const gated = tier.tier < STRUCTURES.soilFactory.localTier;
      const capNow = s.structures.soilFactory * STRUCTURES.soilFactory.capacityValue * pf.eff;
      return {
        title: 'Soil factory',
        count: s.structures.soilFactory,
        blurb: 'Washes perchlorates out of regolith (Hecht 2009), blends in compost, makes living soil.',
        lines: [
          { label: 'Wash capacity', value: `${capNow.toFixed(0)} kg regolith/sol` },
          { label: 'Industry gate', value: gated ? `locked until tier 1 (now ${tier.name})` : 'unlocked', tone: gated ? 'warn' : 'good' },
          { label: 'Clean soil made', value: kg(inv.cleanSoilKg), tone: 'good' },
          { label: 'Compost blend', value: '15% organics per batch' },
        ],
      };
    }
    case 'fabShop': {
      const rate = s.structures.fabShop * STRUCTURES.fabShop.capacityValue * pf.eff;
      const tier = industryTierFor(s.localOutputTonnes);
      return {
        title: 'Fabrication shop',
        count: s.structures.fabShop,
        blurb: 'Machine tools and printers. Makes spares and raises the local-mass fractions.',
        lines: [
          { label: 'Spares output', value: `${rate.toFixed(1)} kg/sol` },
          { label: 'Spares on shelf', value: kg(inv.sparesKg), tone: inv.sparesKg < 200 ? 'warn' : undefined },
          { label: 'Open failures', value: `${s.pendingFailures}`, tone: s.pendingFailures > 0 ? 'warn' : 'good' },
          { label: 'Industry tier', value: `${tier.name} (${s.localOutputTonnes.toFixed(0)} t local output)` },
        ],
      };
    }
    case 'pad': {
      let landed = 0;
      let departed = 0;
      for (const l of s.ledgers) {
        landed += l.shipsLanded;
        departed += l.shipsDeparted;
      }
      return {
        title: 'Landing pads (sintered)',
        count: s.structures.pad,
        blurb: 'Microwave-sintered regolith. Without a pad, every landing sandblasts the city.',
        lines: [
          { label: 'Landings supported', value: `${s.structures.pad * STRUCTURES.pad.capacityValue} per window` },
          { label: 'Ships on the ground', value: `${Math.max(0, landed - departed)}` },
          { label: 'Lifetime traffic', value: `${landed} down · ${departed} home` },
        ],
      };
    }
    case 'starship': {
      let landed = 0;
      let departed = 0;
      for (const l of s.ledgers) {
        landed += l.shipsLanded;
        departed += l.shipsDeparted;
      }
      const perShip = s.params.methaloxPerShipT * 1000;
      const ch4Ships = safeDiv(inv.ch4Kg * (1 + LOX_TO_CH4_RATIO), perShip, 0);
      const loxShips = safeDiv((inv.loxKg * (1 + LOX_TO_CH4_RATIO)) / LOX_TO_CH4_RATIO, perShip, 0);
      const fuelable = Math.min(ch4Ships, loxShips);
      const departureSol = s.window * SOLS_PER_SYNODIC_WINDOW + DEPARTURE_OFFSET_SOLS;
      const toDeparture = Math.max(0, departureSol - s.sol);
      return {
        title: 'Starship',
        count: Math.max(0, landed - departed),
        blurb: 'The currency of the whole game. Every import cost one of these; going home costs 1,000 t of local methalox.',
        lines: [
          { label: 'Fleet on the ground', value: `${Math.max(0, landed - departed)} ships` },
          { label: 'Fuel per departure', value: `${s.params.methaloxPerShipT} t methalox` },
          { label: 'Ships fuelable now', value: fuelable.toFixed(2), tone: fuelable >= s.params.returnShipsPerWindow ? 'good' : 'warn' },
          { label: 'Next departure burn', value: `${toDeparture} sols` },
        ],
      };
    }
    case 'rover': {
      const haul = s.structures.iceMine * STRUCTURES.iceMine.capacityValue * pf.eff;
      return {
        title: 'Ice-hauler rover',
        count: null,
        blurb: 'Loops between the ice table and the ISRU plant, all sol, every sol.',
        lines: [
          { label: 'Route', value: 'ice mine → melt plant' },
          { label: 'Haul rate', value: `${haul.toFixed(0)} kg ice/sol (with the mine)` },
          { label: 'Drivetrain hazard', value: '3× fleet baseline — dust eats bearings', tone: 'warn' },
        ],
      };
    }
  }
}
