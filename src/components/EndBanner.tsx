'use client';

/**
 * End-state banner over the city view. Win states are quiet and factual;
 * lose states name the mechanism. There is no green-Mars win screen.
 * Every ending offers a shareable emoji scorecard and a challenge permalink.
 */

import { useState } from 'react';
import { buildRunPermalink, copyText } from '../lib/share/permalink';
import { scorecard } from '../lib/share/scorecard';
import { useSimStore } from '../store/useSimStore';

/** Contextual copy per end state. */
const DETAIL: Record<string, string> = {
  'RETURN FUEL READY': 'The tanks hold a full return load at 3.6:1. Ships can go home. The city keeps running.',
  'SURVIVED 3 WINDOWS CLOSED-LOOP': 'Three windows above 80% self-sufficiency. Mars is still red; the streets are green.',
  STARVED: 'Calories ran out faster than the greenhouses ramped. Check the compost loop and the manifest food line.',
  'STRANDED (NO METHALOX)': 'The departure window closed without a full propellant load. Crew waits ~26 months.',
  'DUST YEAR BLACKOUT': 'Solar collapsed under the storm and there was no nuclear floor. ISRU went dark, then everything did.',
};

/** The banner. */
export function EndBanner(): React.ReactElement | null {
  const sim = useSimStore((s) => s.sim);
  const runLog = useSimStore((s) => s.runLog);
  const setShowSetup = useSimStore((s) => s.setShowSetup);
  const [copied, setCopied] = useState<'card' | 'link' | null>(null);

  const endState = sim.endState;
  if (endState === '') {
    return null;
  }
  const isWin = endState === 'RETURN FUEL READY' || endState === 'SURVIVED 3 WINDOWS CLOSED-LOOP';

  /** Flash a "copied" acknowledgement on the pressed button. */
  const flash = (which: 'card' | 'link'): void => {
    setCopied(which);
    window.setTimeout(() => setCopied(null), 1500);
  };

  const copyScorecard = async (): Promise<void> => {
    const url = await buildRunPermalink(runLog, sim.sol);
    const ok = await copyText(scorecard(sim, { daily: runLog.daily, url }));
    if (ok) {
      flash('card');
    }
  };

  const copyLink = async (): Promise<void> => {
    const url = await buildRunPermalink(runLog, sim.sol);
    const ok = await copyText(url);
    if (ok) {
      flash('link');
    }
  };

  return (
    <div className="absolute inset-x-0 top-10 z-30 flex justify-center pointer-events-none">
      <div
        className={`panel border px-6 py-4 max-w-lg text-center pointer-events-auto ${
          isWin ? 'border-[var(--green)]' : 'border-[var(--fail)]'
        }`}
      >
        <div className={`tracking-[0.3em] text-sm ${isWin ? 'text-[var(--green)]' : 'text-[var(--fail)]'}`}>
          {endState}
        </div>
        <div className="text-[11px] text-[var(--dim)] mt-2">{DETAIL[endState] ?? ''}</div>
        <pre className="text-[11px] text-left leading-relaxed mt-3 px-3 py-2 bg-[var(--panel-2)] border border-[var(--line)] whitespace-pre-wrap">
          {scorecard(sim, { daily: runLog.daily })}
        </pre>
        <div className="flex gap-2 justify-center mt-3">
          <button
            onClick={() => void copyScorecard()}
            className="text-[10px] px-3 py-1.5 border border-[var(--line)] hover:border-[var(--rust)] text-[var(--dim)] hover:text-[var(--text)] uppercase tracking-widest"
            title="Copy the emoji scorecard plus a replay link"
          >
            {copied === 'card' ? 'Copied!' : 'Copy scorecard'}
          </button>
          <button
            onClick={() => void copyLink()}
            className="text-[10px] px-3 py-1.5 border border-[var(--line)] hover:border-[var(--rust)] text-[var(--dim)] hover:text-[var(--text)] uppercase tracking-widest"
            title="Copy a permalink that replays this exact run"
          >
            {copied === 'link' ? 'Copied!' : 'Copy challenge link'}
          </button>
          {isWin ? (
            <span className="text-[10px] text-[var(--dim)] self-center">Sim continues — keep playing.</span>
          ) : (
            <button
              onClick={() => setShowSetup(true)}
              className="text-[10px] px-3 py-1.5 border border-[var(--rust)] text-[var(--rust-hot)] hover:bg-[var(--rust)] hover:text-black uppercase tracking-widest"
            >
              New city
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
