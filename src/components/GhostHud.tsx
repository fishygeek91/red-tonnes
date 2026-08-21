'use client';

/**
 * Ghost race HUD: live comparison against the frozen shared run — fuel,
 * loop closure, and pace on the fuel race — plus toasts that fire as the
 * player's clock crosses each of the ghost's milestone sols.
 * Rendered only while a ghost is loaded and the shared-run notice is gone.
 */

import { useEffect, useRef, useState } from 'react';
import type { GhostRun } from '../lib/share/ghost';
import { ghostFuelLeadSols, ghostSnapshotAt } from '../lib/share/ghost';
import { topBarStats } from '../lib/sim/derive';
import { useNarrowViewport } from '../hooks/useNarrowViewport';
import { useSimStore } from '../store/useSimStore';

/** One on-screen ghost-milestone toast. */
interface GhostToast {
  readonly id: number;
  readonly sol: number;
  readonly text: string;
}

/** How long a milestone toast stays up, ms. */
const TOAST_MS = 8000;
/** Max simultaneous toasts (oldest dropped first). */
const TOAST_STACK = 3;

/** Signed formatting for deltas, e.g. "+12.4" / "−3.0". */
function signed(v: number, digits: number): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}`;
}

/** The HUD + toast stack. */
export function GhostHud(): React.ReactElement | null {
  const sim = useSimStore((s) => s.sim);
  const ghost = useSimStore((s) => s.ghost);
  const sharedNotice = useSimStore((s) => s.sharedNotice);
  const clearGhost = useSimStore((s) => s.clearGhost);
  const narrow = useNarrowViewport();

  const [toasts, setToasts] = useState<readonly GhostToast[]>([]);
  // Sol already scanned for milestones; toasts fire for (prevSol, sol].
  const prevSolRef = useRef(0);
  // Ghost identity guard: a newly loaded ghost must not replay old toasts.
  const lastGhostRef = useRef<GhostRun | null>(null);
  const nextIdRef = useRef(1);

  useEffect(() => {
    if (ghost !== lastGhostRef.current) {
      // New ghost (or ghost cleared): sync the scan cursor, drop stale toasts.
      lastGhostRef.current = ghost;
      prevSolRef.current = sim.sol;
      setToasts([]);
      return;
    }
    if (ghost === null) {
      return;
    }
    const prev = prevSolRef.current;
    if (sim.sol < prev) {
      // Race restarted from sol 0 with the same ghost: reset without toasting.
      prevSolRef.current = sim.sol;
      return;
    }
    if (sim.sol === prev) {
      return;
    }
    const fresh = ghost.milestones.filter((m) => m.sol > prev && m.sol <= sim.sol);
    prevSolRef.current = sim.sol;
    if (fresh.length === 0) {
      return;
    }
    const added: GhostToast[] = fresh.map((m) => ({
      id: nextIdRef.current++,
      sol: m.sol,
      text: m.text,
    }));
    setToasts((cur) => [...cur, ...added].slice(-TOAST_STACK));
    for (const t of added) {
      window.setTimeout(() => {
        setToasts((cur) => cur.filter((x) => x.id !== t.id));
      }, TOAST_MS);
    }
  }, [ghost, sim.sol]);

  if (ghost === null || sharedNotice) {
    return null;
  }

  const you = topBarStats(sim);
  const snap = ghostSnapshotAt(ghost, sim.sol);
  const ghostFuelT = snap ? snap.methaloxKg / 1000 : 0;
  const ghostLoop = snap ? snap.selfSufficiency : 0;
  const lead = ghostFuelLeadSols(ghost, sim.sol, you.methaloxT * 1000);
  const ghostDone = sim.sol >= ghost.finalSol;

  return (
    <div
      className={`absolute left-2 right-2 z-20 w-72 max-w-[calc(100%-1rem)] pointer-events-none flex flex-col gap-1 ${
        narrow ? 'top-14' : 'top-2'
      }`}
    >
      <div className="panel border border-[var(--line)] px-3 py-2 pointer-events-auto">
        <div className="flex justify-between items-baseline">
          <span className="panel-title text-[var(--rust-hot)]">Ghost race</span>
          <button
            onClick={clearGhost}
            className="min-h-11 px-2 text-[10px] border border-[var(--line)] text-[var(--dim)] hover:text-[var(--text)] hover:border-[var(--rust)] uppercase tracking-widest"
            title="Drop the ghost overlay"
          >
            End race
          </button>
        </div>
        <div className="text-[9px] text-[var(--dim)] mb-1">{ghost.label}</div>
        <div className="num text-[10px] leading-relaxed">
          <div className="flex justify-between">
            <span className="text-[var(--dim)]">Fuel</span>
            <span>
              you {you.methaloxT.toFixed(1)} t · ghost {ghostFuelT.toFixed(1)} t{' '}
              <span className={you.methaloxT >= ghostFuelT ? 'text-[var(--green)]' : 'text-[var(--warn)]'}>
                ({signed(you.methaloxT - ghostFuelT, 1)})
              </span>
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--dim)]">Loop</span>
            <span>
              you {(you.selfSufficiency * 100).toFixed(0)}% · ghost {(ghostLoop * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--dim)]">Pace</span>
            {lead === null ? (
              <span className="text-[var(--green)]">ahead of everything the ghost banked</span>
            ) : (
              <span className={lead >= 0 ? 'text-[var(--green)]' : 'text-[var(--warn)]'}>
                {Math.abs(lead)} sols {lead >= 0 ? 'ahead' : 'behind'} on fuel
              </span>
            )}
          </div>
          {ghostDone ? (
            <div className="text-[9px] text-[var(--dim)] mt-1 border-t border-[var(--line)] pt-1">
              Ghost ended at sol {ghost.finalSol}
              {ghost.endState !== '' ? (
                <>
                  : <span className="text-[var(--text)]">{ghost.endState}</span>
                </>
              ) : (
                ' — still running when shared'
              )}
            </div>
          ) : null}
        </div>
      </div>
      {toasts.map((t) => (
        <div
          key={t.id}
          className="panel border border-[var(--rust)] px-3 py-1.5 text-[10px] pointer-events-auto"
        >
          <span className="num text-[var(--rust-hot)]">s{t.sol}</span>{' '}
          <span className="text-[var(--dim)] uppercase tracking-widest text-[9px]">ghost</span>{' '}
          <span className="text-[var(--text)]">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
