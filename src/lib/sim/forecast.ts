/**
 * Flight Director forecast: run the REAL engine silently into the future.
 *
 * Because `step` is a pure function and every stochastic draw (storm years,
 * hardware failures) is derived deterministically from the seed, projecting
 * the city is not an estimate — it is exactly what will happen if the player
 * changes nothing. The forecast forks the live state, steps it one synodic
 * window ahead, and reads the verdicts straight out of the projected history
 * and event log. One engine, zero drift.
 */

import { DEPARTURE_OFFSET_SOLS, HUMAN_KCAL_PER_SOL, SOLS_PER_SYNODIC_WINDOW } from "../constants";
import type { EndState, SimState, SolSnapshot } from "./state";
import { step, sunlightFraction } from "./step";

/** Severity of one advisory line. */
export type ForecastTone = "good" | "warn" | "bad";

/** One advisory the Flight Director reads out, in priority order. */
export interface ForecastFinding {
  /** Color / severity of the line. */
  readonly tone: ForecastTone;
  /** Human-readable advisory text. */
  readonly text: string;
  /** Sol the finding refers to; null for horizon-wide statements. */
  readonly sol: number | null;
}

/** Overall departure verdict for the next burn inside the horizon. */
export type DepartureVerdict =
  | "burn" // the projected city makes the burn
  | "miss" // the burn sol arrives with the tanks short
  | "lost" // a terminal lose state lands before the burn
  | "beyond"; // the next burn sol is past the forecast horizon

/** The full projection returned by {@link runForecast}. */
export interface Forecast {
  /** Sol the forecast was taken from. */
  readonly fromSol: number;
  /** Sols simulated ahead. */
  readonly horizonSols: number;
  /** Projected per-sol snapshots strictly after `fromSol`. */
  readonly snapshots: readonly SolSnapshot[];
  /** Sol of the next departure burn attempt (engine schedule: w×759+600). */
  readonly nextDepartureSol: number;
  /** Methalox required at the burn, kg (quota × return ships). */
  readonly quotaKg: number;
  /** First projected sol where banked methalox reaches the quota; null if never. */
  readonly fuelReadySol: number | null;
  /** Methalox banked on the eve of the next burn, kg (0 if the burn is beyond the horizon). */
  readonly fuelAtBurnKg: number;
  /** Departure verdict for the next burn. */
  readonly verdict: DepartureVerdict;
  /** Terminal state the projection ends in ('' if the city survives the horizon). */
  readonly projectedEnd: EndState;
  /** Sol the projected terminal state lands; null while surviving. */
  readonly projectedEndSol: number | null;
  /** First projected sol of caloric deficit (< 90% of need); null if fed throughout. */
  readonly hungerOnsetSol: number | null;
  /** Peak dust optical depth inside the horizon and the sol it lands. */
  readonly peakTau: number;
  readonly peakTauSol: number;
  /** Ordered advisory lines for the HUD. */
  readonly findings: readonly ForecastFinding[];
}

/** Default forecast horizon: one full synodic window (759 sols). */
export const FORECAST_HORIZON_SOLS = SOLS_PER_SYNODIC_WINDOW;

/**
 * Adaptive horizon: at least one window, and always far enough to see past
 * the next departure burn (plus a 60-sol tail), capped at two windows so the
 * projection stays cheap.
 * @param sol - Current sol.
 * @returns Sols to simulate ahead.
 */
export function forecastHorizonSols(sol: number): number {
  const toBurn = nextDepartureSol(sol) - sol + 60;
  return Math.min(2 * SOLS_PER_SYNODIC_WINDOW, Math.max(FORECAST_HORIZON_SOLS, toBurn));
}

/**
 * Sol of the next departure burn attempt strictly after `sol`.
 * The engine attempts departures at `window × 759 + 600` for windows >= 1.
 * @param sol - Current sol.
 * @returns The next burn sol on the engine's schedule.
 */
export function nextDepartureSol(sol: number): number {
  const w = Math.max(
    1,
    Math.ceil((sol + 1 - DEPARTURE_OFFSET_SOLS) / SOLS_PER_SYNODIC_WINDOW),
  );
  return w * SOLS_PER_SYNODIC_WINDOW + DEPARTURE_OFFSET_SOLS;
}

