'use client';

/**
 * Phone/tablet breakpoint: below Tailwind `lg` (1024px) the city-first
 * shell is used and the second WebGL globe is not mounted.
 */

import { useSyncExternalStore } from 'react';

/** Matches `lg:` — desktop mission-control starts at 1024px. */
const NARROW_QUERY = '(max-width: 1023px)';

/**
 * Subscribe to the narrow-viewport media query.
 * @param onStoreChange - React store listener.
 * @returns Unsubscribe function.
 */
function subscribe(onStoreChange: () => void): () => void {
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener('change', onStoreChange);
  return () => {
    mq.removeEventListener('change', onStoreChange);
  };
}

/**
 * Client snapshot of the narrow media query.
 * @returns True when the viewport is phone/tablet width.
 */
function getSnapshot(): boolean {
  return window.matchMedia(NARROW_QUERY).matches;
}

/**
 * SSR / hydration snapshot. Phone-first so static HTML does not mount
 * the desktop globe on a phone, then tear it down.
 * @returns True (treat the first paint as narrow).
 */
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Whether the city-first (phone/tablet) shell should render.
 * @returns True below 1024px.
 */
export function useNarrowViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
