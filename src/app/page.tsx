'use client';

/**
 * RED TONNES — one route, two shells.
 * Wide: globe + controls | city | ledgers.
 * Narrow: city-first sheets (Plan / Status / Time).
 */

import dynamic from 'next/dynamic';
import { BuildPanel } from '../components/BuildPanel';
import { EndBanner } from '../components/EndBanner';
import { ExplainableProvider } from '../components/Explainable';
import { GhostHud } from '../components/GhostHud';
import { Ledgers } from '../components/Ledgers';
import { Briefing } from '../components/mobile/Briefing';
import { MobileShell } from '../components/mobile/MobileShell';
import { PlanetOverlay } from '../components/PlanetOverlay';
import { SetupModal } from '../components/SetupModal';
import { SharedRunLoader, SharedRunNotice } from '../components/SharedRunNotice';
import { SimAudio } from '../components/SimAudio';
import { SimClock } from '../components/SimClock';
import { SourcesDrawer } from '../components/SourcesDrawer';
import { TimeScrubber } from '../components/TimeScrubber';
import { TopBar } from '../components/TopBar';
import { TrendsPanel } from '../components/TrendsPanel';
import { useNarrowViewport } from '../hooks/useNarrowViewport';

const MarsGlobe = dynamic(() => import('../components/three/MarsGlobe').then((m) => m.MarsGlobe), {
  ssr: false,
  loading: () => (
    <div className="h-[240px] shrink-0 flex items-center justify-center text-[10px] text-[var(--dim)]">
      spinning up Mars…
    </div>
  ),
});
const CityScene = dynamic(() => import('../components/three/CityScene').then((m) => m.CityScene), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--dim)]">landing the city…</div>
  ),
});

/**
 * Desktop three-column mission control. Globe stays mounted only here.
 * @param props.city - Client-only CityScene.
 */
function DesktopShell(props: { city: React.ReactNode }): React.ReactElement {
  return (
    <>
      <TopBar />
      <main className="flex-1 flex min-h-0 relative">
        <div className="w-[300px] shrink-0 flex flex-col panel border-r border-[var(--line)] relative">
          <MarsGlobe />
          <PlanetOverlay />
          <BuildPanel />
        </div>
        <div className="flex-1 relative min-w-0 min-h-0 flex flex-col">
          {props.city}
          <EndBanner />
          <SharedRunNotice />
          <GhostHud />
        </div>
        <Ledgers />
      </main>
      <TrendsPanel />
      <TimeScrubber />
    </>
  );
}

/** The one screen. */
export default function Page(): React.ReactElement {
  const narrow = useNarrowViewport();
  const city = <CityScene />;
  return (
    <ExplainableProvider>
      <div className="h-full flex flex-col relative">
        <SimClock />
        <SimAudio />
        <SharedRunLoader />
        {narrow ? <MobileShell city={city} /> : <DesktopShell city={city} />}
        <Briefing />
        <SourcesDrawer />
        <SetupModal />
      </div>
    </ExplainableProvider>
  );
}
