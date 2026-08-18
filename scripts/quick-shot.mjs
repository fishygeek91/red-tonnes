/**
 * Dev-only helper: capture one screenshot shortly after load to inspect the
 * opening Starship landing burns. Run: node scripts/quick-shot.mjs [url] [delayMs] [out]
 */

import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3000/";
const delayMs = Number(process.argv[3] ?? 800);
const out = process.argv[4] ?? "/tmp/quick-shot.png";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(delayMs);
  await page.screenshot({ path: out });
  console.log(`Saved ${out}`);
} finally {
  await browser.close();
}
