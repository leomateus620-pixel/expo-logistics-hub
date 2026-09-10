const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs");
const path = require("node:path");
const out = "docs/screenshots/fenasoja-complex";
const phase = process.argv[2] || "after";
const mobile = process.argv.includes("--mobile");
const poses = {
  attachment1: {
    target: [15.8, 0, 14],
    position: [15.79, 12, 14],
    up: [0, 0, -1],
  },
  attachment2: { target: [15.8, 0, 14], position: [15.8, 12, 14.01] },
  frontage: { target: [15.8, 0.8, 15.7], position: [11.1, 1.65, 15.7] },
  beforeView4: { target: [16, 0, 14], position: [19.5, 12, 14] },
  beforeView5: { target: [16, 0, 14], position: [12, 12, 14] },
  beforeView6: { target: [15.8, 0.6, 15.7], position: [11.3, 2.9, 12.7] },
  rear: { target: [15.8, 0.6, 15.5], position: [20, 3.5, 16.5] },
  rightRoom: { target: [15.8, 0.6, 15.7], position: [14.5, 2.8, 19.5] },
  roof: { target: [15.8, 0.6, 15.7], position: [18, 5.5, 18.5] },
  stageFront: { target: [15.6, 0.6, 12.9], position: [10, 2.1, 12.9] },
  maximum: { target: [0, 0, 0], position: [100, 140, 160] },
  referenceFront: { target: [15.3, 0.67, 15.1], position: [11.5, 1.0, 15.1] },
  monument: { target: [14.43, 0.31, 15.65], position: [12.9, 0.7, 15.85] },
};
let browser;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    (process.env.QA_URL || "http://127.0.0.1:4194") +
      "/__dev/commercial-map-rendering" +
      (phase === "neutral" ? "?complexNeutral&complexDebug" : ""),
    { waitUntil: "domcontentloaded", timeout: 120000 },
  );
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.territoryQa === "ready",
    null,
    { timeout: 120000 },
  );
  await page.waitForFunction(
    () =>
      JSON.parse(
        document.querySelector("canvas")?.dataset.commercialMapRenderHealth ||
          "{}",
      ).status === "ready",
    null,
    { timeout: 120000 },
  );
  await page.addStyleTag({
    content: ".commercial-map-district-qa {visibility:hidden}",
  });
  const report = {
    phase,
    mobile,
    browser: browser.version(),
    errors,
    poses,
    measurements: {},
  };
  if (phase !== "before") {
    report.registration = await page.evaluate(async () => {
      const s =
        await import("/src/features/commercial-map/data/fenasojaComplexReconstruction.ts");
      const l =
        await import("/src/features/commercial-map/utils/lactalisOrientationProposal.ts");
      window.dispatchEvent(
        new CustomEvent("territory-qa", { detail: { inspectComplex: true } }),
      );
      return {
        spec: s.FENASOJA_COMPLEX,
        orientation: l.lactalisAudienceOrientationProposal(),
        meshes: JSON.parse(
          document.querySelector("canvas").dataset.fenasojaComplexInspection ||
            "[]",
        ),
      };
    });
  }
  for (const [name, pose] of Object.entries(poses)) {
    await page.evaluate(
      (p) =>
        window.dispatchEvent(new CustomEvent("territory-qa", { detail: p })),
      pose,
    );
    await page.waitForTimeout(1600);
    await page.screenshot({
      path: path.join(out, `${phase}-${mobile ? "mobile-" : ""}${name}.png`),
    });
  }
  for (const name of process.argv.includes("--quick")
    ? []
    : ["frontage", "stageFront", "beforeView6", "maximum"]) {
    await page.evaluate((p) => {
      delete document.querySelector("canvas").dataset.territoryReport;
      window.dispatchEvent(
        new CustomEvent("territory-qa", { detail: { ...p, measure: true } }),
      );
    }, poses[name]);
    await page.waitForFunction(
      () => document.querySelector("canvas")?.dataset.territoryReport,
      null,
      { timeout: 60000 },
    );
    report.measurements[name] = await page
      .locator("canvas")
      .evaluate((c) => JSON.parse(c.dataset.territoryReport));
  }
  if (phase === "after") {
    await page.evaluate(async () =>
      (
        await import("/src/features/commercial-map/state/useCommercialMapStore.ts")
      ).useCommercialMapStore
        .getState()
        .setNightModeActive(true),
    );
    for (const name of ["frontage", "stageFront"]) {
      await page.evaluate(
        (p) =>
          window.dispatchEvent(new CustomEvent("territory-qa", { detail: p })),
        poses[name],
      );
      await page.waitForTimeout(1800);
      await page.screenshot({
        path: path.join(
          out,
          `${phase}-${mobile ? "mobile-" : ""}night-${name}.png`,
        ),
      });
    }
    if (mobile) {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, `${phase}-landscape.png`) });
    }
  }
  fs.writeFileSync(
    path.join(out, `${phase}-${mobile ? "mobile" : "desktop"}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      phase,
      mobile,
      errors,
      measures: Object.fromEntries(
        Object.entries(report.measurements).map(([k, v]) => [
          k,
          {
            meanMs: v.meanMs,
            p95Ms: v.p95Ms,
            renderer: v.renderer,
            health: v.health,
          },
        ]),
      ),
    }),
  );
  await browser.close();
})().catch(async (e) => {
  console.error(e);
  await browser?.close();
  process.exit(1);
});
