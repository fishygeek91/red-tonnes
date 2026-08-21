'use client';

/**
 * First-visit teaching overlay. The demo keeps playing underneath;
 * this only names the three jobs the city has to do.
 */

import { useState, useSyncExternalStore } from 'react';
import { useSimStore } from '../../store/useSimStore';

/** localStorage flag so returning visitors skip the cards. */
export const BRIEFING_KEY = 'rt-briefing-v1';

/** One teaching card. */
interface Card {
  readonly title: string;
  readonly body: string;
}

const CARDS: readonly Card[] = [
  {
    title: 'Starship is the currency',
    body: 'Every import is paid in landed tonnes. The next cargo window is 759 sols away — miss it and you wait ~26 months.',
  },
  {
    title: 'Feed the crew',
    body: 'Local food and water have to beat Earth rations before the loop closes. Calories and the water tank are the first things that kill a city.',
  },
  {
    title: 'Fuel the return',
    body: 'Bank methalox at 3.6:1 (LOX:CH4) before the departure sol. Short the tanks and the crew is stranded until the next window.',
  },
];

/**
 * Read whether this browser has dismissed the briefing.
 * @returns True if the visitor already finished the cards.
 */
function readSeen(): boolean {
  try {
    return window.localStorage.getItem(BRIEFING_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Persist that the briefing was dismissed.
 */
function writeSeen(): void {
  try {
    window.localStorage.setItem(BRIEFING_KEY, '1');
  } catch {
    // Private mode / quota — treat as dismissed for this session only.
  }
}

/** No-op subscribe: the flag only changes from this component. */
function subscribe(): () => void {
  return () => {
    return;
  };
}

/** Client snapshot of the persisted dismiss flag. */
function getSnapshot(): boolean {
  return readSeen();
}

/** Hide on the server so hydration does not flash the overlay. */
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Three-step overlay. Hidden on shared-run visits and after dismiss.
 */
export function Briefing(): React.ReactElement | null {
  const sharedNotice = useSimStore((s) => s.sharedNotice);
  const persistedSeen = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || persistedSeen || sharedNotice) {
    return null;
  }

  const card = CARDS[step];
  if (card === undefined) {
    return null;
  }
  const last = step >= CARDS.length - 1;

  /** Advance, or dismiss on the last card. */
  const next = (): void => {
    if (last) {
      writeSeen();
      setDismissed(true);
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <div className="absolute inset-0 z-40 bg-black/65 flex items-end justify-center pointer-events-auto safe-pad-bottom">
      <div className="w-full max-w-md panel border border-[var(--rust)] p-4 m-3">
        <div className="panel-title text-[var(--rust-hot)] mb-2">
          How this works · {step + 1}/{CARDS.length}
        </div>
        <h2 className="text-sm text-[var(--text)] tracking-wide mb-2">{card.title}</h2>
        <p className="text-[12px] text-[var(--dim)] leading-relaxed">{card.body}</p>
        <div className="flex gap-2 mt-4">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="min-h-11 px-4 border border-[var(--line)] text-[var(--dim)] uppercase tracking-widest text-[11px]"
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={next}
            className="flex-1 min-h-11 px-4 border border-[var(--rust)] text-[var(--rust-hot)] hover:bg-[var(--rust)] hover:text-black uppercase tracking-widest text-[11px]"
          >
            {last ? 'Watch the city' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
