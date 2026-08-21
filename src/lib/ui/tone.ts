/**
 * Shared tone → CSS class mapping for stats, vitals, and ledger lines.
 */

/** Visual severity / species color for a number. */
export type StatTone = 'ok' | 'warn' | 'fail' | 'green' | 'ice';

/**
 * Map a stat tone to a text color class.
 * @param tone - Optional tone; missing / `ok` uses the default text color.
 * @returns Tailwind class string.
 */
export function toneClass(tone: StatTone | undefined): string {
  if (tone === 'fail') {
    return 'text-[var(--fail)]';
  }
  if (tone === 'warn') {
    return 'text-[var(--warn)]';
  }
  if (tone === 'green') {
    return 'text-[var(--green)]';
  }
  if (tone === 'ice') {
    return 'text-[var(--ice)]';
  }
  return 'text-[var(--text)]';
}
