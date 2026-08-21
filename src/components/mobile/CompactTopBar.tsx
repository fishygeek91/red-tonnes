'use client';

/**
 * Phone/tablet header: brand, three tappable vitals, overflow menu.
 * A fourth control opens the full Status sheet for the rest of the numbers.
 */

import { useState } from 'react';
import { topBarStats } from '../../lib/sim/derive';
import { toneClass } from '../../lib/ui/tone';
import type { StatTone } from '../../lib/ui/tone';
import { useSimStore } from '../../store/useSimStore';
import { Explainable } from '../Explainable';
import { useMissionActions } from '../useMissionActions';

/** One compact vital cell. */
function Vital(props: {
  label: string;
  value: string;
  explanation: string;
  tone: StatTone;
}): React.ReactElement {
  return (
    <Explainable explanation={props.explanation} className="flex-1 min-w-0 px-1.5">
      <span className="panel-title block">{props.label}</span>
      <span className={`num text-xs ${toneClass(props.tone)} block truncate`}>{props.value}</span>
    </Explainable>
  );
}

/**
 * Compact city-first chrome. Calories swap to water when food is healthy
 * and the tank is the risk.
 */
export function CompactTopBar(): React.ReactElement {
  const sim = useSimStore((s) => s.sim);
  const setMobileSheet = useSimStore((s) => s.setMobileSheet);
  const { shareCopied, copyShareLink, copyBrief, openSources, openSetup } = useMissionActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const t = topBarStats(sim);

  const caloriesOk = t.kcalPerPersonSol >= 2700;
  const waterRisk = t.waterDaysReserve <= 60;
  const showWater = caloriesOk && waterRisk;

  const loopTone: StatTone = t.selfSufficiency > 0.5 ? 'ok' : 'warn';
  const fuelTone: StatTone =
    t.shipsFuelable >= sim.params.returnShipsPerWindow ? 'ok' : 'warn';
  const foodTone: StatTone = showWater
    ? 'fail'
    : t.kcalPerPersonSol >= 2700
      ? 'ok'
      : t.kcalPerPersonSol >= 2000
        ? 'warn'
        : 'fail';

  return (
    <header className="shrink-0 panel border-b border-[var(--line)] safe-pad-top select-none">
      <div className="flex items-center h-11 px-2 gap-1">
        <div className="flex flex-col pr-2 min-w-0">
          <span className="text-[var(--rust-hot)] font-bold tracking-[0.22em] text-[11px] brand-glow">
            RED TONNES
          </span>
          <span className="text-[9px] text-[var(--dim)] truncate">
            W{t.window} · sol {sim.sol}
          </span>
        </div>
        <div className="flex-1" />
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="min-w-11 min-h-11 border border-[var(--line)] text-[var(--dim)] text-[10px] uppercase tracking-widest"
            aria-expanded={menuOpen}
            aria-label="Mission menu"
          >
            Menu
          </button>
          {menuOpen ? (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-40 cursor-default bg-transparent"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-50 panel border border-[var(--line)] w-40 py-1">
              <button
                type="button"
                onClick={() => {
                  copyBrief();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3 min-h-11 text-[11px] uppercase tracking-widest text-[var(--dim)] hover:text-[var(--text)]"
              >
                Brief
              </button>
              <button
                type="button"
                onClick={() => {
                  void copyShareLink();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3 min-h-11 text-[11px] uppercase tracking-widest text-[var(--dim)] hover:text-[var(--text)]"
              >
                {shareCopied ? 'Copied!' : 'Share'}
              </button>
              <button
                type="button"
                onClick={() => {
                  openSources();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3 min-h-11 text-[11px] uppercase tracking-widest text-[var(--dim)] hover:text-[var(--text)]"
              >
                Sources
              </button>
              <button
                type="button"
                onClick={() => {
                  openSetup();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3 min-h-11 text-[11px] uppercase tracking-widest text-[var(--rust-hot)]"
              >
                New game
              </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex items-stretch border-t border-[var(--line)] min-h-11">
        <Vital
          label="Loop"
          value={`${(t.selfSufficiency * 100).toFixed(0)}%`}
          explanation="local produced mass / (local + imported), current window ledger."
          tone={loopTone}
        />
        <Vital
          label="Fuel"
          value={`${t.shipsFuelable.toFixed(2)} ships`}
          explanation={`CH4 + LOX banked vs ${sim.params.methaloxPerShipT} t per ship (ASSUMED slider). Ships fuelable requires the 3.6:1 O2:CH4 ratio in both tanks.`}
          tone={fuelTone}
        />
        {showWater ? (
          <Vital
            label="Water"
            value={`${Math.min(9999, t.waterDaysReserve).toFixed(0)} sols`}
            explanation="water inventory / net loss rate (8 kg/p/sol at 93% recycling, BVAD-class). Ignores ISRU top-up — this is the tank alone."
            tone={foodTone}
          />
        ) : (
          <Vital
            label="Calories"
            value={`${t.kcalPerPersonSol.toFixed(0)}`}
            explanation="Eaten yesterday per person. Need 3,000 (BVAD active crew). Local fresh food is eaten before Earth rations."
            tone={foodTone}
          />
        )}
        <button
          type="button"
          onClick={() => setMobileSheet('status')}
          className="shrink-0 px-2 min-h-11 border-l border-[var(--line)] text-[9px] uppercase tracking-widest text-[var(--dim)]"
          title="Open every live number"
        >
          All
        </button>
      </div>
    </header>
  );
}
