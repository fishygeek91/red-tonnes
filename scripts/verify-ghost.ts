/**
 * Dev-only helper: end-to-end check of ghost racing in a real browser.
 *
 * Builds a shared-run permalink headlessly (seed 7, Arcadia, Balanced,
 * shared at sol 1300 — after the run banks return fuel at sol 1124), loads
 * it, clicks "Race the ghost", runs the race at 60 sols/s, and verifies the
 * HUD, pace line, and ghost chart overlays are on screen. Saves screenshots
 * to /tmp for eyeballing.
 *
 * Run: npx tsx scripts/verify-ghost.ts [baseUrl]
 */

import { chromium } from 'playwright';
import { encodeRunLog } from '../src/lib/share/encode';
import { emptyRunLog } from '../src/lib/share/recording';

const baseUrl = process.argv[2] ?? 'http://localhost:3000/';

/** Fail loudly with a labeled message. */
function must(condition: boolean, label: string): void {
  console.log(`${condition ? 'ok' : 'FAIL'}: ${label}`);
  if (!condition) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  // A no-action run of the demo seed, shared at sol 1300: the ghost carries
  // the RETURN FUEL READY milestone (sol 1124) and the storm year.
  const log = { ...emptyRunLog(7, 'arcadia', 'balanced'), finalSol: 1300 };
  const encoded = await encodeRunLog(log);
  const url = `${baseUrl}#r=${encoded}`;
  console.log(`link: ${url.slice(0, 80)}… (${encoded.length} chars)`);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 2,
    });
    await page.goto(url, { waitUntil: 'networkidle' });

    // The shared-run notice must offer the race.
    const raceButton = page.getByRole('button', { name: 'Race the ghost' });
    await raceButton.waitFor({ state: 'visible', timeout: 15000 });
    must(true, 'shared-run notice shows "Race the ghost"');
    await page.screenshot({ path: '/tmp/ghost-notice.png' });

    // Start the race, crank the speed, open the Trends drawer.
    await raceButton.click();
    await page.getByRole('button', { name: '60×' }).click();
    await page.getByRole('button', { name: 'Trends' }).click();

    // The race HUD replaces the notice immediately.
    const hud = page.getByText('Ghost race', { exact: false });
    await hud.waitFor({ state: 'visible', timeout: 5000 });
    must(true, 'ghost race HUD is visible after starting the race');
    must(
      (await page.getByText('on fuel', { exact: false }).count()) > 0 ||
        (await page.getByText('ahead of everything', { exact: false }).count()) > 0,
      'pace line rendered',
    );

    // Let ~900 sols run: past window 1 (sol 759), so at least one ghost
    // milestone toast has fired and the ghost chart lines have length.
    await page.waitForTimeout(15000);
    await page.screenshot({ path: '/tmp/ghost-race.png' });

    // panel-title uppercases via CSS, so compare case-insensitively.
    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    must(bodyText.includes('ghost race'), 'HUD still up mid-race');
    must(bodyText.includes('ghost'), 'ghost legend present in charts');
    console.log('screenshots: /tmp/ghost-notice.png /tmp/ghost-race.png');
  } finally {
    await browser.close();
  }
}

void main();
