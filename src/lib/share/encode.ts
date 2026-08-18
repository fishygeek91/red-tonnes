/**
 * URL codec for run logs: JSON -> deflate-raw -> base64url and back.
 * Uses the native CompressionStream / DecompressionStream APIs (available in
 * all modern browsers and Node 18+), so no dependencies are added. Decoding
 * validates the payload field-by-field and returns null on any malformed
 * input — a shared link must never crash the app.
 */

import type { Manifest, ModelParams } from '../sim/state';
import { STRUCTURES } from '../structures';
import type { RunAction, RunLog } from './recording';

/**
 * Hard ceiling on any sol value in a decoded log (~260 windows / ~560 Earth
 * years). replayRun advances sol-by-sol, so an unbounded finalSol in a
 * crafted link would otherwise freeze the tab.
 */
const MAX_SOLS = 200000;

/** Hard ceiling on recorded actions in a decoded log. */
const MAX_ACTIONS = 5000;

/** Compress raw bytes with deflate-raw. */
async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Decompress deflate-raw bytes; returns null if the stream is corrupt. */
async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array | null> {
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/** Encode bytes as URL-safe base64 (RFC 4648 §5, unpadded). */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  // Chunked to stay well under argument/string limits on long runs.
  const chunk = 0x2000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode URL-safe base64 to bytes; returns null on invalid input. */
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/** True when the value is a plain object (record). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when the value is a finite number. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** True when the value is a finite, non-negative number. */
function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

/** True when every value of the record is a finite number. */
function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isFiniteNumber);
}

/**
 * Validate a manifest's structure counts: every key must be a real structure
 * id (step.ts indexes STRUCTURES[id] unchecked when the window lands) and
 * every count non-negative.
 */
function isStructureCounts(value: unknown): value is Manifest['structures'] {
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).every(
    ([id, count]) => id in STRUCTURES && isNonNegativeNumber(count),
  );
}

/** Validate a Manifest shape. Mass fields must be non-negative: negative imports would inject negative mass into conserved pools. */
function isManifest(value: unknown): value is Manifest {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isStructureCounts(value.structures) &&
    isNonNegativeNumber(value.earthFoodKg) &&
    isNonNegativeNumber(value.sparesKg) &&
    isNonNegativeNumber(value.h2Kg) &&
    isNonNegativeNumber(value.substrateKg) &&
    isNonNegativeNumber(value.fertilizerNKg) &&
    isNonNegativeNumber(value.fertilizerPkKg) &&
    isNonNegativeNumber(value.crew)
  );
}

/** Validate a partial ModelParams shape (every present field type-checked). */
function isPartialParams(value: unknown): value is Partial<ModelParams> {
  if (!isRecord(value)) {
    return false;
  }
  const numeric: readonly string[] = [
    'starshipPayloadT',
    'methaloxPerShipT',
    'shipsPerWindow',
    'returnShipsPerWindow',
  ];
  for (const key of numeric) {
    if (key in value && value[key] !== undefined && !isNonNegativeNumber(value[key])) {
      return false;
    }
  }
  if ('overlayEnabled' in value && typeof value.overlayEnabled !== 'boolean') {
    return false;
  }
  return true;
}

/** Validate a RunAction shape. */
function isRunAction(value: unknown): value is RunAction {
  if (!isRecord(value) || !isNonNegativeNumber(value.sol) || value.sol > MAX_SOLS) {
    return false;
  }
  if ('cropMix' in value && value.cropMix !== undefined && !isNumberRecord(value.cropMix)) {
    return false;
  }
  if ('manifests' in value && value.manifests !== undefined) {
    if (!isRecord(value.manifests)) {
      return false;
    }
    for (const m of Object.values(value.manifests)) {
      if (!isManifest(m)) {
        return false;
      }
    }
  }
  if ('params' in value && value.params !== undefined && !isPartialParams(value.params)) {
    return false;
  }
  return true;
}

/** Validate a full RunLog shape. */
function isRunLog(value: unknown): value is RunLog {
  if (!isRecord(value)) {
    return false;
  }
  if (value.v !== 1) {
    return false;
  }
  if (!isFiniteNumber(value.seed)) {
    return false;
  }
  if (!isNonNegativeNumber(value.finalSol) || value.finalSol > MAX_SOLS) {
    return false;
  }
  if (typeof value.siteId !== 'string' || typeof value.templateId !== 'string') {
    return false;
  }
  if ('daily' in value && value.daily !== undefined && typeof value.daily !== 'string') {
    return false;
  }
  return (
    Array.isArray(value.actions) &&
    value.actions.length <= MAX_ACTIONS &&
    value.actions.every(isRunAction)
  );
}

/** Encode a run log into a URL-fragment-safe string. */
export async function encodeRunLog(log: RunLog): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(log));
  return toBase64Url(await deflate(json));
}

/** Decode a run log from a URL fragment payload; null on any malformed input. */
export async function decodeRunLog(encoded: string): Promise<RunLog | null> {
  const bytes = fromBase64Url(encoded);
  if (!bytes) {
    return null;
  }
  const inflated = await inflate(bytes);
  if (!inflated) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(inflated));
  } catch {
    return null;
  }
  return isRunLog(parsed) ? parsed : null;
}
