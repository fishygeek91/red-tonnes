'use client';

/**
 * End-state banner over the city view. Win states are quiet and factual;
 * lose states open an accident-investigation brief whose findings scrub
 * the city back to the sol they name. There is no green-Mars win screen.
 * Every ending offers a shareable emoji scorecard and a challenge permalink.
 */

import { useMemo, useState } from 'react';
import { buildRunPermalink, copyText } from '../lib/share/permalink';
import { scorecard } from '../lib/share/scorecard';
import { formatPostMortem, investigate } from '../lib/sim/postmortem';
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
  const ghost = useSimStore((s) => s.ghost);
  const setShowSetup = useSimStore((s) => s.setShowSetup);
  const setScrubSol = useSimStore((s) => s.setScrubSol);
  const [copied, setCopied] = useState<'card' | 'link' | 'report' | null>(null);

  const report = useMemo(() => investigate(sim), [sim]);

  const endState = sim.endState;
  if (endState === '') {
    return null;
  }
  const isWin = endState === 'RETURN FUEL READY' || endState === 'SURVIVED 3 WINDOWS CLOSED-LOOP';

  /** Flash a "copied" acknowledgement on the pressed button. */
  const flash = (which: 'card' | 'link' | 'report'): void => {
    setCopied(which);
    window.setTimeout(() => setCopied(null), 1500);
  };

  const copyScorecard = async (): Promise<void> => {
    const url = await buildRunPermalink(runLog, sim.sol);
    const ok = await copyText(
      scorecard(sim, { daily: runLog.daily, url, ghost: ghost ?? undefined }),
    );
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

  const copyReport = async (): Promise<void> => {
    if (report === null) {
      return;
    }
    const ok = await copyText(formatPostMortem(report));
    if (ok) {
      flash('report');
    }
  };

  /** Rewind the city to a finding's sol (live if they click the terminal). */
  const scrubTo = (sol: number): void => {
    setScrubSol(sol >= sim.sol ? null : Math.max(0, sol));
  };

  return (
    <div className="absolute inset-x-0 top-10 z-30 flex justify-center pointer-events-none">
      <div
        className={`panel border px-6 py-4 max-w-xl max-h-[70vh] overflow-y-auto text-center pointer-events-auto ${
          isWin ? 'border-[var(--green)]' : 'border-[var(--fail)]'
        }`}
      >
        <div className={`tracking-[0.3em] text-sm ${isWin ? 'text-[var(--green)]' : 'text-[var(--fail)]'}`}>
          {endState}
        </div>
        <div className="text-[11px] text-[var(--dim)] mt-2">{DETAIL[endState] ?? ''}</div>
        <pre className="text-[11px] text-left leading-relaxed mt-3 px-3 py-2 bg-[var(--panel-2)] border border-[var(--line)] whitespace-pre-wrap">
          {scorecard(sim, { daily: runLog.daily, ghost: ghost ?? undefined })}
        </pre>
        {report !== null ? (
          <div className="mt-3 text-left border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2">
            <div className="flex justify-between items-baseline">
              <span className="panel-title text-[var(--fail)]">Accident investigation</span>
              <span className="num text-[9px] text-[var(--dim)]">{report.caseId}</span>
            </div>
            <p className="text-[11px] text-[var(--text)] mt-1 leading-snug">{report.probableCause}.</p>
            <ol className="mt-2 flex flex-col gap-0.5">
              {report.chain.map((finding) => (
                <li key={`${finding.sol}-${finding.kind}-${finding.text}`}>
                  <button
                    type="button"
                    onClick={() => scrubTo(finding.sol)}
                    className="w-full text-left px-1.5 py-1 text-[11px] leading-snug border border-transparent hover:border-[var(--rust)] hover:bg-black/20"
                    title="Rewind the city to this sol"
                  >
                    <span className="num text-[var(--rust-hot)]">sol {finding.sol}</span>{' '}
                    <span className={finding.kind === 'terminal' ? 'text-[var(--fail)]' : 'text-[var(--text)]'}>
                      {finding.text}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="text-[8px] text-[var(--dim)] mt-1">click a finding to rewind the city</div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 justify-center mt-3">
          <button
            onClick={() => void copyScorecard()}
            className="text-[10px] px-3 py-1.5 border border-[var(--line)] hover:border-[var(--rust)] text-[var(--dim)] hover:text-[var(--text)] uppercase tracking-widest"
            title="Copy the emoji scorecard plus a replay link"
          >
            {copied === 'card' ? 'Copied!' : 'Copy scorecard'}
          </button>
          {report !== null ? (
            <button
              onClick={() => void copyReport()}
              className="text-[10px] px-3 py-1.5 border border-[var(--line)] hover:border-[var(--rust)] text-[var(--dim)] hover:text-[var(--text)] uppercase tracking-widest"
              title="Copy the accident-investigation markdown"
            >
              {copied === 'report' ? 'Copied!' : 'Copy report'}
            </button>
          ) : null}
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
