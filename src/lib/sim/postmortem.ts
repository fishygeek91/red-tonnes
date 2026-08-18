/**
 * Accident-investigation post-mortem.
 *
 * When a run ends in a terminal lose state, this walks the recorded per-sol
 * history and event log backwards for the causal chain — storm onset, power
 * shed, ISRU stall, ration exhaustion — and names a probable cause. Pure
 * derivation: nothing here mutates state or touches the engine.
 *
 * Win states and a still-running city return null. The report is meant to
 * read like a short NTSB brief, not a tutorial.
 */

import { DEPARTURE_OFFSET_SOLS, HUMAN_KCAL_PER_SOL, SOLS_PER_SYNODIC_WINDOW } from '../constants';
import { getSite } from '../sites';
import type { EndState, SimEvent, SimState, SolSnapshot } from './state';

/** How a finding sits in the chain. */
export type FindingKind = 'precipitating' | 'contributing' | 'terminal';

/** One dated finding the player can click to rewind to. */
export interface Finding {
  /** Sol the finding refers to (used to scrub the city). */
  readonly sol: number;
  /** Role in the accident sequence. */
  readonly kind: FindingKind;
  /** One-line finding, no trailing period so the UI can compose freely. */
  readonly text: string;
}

/** A complete investigation of a lost city. */
export interface PostMortem {
  /** Short case file id, e.g. RT-STRANDED-s1359. */
  readonly caseId: string;
  /** Site display name. */
  readonly siteName: string;
  /** Terminal end state that triggered the investigation. */
  readonly endState: EndState;
  /** One-sentence probable cause. */
  readonly probableCause: string;
  /** Chronological findings, terminal last. */
  readonly chain: readonly Finding[];
}

/** Calorie warning threshold — 90% of the 3,000 kcal BVAD need. */
const KCAL_DEFICIT = HUMAN_KCAL_PER_SOL * 0.9;
/** Optical depth that the rest of the UI treats as a storm. */
const STORM_TAU = 2;
/** Power ratio below which ISRU is being shed. */
const POWER_SHED = 0.85;
/** Methalox growth below this (kg/sol) counts as an idle tank farm. */
const ISRU_IDLE_KG = 100;
/** Minimum streak length before we bother naming it. */
const MIN_STREAK = 8;

/** A contiguous run of snapshots matching a predicate. */
interface Streak {
  readonly start: SolSnapshot;
  readonly end: SolSnapshot;
  readonly length: number;
}

/** First snapshot matching `pred`, or null. */
function firstWhere(
  history: readonly SolSnapshot[],
  pred: (snap: SolSnapshot) => boolean,
): SolSnapshot | null {
  return history.find(pred) ?? null;
}

/** Snapshot that maximises `score`, or null on an empty history. */
function peakOf(
  history: readonly SolSnapshot[],
  score: (snap: SolSnapshot) => number,
): SolSnapshot | null {
  if (history.length === 0) {
    return null;
  }
  return history.reduce((best, snap) => (score(snap) > score(best) ? snap : best));
}

/** Snapshot that minimises `score`, or null on an empty history. */
function troughOf(
  history: readonly SolSnapshot[],
  score: (snap: SolSnapshot) => number,
): SolSnapshot | null {
  if (history.length === 0) {
    return null;
  }
  return history.reduce((best, snap) => (score(snap) < score(best) ? snap : best));
}

/** Longest contiguous run matching `pred`. */
function longestStreak(
  history: readonly SolSnapshot[],
  pred: (snap: SolSnapshot) => boolean,
): Streak | null {
  let best: Streak | null = null;
  let runStart: SolSnapshot | null = null;
  let runEnd: SolSnapshot | null = null;
  const close = (): void => {
    if (runStart === null || runEnd === null) {
      return;
    }
    const length = runEnd.sol - runStart.sol + 1;
    if (length >= MIN_STREAK && (best === null || length > best.length)) {
      best = { start: runStart, end: runEnd, length };
    }
    runStart = null;
    runEnd = null;
  };
  for (const snap of history) {
    if (pred(snap)) {
      if (runStart === null) {
        runStart = snap;
      }
      runEnd = snap;
    } else {
      close();
    }
  }
  close();
  return best;
}

/** Slice of history at or before `sol` (inclusive), empty if none. */
function untilSol(history: readonly SolSnapshot[], sol: number): readonly SolSnapshot[] {
  return history.filter((snap) => snap.sol <= sol);
}

