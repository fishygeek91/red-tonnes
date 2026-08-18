/**
 * Zustand store: owns the SimState and the playback clock.
 * The UI only renders state and dispatches actions; every physics change
 * goes through the pure `step` function in lib/sim/step.ts.
 */

'use client';

import { create } from 'zustand';
import { SOLS_PER_SYNODIC_WINDOW } from '../lib/constants';
import { dailyChallenge } from '../lib/share/daily';
import type { GhostRun } from '../lib/share/ghost';
import { ghostFromReplay } from '../lib/share/ghost';
import type { RunLog } from '../lib/share/recording';
import { appendRunAction, emptyRunLog, replayRun } from '../lib/share/recording';
import type { InspectId } from '../lib/sim/inspect';
import type { Manifest, SimState } from '../lib/sim/state';
import { createInitialState } from '../lib/sim/state';
import type { SimActions } from '../lib/sim/step';
import { step } from '../lib/sim/step';

/** Playback speeds in sols advanced per real second. */
export const SPEEDS: readonly number[] = [1, 5, 20, 60];

/** Store shape. */
interface SimStore {
  /** The authoritative simulation state. */
  sim: SimState;
  /** Whether the clock is running. */
  playing: boolean;
  /** Sols per real second while playing. */
  speed: number;
  /** Scrubber position (sol index into history); null = live. */
  scrubSol: number | null;
  /** True until the player dismisses the intro / starts a custom game. */
  showSetup: boolean;
  /** Sources & assumptions drawer visibility. */
  showSources: boolean;
  /** Planet-overlay visibility (teaching layer). */
  showOverlay: boolean;
  /** Fractional sol accumulator for smooth playback. */
  accumulator: number;
  /** Sol-stamped action log for the current run (permalink source of truth). */
  runLog: RunLog;
  /** True while showing the "you loaded someone's run" notice. */
  sharedNotice: boolean;
  /** Currently inspected structure in the 3D city; null = nothing selected. */
  inspectId: InspectId | null;
  /** Trends drawer (history charts) visibility. */
  showTrends: boolean;
  /** Frozen snapshot of a shared run being raced; null = no ghost. */
  ghost: GhostRun | null;

  /** Start a new game from the setup screen. */
  newGame: (seed: number, siteId: string, templateId: string) => void;
  /** Start today's daily challenge (same setup for everyone, per UTC day). */
  startDaily: () => void;
  /** Load a shared run from a decoded permalink: replay it, pause at its end. */
  loadSharedRun: (log: RunLog) => void;
  /** Restart the shared run's seed from sol 0 and race its ghost. */
  startRace: () => void;
  /** Drop the ghost (end the race overlay). */
  clearGhost: () => void;
  /** Dismiss the shared-run notice. */
  setSharedNotice: (v: boolean) => void;
  /** Toggle play/pause. */
  togglePlay: () => void;
  /** Set playback speed (sols/sec). */
  setSpeed: (speed: number) => void;
  /** Advance the sim by whole sols with optional actions. */
  advance: (dtSols: number, actions?: SimActions) => void;
  /** Clock tick from the animation loop; dt in real seconds. */
  tick: (dtSeconds: number) => void;
  /** Jump forward to the next window arrival. */
  jumpToNextWindow: () => void;
  /** Scrub the history view; null returns to live. */
  setScrubSol: (sol: number | null) => void;
  /** Replace the crop mix. */
  setCropMix: (mix: Record<string, number>) => void;
  /** Queue a manifest for a future window. */
  setManifest: (window: number, manifest: Manifest) => void;
  /** Update tunable parameters (sliders). */
  setParams: (params: Partial<SimState['params']>) => void;
  /** UI toggles. */
  setShowSetup: (v: boolean) => void;
  setShowSources: (v: boolean) => void;
  setShowOverlay: (v: boolean) => void;
  /** Select (or clear) the inspected structure in the 3D city. */
  setInspect: (id: InspectId | null) => void;
  /** Toggle the Trends drawer. */
  setShowTrends: (v: boolean) => void;
}

/** Default demo seed: chosen so a global dust storm hits mid–window 0 (onset ~sol 420) while the nuclear floor keeps the city alive — the demo tells the whole story by itself. */
const DEMO_SEED = 7;

