'use client';

/**
 * Right-hand live ledgers: inventories in real units, the window mass Sankey,
 * the 2-missed-windows resilience test, industry tier, and the event log.
 * Hover any number for its formula/assumption.
 */

import { missedWindowTest } from '../lib/sim/derive';
import { industryTierFor, INDUSTRY_TIERS } from '../lib/structures';
import { useSimStore } from '../store/useSimStore';
import { WindowSankey } from './WindowSankey';

/** A single inventory line with hover formula. */
function Line(props: {
  label: string;
  value: string;
  tooltip: string;
  tone?: 'ok' | 'warn' | 'green' | 'ice';
}): React.ReactElement {
  const color =
    props.tone === 'warn'
      ? 'text-[var(--warn)]'
      : props.tone === 'green'
        ? 'text-[var(--green)]'
        : props.tone === 'ice'
          ? 'text-[var(--ice)]'
          : 'text-[var(--text)]';
  return (
    <div className="flex justify-between items-baseline text-xs py-0.5">
      <span className="text-[var(--dim)]">{props.label}</span>
      <span className={`num ${color} stat-hover`} title={props.tooltip}>
        {props.value}
      </span>
    </div>
  );
}

/** Format kg smartly: t above 10,000 kg. */
function fmtKg(kg: number): string {
  if (kg >= 10000) {
    return `${(kg / 1000).toFixed(1)} t`;
  }
  return `${kg.toFixed(0)} kg`;
}

