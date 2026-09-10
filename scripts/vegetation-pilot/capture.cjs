/* Local, authentication-free rendering harness: canonical application scene. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs");
const path = require("node:path");
const phase = process.argv[2] || "after";
const device = process.argv[3] || "desktop";
const out = path.resolve("docs/screenshots/vegetation-pilot");
const viewports = {
  desktop: { width: 1440, height: 960 },
  portrait: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
};
let browser;
let activePage;
let activeReport;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({
    viewport: viewports[device],
    deviceScaleFactor: 1,
    isMobile: device !== "desktop",
    hasTouch: device !== "desktop",
  });
  const errors = [];
  activePage = page;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(
    "http://127.0.0.1:4196/__dev/commercial-map-rendering" +
      (phase.startsWith("before")
        ? "?vegetationPilotBaseline"
        : process.env.QA_QUERY || ""),
    { timeout: 120000 },
  );
  await page.waitForFunction(
    () =>
      document.querySelector("canvas")?.dataset.territoryQa === "ready" &&
      JSON.parse(
        document.querySelector("canvas").dataset.commercialMapRenderHealth ||
          "{}",
      ).status === "ready",
    null,
    { timeout: 120000 },
  );
  await page.addStyleTag({
    content: ".commercial-map-district-qa{visibility:hidden}",
  });
  const poses = await page.evaluate(async () => {
    const { officialPdfPointToLocal: p } = await import(
      "/src/features/commercial-map/data/officialReference2026.ts"
    );
    const pose = (point, offset, h = 0.5) => {
      const [x, z] = p(point);
      return {
        target: [x, h, z],
        position: [x + offset[0], h + offset[1], z + offset[2]],
      };
    };
    return {
      "a-close": pose([4100, 3910], [4, 2.5, 5], 1.1),
      "a-medium": pose([4260, 3950], [9, 10, 13]),
      "b-close": pose([4410, 3595], [-4, 2.3, 5], 1.1),
      "b-medium": pose([4270, 3610], [8, 9, 12]),
      "parking-close": pose([4800, 3658], [4, 2.6, 5], 1.1),
      "parking-medium": pose([4890, 3710], [10, 14, 18]),
      "a-ground": pose([4100, 3910], [3, 0.3, 4], 1.1),
      "b-ground": pose([4410, 3595], [-3, 1.1, 4], 0.6),
      "parking-ground": pose([4800, 3658], [1, 0.35, 4], 0.9),
      "pilot-high": pose([4670, 3750], [0.1, 40, 3]),
      "control-outside": pose([2980, 3060], [3, 9, 12]),
      overview: { target: [0, 0, 0], position: [65, 85, 105] },
    };
  });
  const report = {
    phase,
    device,
    browser: browser.version(),
    viewport: viewports[device],
    poses,
    errors,
    measurements: {},
  };
  const views = Object.entries(poses).filter(
    ([name]) =>
      (!process.argv.includes("--ground-only") || name.endsWith("-ground")) &&
      (!process.argv.includes("--measure-only") ||
        [
          "a-close",
          "b-close",
          "parking-close",
          "pilot-high",
          "overview",
        ].includes(name)),
  );
  activeReport = report;
  report.inventory = await page.evaluate(async () => {
    const { COMMERCIAL_MAP_TREES: trees } = await import(
      "/src/features/commercial-map/data/commercialTrees.ts"
    );
    const ids = ["QUADRA_A", "QUADRA_B", "PARKING_EXHIBITORS_VISITORS"];
    return Object.fromEntries(
      ids.map((id) => [
        id,
        trees
          .filter((t) => t.area === id)
          .map((t) => ({
            id: t.id,
            position: t.position,
            canopyRadius: t.canopyRadius,
          })),
      ]),
    );
  });
  // Warm every view before sampling the same camera sequence.
  for (const [, pose] of views) {
    await page.evaluate(
      (p) =>
        window.dispatchEvent(new CustomEvent("territory-qa", { detail: p })),
      pose,
    );
    await page.waitForTimeout(1100);
  }
  for (const [name, pose] of views) {
    await page.evaluate(
      (p) =>
        window.dispatchEvent(new CustomEvent("territory-qa", { detail: p })),
      pose,
    );
    await page.waitForTimeout(1700);
    if (!process.argv.includes("--measure-only"))
      await page.screenshot({
        path: path.join(out, `${phase}-${device}-${name}.png`),
      });
    if (
      !process.argv.includes("--quick") &&
      [
        "a-close",
        "b-close",
        "parking-close",
        "pilot-high",
        "overview",
      ].includes(name)
    ) {
      await page.evaluate((p) => {
        delete document.querySelector("canvas").dataset.territoryReport;
        window.dispatchEvent(
          new CustomEvent("territory-qa", { detail: { ...p, measure: true } }),
        );
      }, pose);
      await page.waitForFunction(
        () => document.querySelector("canvas")?.dataset.territoryReport,
        null,
        { timeout: 90000 },
      );
      report.measurements[name] = await page
        .locator("canvas")
        .evaluate((c) => JSON.parse(c.dataset.territoryReport));
      console.log(
        device,
        name,
        report.measurements[name].meanMs,
        report.measurements[name].renderer.triangles,
      );
      fs.writeFileSync(
        path.join(out, `${phase}-${device}.json`),
        JSON.stringify(report, null, 2),
      );
    }
  }
  report.final = await page.locator("canvas").evaluate((c) => ({
    health: JSON.parse(c.dataset.commercialMapRenderHealth || "{}"),
    snapshot: window.__commercialMapRuntimeDiagnostics?.capture(),
  }));
  fs.writeFileSync(
    path.join(out, `${phase}-${device}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log("Saved", phase, device, "errors:", errors.length);
  await browser.close();
})().catch(async (e) => {
  console.error(e);
  if (activePage && !activePage.isClosed()) {
    const failure = await activePage
      .locator("canvas")
      .evaluate((c) => ({
        data: { ...c.dataset },
        snapshot: window.__commercialMapRuntimeDiagnostics?.capture(),
      }))
      .catch(() => null);
    fs.writeFileSync(
      path.join(out, `${phase}-${device}-failure.json`),
      JSON.stringify(
        { error: String(e), report: activeReport, failure },
        null,
        2,
      ),
    );
    await activePage
      .screenshot({ path: path.join(out, `${phase}-${device}-failure.png`) })
      .catch(() => {});
  }
  await browser?.close();
  process.exit(1);
});