export const useSimStore = create<SimStore>((set, get) => ({
  sim: createInitialState({ seed: DEMO_SEED, siteId: 'arcadia', templateId: 'balanced' }),
  playing: true, // the first load plays itself (demo requirement)
  speed: 20,
  scrubSol: null,
  showSetup: false,
  showSources: false,
  showOverlay: false,
  accumulator: 0,
  runLog: emptyRunLog(DEMO_SEED, 'arcadia', 'balanced'),
  sharedNotice: false,
  inspectId: null,
  showTrends: false,
  ghost: null,

  newGame: (seed, siteId, templateId) => {
    set({
      sim: createInitialState({ seed, siteId, templateId }),
      playing: true,
      scrubSol: null,
      showSetup: false,
      accumulator: 0,
      runLog: emptyRunLog(seed, siteId, templateId),
      sharedNotice: false,
      inspectId: null,
      ghost: null,
    });
  },

  startDaily: () => {
    const daily = dailyChallenge(new Date());
    set({
      sim: createInitialState({
        seed: daily.seed,
        siteId: daily.siteId,
        templateId: daily.templateId,
      }),
      playing: true,
      scrubSol: null,
      showSetup: false,
      accumulator: 0,
      runLog: emptyRunLog(daily.seed, daily.siteId, daily.templateId, daily.dateKey),
      sharedNotice: false,
      inspectId: null,
      ghost: null,
    });
  },

  loadSharedRun: (log) => {
    // Replay reconstructs the exact state (and scrubbable history) of the
    // shared run; pause at its end so the visitor can inspect, then take over.
    // The replayed run is also frozen as a ghost so the visitor can race it.
    const replayed = replayRun(log);
    set({
      sim: replayed,
      playing: false,
      scrubSol: null,
      showSetup: false,
      accumulator: 0,
      runLog: log,
      sharedNotice: true,
      inspectId: null,
      ghost: ghostFromReplay(log, replayed),
    });
  },

  startRace: () => {
    const st = get();
    if (st.ghost === null) {
      return;
    }
    // Same seed, site and template as the shared run => same storms and the
    // same windows. The racer starts from sol 0 with a fresh action log
    // (daily tag preserved so a daily race still scores as a daily).
    const log = st.runLog;
    set({
      sim: createInitialState({ seed: log.seed, siteId: log.siteId, templateId: log.templateId }),
      playing: true,
      scrubSol: null,
      showSetup: false,
      accumulator: 0,
      runLog: emptyRunLog(log.seed, log.siteId, log.templateId, log.daily),
      sharedNotice: false,
      inspectId: null,
    });
  },

  clearGhost: () => set({ ghost: null }),

  setSharedNotice: (v) => set({ sharedNotice: v }),

  togglePlay: () => set((st) => ({ playing: !st.playing })),

  setSpeed: (speed) => set({ speed }),

  advance: (dtSols, actions) => {
    const st = get();
    if (dtSols <= 0) {
      return;
    }
    set({ sim: step(st.sim, dtSols, actions ?? {}), scrubSol: null });
  },

  tick: (dtSeconds) => {
    const st = get();
    if (!st.playing || st.sim.endState === 'STARVED' || st.sim.endState === 'STRANDED (NO METHALOX)' || st.sim.endState === 'DUST YEAR BLACKOUT') {
      return;
    }
    const acc = st.accumulator + dtSeconds * st.speed;
    const whole = Math.floor(acc);
    if (whole >= 1) {
      // Cap per-frame work so a background tab does not freeze on resume.
      const capped = Math.min(whole, 120);
      set({ sim: step(st.sim, capped, {}), accumulator: acc - whole, scrubSol: null });
    } else {
      set({ accumulator: acc });
    }
  },

  jumpToNextWindow: () => {
    const st = get();
    const next = (st.sim.window + 1) * SOLS_PER_SYNODIC_WINDOW;
    const dt = Math.max(1, next - st.sim.sol);
    set({ sim: step(st.sim, dt, {}), scrubSol: null });
  },

  // Scrubbing into history pauses the clock — otherwise the next tick would
  // wipe the scrub position and yank the player back to live within 50 ms.
  setScrubSol: (sol) =>
    set((st) => ({ scrubSol: sol, playing: sol === null ? st.playing : false })),

  setCropMix: (mix) => {
    const st = get();
    set({
      sim: step(st.sim, 0, { cropMix: mix }),
      runLog: appendRunAction(st.runLog, { sol: st.sim.sol, cropMix: mix }),
    });
  },

  setManifest: (window, manifest) => {
    const st = get();
    set({
      sim: step(st.sim, 0, { manifests: { [window]: manifest } }),
      runLog: appendRunAction(st.runLog, { sol: st.sim.sol, manifests: { [window]: manifest } }),
    });
  },

  setParams: (params) => {
    const st = get();
    set({
      sim: step(st.sim, 0, { params }),
      runLog: appendRunAction(st.runLog, { sol: st.sim.sol, params }),
    });
  },

  setShowSetup: (v) => set({ showSetup: v }),
  setShowSources: (v) => set({ showSources: v }),
  setShowOverlay: (v) => set({ showOverlay: v }),
  setInspect: (id) => set({ inspectId: id }),
  setShowTrends: (v) => set({ showTrends: v }),
}));
