/**
 * Headless smoke test: run the demo seed for two synodic windows and print
 * the numbers that matter. Also verifies determinism (same seed => same
 * history) and that nothing goes NaN.
 */

import { decodeRunLog, encodeRunLog } from '../src/lib/share/encode';
import { ghostFromReplay, ghostFuelLeadSols, ghostSnapshotAt, raceVerdict } from '../src/lib/share/ghost';
import { appendRunAction, emptyRunLog, replayRun } from '../src/lib/share/recording';
import { scorecard } from '../src/lib/share/scorecard';
import { missionBrief } from '../src/lib/sim/brief';
import { topBarStats } from '../src/lib/sim/derive';
import { MANIFEST_TEMPLATES, createInitialState } from '../src/lib/sim/state';
import type { SimActions } from '../src/lib/sim/step';
import { step } from '../src/lib/sim/step';

function run(seed: number): ReturnType<typeof createInitialState> {
  let s = createInitialState({ seed, siteId: 'arcadia', templateId: 'balanced' });
  for (let i = 0; i < 1520; i += 10) {
    s = step(s, 10, {});
    // Every material pool must stay non-negative at every checkpoint.
    for (const [name, v] of Object.entries(s.inv)) {
      if (typeof v === 'number' && (v < -1e-6 || !Number.isFinite(v))) {
        throw new Error(`pool '${name}' went bad at sol ${s.sol}: ${v}`);
      }
    }
  }
  return s;
}

const a = run(7);
const b = run(7);

// Determinism check: identical seeds must produce identical histories.
const same =
  a.history.length === b.history.length &&
  a.history.every((h, i) => Math.abs(h.methaloxKg - b.history[i].methaloxKg) < 1e-9);
console.log('deterministic:', same);

// NaN sweep across every inventory pool.
const pools = Object.entries(a.inv).filter(([, v]) => typeof v === 'number') as Array<[string, number]>;
const bad = pools.filter(([, v]) => !Number.isFinite(v));
console.log('non-finite pools:', bad.length === 0 ? 'none' : bad);

// The demo seed must include a real dust storm in the recorded history.
const peakTau = Math.max(...a.history.map((h) => h.tau));
console.log('peak tau seen:', peakTau.toFixed(2), peakTau > 2 ? '(storm confirmed)' : '(NO STORM — demo seed broken!)');

const t = topBarStats(a);
console.log('--- after ~2 windows (sol', a.sol, ') ---');
console.log('window:', a.window, 'endState:', a.endState || '(running)');
console.log('methalox t:', t.methaloxT.toFixed(1), 'ships fuelable:', t.shipsFuelable.toFixed(2));
console.log('kcal/p/sol:', t.kcalPerPersonSol.toFixed(0), 'earth food frac:', t.earthFoodFraction.toFixed(2));
console.log('water sols:', t.waterDaysReserve.toFixed(0), 'selfSuff:', (t.selfSufficiency * 100).toFixed(0) + '%');
console.log('N pool kg:', a.inv.nitrogenKg.toFixed(0), 'compost kg:', a.inv.compostKg.toFixed(0), 'feedstock kg:', a.inv.feedstockKg.toFixed(0));
console.log('events:');
for (const e of a.events.slice(-15)) {
  console.log(`  s${e.sol} [${e.kind}] ${e.text}`);
}
console.log('\n' + missionBrief(a));

