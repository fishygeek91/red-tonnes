'use client';

/**
 * One-line mission objective over the city: feed, water, or fuel —
 * whichever is the current bottleneck.
 */

import { topBarStats } from '../../lib/sim/derive';
import { toneClass } from '../../lib/ui/tone';
import type { StatTone } from '../../lib/ui/tone';
import { useSimStore } from '../../store/useSimStore';

/** Computed chip copy and severity. */
interface Objective {
  readonly text: string;
  readonly tone: StatTone;
}

/**
 * Pick the most urgent job from the live top-bar stats.
 * @param kcal - Calories eaten yesterday per person.
 * @param waterDays - Tank-only water runway in sols.
 * @param shipsFuelable - Ships that can depart at the 3.6:1 ratio.
 * @param shipsNeeded - Return-ship quota this window.
 * @param departSol - Absolute sol of the next departure burn.
 * @returns Chip text and tone.
 */
function objectiveOf(
  kcal: number,
  waterDays: number,
  shipsFuelable: number,
  shipsNeeded: number,
  departSol: number,
): Objective {
  if (kcal < 2000) {
    return { text: `Calories ${kcal.toFixed(0)} — grow or import`, tone: 'fail' };
  }
  if (kcal < 2700) {
    return { text: `Calories ${kcal.toFixed(0)} — crew is short`, tone: 'warn' };
  }
  if (waterDays <= 60) {
    return { text: `Water reserve ${Math.min(9999, waterDays).toFixed(0)} sols`, tone: 'fail' };
  }
  const quota = Math.max(0, shipsNeeded);
  const ready = shipsFuelable.toFixed(2);
  if (quota === 0) {
    return { text: 'No return-ship quota this window', tone: 'ok' };
  }
  if (shipsFuelable >= quota) {
    return { text: `Return fuel ready · ${ready} ships`, tone: 'ok' };
  }
  return {
    text: `Fuel ${quota} ship${quota === 1 ? '' : 's'} by sol ${departSol} · ${ready} ready`,
    tone: shipsFuelable >= quota * 0.5 ? 'warn' : 'fail',
  };
}

/**
 * Floating objective line. Hidden while a sheet covers the lower city
 * so it does not fight the sheet header.
 */
export function ObjectiveChip(): React.ReactElement | null {
  const sim = useSimStore((s) => s.sim);
  const mobileSheet = useSimStore((s) => s.mobileSheet);
  const sharedNotice = useSimStore((s) => s.sharedNotice);
  const ghost = useSimStore((s) => s.ghost);
  if (mobileSheet !== null || sim.endState !== '' || sharedNotice || ghost !== null) {
    return null;
  }
  const t = topBarStats(sim);
  const departSol = sim.sol + t.solsToNextDeparture;
  const obj = objectiveOf(
    t.kcalPerPersonSol,
    t.waterDaysReserve,
    t.shipsFuelable,
    sim.params.returnShipsPerWindow,
    departSol,
  );
  return (
    <div className="absolute left-2 right-2 top-2 z-10 pointer-events-none flex justify-start">
      <div className={`panel border border-[var(--line)] px-2.5 py-1.5 text-[11px] leading-snug ${toneClass(obj.tone)}`}>
        {obj.text}
      </div>
    </div>
  );
}
