'use client';

/**
 * Left control panel: allocate the next window's landed tonnes across
 * structures and consumables, tune the crop mix, and adjust the ASSUMED
 * sliders (Starship payload class, methalox quota, ships per window).
 */

import { useState } from 'react';
import { CROPS } from '../lib/crops';
import type { Manifest } from '../lib/sim/state';
import { emptyManifest, manifestMassKg } from '../lib/sim/state';
import type { StructureId } from '../lib/structures';
import { STRUCTURE_ORDER, STRUCTURES } from '../lib/structures';
import { useSimStore } from '../store/useSimStore';

type Tab = 'manifest' | 'crops' | 'model';

/** Stepper row for one structure in the manifest. */
function StructRow(props: {
  id: StructureId;
  count: number;
  onChange: (n: number) => void;
}): React.ReactElement {
  const spec = STRUCTURES[props.id];
  return (
    <div className="flex items-center gap-1 text-[10px] py-0.5">
      <span
        className="flex-1 text-[var(--dim)] stat-hover truncate"
        title={`${spec.capacity}. Landed mass ${(spec.massKg / 1000).toFixed(1)} t, draw ${spec.powerKwe} kWe, crew ${spec.crewHoursPerSol} h/sol.`}
      >
        {spec.name}
      </span>
      <span className="num w-10 text-right text-[var(--dim)]">{(spec.massKg / 1000).toFixed(1)}t</span>
      <button
        onClick={() => props.onChange(Math.max(0, props.count - 1))}
        className="w-5 h-5 border border-[var(--line)] text-[var(--dim)] hover:text-[var(--text)]"
      >
        −
      </button>
      <span className="num w-5 text-center">{props.count}</span>
      <button
        onClick={() => props.onChange(props.count + 1)}
        className="w-5 h-5 border border-[var(--line)] text-[var(--dim)] hover:text-[var(--text)]"
      >
        +
      </button>
    </div>
  );
}

/** Slider row for consumable kg in the manifest. */
function KgRow(props: {
  label: string;
  value: number;
  max: number;
  tooltip: string;
  onChange: (v: number) => void;
}): React.ReactElement {
  return (
    <div className="text-[10px] py-0.5">
      <div className="flex justify-between">
        <span className="text-[var(--dim)] stat-hover" title={props.tooltip}>
          {props.label}
        </span>
        <span className="num">{(props.value / 1000).toFixed(1)} t</span>
      </div>
      <input
        type="range"
        min={0}
        max={props.max}
        step={100}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full h-2"
      />
    </div>
  );
}