/** Compact case-file tag for an end state. */
function caseTag(endState: EndState): string {
  if (endState === 'STRANDED (NO METHALOX)') {
    return 'STRANDED';
  }
  if (endState === 'DUST YEAR BLACKOUT') {
    return 'BLACKOUT';
  }
  if (endState === 'STARVED') {
    return 'STARVED';
  }
  return 'CASE';
}

/** Push a finding, skipping empty text. */
function add(chain: Finding[], finding: Finding): void {
  if (finding.text.length > 0) {
    chain.push(finding);
  }
}

/** Latest warning/failure event whose text matches any of the needles. */
function latestEvent(
  events: readonly SimEvent[],
  needles: readonly string[],
): SimEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.kind === 'milestone') {
      continue;
    }
    if (needles.some((n) => event.text.includes(n))) {
      return event;
    }
  }
  return null;
}

/** Build the STARVED chain: rations, calories, nutrients, dust, plant. */
function investigateStarved(s: SimState): { cause: string; chain: Finding[] } {
  const h = s.history;
  const chain: Finding[] = [];
  const deficit = longestStreak(h, (snap) => snap.kcalPerPersonSol < KCAL_DEFICIT);
  const firstLow = firstWhere(h, (snap) => snap.kcalPerPersonSol < KCAL_DEFICIT);
  const rationsGone = firstWhere(
    h,
    (snap) => snap.earthFoodFraction < 0.05 && snap.kcalPerPersonSol < KCAL_DEFICIT,
  );
  const nTrough = troughOf(h, (snap) => snap.nitrogenKg);
  const storm = peakOf(h, (snap) => snap.tau);
  const firstPop = h.length > 0 ? h[0].population : s.population;
  const popJump = firstWhere(h, (snap) => snap.population > firstPop);

  if (firstLow) {
    add(chain, {
      sol: firstLow.sol,
      kind: 'precipitating',
      text: `Calories fell to ${firstLow.kcalPerPersonSol.toFixed(0)} kcal/person/sol (need ${HUMAN_KCAL_PER_SOL.toFixed(0)})`,
    });
  }
  if (rationsGone && firstLow && rationsGone.sol >= firstLow.sol) {
    add(chain, {
      sol: rationsGone.sol,
      kind: 'contributing',
      text: `Earth rations stopped covering the gap (Earth-food fraction ${(rationsGone.earthFoodFraction * 100).toFixed(0)}%)`,
    });
  }
  if (deficit) {
    add(chain, {
      sol: deficit.start.sol,
      kind: 'contributing',
      text: `Caloric deficit held ${deficit.length} sols (${deficit.start.sol}–${deficit.end.sol})`,
    });
  }
  if (nTrough && nTrough.nitrogenKg < 20) {
    add(chain, {
      sol: nTrough.sol,
      kind: 'contributing',
      text: `Nitrogen pool bottomed at ${nTrough.nitrogenKg.toFixed(0)} kg with ${nTrough.compostKg.toFixed(0)} kg finished compost`,
    });
  }
  if (popJump && firstLow && popJump.sol <= firstLow.sol + 30) {
    const ghPer = popJump.population > 0 ? popJump.greenhouseM2 / popJump.population : 0;
    add(chain, {
      sol: popJump.sol,
      kind: 'contributing',
      text: `Crew rose to ${popJump.population} against ${popJump.greenhouseM2.toFixed(0)} m² of greenhouse (${ghPer.toFixed(0)} m²/person)`,
    });
  } else if (firstLow && firstLow.greenhouseM2 / Math.max(1, firstLow.population) < 80) {
    add(chain, {
      sol: firstLow.sol,
      kind: 'contributing',
      text: `Greenhouse plant was ${firstLow.greenhouseM2.toFixed(0)} m² for ${firstLow.population} crew — too little area to close the diet`,
    });
  }
  if (storm && storm.tau >= STORM_TAU) {
    add(chain, {
      sol: storm.sol,
      kind: 'contributing',
      text: `Dust peaked at τ ${storm.tau.toFixed(1)} — street-greenhouse light collapsed`,
    });
  }
  const diet = latestEvent(s.events, ['protein', 'variety', 'Caloric deficit']);
  if (diet) {
    add(chain, { sol: diet.sol, kind: 'contributing', text: diet.text.replace(/\.$/, '') });
  }

  add(chain, {
    sol: s.sol,
    kind: 'terminal',
    text: `STARVED after ${s.hungerSols.toFixed(0)} sols of nutritional deficit`,
  });

  const calorieLed = deficit !== null && deficit.length >= 20;
  const proteinLed = diet !== null && diet.text.includes('protein');
  const varietyLed = diet !== null && diet.text.includes('variety');
  let cause = `Sustained nutritional deficit — hungerSols passed 30 at sol ${s.sol}`;
  if (calorieLed) {
    cause = `Local production plus remaining rations could not cover ${HUMAN_KCAL_PER_SOL.toFixed(0)} kcal/person/sol for ${deficit.length} sols`;
  } else if (proteinLed) {
    cause = 'Calories existed but protein/N failed — the diet was energy without amino acids';
  } else if (varietyLed) {
    cause = 'Diet variety collapsed below three crops (scurvy-class risk) and the hunger clock ran out';
  }
  return { cause, chain };
}