/** Terminal lose states that freeze the clock (mirrors the engine's check). */
function isTerminalLoss(end: EndState): boolean {
  return end === "STARVED" || end === "STRANDED (NO METHALOX)" || end === "DUST YEAR BLACKOUT";
}

/**
 * Find the failure event that actually names `end`, not merely the first
 * failure-kind line in the log.
 * @param events - Future events from the projection.
 * @param end - Terminal lose state to match.
 */
function terminalLossEvent(
  events: readonly { readonly sol: number; readonly kind: string; readonly text: string }[],
  end: EndState,
): { readonly sol: number } | undefined {
  if (end === "STARVED") {
    return events.find((e) => e.text.startsWith("STARVED"));
  }
  if (end === "DUST YEAR BLACKOUT") {
    return events.find((e) => e.text.startsWith("DUST YEAR BLACKOUT"));
  }
  if (end === "STRANDED (NO METHALOX)") {
    return events.find((e) => e.text.startsWith("Departure window MISSED"));
  }
  return undefined;
}

/**
 * Project the city `horizonSols` ahead with no player actions.
 * Pure: the input state is never mutated (step clones internally).
 * @param state - The live simulation state to fork.
 * @param horizonSols - Sols to simulate ahead (default one synodic window).
 * @returns The full forecast with findings ready for the HUD.
 */
