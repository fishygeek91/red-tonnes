'use client';

/**
 * Invisible component that drives the simulation clock with
 * requestAnimationFrame. Renders nothing; only dispatches ticks.
 */

import { useEffect } from 'react';
import { useSimStore } from '../store/useSimStore';

/** Mount once; keeps the sim advancing while `playing` is true, and wires keyboard shortcuts (space = play/pause, N = jump to next window). */
export function SimClock(): null {
  const tick = useSimStore((s) => s.tick);
  const togglePlay = useSimStore((s) => s.togglePlay);
  const jumpToNextWindow = useSimStore((s) => s.jumpToNextWindow);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(0.25, (now - last) / 1000); // clamp long frames
      last = now;
      tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target;
      // Never hijack keys while the user is typing in a form control.
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLButtonElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'KeyN') {
        e.preventDefault();
        jumpToNextWindow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, jumpToNextWindow]);

  return null;
}
