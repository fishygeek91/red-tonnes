'use client';

/**
 * Procedural Mars bed. No samples: filtered brown noise for the thin wind,
 * a pair of detuned oscillators for the ISRU plant, a faint life-support
 * tone, and one-shot rumbles on landings and departure burns.
 *
 * AudioContext is created on the Sound button (a user gesture). Parameters
 * follow the city under the playhead, including the scrubber.
 */

import { useEffect, useRef } from 'react';
import { audioParamsFromState } from '../lib/audio/params';
import { useSimStore } from '../store/useSimStore';

/** Nodes that live for the life of an enabled bed. */
interface Bed {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly windGain: GainNode;
  readonly windFilter: BiquadFilterNode;
  readonly humGain: GainNode;
  readonly humA: OscillatorNode;
  readonly humB: OscillatorNode;
  readonly lifeGain: GainNode;
  readonly lifeOsc: OscillatorNode;
}

/** Build looping brown noise into a buffer source. */
function brownSource(ctx: AudioContext): AudioBufferSourceNode {
  const length = Math.max(1, Math.floor(ctx.sampleRate * 2));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.start();
  return src;
}

/** Construct the looping bed. Caller must close() the context to release it. */
function createBed(): Bed {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);

  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 600;
  windFilter.Q.value = 0.9;
  const windGain = ctx.createGain();
  windGain.gain.value = 0;
  brownSource(ctx).connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(master);

  const humGain = ctx.createGain();
  humGain.gain.value = 0;
  const humA = ctx.createOscillator();
  const humB = ctx.createOscillator();
  humA.type = 'sine';
  humB.type = 'triangle';
  humA.frequency.value = 47;
  humB.frequency.value = 94.3;
  humA.start();
  humB.start();
  humA.connect(humGain);
  humB.connect(humGain);
  humGain.connect(master);

  const lifeGain = ctx.createGain();
  lifeGain.gain.value = 0;
  const lifeOsc = ctx.createOscillator();
  lifeOsc.type = 'sine';
  lifeOsc.frequency.value = 312;
  lifeOsc.start();
  lifeOsc.connect(lifeGain);
  lifeGain.connect(master);

  return { ctx, master, windGain, windFilter, humGain, humA, humB, lifeGain, lifeOsc };
}

/** Exponential-ramp a gain or frequency over `seconds`. */
function ramp(param: AudioParam, value: number, ctx: AudioContext, seconds: number): void {
  const v = Math.max(0.0001, value);
  param.cancelScheduledValues(ctx.currentTime);
  param.setValueAtTime(Math.max(0.0001, param.value), ctx.currentTime);
  param.exponentialRampToValueAtTime(v, ctx.currentTime + seconds);
}

/**
 * One-shot rumble: filtered noise + a short osc sweep.
 * `rise` true = departure (pitch up), false = landing (pitch down).
 */
function rumble(ctx: AudioContext, master: GainNode, rise: boolean): void {
  const now = ctx.currentTime;
  const dur = 1.6;
  const noise = brownSource(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = rise ? 180 : 140;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(master);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(rise ? 55 : 90, now);
  osc.frequency.exponentialRampToValueAtTime(rise ? 140 : 38, now + dur);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.exponentialRampToValueAtTime(0.18, now + 0.05);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(oscGain);
  oscGain.connect(master);
  osc.start(now);
  osc.stop(now + dur);
  window.setTimeout(() => {
    noise.stop();
    noise.disconnect();
    filter.disconnect();
    gain.disconnect();
    oscGain.disconnect();
  }, (dur + 0.2) * 1000);
}

/** The invisible audio driver. */
export function SimAudio(): null {
  const sim = useSimStore((s) => s.sim);
  const scrubSol = useSimStore((s) => s.scrubSol);
  const audioEnabled = useSimStore((s) => s.audioEnabled);
  const bedRef = useRef<Bed | null>(null);
  const lastCueSol = useRef(0);

  // Create / tear down the bed when the player toggles Sound.
  useEffect(() => {
    if (!audioEnabled) {
      const bed = bedRef.current;
      bedRef.current = null;
      if (bed) {
        void bed.ctx.close();
      }
      return;
    }
    const bed = createBed();
    bedRef.current = bed;
    // Don't replay historical landings when the bed is first armed.
    lastCueSol.current = useSimStore.getState().sim.sol;
    void bed.ctx.resume();
    return () => {
      if (bedRef.current === bed) {
        bedRef.current = null;
      }
      void bed.ctx.close();
    };
  }, [audioEnabled]);

  // Follow the playhead.
  useEffect(() => {
    const bed = bedRef.current;
    if (bed === null) {
      return;
    }
    const p = audioParamsFromState(sim, scrubSol);
    ramp(bed.windGain.gain, p.windGain, bed.ctx, 0.25);
    ramp(bed.windFilter.frequency, p.windCutoffHz, bed.ctx, 0.4);
    ramp(bed.humGain.gain, Math.max(0.0001, p.humGain), bed.ctx, 0.3);
    ramp(bed.humA.frequency, p.humHz, bed.ctx, 0.4);
    ramp(bed.humB.frequency, p.humHz * 2.01, bed.ctx, 0.4);
    ramp(bed.lifeGain.gain, Math.max(0.0001, p.lifeGain), bed.ctx, 0.3);
  }, [sim, scrubSol]);

  // One-shots: landing arrivals and departure burns. At 60 sols/s we only
  // fire the most recent cue so the bed is not a drum fill.
  useEffect(() => {
    const bed = bedRef.current;
    if (bed === null) {
      return;
    }
    const fresh = sim.events.filter((e) => e.sol > lastCueSol.current);
    if (fresh.length === 0) {
      return;
    }
    lastCueSol.current = fresh[fresh.length - 1].sol;
    let land = false;
    let depart = false;
    for (const event of fresh) {
      if (event.text.includes('ships down') || event.text.includes('Starships down')) {
        land = true;
      }
      if (event.text.includes('Departure burn')) {
        depart = true;
      }
    }
    if (depart) {
      rumble(bed.ctx, bed.master, true);
    } else if (land) {
      rumble(bed.ctx, bed.master, false);
    }
  }, [sim.events, sim.sol]);

  return null;
}
