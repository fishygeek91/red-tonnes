'use client';

/**
 * New-game setup: pick a site, a first-window manifest template, and a seed.
 * Deterministic: the same three choices always produce the same history.
 */

import { useState } from 'react';
import { dailyChallenge } from '../lib/share/daily';
import { MANIFEST_TEMPLATES } from '../lib/sim/state';
import { SITES, getSite } from '../lib/sites';
import { useSimStore } from '../store/useSimStore';

/** The modal. */
export function SetupModal(): React.ReactElement | null {
  const show = useSimStore((s) => s.showSetup);
  const setShow = useSimStore((s) => s.setShowSetup);
  const newGame = useSimStore((s) => s.newGame);
  const startDaily = useSimStore((s) => s.startDaily);
  const [siteId, setSiteId] = useState('arcadia');
  const [templateId, setTemplateId] = useState('balanced');
  const [seed, setSeed] = useState(7);

  if (!show) {
    return null;
  }
  // Today's challenge: same seed, site and manifest for every player (UTC day).
  const daily = dailyChallenge(new Date());
  const dailySite = getSite(daily.siteId);
  const dailyTemplate =
    MANIFEST_TEMPLATES.find((t) => t.id === daily.templateId) ?? MANIFEST_TEMPLATES[0];
  return (
    <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center" onClick={() => setShow(false)}>
      <div className="w-[560px] panel border border-[var(--rust)] p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm tracking-[0.25em] text-[var(--rust-hot)] mb-4">NEW CITY</h2>

        <h3 className="panel-title mb-1">Daily challenge</h3>
        <button
          onClick={() => startDaily()}
          className="w-full text-left p-2 border border-[var(--green)] hover:bg-[var(--green)]/10 text-[11px] mb-4"
          title="Everyone gets the same seed, site and manifest today. Share your scorecard."
        >
          <div className="flex justify-between">
            <span className="text-[var(--green)]">Daily #{daily.dayNumber} — {daily.dateKey}</span>
            <span className="num text-[var(--dim)]">
              {dailySite.name} · {dailyTemplate.name}
            </span>
          </div>
          <div className="text-[var(--dim)] text-[10px]">
            One shared setup per day. Same storms for every player — compare scorecards.
          </div>
        </button>

        <h3 className="panel-title mb-1">Site</h3>
        <div className="grid grid-cols-1 gap-1 mb-4">
          {SITES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSiteId(s.id)}
              className={`text-left p-2 border text-[11px] ${
                siteId === s.id ? 'border-[var(--rust-hot)]' : 'border-[var(--line)] hover:border-[var(--dim)]'
              }`}
            >
              <div className="flex justify-between">
                <span className="text-[var(--text)]">{s.name}</span>
                <span className="num text-[var(--dim)]">
                  {s.latitudeDeg.toFixed(0)}° · ice {s.iceDepthM} m · dust ×{s.dustFactor}
                </span>
              </div>
              <div className="text-[var(--dim)] text-[10px]">{s.blurb}</div>
            </button>
          ))}
        </div>

        <h3 className="panel-title mb-1">First cargo manifest</h3>
        <div className="grid grid-cols-3 gap-1 mb-4">
          {MANIFEST_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTemplateId(t.id)}
              className={`text-left p-2 border text-[11px] ${
                templateId === t.id ? 'border-[var(--rust-hot)]' : 'border-[var(--line)] hover:border-[var(--dim)]'
              }`}
            >
              <div className="text-[var(--text)]">{t.name}</div>
              <div className="text-[var(--dim)] text-[10px]">{t.description}</div>
            </button>
          ))}
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1">
            <h3 className="panel-title mb-1">Seed (deterministic: same seed, same storms)</h3>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Math.floor(Number(e.target.value) || 0))}
              className="w-full bg-[var(--panel-2)] border border-[var(--line)] px-2 py-1.5 num text-sm"
            />
          </div>
          <button
            onClick={() => newGame(seed, siteId, templateId)}
            className="px-6 py-2 border border-[var(--rust)] text-[var(--rust-hot)] hover:bg-[var(--rust)] hover:text-black tracking-[0.2em] uppercase text-xs"
          >
            Land
          </button>
        </div>
      </div>
    </div>
  );
}
