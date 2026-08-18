'use client';

/**
 * Loads a shared run from the URL fragment (#r=...) on first mount and shows
 * a dismissible notice while the visitor is inspecting someone else's run.
 * Pressing play (Space or the scrubber) branches the run into their own.
 */

import { useEffect } from 'react';
import { decodeRunLog } from '../lib/share/encode';
import { useSimStore } from '../store/useSimStore';

/** The loader + notice. */
export function SharedRunNotice(): React.ReactElement | null {
  const sharedNotice = useSimStore((s) => s.sharedNotice);
  const setSharedNotice = useSimStore((s) => s.setSharedNotice);
  const loadSharedRun = useSimStore((s) => s.loadSharedRun);
  const playing = useSimStore((s) => s.playing);
  const endState = useSimStore((s) => s.sim.endState);

  // One-time hash check: a valid #r= payload replaces the demo autoplay.
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

  // The notice retires itself once the visitor takes over.
  useEffect(() => {
    if (playing && sharedNotice) {
      setSharedNotice(false);
    }
  }, [playing, sharedNotice, setSharedNotice]);

  if (!sharedNotice) {
    return null;
  }
  // Terminal lose states freeze the engine clock, so "press Space" would do
  // nothing — point the visitor at New Game instead.
  const runLost =
    endState === 'STARVED' ||
    endState === 'STRANDED (NO METHALOX)' ||
    endState === 'DUST YEAR BLACKOUT';
  return (
    <div className="absolute inset-x-0 top-2 z-40 flex justify-center pointer-events-none">
      <div className="panel border border-[var(--rust)] px-4 py-2 flex items-center gap-3 pointer-events-auto">
        <span className="text-[11px] text-[var(--text)]">
          {runLost ? (
            <>
              You are watching a shared run that ended in{' '}
              <span className="text-[var(--fail)]">{endState}</span> — scrub the timeline to see
              where it went wrong, then start a New Game to do better.
            </>
          ) : (
            <>
              You are watching a shared run — scrub the timeline, then press{' '}
              <span className="text-[var(--rust-hot)]">Space</span> to take over and beat it.
            </>
          )}
        </span>
        <button
          onClick={() => setSharedNotice(false)}
          className="text-[10px] px-2 py-1 border border-[var(--line)] hover:border-[var(--rust)] text-[var(--dim)] hover:text-[var(--text)] uppercase tracking-widest"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
