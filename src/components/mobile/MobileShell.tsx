'use client';

/**
 * Phone/tablet shell: the 3D city fills the viewport; Plan / Status / Time
 * rise as sheets. No Mars globe — one WebGL canvas only.
 */

import { BuildPanel } from '../BuildPanel';
import { EndBanner } from '../EndBanner';
import { GhostHud } from '../GhostHud';
import { Ledgers } from '../Ledgers';
import { SharedRunNotice } from '../SharedRunNotice';
import { TimeScrubber } from '../TimeScrubber';
import { TrendsPanel } from '../TrendsPanel';
import { useSimStore } from '../../store/useSimStore';
import { CompactTopBar } from './CompactTopBar';
import { MissionDock } from './MissionDock';
import { ObjectiveChip } from './ObjectiveChip';
import { Sheet } from './Sheet';

/**
 * City-first layout used below the `lg` breakpoint.
 * @param props.city - Client-only CityScene (dynamically imported by the page).
 */
export function MobileShell(props: { city: React.ReactNode }): React.ReactElement {
  const mobileSheet = useSimStore((s) => s.mobileSheet);
  const setMobileSheet = useSimStore((s) => s.setMobileSheet);

  return (
    <div className="h-full flex flex-col min-h-0 relative">
      <CompactTopBar />
      <div className="flex-1 relative min-h-0 min-w-0 flex flex-col">
        {props.city}
        <ObjectiveChip />
        <GhostHud />
        <SharedRunNotice />
        <EndBanner />
        <Sheet
          open={mobileSheet === 'plan'}
          title="Plan next window"
          onClose={() => setMobileSheet(null)}
          scrollBody={false}
        >
          <BuildPanel touch className="h-full min-h-0 flex-1 border-0" />
        </Sheet>
        <Sheet
          open={mobileSheet === 'status'}
          title="Live status"
          onClose={() => setMobileSheet(null)}
          scrollBody={false}
        >
          <Ledgers className="w-full h-full min-h-0 flex-1 border-0" />
        </Sheet>
        <Sheet open={mobileSheet === 'time'} title="Time & trends" onClose={() => setMobileSheet(null)}>
          <div className="flex flex-col gap-3 p-3">
            <TimeScrubber variant="panel" />
            <TrendsPanel force stacked />
          </div>
        </Sheet>
      </div>
      <MissionDock />
    </div>
  );
}
