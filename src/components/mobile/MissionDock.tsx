'use client';

/**
 * Persistent city-first dock: play/pause plus the three sheets.
 * Tap an open sheet's button again to put the city full-screen.
 */

import type { MobileSheetId } from '../../store/useSimStore';
import { useSimStore } from '../../store/useSimStore';

/** One dock control. */
function DockButton(props: {
  label: string;
  active: boolean;
  onClick: () => void;
  accent?: boolean;
}): React.ReactElement {
  const color = props.active
    ? 'text-[var(--rust-hot)] border-[var(--rust-hot)]'
    : props.accent
      ? 'text-[var(--rust-hot)] border-[var(--rust)]'
      : 'text-[var(--dim)] border-[var(--line)]';
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`flex-1 min-h-11 border text-[10px] uppercase tracking-widest ${color}`}
    >
      {props.label}
    </button>
  );
}

/**
 * Bottom dock. Safe-area padded so it clears the home indicator.
 */
export function MissionDock(): React.ReactElement {
  const playing = useSimStore((s) => s.playing);
  const togglePlay = useSimStore((s) => s.togglePlay);
  const mobileSheet = useSimStore((s) => s.mobileSheet);
  const setMobileSheet = useSimStore((s) => s.setMobileSheet);

  /**
   * Toggle a sheet; tapping the active id closes it.
   * @param id - Sheet to open or close.
   */
  const toggleSheet = (id: MobileSheetId): void => {
    setMobileSheet(mobileSheet === id ? null : id);
  };

  return (
    <nav className="shrink-0 panel border-t border-[var(--line)] px-2 pt-2 safe-pad-bottom select-none">
      <div className="flex gap-1.5 pb-2">
        <DockButton label={playing ? 'Pause' : 'Play'} active={false} accent onClick={togglePlay} />
        <DockButton label="Plan" active={mobileSheet === 'plan'} onClick={() => toggleSheet('plan')} />
        <DockButton label="Status" active={mobileSheet === 'status'} onClick={() => toggleSheet('status')} />
        <DockButton label="Time" active={mobileSheet === 'time'} onClick={() => toggleSheet('time')} />
      </div>
    </nav>
  );
}
