'use client';

/**
 * Shared Brief / Share / Sources / New-game actions used by the desktop
 * top bar and the phone overflow menu.
 */

import { useState } from 'react';
import { buildRunPermalink, copyText } from '../lib/share/permalink';
import { missionBrief } from '../lib/sim/brief';
import { useSimStore } from '../store/useSimStore';

/** Clipboard / download helpers plus the two modal toggles. */
export interface MissionActions {
  readonly shareCopied: boolean;
  readonly copyShareLink: () => Promise<void>;
  readonly copyBrief: () => void;
  readonly openSources: () => void;
  readonly openSetup: () => void;
}

/**
 * Wire mission-chrome actions to the sim store.
 * @returns Stable-enough callbacks for the current run.
 */
export function useMissionActions(): MissionActions {
  const sim = useSimStore((s) => s.sim);
  const runLog = useSimStore((s) => s.runLog);
  const setShowSources = useSimStore((s) => s.setShowSources);
  const setShowSetup = useSimStore((s) => s.setShowSetup);
  const [shareCopied, setShareCopied] = useState(false);

  const copyShareLink = async (): Promise<void> => {
    const url = await buildRunPermalink(runLog, sim.sol);
    if (await copyText(url)) {
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1500);
    }
  };

  const copyBrief = (): void => {
    const text = missionBrief(sim);
    void navigator.clipboard.writeText(text).catch(() => {
      const blob = new Blob([text], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `red-tonnes-brief-sol${sim.sol}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };

  return {
    shareCopied,
    copyShareLink,
    copyBrief,
    openSources: () => setShowSources(true),
    openSetup: () => setShowSetup(true),
  };
}
