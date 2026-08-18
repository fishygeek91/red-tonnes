/**
 * One-click mission brief: a screenshot-beautiful markdown snapshot of the
 * current city state, suitable for pasting into an argument.
 */

import { SOLS_PER_SYNODIC_WINDOW } from '../constants';
import { getSite } from '../sites';
import { STRUCTURE_ORDER, STRUCTURES, industryTierFor } from '../structures';
import { greenhouseAreaM2, missedWindowTest, topBarStats } from './derive';
import type { SimState } from './state';

/** Render the current state as a markdown mission brief. */
export function missionBrief(s: SimState): string {
  const site = getSite(s.siteId);
  const t = topBarStats(s);
  const test = missedWindowTest(s);
  const tier = industryTierFor(s.localOutputTonnes);
  const ledger = s.ledgers[s.ledgers.length - 1];
  const producedT = Object.values(ledger.produced).reduce((a, b) => a + b, 0) / 1000;
  const importedT = Object.values(ledger.imported).reduce((a, b) => a + b, 0) / 1000;
  const structures = STRUCTURE_ORDER.filter((id) => s.structures[id] > 0)
    .map((id) => `- ${STRUCTURES[id].name}: ${s.structures[id]}`)
    .join('\n');
  const compostInWork = s.compostBatches.reduce((a, b) => a + b.feedKg, 0);
  const canReturn = t.shipsFuelable >= s.params.returnShipsPerWindow;

  return [
    '# RED TONNES — MISSION BRIEF',
    '',
    `Sol ${s.sol} · Window ${s.window} · ${site.name} (${site.latitudeDeg.toFixed(1)}°, ice at ${site.iceDepthM} m)`,
    s.endState !== '' ? `**STATUS: ${s.endState}**` : '**STATUS: OPERATING**',
    '',
    '## City',
    `- Population: ${s.population}`,
    `- Calories: ${t.kcalPerPersonSol.toFixed(0)} kcal/person/sol (Earth-food fraction ${(t.earthFoodFraction * 100).toFixed(0)}%)`,
    `- Water reserve: ${t.waterDaysReserve.toFixed(0)} sols`,
    `- Greenhouse area: ${greenhouseAreaM2(s).toFixed(0)} m²`,
    `- Compost in work: ${compostInWork.toFixed(0)} kg · finished ${s.inv.compostKg.toFixed(0)} kg · N pool ${s.inv.nitrogenKg.toFixed(0)} kg`,
    `- Industry: ${tier.name} (${s.localOutputTonnes.toFixed(1)} t cumulative local output)`,
    '',
    '## Logistics',
    `- Window ${s.window} mass: ${importedT.toFixed(1)} t imported vs ${producedT.toFixed(1)} t produced locally`,
    `- Self-sufficiency (this window): ${(t.selfSufficiency * 100).toFixed(0)}%`,
    `- Two-missed-windows test: ${test.passes ? 'PASS' : 'FAIL'} (food runway ${test.foodRunwaySols.toFixed(0)} / needed ${test.requiredSols} sols)`,
    `- Next Earth departure: ${t.solsToNextDeparture} sols · next arrival: ${t.solsToNextArrival} sols (synodic ${SOLS_PER_SYNODIC_WINDOW} sols)`,
    '',
    '## Return fuel',
    `- Methalox banked: ${t.methaloxT.toFixed(1)} t (${s.inv.ch4Kg.toFixed(0)} kg CH4 / ${s.inv.loxKg.toFixed(0)} kg LOX)`,
    `- Ships fuelable at ${s.params.methaloxPerShipT} t each: ${t.shipsFuelable.toFixed(2)}`,
    `- Verdict: ${canReturn ? 'SHIPS CAN GO HOME' : 'CREW STAYS — keep the Sabatier hot'}`,
    '',
    '## Built plant',
    structures.length > 0 ? structures : '- (nothing on the pad yet)',
    '',
    `_Mars is still red. Sky at ${t.pressureMbar.toFixed(1)} mbar. The green is indoors, on purpose._`,
  ].join('\n');
}