/** Build the STRANDED chain: quota, peak fuel, ISRU stall, power, water. */
function investigateStranded(s: SimState): { cause: string; chain: Finding[] } {
  const departureSol = s.window * SOLS_PER_SYNODIC_WINDOW + DEPARTURE_OFFSET_SOLS;
  const h = untilSol(s.history, departureSol);
  const chain: Finding[] = [];
  const quotaT = s.params.methaloxPerShipT * s.params.returnShipsPerWindow;
  const atDepart = h.length > 0 ? h[h.length - 1] : null;
  const peak = peakOf(h, (snap) => snap.methaloxKg);

  // Idle from deltas so boil-off and a dead Sabatier look the same.
  const idlePred = (snap: SolSnapshot, index: number): boolean => {
    if (index === 0) {
      return false;
    }
    return snap.methaloxKg - h[index - 1].methaloxKg < ISRU_IDLE_KG;
  };
  const idleStreak = longestIndexedStreak(h, idlePred);
  const shed = longestStreak(h, (snap) => {
    if (snap.powerDemandKwe <= 0) {
      return false;
    }
    return snap.powerAvailKwe / snap.powerDemandKwe < POWER_SHED;
  });
  const storm = longestStreak(h, (snap) => snap.tau >= STORM_TAU);
  const dry = troughOf(h, (snap) => snap.waterKg);
  const missed = latestEvent(s.events, ['Departure window MISSED']);

  // A peak on the departure sol is the shortfall itself — don't list it twice.
  if (peak && peak.methaloxKg > 0 && peak.sol < departureSol - 5) {
    add(chain, {
      sol: peak.sol,
      kind: 'precipitating',
      text: `Methalox peaked at ${(peak.methaloxKg / 1000).toFixed(1)} t of the ${quotaT.toFixed(0)} t return quota`,
    });
  }
  if (idleStreak) {
    const rate = (idleStreak.end.methaloxKg - idleStreak.start.methaloxKg) / Math.max(1, idleStreak.length);
    add(chain, {
      sol: idleStreak.start.sol,
      kind: 'contributing',
      text: `ISRU idled ${idleStreak.length} sols (${(rate / 1000).toFixed(2)} t/sol) — tanks were not climbing`,
    });
  }
  if (shed) {
    const ratio = shed.start.powerDemandKwe > 0 ? shed.start.powerAvailKwe / shed.start.powerDemandKwe : 0;
    add(chain, {
      sol: shed.start.sol,
      kind: 'contributing',
      text: `Power sat at ${(ratio * 100).toFixed(0)}% of demand for ${shed.length} sols — ISRU is the first tier shed`,
    });
  }
  if (storm) {
    add(chain, {
      sol: storm.start.sol,
      kind: 'contributing',
      text: `Global dust storm τ ${storm.start.tau.toFixed(1)}–${peakOf(
        h.filter((x) => x.sol >= storm.start.sol && x.sol <= storm.end.sol),
        (x) => x.tau,
      )?.tau.toFixed(1) ?? storm.end.tau.toFixed(1)} for ${storm.length} sols`,
    });
  }
  if (dry && dry.waterKg < 8000) {
    add(chain, {
      sol: dry.sol,
      kind: 'contributing',
      text: `Water tank trough ${dry.waterKg.toFixed(0)} kg — electrolyzers starve before the Sabatier does`,
    });
  }
  if (missed) {
    add(chain, { sol: missed.sol, kind: 'contributing', text: missed.text.replace(/\.$/, '') });
  }

  const hadT = atDepart ? atDepart.methaloxKg / 1000 : s.inv.ch4Kg / 1000 + s.inv.loxKg / 1000;
  const shortT = Math.max(0, quotaT - hadT);
  add(chain, {
    sol: atDepart ? atDepart.sol : s.sol,
    kind: 'terminal',
    text: `Departure geometry closed ${shortT.toFixed(0)} t short of the ${quotaT.toFixed(0)} t quota (${hadT.toFixed(1)} t banked)`,
  });

  let cause = `The tanks held ${hadT.toFixed(0)} t at the departure sol against a ${quotaT.toFixed(0)} t quota`;
  const idleThroughStorm = storm !== null && idleStreak !== null && storm.length >= 20;
  if (idleThroughStorm) {
    cause = `A ${storm.length}-sol dust storm idled ISRU for ${idleStreak.length} sols and the tanks never recovered before the departure geometry closed`;
  } else if (shed && shed.length >= 20) {
    cause = `Power sat below demand for ${shed.length} sols — ISRU is the first tier shed, and the departure clock did not wait`;
  } else if (dry && dry.waterKg < 3000) {
    cause = 'The water reserve starved the electrolyzers, so the Sabatier had nothing to reduce';
  } else if (peak && peak.methaloxKg < quotaT * 1000 * 0.7) {
    cause = `ISRU never approached the return quota — peak bank ${(peak.methaloxKg / 1000).toFixed(0)} t of ${quotaT.toFixed(0)} t`;
  }
  return { cause, chain };
}