// ---- share feature: replay equivalence + codec round-trip -------------------
// A live run with mid-run actions applied at arbitrary sols, advanced in
// deliberately odd chunk sizes, must be bit-identical to replayRun() of its
// recorded log — this is the contract the whole permalink feature rests on.
async function shareChecks(): Promise<void> {
  let live = createInitialState({ seed: 42, siteId: 'utopia', templateId: 'food' });
  let log = emptyRunLog(42, 'utopia', 'food');

  /** Apply an action to the live run and record it, exactly like the store. */
  const act = (actions: SimActions): void => {
    log = appendRunAction(log, {
      sol: live.sol,
      cropMix: actions.cropMix,
      manifests: actions.manifests,
      params: actions.params,
    });
    live = step(live, 0, actions);
  };

  live = step(live, 137, {});
  act({ cropMix: { potato: 3, greens: 1, spirulina: 1 } });
  live = step(live, 7, {});
  act({ params: { starshipPayloadT: 120, shipsPerWindow: 4 } });
  // Same-sol second edit: must collapse into one log entry, same result.
  act({ params: { methaloxPerShipT: 950 } });
  live = step(live, 263, {});
  act({ manifests: { 2: { ...MANIFEST_TEMPLATES[1].manifest, crew: 8 } } });
  live = step(live, 401, {});

  const replayed = replayRun({ ...log, finalSol: live.sol });
  const identical = JSON.stringify(live) === JSON.stringify(replayed);
  console.log('\n--- share checks ---');
  console.log('replay identical to live:', identical);
  if (!identical) {
    throw new Error('replayRun diverged from the live run — determinism contract broken');
  }

  // Codec round-trip: encode -> decode must reproduce the log exactly.
  const shared = { ...log, finalSol: live.sol };
  const encoded = await encodeRunLog(shared);
  const decoded = await decodeRunLog(encoded);
  const roundTrips = decoded !== null && JSON.stringify(decoded) === JSON.stringify(shared);
  console.log('codec round-trips:', roundTrips, `(${encoded.length} chars)`);
  if (!roundTrips) {
    throw new Error('encode/decode round-trip failed');
  }

  // Malformed payloads must decode to null, never throw.
  const junk = await Promise.all([
    decodeRunLog('not-base64!!'),
    decodeRunLog('aGVsbG8'),
    decodeRunLog(''),
  ]);
  console.log('malformed inputs rejected:', junk.every((d) => d === null));

  // Hostile payloads: well-formed encodings that must still be rejected.
  // (a) unknown structure id — would crash STRUCTURES[id].massKg on landing;
  // (b) unbounded finalSol — would freeze the tab in replayRun;
  // (c) negative import mass — would inject negative mass into conserved pools.
  // Case (a) cannot be built through encodeRunLog (the types forbid it), so
  // forge it at the JSON level via the same deflate + base64url pipeline.
  const encodeRawJson = async (json: string): Promise<string> => {
    const stream = new Blob([new TextEncoder().encode(json)])
      .stream()
      .pipeThrough(new CompressionStream('deflate-raw'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = '';
    for (const b of bytes) {
      binary += String.fromCharCode(b);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const bogusStructureJson = JSON.stringify({
    ...shared,
    actions: [
      {
        sol: 0,
        manifests: { 1: { ...MANIFEST_TEMPLATES[0].manifest, structures: { bogus: 1 } } },
      },
    ],
  });
  const hostile = await Promise.all([
    decodeRunLog(await encodeRawJson(bogusStructureJson)),
    decodeRunLog(await encodeRunLog({ ...shared, finalSol: 1e9 })),
    decodeRunLog(
      await encodeRunLog({
        ...shared,
        actions: [
          { sol: 0, manifests: { 1: { ...MANIFEST_TEMPLATES[0].manifest, earthFoodKg: -50000 } } },
        ],
      }),
    ),
  ]);
  const hostileRejected = hostile.every((d) => d === null);
  console.log('hostile payloads rejected:', hostileRejected);
  if (!hostileRejected) {
    throw new Error('a hostile payload passed validation');
  }

  console.log('\n' + scorecard(replayed, { daily: '2026-08-18' }));

  // ---- ghost racing checks --------------------------------------------------
  // The ghost is derived from a replayed shared run; it must snapshot the
  // run faithfully and stay frozen while the racer's sim keeps stepping.
  const ghost = ghostFromReplay(shared, replayed);
  const historyLenBefore = ghost.history.length;
  const steppedPast = step(replayed, 25, {});
  const frozen =
    ghost.history.length === historyLenBefore && steppedPast.history.length > historyLenBefore;

  // Snapshot lookup: every queried sol must return the latest snapshot at or
  // before it, and sols past finalSol must clamp to the last snapshot.
  const probes = [1, 137, 400, shared.finalSol, shared.finalSol + 500];
  const lookupOk = probes.every((sol) => {
    const snap = ghostSnapshotAt(ghost, sol);
    return snap !== null && snap.sol <= sol && snap.sol <= shared.finalSol;
  });

  // Pace helper: the ghost reached its own final fuel level no later than
  // finalSol, so the lead measured there can never be positive.
  const finalFuel = ghost.history[ghost.history.length - 1].methaloxKg;
  const lead = ghostFuelLeadSols(ghost, shared.finalSol, finalFuel);
  const paceOk = lead !== null && lead <= 0;

  // Racing a run against its own ghost must never declare a winner by sols.
  const selfVerdict = raceVerdict(ghost, replayed);
  const verdictOk = selfVerdict === null || selfVerdict === '🏁 Dead heat with the ghost';

  // Decided-verdict branch: the seed-7 demo run banks return fuel (sol 1124),
  // so racing it against its own ghost must land exactly on a dead heat.
  const fueledGhost = ghostFromReplay(
    { ...emptyRunLog(7, 'arcadia', 'balanced'), finalSol: a.sol },
    a,
  );
  const fueledVerdict = raceVerdict(fueledGhost, a);
  const fueledOk = fueledVerdict === '🏁 Dead heat with the ghost';

  console.log('\n--- ghost checks ---');
  console.log('ghost frozen while sim steps:', frozen);
  console.log('snapshot lookup clamps correctly:', lookupOk);
  console.log('pace helper self-consistent:', paceOk);
  console.log('self-race verdict sane:', verdictOk, selfVerdict === null ? '(undecided)' : `(${selfVerdict})`);
  console.log('fueled self-race is a dead heat:', fueledOk, `(${fueledVerdict ?? 'null'})`);
  if (!frozen || !lookupOk || !paceOk || !verdictOk || !fueledOk) {
    throw new Error('ghost racing checks failed');
  }
}

void shareChecks();
