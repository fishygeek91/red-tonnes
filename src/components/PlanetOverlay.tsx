'use client';

/**
 * The honest planet overlay: interactive terraforming levers that fail on
 * purpose, because the published CO2 inventory says they must
 * (Jakosky & Edwards 2018). Teaching layer — never a win condition.
 */

import { useState } from 'react';
import {
  OVERLAY_ALL_ACCESSIBLE_MBAR,
  OVERLAY_EARTHLIKE_MBAR,
  OVERLAY_POLAR_CAP_RELEASE_MBAR,
  OVERLAY_PRESENT_MBAR,
  OVERLAY_STRIP_MBAR_PER_1000Y,
} from '../lib/constants';
import { useSimStore } from '../store/useSimStore';

/** The overlay card, shown over the globe when toggled. */
export function PlanetOverlay(): React.ReactElement | null {
  const show = useSimStore((s) => s.showOverlay);
  const [releaseCaps, setReleaseCaps] = useState(false);
  const [dustCaps, setDustCaps] = useState(false);
  const [mirrors, setMirrors] = useState(false);
  const [sgg, setSgg] = useState(false);

  if (!show) {
    return null;
  }
  // Sum the best case of every lever. Dusting caps / mirrors / SGGs release the
  // same limited inventory faster — they do not create CO2 that is not there.
  let mbar = OVERLAY_PRESENT_MBAR;
  if (releaseCaps) {
    mbar = OVERLAY_POLAR_CAP_RELEASE_MBAR;
  }
  if (releaseCaps && (dustCaps || mirrors || sgg)) {
    mbar = OVERLAY_ALL_ACCESSIBLE_MBAR;
  }
  const pct = (mbar / OVERLAY_EARTHLIKE_MBAR) * 100;

  return (
    <div className="absolute top-2 left-2 right-2 z-20 panel border border-[var(--line)] p-3 text-[10px] space-y-2">
      <div className="flex justify-between items-center">
        <span className="panel-title">Planet overlay — could we terraform?</span>
        <span className="num text-[var(--warn)]">{mbar.toFixed(1)} mbar</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <label className="flex gap-1.5 items-center cursor-pointer">
          <input type="checkbox" checked={releaseCaps} onChange={(e) => setReleaseCaps(e.target.checked)} />
          <span className="text-[var(--dim)]">Release polar CO2</span>
        </label>
        <label className="flex gap-1.5 items-center cursor-pointer">
          <input type="checkbox" checked={dustCaps} onChange={(e) => setDustCaps(e.target.checked)} />
          <span className="text-[var(--dim)]">Dust the caps</span>
        </label>
        <label className="flex gap-1.5 items-center cursor-pointer">
          <input type="checkbox" checked={mirrors} onChange={(e) => setMirrors(e.target.checked)} />
          <span className="text-[var(--dim)]">Orbital mirrors</span>
        </label>
        <label className="flex gap-1.5 items-center cursor-pointer">
          <input type="checkbox" checked={sgg} onChange={(e) => setSgg(e.target.checked)} />
          <span className="text-[var(--dim)]">Super-greenhouse gases</span>
        </label>
      </div>
      <div className="h-2 bg-[var(--panel-2)] relative">
        <div className="h-full bg-[var(--warn)]" style={{ width: `${Math.max(0.5, pct)}%` }} />
        <div className="absolute right-0 top-0 h-full w-px bg-[var(--green)]" title="Earth sea level, 1013 mbar" />
      </div>
      <div className="text-[var(--dim)] leading-snug">
        Best case with every lever: <span className="num text-[var(--warn)]">{mbar.toFixed(0)} mbar</span> —{' '}
        <span className="num">{pct.toFixed(1)}%</span> of Earth sea level, still far below the 62 mbar Armstrong limit.
        Accessible CO2 tops out near {OVERLAY_ALL_ACCESSIBLE_MBAR} mbar (Jakosky & Edwards 2018 / NASA summary), and
        solar wind strips ~{OVERLAY_STRIP_MBAR_PER_1000Y} mbar per millennium (MAVEN-scale). The line where humans walk
        outside without a suit is unreachable in this model — which is why the city para-terraforms instead.
      </div>
    </div>
  );
}