/**
 * Longest streak using an index-aware predicate (for delta checks that need
 * the previous snapshot). Same length rule as `longestStreak`.
 */
function longestIndexedStreak(
  history: readonly SolSnapshot[],
  pred: (snap: SolSnapshot, index: number) => boolean,
): Streak | null {
  let best: Streak | null = null;
  let runStart: SolSnapshot | null = null;
  let runEnd: SolSnapshot | null = null;
  const close = (): void => {
    if (runStart === null || runEnd === null) {
      return;
    }
    const length = runEnd.sol - runStart.sol + 1;
    if (length >= MIN_STREAK && (best === null || length > best.length)) {
      best = { start: runStart, end: runEnd, length };
    }
    runStart = null;
    runEnd = null;
  };
  for (let i = 0; i < history.length; i += 1) {
    if (pred(history[i], i)) {
      if (runStart === null) {
        runStart = history[i];
      }
      runEnd = history[i];
    } else {
      close();
    }
  }
  close();
  return best;
}

/** Build the BLACKOUT chain: storm, power floor, breathing gas, nuclear. */
function investigateBlackout(s: SimState): { cause: string; chain: Finding[] } {
  const h = s.history;
  const chain: Finding[] = [];
  const stormOnset = firstWhere(h, (snap) => snap.tau >= STORM_TAU);
  const stormPeak = peakOf(h, (snap) => snap.tau);
  const firstShed = firstWhere(h, (snap) => {
    if (snap.powerDemandKwe <= 0) {
      return false;
    }
    return snap.powerAvailKwe < snap.powerDemandKwe * POWER_SHED;
  });
  const dark = longestStreak(h, (snap) => {
    if (snap.powerDemandKwe <= 0) {
      return false;
    }
    return snap.powerAvailKwe < snap.powerDemandKwe * 0.5;
  });
  const o2Floor = troughOf(h, (snap) => snap.o2Kg);
  const breath = latestEvent(s.events, ['Breathing', 'life-support', 'Power below']);

  if (stormOnset) {
    add(chain, {
      sol: stormOnset.sol,
      kind: 'precipitating',
      text: `Storm onset at τ ${stormOnset.tau.toFixed(1)}`,
    });
  }
  if (stormPeak && stormPeak.tau >= STORM_TAU) {
    const clear = firstWhere(h, (snap) => snap.tau < STORM_TAU);
    const clearKwe = clear ? clear.powerAvailKwe : stormPeak.powerAvailKwe;
    const frac = clearKwe > 0 ? stormPeak.powerAvailKwe / clearKwe : 0;
    add(chain, {
      sol: stormPeak.sol,
      kind: 'contributing',
      text: `Dust peaked at τ ${stormPeak.tau.toFixed(1)} — solar at ${stormPeak.powerAvailKwe.toFixed(0)} kWe (${(frac * 100).toFixed(0)}% of a clear-sol floor)`,
    });
  }
  if (firstShed) {
    add(chain, {
      sol: firstShed.sol,
      kind: 'contributing',
      text: `Supply dropped below demand (${firstShed.powerAvailKwe.toFixed(0)} / ${firstShed.powerDemandKwe.toFixed(0)} kWe)`,
    });
  }
  if (dark) {
    add(chain, {
      sol: dark.start.sol,
      kind: 'contributing',
      text: `Grid held under half of demand for ${dark.length} sols`,
    });
  }
  if (s.structures.nuclear === 0) {
    add(chain, {
      sol: stormOnset ? stormOnset.sol : s.sol,
      kind: 'contributing',
      text: 'No fission on the pad — the city was a solar-only bet against a dust year',
    });
  } else {
    add(chain, {
      sol: s.sol,
      kind: 'contributing',
      text: `${s.structures.nuclear} fission block${s.structures.nuclear === 1 ? '' : 's'} could not hold life support through the storm`,
    });
  }
  if (o2Floor && o2Floor.o2Kg < 200) {
    add(chain, {
      sol: o2Floor.sol,
      kind: 'contributing',
      text: `Breathing-gas tank trough ${o2Floor.o2Kg.toFixed(0)} kg O2`,
    });
  }
  if (breath) {
    add(chain, { sol: breath.sol, kind: 'contributing', text: breath.text.replace(/\.$/, '') });
  }

  add(chain, {
    sol: s.sol,
    kind: 'terminal',
    text: `DUST YEAR BLACKOUT after ${s.blackoutSols} sols below life-support demand`,
  });

  const stormKilled =
    s.structures.nuclear === 0 &&
    stormOnset !== null &&
    stormOnset.sol < s.sol &&
    stormPeak !== null &&
    stormPeak.tau >= STORM_TAU;
  const cause = stormKilled
    ? 'Solar collapsed under the dust storm and there was no nuclear floor'
    : s.structures.nuclear === 0
      ? 'Solar-only power could not hold life support — there was no nuclear floor'
      : `Power stayed below life-support demand for ${s.blackoutSols} sols — the nuclear floor was not enough`;
  return { cause, chain };
}