export function runForecast(
  state: SimState,
  horizonSols: number = FORECAST_HORIZON_SOLS,
): Forecast {
  const fromSol = state.sol;
  const burnSol = nextDepartureSol(fromSol);
  const quotaKg = state.params.methaloxPerShipT * 1000 * state.params.returnShipsPerWindow;

  // A city already lost has no future to project.
  if (isTerminalLoss(state.endState)) {
    return {
      fromSol,
      horizonSols: 0,
      snapshots: [],
      nextDepartureSol: burnSol,
      quotaKg,
      fuelReadySol: null,
      fuelAtBurnKg: 0,
      verdict: "lost",
      projectedEnd: state.endState,
      projectedEndSol: fromSol,
      hungerOnsetSol: null,
      peakTau: 0,
      peakTauSol: fromSol,
      findings: [],
    };
  }

  // ---- run the real engine forward, silently --------------------------------
  const horizon = Math.max(1, Math.floor(horizonSols));
  const projected = step(state, horizon, {});
  const snapshots = projected.history.slice(state.history.length);

  // Future events only: the clone shares event object references with the
  // live state, so identity filtering is exact even after log capping.
  const existing = new Set(state.events);
  const futureEvents = projected.events.filter((e) => !existing.has(e));

  // ---- milestone extraction ---------------------------------------------------
  let fuelReadySol: number | null = null;
  for (const snap of snapshots) {
    if (quotaKg > 0 && snap.methaloxKg >= quotaKg) {
      fuelReadySol = snap.sol;
      break;
    }
  }

  let hungerOnsetSol: number | null = null;
  for (const snap of snapshots) {
    if (snap.kcalPerPersonSol < HUMAN_KCAL_PER_SOL * 0.9) {
      hungerOnsetSol = snap.sol;
      break;
    }
  }

  let peakTau = 0;
  let peakTauSol = fromSol;
  for (const snap of snapshots) {
    if (snap.tau > peakTau) {
      peakTau = snap.tau;
      peakTauSol = snap.sol;
    }
  }

  const projectedEnd = projected.endState;
  const burnEvent = futureEvents.find((e) => e.text.startsWith("Departure burn"));
  const missEvent = futureEvents.find((e) => e.text.startsWith("Departure window MISSED"));
  const lossEvent = terminalLossEvent(futureEvents, projectedEnd);
  const projectedEndSol = isTerminalLoss(projectedEnd) ? (lossEvent?.sol ?? projected.sol) : null;

  let verdict: DepartureVerdict;
  if (projectedEndSol !== null && projectedEndSol < burnSol && missEvent === undefined) {
    verdict = "lost";
  } else if (burnEvent !== undefined && burnEvent.sol <= burnSol) {
    verdict = "burn";
  } else if (missEvent !== undefined) {
    verdict = "miss";
  } else if (burnSol > fromSol + horizon) {
    verdict = "beyond";
  } else {
    // The burn sol is inside the horizon but no event fired (e.g. the clock
    // froze on a loss right at the burn). Treat as missed.
    verdict = "miss";
  }

  // Fuel banked on the eve of the burn (last snapshot strictly before it).
  // Zero when the burn is past the horizon — do not report horizon-end
  // inventory as if it were the burn-eve figure.
  const burnInHorizon = burnSol <= fromSol + horizon;
  let fuelAtBurnKg = 0;
  if (burnInHorizon) {
    for (const snap of snapshots) {
      if (snap.sol >= burnSol) {
        break;
      }
      fuelAtBurnKg = snap.methaloxKg;
    }
  }

  // ---- advisory lines, priority ordered ---------------------------------------
  const findings: ForecastFinding[] = [];

  if (verdict === "burn") {
    findings.push({
      tone: "good",
      sol: burnEvent?.sol ?? burnSol,
      text: `Departure burn MADE on sol ${burnEvent?.sol ?? burnSol} with ${((fuelAtBurnKg - quotaKg) / 1000).toFixed(0)} t of margin.`,
    });
  } else if (verdict === "miss") {
    findings.push({
      tone: "bad",
      sol: burnSol,
      text: `Departure burn MISSED on sol ${burnSol}: projected ${(fuelAtBurnKg / 1000).toFixed(0)} t of ${(quotaKg / 1000).toFixed(0)} t. Add Sabatier/power or cut demand now.`,
    });
  }
  if (projectedEndSol !== null) {
    findings.push({
      tone: "bad",
      sol: projectedEndSol,
      text: `Projected ${projectedEnd} on sol ${projectedEndSol} — ${projectedEndSol - fromSol} sols from now.`,
    });
  }

  if (fuelReadySol !== null) {
    const margin = burnSol - fuelReadySol;
    findings.push({
      tone: margin >= 0 ? "good" : "warn",
      sol: fuelReadySol,
      text:
        margin >= 0
          ? `Methalox reaches the ${(quotaKg / 1000).toFixed(0)} t quota ~sol ${fuelReadySol} — ${margin} sols before the burn.`
          : `Quota fuel arrives ~sol ${fuelReadySol}, ${-margin} sols AFTER the sol ${burnSol} burn.`,
    });
  } else if (quotaKg > 0 && verdict !== "lost") {
    findings.push({
      tone: "warn",
      sol: null,
      text: `At current rates the ${(quotaKg / 1000).toFixed(0)} t quota is not reached inside ${horizon} sols.`,
    });
  }

  if (hungerOnsetSol !== null && !isTerminalLoss(state.endState)) {
    findings.push({
      tone: hungerOnsetSol - fromSol < 120 ? "bad" : "warn",
      sol: hungerOnsetSol,
      text: `Caloric deficit begins ~sol ${hungerOnsetSol} (${hungerOnsetSol - fromSol} sols out). Queue rations or plant more area.`,
    });
  } else if (snapshots.length > 0) {
    findings.push({
      tone: "good",
      sol: null,
      text: `Kitchen holds: calories stay above need through sol ${fromSol + horizon}.`,
    });
  }

  if (peakTau > 2) {
    const sunPct = Math.round(sunlightFraction(peakTau) * 100);
    findings.push({
      tone: "warn",
      sol: peakTauSol,
      text: `Dust storm on the forecast: τ peaks ${peakTau.toFixed(1)} ~sol ${peakTauSol}; surface sunlight falls to ${sunPct}%.`,
    });
  }

  return {
    fromSol,
    horizonSols: horizon,
    snapshots,
    nextDepartureSol: burnSol,
    quotaKg,
    fuelReadySol,
    fuelAtBurnKg,
    verdict,
    projectedEnd,
    projectedEndSol,
    hungerOnsetSol,
    peakTau,
    peakTauSol,
    findings,
  };
}

/** One line of a plan delta (the consequence of the player's last order). */
export interface ForecastDeltaLine {
  /** Color / severity: good = the future improved, bad = it worsened. */
  readonly tone: ForecastTone;
  /** Human-readable consequence text. */
  readonly text: string;
}

