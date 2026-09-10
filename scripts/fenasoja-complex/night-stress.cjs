const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs");
const path = require("node:path");
const output = process.env.QA_OUTPUT || "docs/screenshots/fenasoja-hero";
let browser;
(async () => {
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    (process.env.QA_URL || "http://127.0.0.1:4194") +
      "/__dev/commercial-map-rendering",
    { waitUntil: "domcontentloaded", timeout: 120000 },
  );
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.territoryQa === "ready",
    null,
    { timeout: 90000 },
  );
  await page.waitForFunction(
    () => JSON.parse(document.querySelector("canvas")?.dataset.commercialMapRenderHealth || "{}").status === "ready",
    null,
    { timeout: 90000 },
  );
  await page.addStyleTag({
    content: ".commercial-map-district-qa {visibility:hidden}",
  });
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("territory-qa", {
        detail: { target: [15.3, 0.67, 15.1], position: [11.5, 1, 15.1] },
      }),
    ),
  );
  const snapshots = [];
  for (let transition = 0; transition < 14; transition++) {
    const night = transition % 2 === 0;
    await page.evaluate(
      async (active) =>
        (
          await import("/src/features/commercial-map/state/useCommercialMapStore.ts")
        ).useCommercialMapStore
          .getState()
          .setNightModeActive(active),
      night,
    );
    await page.waitForTimeout(2600);
    snapshots.push(
      await page.evaluate(
        ({ transition, night }) => {
          const canvas = document.querySelector("canvas");
          return {
            transition,
            night,
            health: JSON.parse(canvas.dataset.commercialMapRenderHealth),
            runtime: window.__commercialMapRuntimeDiagnostics.capture(),
            canvases: document.querySelectorAll("canvas").length,
          };
        },
        { transition, night },
      ),
    );
  }
  const buckets = [false, true]
    .map((night) => {
      // First pair warms shader variants; compare only equal quality/path/dimensions.
      const states = snapshots.filter(
        (s) => s.transition >= 2 && s.night === night,
      );
      const groups = {};
      for (const s of states) {
        const r = s.runtime;
        const key = [
          night,
          s.health.path,
          r.qualityTier,
          r.dpr,
          r.width,
          r.height,
        ].join(":");
        (groups[key] ||= []).push(r);
      }
      return Object.entries(groups).map(([key, rows]) => ({
        key,
        samples: rows.length,
        growth: Object.fromEntries(
          ["geometries", "textures", "programs"].map((k) => [
            k,
            rows.at(-1)[k] - rows[0][k],
          ]),
        ),
      }));
    })
    .flat();
  const passed =
    !errors.length &&
    snapshots.every(
      (s, i) =>
        s.canvases === 1 &&
        s.health.status === "ready" &&
        !s.health.contextLosses &&
        !s.health.lastErrorCode &&
        (!i ||
          s.health.presentedFrames > snapshots[i - 1].health.presentedFrames),
    ) &&
    buckets.every((b) => Object.values(b.growth).every((n) => n === 0)) &&
    buckets.some((b) => b.samples >= 3);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "night-stress.json"),
    JSON.stringify(
      {
        status: passed ? "passed" : "failed",
        transitions: snapshots.length,
        errors,
        buckets,
        snapshots,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ passed, transitions: snapshots.length, errors, buckets }),
  );
  if (!passed) process.exitCode = 1;
  await browser.close();
})().catch(async (e) => {
  console.error(e);
  await browser?.close();
  process.exitCode = 1;
});