/**
 * Deduplicate findings that landed on the same sol with near-identical text,
 * then sort chronologically (terminal always last on a tie).
 */
function finalize(chain: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  const unique: Finding[] = [];
  for (const finding of chain) {
    const key = `${finding.sol}|${finding.text}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(finding);
  }
  unique.sort((a, b) => {
    if (a.kind === 'terminal' && b.kind !== 'terminal') {
      return 1;
    }
    if (b.kind === 'terminal' && a.kind !== 'terminal') {
      return -1;
    }
    return a.sol - b.sol;
  });
  return unique.slice(0, 8);
}

/**
 * Investigate a lost run. Returns null while the city is operating or after
 * a win flag — those are not accidents.
 */
export function investigate(s: SimState): PostMortem | null {
  const lost =
    s.endState === 'STARVED' ||
    s.endState === 'STRANDED (NO METHALOX)' ||
    s.endState === 'DUST YEAR BLACKOUT';
  if (!lost) {
    return null;
  }
  const site = getSite(s.siteId);
  const body =
    s.endState === 'STARVED'
      ? investigateStarved(s)
      : s.endState === 'STRANDED (NO METHALOX)'
        ? investigateStranded(s)
        : investigateBlackout(s);
  return {
    caseId: `RT-${caseTag(s.endState)}-s${s.sol}`,
    siteName: site.name,
    endState: s.endState,
    probableCause: body.cause,
    chain: finalize(body.chain),
  };
}

/** Render a post-mortem as copyable markdown. */
export function formatPostMortem(report: PostMortem): string {
  const lines = [
    '# RED TONNES — ACCIDENT INVESTIGATION',
    '',
    `**${report.caseId}** · ${report.siteName} · ${report.endState}`,
    '',
    '## Probable cause',
    report.probableCause + '.',
    '',
    '## Sequence of events',
    ...report.chain.map((f) => `- Sol ${f.sol} — ${f.text}.`),
    '',
    '_Mars is still red. The ledgers were honest._',
  ];
  return lines.join('\n');
}