/** The measurable difference between two forecasts. */
export interface ForecastDelta {
  /** True when at least one milestone moved. */
  readonly changed: boolean;
  /** Consequence lines, most important first. */
  readonly lines: readonly ForecastDeltaLine[];
}

/** Short label for a departure verdict, used in delta lines. */
function verdictLabel(v: DepartureVerdict): string {
  if (v === "burn") {
    return "burn MADE";
  }
  if (v === "miss") {
    return "burn MISSED";
  }
  if (v === "lost") {
    return "city LOST";
  }
  return "beyond horizon";
}

/** Rank a verdict for better/worse comparison (higher is better). */
function verdictRank(v: DepartureVerdict): number {
  if (v === "burn") {
    return 3;
  }
  if (v === "beyond") {
    return 2;
  }
  if (v === "miss") {
    return 1;
  }
  return 0;
}

/**
 * Diff two forecasts of the same run: what did the player's last order buy?
 * Both forecasts should be taken close together in time (the caller guards
 * that), so every difference is attributable to the order, not to the clock.
 * @param before - The forecast in force before the order.
 * @param after - The forecast recomputed after the order.
 * @returns Consequence lines, most important first.
 */
export function diffForecasts(before: Forecast, after: Forecast): ForecastDelta {
  const lines: ForecastDeltaLine[] = [];

  // Departure verdict flips are the headline.
  if (before.verdict !== after.verdict) {
    lines.push({
      tone: verdictRank(after.verdict) >= verdictRank(before.verdict) ? "good" : "bad",
      text: `Departure verdict: ${verdictLabel(before.verdict)} → ${verdictLabel(after.verdict)}.`,
    });
  }

  // Fuel-ready sol movement (or appearing / vanishing from the horizon).
  if (before.fuelReadySol !== null && after.fuelReadySol !== null) {
    const moved = after.fuelReadySol - before.fuelReadySol;
    if (moved !== 0) {
      lines.push({
        tone: moved < 0 ? "good" : "bad",
        text: `Fuel-ready moved s${before.fuelReadySol} → s${after.fuelReadySol} (${Math.abs(moved)} sols ${moved < 0 ? "earlier" : "later"}).`,
      });
    }
  } else if (before.fuelReadySol === null && after.fuelReadySol !== null) {
    lines.push({ tone: "good", text: `Quota fuel now reached (~s${after.fuelReadySol}).` });
  } else if (before.fuelReadySol !== null && after.fuelReadySol === null) {
    lines.push({ tone: "bad", text: "Quota fuel no longer reached inside the horizon." });
  }

  // Fuel banked on the eve of the burn (only when both forecasts can see it).
  if (before.verdict !== "beyond" && after.verdict !== "beyond") {
    const fuelMovedT = (after.fuelAtBurnKg - before.fuelAtBurnKg) / 1000;
    if (Math.abs(fuelMovedT) >= 1) {
      lines.push({
        tone: fuelMovedT > 0 ? "good" : "bad",
        text: `Fuel at the burn ${fuelMovedT > 0 ? "+" : "−"}${Math.abs(fuelMovedT).toFixed(0)} t (${(before.fuelAtBurnKg / 1000).toFixed(0)} → ${(after.fuelAtBurnKg / 1000).toFixed(0)} t).`,
      });
    }
  }

  // Hunger onset movement: later (or gone) is good.
  if (before.hungerOnsetSol !== null && after.hungerOnsetSol !== null) {
    const moved = after.hungerOnsetSol - before.hungerOnsetSol;
    if (moved !== 0) {
      lines.push({
        tone: moved > 0 ? "good" : "bad",
        text: `Caloric deficit moved s${before.hungerOnsetSol} → s${after.hungerOnsetSol} (${Math.abs(moved)} sols ${moved > 0 ? "later" : "sooner"}).`,
      });
    }
  } else if (before.hungerOnsetSol !== null && after.hungerOnsetSol === null) {
    lines.push({ tone: "good", text: "Caloric deficit cleared from the forecast." });
  } else if (before.hungerOnsetSol === null && after.hungerOnsetSol !== null) {
    lines.push({
      tone: "bad",
      text: `Caloric deficit now begins ~s${after.hungerOnsetSol}.`,
    });
  }

  return { changed: lines.length > 0, lines };
}