/** The panel. */
export function BuildPanel(): React.ReactElement {
  const sim = useSimStore((s) => s.sim);
  const setManifest = useSimStore((s) => s.setManifest);
  const setCropMix = useSimStore((s) => s.setCropMix);
  const setParams = useSimStore((s) => s.setParams);
  const showOverlay = useSimStore((s) => s.showOverlay);
  const setShowOverlay = useSimStore((s) => s.setShowOverlay);
  const [tab, setTab] = useState<Tab>('manifest');

  const nextWindow = sim.window + 1;
  const manifest: Manifest = sim.manifests[nextWindow] ?? emptyManifest();
  const budgetKg = sim.params.shipsPerWindow * sim.params.starshipPayloadT * 1000;
  const usedKg = manifestMassKg(manifest);
  const over = usedKg > budgetKg;

  const update = (patch: Partial<Manifest>): void => {
    setManifest(nextWindow, { ...manifest, ...patch });
  };
  const updateStruct = (id: StructureId, n: number): void => {
    update({ structures: { ...manifest.structures, [id]: n } });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden panel border-t border-[var(--line)]">
      <div className="flex border-b border-[var(--line)]">
        {(['manifest', 'crops', 'model'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-[10px] uppercase tracking-widest ${
              tab === t ? 'text-[var(--rust-hot)] border-b border-[var(--rust-hot)]' : 'text-[var(--dim)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {tab === 'manifest' && (
          <div>
            <div className="text-[10px] mb-1 flex justify-between">
              <span className="text-[var(--dim)]">Window {nextWindow} cargo</span>
              <span className={`num ${over ? 'text-[var(--fail)]' : 'text-[var(--text)]'}`}>
                {(usedKg / 1000).toFixed(1)} / {(budgetKg / 1000).toFixed(0)} t
              </span>
            </div>
            <div className="h-1.5 bg-[var(--panel-2)] mb-2">
              <div
                className="h-full"
                style={{
                  width: `${Math.min(100, (usedKg / Math.max(1, budgetKg)) * 100)}%`,
                  background: over ? 'var(--fail)' : 'var(--rust)',
                }}
              />
            </div>
            {over && (
              <div className="text-[9px] text-[var(--fail)] mb-1">
                Over payload: cargo lands in manifest order until ships are full. The rest stays on Earth ~26 months.
              </div>
            )}
            {STRUCTURE_ORDER.map((id) => (
              <StructRow key={id} id={id} count={manifest.structures[id] ?? 0} onChange={(n) => updateStruct(id, n)} />
            ))}
            <div className="border-t border-[var(--line)] mt-2 pt-1">
              <KgRow label="Earth rations" value={manifest.earthFoodKg} max={40000} tooltip="4,000 kcal/kg. 12 crew eat ~0.75 kg/sol each when nothing grows." onChange={(v) => update({ earthFoodKg: v })} />
              <KgRow label="Spare parts" value={manifest.sparesKg} max={15000} tooltip="40 kg per repair; ~1 failure per 500 unit-sols. No spares → efficiency rot." onChange={(v) => update({ sparesKg: v })} />
              <KgRow label="Seed hydrogen" value={manifest.h2Kg} max={8000} tooltip="Sabatier feed until electrolysis closes the loop. Leaks 0.2%/sol." onChange={(v) => update({ h2Kg: v })} />
              <KgRow label="Grow substrate" value={manifest.substrateKg} max={20000} tooltip="Inert media; beds need ~30 kg/m². The soil factory replaces this eventually." onChange={(v) => update({ substrateKg: v })} />
              <KgRow label="Fertilizer N" value={manifest.fertilizerNKg} max={5000} tooltip="Plant-available nitrogen. Close the compost/urine loop or keep paying this forever." onChange={(v) => update({ fertilizerNKg: v })} />
              <KgRow label="Fertilizer P+K" value={manifest.fertilizerPkKg} max={5000} tooltip="Split 40/60 P/K on arrival." onChange={(v) => update({ fertilizerPkKg: v })} />
              <div className="flex items-center justify-between text-[10px] py-1">
                <span className="text-[var(--dim)] stat-hover" title="500 kg landed per person (body + effects + seat hardware, ASSUMED)">
                  New crew
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => update({ crew: Math.max(0, manifest.crew - 1) })} className="w-5 h-5 border border-[var(--line)] text-[var(--dim)]">−</button>
                  <span className="num w-6 text-center">{manifest.crew}</span>
                  <button onClick={() => update({ crew: manifest.crew + 1 })} className="w-5 h-5 border border-[var(--line)] text-[var(--dim)]">+</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'crops' && (
          <div>
            <div className="text-[9px] text-[var(--dim)] mb-2">
              Area fractions renormalize automatically. Legumes and spirulina fix N; wheat and potato carry the calories.
            </div>
            {CROPS.map((c) => (
              <div key={c.id} className="text-[10px] py-0.5">
                <div className="flex justify-between">
                  <span
                    className="text-[var(--dim)] stat-hover"
                    title={`${c.edibleGPerM2Sol} g/m²/sol edible · ${c.kcalPerKg} kcal/kg · ${c.proteinGPerKg} g protein/kg · ${c.harvestSols}-sol cycle · ${c.waterLPerKgEdible} L/kg${c.fixesNitrogen ? ' · fixes N' : ''}`}
                  >
                    {c.name}
                  </span>
                  <span className="num">{((sim.cropMix[c.id] ?? 0) * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round((sim.cropMix[c.id] ?? 0) * 100)}
                  onChange={(e) => setCropMix({ ...sim.cropMix, [c.id]: Number(e.target.value) / 100 })}
                  className="w-full h-2"
                />
              </div>
            ))}
          </div>
        )}

        {tab === 'model' && (
          <div className="space-y-3 text-[10px]">
            <div>
              <div className="flex justify-between">
                <span className="text-[var(--dim)] stat-hover" title="ASSUMED: SpaceX '100 t class' to the Mars surface. Nobody has landed one yet; that is why it is a slider.">
                  Starship payload
                </span>
                <span className="num">{sim.params.starshipPayloadT} t</span>
              </div>
              <input type="range" min={50} max={200} step={5} value={sim.params.starshipPayloadT} onChange={(e) => setParams({ starshipPayloadT: Number(e.target.value) })} className="w-full h-2" />
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-[var(--dim)] stat-hover" title="ASSUMED: full methalox load per returning ship, 1,000–1,200 t per SpaceX figures.">
                  Methalox per ship
                </span>
                <span className="num">{sim.params.methaloxPerShipT} t</span>
              </div>
              <input type="range" min={600} max={1500} step={50} value={sim.params.methaloxPerShipT} onChange={(e) => setParams({ methaloxPerShipT: Number(e.target.value) })} className="w-full h-2" />
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-[var(--dim)]">Cargo ships / window</span>
                <span className="num">{sim.params.shipsPerWindow}</span>
              </div>
              <input type="range" min={1} max={10} step={1} value={sim.params.shipsPerWindow} onChange={(e) => setParams({ shipsPerWindow: Number(e.target.value) })} className="w-full h-2" />
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-[var(--dim)] stat-hover" title="Crew ships that must fuel and depart each window. Miss the quota and they are stranded.">
                  Return ships / window
                </span>
                <span className="num">{sim.params.returnShipsPerWindow}</span>
              </div>
              <input type="range" min={0} max={4} step={1} value={sim.params.returnShipsPerWindow} onChange={(e) => setParams({ returnShipsPerWindow: Number(e.target.value) })} className="w-full h-2" />
            </div>
            <label className="flex items-center gap-2 pt-2 border-t border-[var(--line)] cursor-pointer">
              <input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} />
              <span className="text-[var(--dim)] stat-hover" title="Teaching layer, not a win condition: published CO2 inventories cannot make Mars breathable (Jakosky & Edwards 2018).">
                Planet overlay: could we terraform?
              </span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
