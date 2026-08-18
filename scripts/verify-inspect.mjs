/**
 * Dev-only helper: verify the inspect-card, Trends drawer, and scrub-replay
 * features in a real browser. Loads the page, lets the demo run, opens the
 * Trends drawer, clicks around the 3D city until an inspection card appears,
 * then scrubs the timeline and screenshots each state.
 * Run: node scripts/verify-inspect.mjs [url]
 */

import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3000/";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[console error] ${msg.text()}`);
    }
  });
  await page.goto(url, { waitUntil: "networkidle" });
  // Let the demo advance so history/charts have data (20 sols/s x 6 s).
  await page.waitForTimeout(6000);

  // 1) Open the Trends drawer.
  await page.getByRole("button", { name: "Trends" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "/tmp/verify-trends.png" });
  console.log("Saved /tmp/verify-trends.png");

  // 2) Click around the city until an inspection card shows up.
  const canvas = page.locator("main canvas").last();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("city canvas not found");
  }
  const tries = [
    [0.5, 0.6], [0.45, 0.55], [0.55, 0.55], [0.4, 0.6], [0.6, 0.6],
    [0.5, 0.5], [0.35, 0.55], [0.65, 0.55], [0.5, 0.7], [0.42, 0.48],
  ];
  let cardShown = false;
  for (const [fx, fy] of tries) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(250);
    if (await page.getByText("built", { exact: false }).first().isVisible().catch(() => false)) {
      cardShown = true;
      break;
    }
  }
  console.log(`inspect card shown: ${cardShown}`);
  await page.screenshot({ path: "/tmp/verify-inspect.png" });
  console.log("Saved /tmp/verify-inspect.png");

  // 3) Click ~40% into a Trends chart and confirm the history view engages
  //    (this exercises the drawer's click-to-scrub path end to end).
  const chart = page.locator("svg.cursor-crosshair").first();
  const chartBox = await chart.boundingBox();
  if (!chartBox) {
    throw new Error("trends chart not found");
  }
  await page.mouse.click(chartBox.x + chartBox.width * 0.4, chartBox.y + chartBox.height * 0.5);
  await page.waitForTimeout(600);
  const historyBadge = await page
    .getByText("viewing history", { exact: false })
    .isVisible()
    .catch(() => false);
  console.log(`history view engaged: ${historyBadge}`);
  await page.screenshot({ path: "/tmp/verify-scrub.png" });
  console.log("Saved /tmp/verify-scrub.png");
} finally {
  await browser.close();
}
