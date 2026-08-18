'use client';

/**
 * Bottom time controls: play/pause, speed, jump-to-window, and a scrubber
 * over the recorded per-sol history with a sparkline of tau (dust) and
 * methalox so storms and fuel are legible at a glance.
 */

import { useMemo } from 'react';
import { SOLS_PER_SYNODIC_WINDOW } from '../lib/constants';
import { SPEEDS, useSimStore } from '../store/useSimStore';

/** Build an SVG polyline path from history values. */
function sparkPath(values: number[], w: number, h: number, max: number): string {
  if (values.length < 2 || max <= 0) {
    return '';
  }
  const step = w / (values.length - 1);
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - (Math.min(v, max) / max) * h).toFixed(1)}`)
    .join(' ');
}

/** The scrubber bar. */
export function TimeScrubber(): React.ReactElement {
  const sim = useSimStore((s) => s.sim);
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const scrubSol = useSimStore((s) => s.scrubSol);
  const togglePlay = useSimStore((s) => s.togglePlay);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const setScrubSol = useSimStore((s) => s.setScrubSol);
  const jumpToNextWindow = useSimStore((s) => s.jumpToNextWindow);
  const showTrends = useSimStore((s) => s.showTrends);
  const setShowTrends = useSimStore((s) => s.setShowTrends);

  const h = sim.history;
  const { tauPath, fuelPath, maxFuel } = useMemo(() => {
    const taus = h.map((x) => x.tau);
    const fuels = h.map((x) => x.methaloxKg / 1000);
    const mf = Math.max(1, ...fuels);
    return {
      tauPath: sparkPath(taus, 600, 26, 6),
      fuelPath: sparkPath(fuels, 600, 26, mf),
      maxFuel: mf,
    };
  }, [h]);

  const viewSol = scrubSol ?? sim.sol;
  const viewSnap = scrubSol !== null ? h.find((x) => x.sol === scrubSol) : undefined;

  return (
    <footer className="panel border-t border-[var(--line)] px-3 py-2 flex items-center gap-3 select-none">
      <button
        onClick={togglePlay}
        className="w-16 py-1.5 border border-[var(--rust)] text-[var(--rust-hot)] hover:bg-[var(--rust)] hover:text-black text-xs tracking-widest uppercase"
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <div className="flex gap-1">
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            onClick={() => setSpeed(sp)}
            className={`px-2 py-1 text-[10px] border num ${
              speed === sp
                ? 'border-[var(--rust-hot)] text-[var(--rust-hot)]'
                : 'border-[var(--line)] text-[var(--dim)] hover:text-[var(--text)]'
            }`}
            title={`${sp} sols per second`}
          >
            {sp}×
          </button>
        ))}
      </div>
      <button
        onClick={jumpToNextWindow}
        className="px-2 py-1.5 text-[10px] border border-[var(--line)] text-[var(--dim)] hover:text-[var(--text)] hover:border-[var(--rust)] uppercase tracking-widest"
        title="Simulate forward to the next synodic window arrival"
      >
        ⇥ Next window
      </button>
      <button
        onClick={() => setShowTrends(!showTrends)}
        className={`px-2 py-1.5 text-[10px] border uppercase tracking-widest ${
          showTrends
            ? 'border-[var(--rust-hot)] text-[var(--rust-hot)]'
            : 'border-[var(--line)] text-[var(--dim)] hover:text-[var(--text)] hover:border-[var(--rust)]'
        }`}
        title="Toggle the history charts drawer (power, fuel, calories, dust, loop closure)"
      >
        Trends
      </button>

      <div className="flex-1 relative h-10">
        <svg viewBox="0 0 600 26" preserveAspectRatio="none" className="absolute inset-x-0 top-0 w-full h-[26px] opacity-90">
          {/* window boundary ticks */}
          {Array.from({ length: Math.floor(sim.sol / SOLS_PER_SYNODIC_WINDOW) + 1 }, (_, i) => {
            const x = sim.sol > 0 ? ((i * SOLS_PER_SYNODIC_WINDOW) / Math.max(1, sim.sol)) * 600 : 0;
            return <line key={i} x1={x} y1={0} x2={x} y2={26} stroke="var(--line)" strokeWidth={1} />;
          })}
          <path d={tauPath} fill="none" stroke="var(--warn)" strokeWidth={1.2} />
          <path d={fuelPath} fill="none" stroke="var(--ice)" strokeWidth={1.2} />
        </svg>
        <input
          type="range"
          min={0}
          max={Math.max(1, sim.sol)}
          value={viewSol}
          onChange={(e) => {
            const v = Number(e.target.value);
            setScrubSol(v >= sim.sol ? null : v);
          }}
          className="absolute inset-x-0 bottom-0 w-full h-3"
          title="Scrub history (release at the right edge to return to live)"
        />
      </div>

      <div className="num text-[10px] text-[var(--dim)] w-52 text-right leading-tight">
        {viewSnap ? (
          <>
            <div>
              sol {viewSnap.sol} · τ {viewSnap.tau.toFixed(1)} · {(viewSnap.methaloxKg / 1000).toFixed(0)} t fuel
            </div>
            <div className="text-[var(--warn)]">viewing history — drag right for live</div>
          </>
        ) : (
          <>
            <div>
              sol {sim.sol} · <span className="text-[var(--warn)]">τ dust</span> ·{' '}
              <span className="text-[var(--ice)]">fuel (max {maxFuel.toFixed(0)} t)</span>
            </div>
            <div>{playing ? `running ${speed} sols/s` : 'paused'}</div>
          </>
        )}
      </div>
    </footer>
  );
}
