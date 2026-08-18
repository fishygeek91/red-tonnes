/**
 * Browser-side permalink helpers. Kept separate from encode.ts so the codec
 * stays environment-agnostic (the smoke test runs it under Node).
 */

import { encodeRunLog } from './encode';
import type { RunLog } from './recording';

/**
 * Build a shareable URL for a run, stamping `finalSol` with the sol the
 * share happened at so the recipient's replay stops exactly here.
 */
export async function buildRunPermalink(log: RunLog, finalSol: number): Promise<string> {
  const encoded = await encodeRunLog({ ...log, finalSol });
  return `${window.location.origin}${window.location.pathname}#r=${encoded}`;
}

/** Copy text to the clipboard; returns false when the context forbids it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
