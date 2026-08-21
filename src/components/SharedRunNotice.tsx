'use client';

/**
 * Loads a shared run from the URL fragment (#r=...) on first mount and shows
 * a dismissible notice while the visitor is inspecting someone else's run.
 * Pressing play (Space or the scrubber) branches the run into their own.
 */

import { useEffect } from 'react';
import { decodeRunLog } from '../lib/share/encode';
import { useSimStore } from '../store/useSimStore';

/**
 * One-time hash check. Mounted on the page (not the shell) so a phone↔desktop
 * layout swap does not re-decode and reset the run.
 */
export function SharedRunLoader(): null {
  const loadSharedRun = useSimStore((s) => s.loadSharedRun);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#r=')) {
      return;
    }
    void decodeRunLog(hash.slice(3)).then((log) => {
      if (log) {
        loadSharedRun(log);
      }
    });
  }, [loadSharedRun]);

  return null;
}

/** The loader + notice. */
export function SharedRunNotice(): React.ReactElement | null {
  const sharedNotice = useSimStore((s) => s.sharedNotice);
  const setSharedNotice = useSimStore((s) => s.setSharedNotice);
  const startRace = useSimStore((s) => s.startRace);
  const playing = useSimStore((s) => s.playing);
  const endState = useSimStore((s) => s.sim.endState);

  useEffect(() => {
    if (playing && sharedNotice) {
      setSharedNotice(false);
    }
  }, [playing, sharedNotice, setSharedNotice]);

  if (!sharedNotice) {
    return null;
  }
  const runLost =
    endState === 'STARVED' ||
    endState === 'STRANDED (NO METHALOX)' ||
    endState === 'DUST YEAR BLACKOUT';
  return (
    <div className="absolute inset-x-2 top-2 z-40 flex justify-center pointer-events-none">
      <div className="panel border border-[var(--rust)] px-3 py-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pointer-events-auto max-w-xl w-full sm:w-auto">
        <span className="text-[11px] text-[var(--text)]">
          {runLost ? (
            <>
              You are watching a shared run that ended in{' '}
              <span className="text-[var(--fail)]">{endState}</span> — the investigation names the
              chain (tap a finding to rewind), then race the same seed and survive it.
            </>
          ) : (
            <>
              You are watching a shared run — scrub the timeline, press{' '}
              <span className="text-[var(--rust-hot)]">Play</span> to take over, or race their
              ghost from sol 0. Same seed, same storms.
            </>
          )}
        </span>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => startRace()}
            className="min-h-11 px-3 text-[10px] border border-[var(--rust)] text-[var(--rust-hot)] hover:bg-[var(--rust)] hover:text-black uppercase tracking-widest"
            title="Restart this seed from sol 0 with the shared run as a live ghost"
          >
            Race the ghost
          </button>
          <button
            type="button"
            onClick={() => setSharedNotice(false)}
            className="min-h-11 px-3 text-[10px] border border-[var(--line)] hover:border-[var(--rust)] text-[var(--dim)] hover:text-[var(--text)] uppercase tracking-widest"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
