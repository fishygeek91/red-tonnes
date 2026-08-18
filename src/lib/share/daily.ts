/**
 * Daily challenge derivation: one shared setup per UTC calendar day.
 * The date string is hashed (mulberry-style mixing, matching rng.ts) into a
 * seed, and the site + manifest template are picked deterministically from
 * the existing preset lists — everyone on Earth lands the same city today.
 */

import { MANIFEST_TEMPLATES } from '../sim/state';
import { SITES } from '../sites';

/** Everything needed to start (and label) today's challenge. */
export interface DailyChallenge {
  /** UTC date key, YYYY-MM-DD. Stored on the run log to tag daily runs. */
  readonly dateKey: string;
  /** Human-friendly challenge number (days since the epoch date, 1-based). */
  readonly dayNumber: number;
  /** Derived RNG seed. */
  readonly seed: number;
  /** Site id for today. */
  readonly siteId: string;
  /** Manifest template id for today. */
  readonly templateId: string;
}

/** First daily challenge date (UTC). Daily #1. */
const EPOCH_UTC_MS = Date.UTC(2026, 0, 1);

/** Format a Date as a UTC YYYY-MM-DD key. */
export function dateKeyOf(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Hash a string to an unsigned 32-bit integer (FNV-1a + avalanche mix). */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  // Final avalanche so consecutive dates diverge across all bits.
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Compute the daily challenge for a given date (UTC calendar day). */
export function dailyChallenge(date: Date): DailyChallenge {
  const dateKey = dateKeyOf(date);
  const hash = hashString(dateKey);
  const dayMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dayNumber = Math.max(1, Math.floor((dayMs - EPOCH_UTC_MS) / 86400000) + 1);
  // Independent bit ranges pick site and template so they do not correlate.
  const site = SITES[hash % SITES.length];
  const template = MANIFEST_TEMPLATES[(hash >>> 8) % MANIFEST_TEMPLATES.length];
  return {
    dateKey,
    dayNumber,
    // Seed keeps the full hash: same date => same storms for every player.
    seed: hash,
    siteId: site.id,
    templateId: template.id,
  };
}

/** Daily number for a stored date key (used when rendering old scorecards). */
export function dayNumberOf(dateKey: string): number {
  const parts = dateKey.split('-').map((p) => Number(p));
  if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p))) {
    return 1;
  }
  const ms = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  return Math.max(1, Math.floor((ms - EPOCH_UTC_MS) / 86400000) + 1);
}
