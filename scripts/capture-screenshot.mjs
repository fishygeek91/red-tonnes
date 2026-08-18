/**
 * One-off capture script: opens the live RED TONNES demo in headless
 * Chromium, waits for the seed-7 global dust storm (sol ~420, τ spike),
 * and saves a README screenshot to docs/screenshot.png.
 *
 * Run: node scripts/capture-screenshot.mjs [url]
 */

import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] ?? "https://fishygeek91.github.io/red-tonnes/";
const outPath = "docs/screenshot.png";

/** Extract the current sol and dust optical depth from the top bar text. */
function parseStats(bodyText) {
  const solMatch = bodyText.match(/sol (\d+)/);
  const tauMatch = bodyText.match(/τ (\d+(?:\.\d+)?)/);
  return {
    sol: solMatch === null ? null : Number(solMatch[1]),
    tau: tauMatch === null ? null : Number(tauMatch[1]),
  };
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
  });

  console.log(`Loading ${url}`);
  await page.goto(url, { waitUntil: "networkidle" });

  // The demo plays itself at ~20 sols/second; the storm lands around sol 420.
  // Poll once per second: grab a clear-sky shot around sol 300, then a storm
  // shot once τ spikes, bailing out if sol 600 passes without one.
  await mkdir("docs", { recursive: true });
  const deadline = Date.now() + 90_000;
  let clearSaved = false;
  let stormSaved = false;
  while (Date.now() < deadline && !stormSaved) {
    const bodyText = await page.evaluate(() => document.body.innerText);
    const { sol, tau } = parseStats(bodyText);
    if (sol !== null) {
      console.log(`sol ${sol}, τ ${tau ?? "?"}`);
      if (!clearSaved && sol >= 300 && tau !== null && tau < 1) {
        await page.screenshot({ path: "docs/screenshot-clear.png" });
        clearSaved = true;
        console.log("Saved docs/screenshot-clear.png");
      }
      if (sol >= 400 && tau !== null && tau >= 2.5) {
        await page.screenshot({ path: outPath });
        stormSaved = true;
        console.log(`Saved ${outPath}`);
      }
      if (sol >= 600) {
        console.warn("Passed sol 600 without seeing τ >= 2.5; capturing anyway.");
        break;
      }
    }
    await page.waitForTimeout(1000);
  }
  if (!stormSaved) {
    console.warn("Storm condition not met before deadline; capturing current state.");
    await page.screenshot({ path: outPath });
  }
} finally {
  await browser.close();
}