/** The full right panel. */
export function Ledgers(): React.ReactElement {
  const sim = useSimStore((s) => s.sim);
  const inv = sim.inv;
  const test = missedWindowTest(sim);
  const tier = industryTierFor(sim.localOutputTonnes);
  const nextTier = INDUSTRY_TIERS.find((t) => t.tier === tier.tier + 1);
  const localFoodKg = Object.values(inv.localFoodKg).reduce((a, b) => a + b, 0);
  const compostInWork = sim.compostBatches.reduce((a, b) => a + b.feedKg, 0);
  const events = [...sim.events].slice(-40).reverse();

  return (
    <aside className="w-[340px] shrink-0 panel border-l border-[var(--line)] flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <section>
          <h3 className="panel-title mb-1">Propellant & ISRU</h3>
          <Line label="Liquid CH4" value={fmtKg(inv.ch4Kg)} tone="ice" tooltip="Sabatier: CO2 + 4 H2 → CH4 + 2 H2O (stoichiometric), plus digester biogas. Boil-off 0.05%/sol (ASSUMED)." />
          <Line label="LOX" value={fmtKg(inv.loxKg)} tone="ice" tooltip="Electrolysis O2 liquefied at 0.3 kWh/kg toward the 3.6:1 O2:CH4 Raptor ratio." />
          <Line label="H2 buffer" value={fmtKg(inv.h2Kg)} tone={inv.h2Kg < 200 ? 'warn' : 'ok'} tooltip="Seed hydrogen + electrolysis output. Leaks 0.2%/sol (ASSUMED) — the loop tax. Sabatier eats 0.5026 kg H2 per kg CH4." />
          <Line label="CO2 buffer" value={fmtKg(inv.co2Kg)} tooltip="Compressor intake at ~6 mbar costs 0.9 kWh/kg (ASSUMED, real thin-air work) + human/compost respiration." />
          <Line label="Water" value={fmtKg(inv.waterKg)} tone="ice" tooltip="Ice mine (0.35 kWh/kg base × depth factor, ASSUMED) + Sabatier recycle − electrolysis − life support losses." />
        </section>

        <section>
          <h3 className="panel-title mb-1">Food & nutrient loop</h3>
          <Line label="Earth rations" value={fmtKg(inv.earthFoodKg)} tooltip="Packaged food at 4,000 kcal/kg (ASSUMED dehydrated class). Eaten only after local fresh food." />
          <Line label="Local food" value={fmtKg(localFoodKg)} tone="green" tooltip="Fresh harvest by crop; kcal/protein per crop from Wheeler 2017 ranges." />
          <Line label="Feedstock" value={fmtKg(inv.feedstockKg)} tooltip="Inedible biomass + scraps + human solids waiting for compost/digestion. If it piles up, build drums." />
          <Line label="Compost (in work)" value={fmtKg(compostInWork)} tooltip={`${sim.compostBatches.length} batches at 55°C+. 70-sol maturity (EPA thermophilic class); O2 hungry.`} />
          <Line label="Compost (mature)" value={fmtKg(inv.compostKg)} tone="green" tooltip="Finished compost: 0.5 kg per kg feedstock (ASSUMED), 70% N retained. Feeds the soil factory and beds." />
          <Line label="Nitrogen pool" value={fmtKg(inv.nitrogenKg)} tone={inv.nitrogenKg < 50 ? 'warn' : 'green'} tooltip="Plant-available N: fertilizer imports + urine recovery (85%) + compost returns. Crops draw ~3% of dry biomass. Close this loop or import forever." />
          <Line label="Phosphorus" value={fmtKg(inv.phosphorusKg)} tooltip="P pool. ~0.4% of dry biomass. There is no Martian guano; recycle or import." />
          <Line label="Substrate + soil" value={fmtKg(inv.substrateKg + inv.cleanSoilKg)} tooltip="Imported media + manufactured soil (washed regolith at 3 L/kg + 15% compost). Beds need ~30 kg/m² (ASSUMED); bare regolith grows at 35% (perchlorates, Hecht 2009)." />
        </section>

        <section>
          <h3 className="panel-title mb-1">Life support</h3>
          <Line label="O2 (gas)" value={fmtKg(inv.o2Kg)} tone={inv.o2Kg < sim.population * 25 ? 'warn' : 'ice'} tooltip="Breathing (0.84 kg/p/sol, BVAD) + compost demand vs plant + electrolysis production. LOX conversion protects a 30-sol crew reserve." />
          <Line label="Spare parts" value={fmtKg(inv.sparesKg)} tone={inv.sparesKg < 200 ? 'warn' : 'ok'} tooltip="Weibull-ish failures (~1 per 500 unit-sols, ASSUMED); each repair eats 40 kg. Unrepaired failures cut plant efficiency 4% each." />
          <Line label="Open failures" value={`${sim.pendingFailures}`} tone={sim.pendingFailures > 0 ? 'warn' : 'ok'} tooltip="Failures waiting on spares. Efficiency = 1 − 0.04 × open failures (floor 30%)." />
          <Line label="Vented / lost" value={fmtKg(sim.ventedKg)} tooltip="Mass conservation ledger: boil-off, H2 leaks, compost vapor. Everything not here is in a pool, a structure, or on a departed ship." />
        </section>

        <section>
          <h3 className="panel-title mb-1">Window mass flow</h3>
          <WindowSankey />
        </section>

        <section>
          <h3 className="panel-title mb-1">Resilience</h3>
          <Line
            label="2-missed-windows test"
            value={test.passes ? 'PASS' : 'FAIL'}
            tone={test.passes ? 'green' : 'warn'}
            tooltip={`Could the city survive 2×759 sols with zero cargo? Food runway ${test.foodRunwaySols.toFixed(0)} sols (stores ÷ net burn after local growing); spares runway ${test.sparesRunwaySols.toFixed(0)} sols.`}
          />
          <Line
            label="Industry"
            value={tier.name}
            tone="green"
            tooltip={`Unlocked by ${sim.localOutputTonnes.toFixed(1)} t cumulative local output (water, methalox, food, compost, soil, spares) — not XP. ${nextTier ? `Next: ${nextTier.name} at ${nextTier.thresholdTonnes} t → ${nextTier.unlocks}` : 'Ladder complete.'}`}
          />
        </section>

        <section>
          <h3 className="panel-title mb-1">Event log</h3>
          <div className="space-y-1 text-[10px] leading-snug">
            {events.map((e, i) => (
              <div key={`${e.sol}-${i}`} className="flex gap-2">
                <span className="num text-[var(--dim)] shrink-0 w-12">s{e.sol}</span>
                <span
                  className={
                    e.kind === 'failure'
                      ? 'text-[var(--fail)]'
                      : e.kind === 'warning'
                        ? 'text-[var(--warn)]'
                        : e.kind === 'milestone'
                          ? 'text-[var(--green)]'
                          : 'text-[var(--dim)]'
                  }
                >
                  {e.text}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
