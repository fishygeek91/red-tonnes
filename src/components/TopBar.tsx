'use client';

/**
 * Top status bar: the seven numbers that decide whether anyone goes home.
 * Every stat carries a hover tooltip with its formula and source/assumption.
 */

import { useState } from 'react';
import { buildRunPermalink, copyText } from '../lib/share/permalink';
import { missionBrief } from '../lib/sim/brief';
import { topBarStats } from '../lib/sim/derive';
import { useSimStore } from '../store/useSimStore';

/** One labeled stat with a hover formula. */
function Stat(props: {
  label: string;
  value: string;
  tooltip: string;
  tone?: 'ok' | 'warn' | 'fail';
}): React.ReactElement {
  const color =
    props.tone === 'fail'
      ? 'text-[var(--fail)]'
      : props.tone === 'warn'
        ? 'text-[var(--warn)]'
        : 'text-[var(--text)]';
  return (
    <div className="flex flex-col items-start px-3 border-l border-[var(--line)] first:border-l-0 min-w-0">
      <span className="panel-title whitespace-nowrap">{props.label}</span>
      <span className={`num text-sm ${color} stat-hover whitespace-nowrap`} title={props.tooltip}>
        {props.value}
      </span>
    </div>
  );
}

/** The top bar itself. */
export function TopBar(): React.ReactElement {
  const sim = useSimStore((s) => s.sim);
  const runLog = useSimStore((s) => s.runLog);
  const setShowSources = useSimStore((s) => s.setShowSources);
  const setShowSetup = useSimStore((s) => s.setShowSetup);
  const [shareCopied, setShareCopied] = useState(false);
  const t = topBarStats(sim);

  const copyShareLink = async (): Promise<void> => {
    const url = await buildRunPermalink(runLog, sim.sol);
    if (await copyText(url)) {
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1500);
    }
  };

  const copyBrief = (): void => {
    const text = missionBrief(sim);
    void navigator.clipboard.writeText(text).catch(() => {
      // Clipboard can fail outside secure contexts; fall back to download.
      const blob = new Blob([text], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `red-tonnes-brief-sol${sim.sol}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };

  return (
    <header className="flex items-center h-14 px-3 panel border-b border-[var(--line)] gap-1 select-none">
      <div className="flex flex-col pr-3">
        <span className="text-[var(--rust-hot)] font-bold tracking-[0.3em] text-sm brand-glow">RED TONNES</span>
        <span className="text-[10px] text-[var(--dim)]">the sky stays thin</span>
      </div>
      <div className="flex items-center overflow-x-auto flex-1">
        <Stat
          label="Window"
          value={`W${t.window} · sol ${sim.sol}`}
          tooltip="Synodic window index. One window = 759 sols (Earth–Mars synodic period ~779.9 days). Miss a window, wait ~26 months."
        />
        <Stat
          label="Next departure"
          value={`${t.solsToNextDeparture} sols`}
          tooltip="Sols until return ships must burn for Earth. departure = window x 759 + 600 (ASSUMED offset before next arrival)."
          tone={t.solsToNextDeparture < 100 && t.shipsFuelable < sim.params.returnShipsPerWindow ? 'warn' : 'ok'}
        />
        <Stat
          label="Self-sufficiency"
          value={`${(t.selfSufficiency * 100).toFixed(0)}%`}
          tooltip="local produced mass / (local + imported), current window ledger."
          tone={t.selfSufficiency > 0.5 ? 'ok' : 'warn'}
        />
        <Stat
          label="Methalox"
          value={`${t.methaloxT.toFixed(0)} t → ${t.shipsFuelable.toFixed(2)} ships`}
          tooltip={`CH4 + LOX banked vs ${sim.params.methaloxPerShipT} t per ship (ASSUMED slider; SpaceX class 1000–1200 t). Ships fuelable requires the 3.6:1 O2:CH4 ratio in both tanks.`}
          tone={t.shipsFuelable >= sim.params.returnShipsPerWindow ? 'ok' : 'warn'}
        />
        <Stat
          label="Calories"
          value={`${t.kcalPerPersonSol.toFixed(0)} kcal/p/sol`}
          tooltip="Eaten yesterday per person. Need 3,000 (BVAD active crew). Local fresh food is eaten before Earth rations."
          tone={t.kcalPerPersonSol >= 2700 ? 'ok' : t.kcalPerPersonSol >= 2000 ? 'warn' : 'fail'}
        />
        <Stat
          label="Water reserve"
          value={`${Math.min(9999, t.waterDaysReserve).toFixed(0)} sols`}
          tooltip="water inventory / net loss rate (8 kg/p/sol at 93% recycling, BVAD-class). Ignores ISRU top-up — this is the tank alone."
          tone={t.waterDaysReserve > 60 ? 'ok' : 'fail'}
        />
        <Stat
          label="Atmosphere"
          value={`${t.pressureMbar.toFixed(1)} mbar · τ ${t.tau.toFixed(1)}`}
          tooltip="Outside pressure stays ~6.4 mbar (NASA fact sheet) — the city para-terraforms, the planet does not change. τ is dust optical depth."
          tone={t.tau > 2 ? 'warn' : 'ok'}
        />
        <Stat
          label="Earth food"
          value={`${(t.earthFoodFraction * 100).toFixed(0)}%`}
          tooltip="Fraction of yesterday's calories from imported rations. Should fall over time or the manifest never frees up."
          tone={t.earthFoodFraction < 0.5 ? 'ok' : 'warn'}
        />
      </div>
      <div className="flex gap-1.5 pl-2">
        <button
          onClick={copyBrief}
          className="text-[10px] px-2 py-1.5 border border-[var(--line)] hover:border-[var(--rust)] text-[var(--dim)] hover:text-[var(--text)] tracking-widest uppercase"
          title="Copy a markdown mission brief of the current state to the clipboard"
        >
          Brief
        </button>
        <button
          onClick={() => void copyShareLink()}
          className="text-[10px] px-2 py-1.5 border border-[var(--line)] hover:border-[var(--rust)] text-[var(--dim)] hover:text-[var(--text)] tracking-widest uppercase"
          title="Copy a permalink that replays this exact run, sol for sol"
        >
          {shareCopied ? 'Copied!' : 'Share'}
        </button>
        <button
          onClick={() => setShowSources(true)}
          className="text-[10px] px-2 py-1.5 border border-[var(--line)] hover:border-[var(--rust)] text-[var(--dim)] hover:text-[var(--text)] tracking-widest uppercase"
        >
          Sources
        </button>
        <button
          onClick={() => setShowSetup(true)}
          className="text-[10px] px-2 py-1.5 border border-[var(--rust)] text-[var(--rust-hot)] hover:bg-[var(--rust)] hover:text-black tracking-widest uppercase"
        >
          New game
        </button>
      </div>
    </header>
  );
}
