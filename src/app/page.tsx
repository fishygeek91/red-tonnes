'use client';

/**
 * RED TONNES — single screen. Left: globe + controls. Center: the city.
 * Right: live ledgers. Top: the numbers that decide who goes home.
 * Bottom: the clock.
 */

import dynamic from 'next/dynamic';
import { BuildPanel } from '../components/BuildPanel';
import { EndBanner } from '../components/EndBanner';
import { GhostHud } from '../components/GhostHud';
import { Ledgers } from '../components/Ledgers';
import { PlanetOverlay } from '../components/PlanetOverlay';
import { SetupModal } from '../components/SetupModal';
import { SharedRunNotice } from '../components/SharedRunNotice';
import { SimAudio } from '../components/SimAudio';
import { SimClock } from '../components/SimClock';
import { SourcesDrawer } from '../components/SourcesDrawer';
import { TimeScrubber } from '../components/TimeScrubber';
import { TopBar } from '../components/TopBar';
import { TrendsPanel } from '../components/TrendsPanel';

// Three.js components are client-only; skip SSR to avoid WebGL on the server.
const MarsGlobe = dynamic(() => import('../components/three/MarsGlobe').then((m) => m.MarsGlobe), {
  ssr: false,
  loading: () => <div className="h-[240px] shrink-0 flex items-center justify-center text-[10px] text-[var(--dim)]">spinning up Mars…</div>,
});
const CityScene = dynamic(() => import('../components/three/CityScene').then((m) => m.CityScene), {
  ssr: false,
  loading: () => <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--dim)]">landing the city…</div>,
});

/** The one screen. */
export default function Page(): React.ReactElement {
  return (
    <div className="h-full flex flex-col relative">
      <SimClock />
      <SimAudio />
      <TopBar />
      <main className="flex-1 flex min-h-0 relative">
        <div className="w-[300px] shrink-0 flex flex-col panel border-r border-[var(--line)] relative">
          <MarsGlobe />
          <PlanetOverlay />
          <BuildPanel />
        </div>
        <CityScene />
        <Ledgers />
        <EndBanner />
        <SharedRunNotice />
        <GhostHud />
      </main>
      <TrendsPanel />
      <TimeScrubber />
      <SourcesDrawer />
      <SetupModal />
    </div>
  );
}
