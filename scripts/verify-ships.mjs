/**
 * Dev-only verification: exercise the Starship traffic animations by jumping
 * to the next synodic window (arrival burns) and then playing forward to the
 * departure sol (launch burn). Saves three screenshots to /tmp.
 *
 * Run: node scripts/verify-ships.mjs [url]
 */

import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3002/";

/** Extract the current sol from the top bar text. */
function parseSol(bodyText) {
  const m = bodyText.match(/sol (\d+)/);
  return m === null ? null : Number(m[1]);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 800 },
    deviceScaleFactor: 1,
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // Keyboard-drive it (the dev-tools badge covers the bottom-left buttons):
  // Space pauses, N jumps to the next window arrival exactly.
  await page.keyboard.press(" ");
  await page.keyboard.press("n");
  await page.waitForTimeout(400);
  const solA = parseSol(await page.evaluate(() => document.body.innerText));
  await page.screenshot({ path: "/tmp/ships-arrival-high.png" });
  console.log(`Saved /tmp/ships-arrival-high.png at sol ${solA}`);

  // Resume at 20x for a beat: the arrivals should be mid-descent.
  await page.keyboard.press(" ");
  await page.waitForTimeout(420);
  const solB = parseSol(await page.evaluate(() => document.body.innerText));
  await page.screenshot({ path: "/tmp/ships-arrival-low.png" });
  console.log(`Saved /tmp/ships-arrival-low.png at sol ${solB}`);
} finally {
  await browser.close();
}
