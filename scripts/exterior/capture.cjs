const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs");
const poses = {
  overview: { target: [0, 0, -35], position: [135, 165, 195] },
  neighbourhood: { target: [-27, 0, -101], position: [-8, 38, -65] },
  houses: { target: [-30, 0, -101], position: [-27, 8, -92] },
  sheds: { target: [43, 0, -113], position: [53, 14, -96] },
  rural: { target: [98, 0, -27], position: [124, 26, -4] },
  water: { target: [-23, 0, 124], position: [-7, 27, 157] },
  fishing: { target: [-37, 0, 124], position: [-41, 2.5, 127] },
  vegetation: { target: [-57, 0, -102], position: [-42, 13, -86] },
};
if (process.argv.includes("--fishers")) {
  const fishers = JSON.parse(
    fs.readFileSync(
      "docs/screenshots/exterior-upgrade/fisher-layout.json",
      "utf8",
    ),
  );
  for (const f of fishers) {
    const [x, z] = f.position,
      dx = Math.sin(f.rotation),
      dz = Math.cos(f.rotation);
    poses[f.id] = {
      target: [x + dx * 0.1, 0.1, z + dz * 0.1],
      position: [x - dx * 0.85 + dz * 0.32, 0.52, z - dz * 0.85 - dx * 0.32],
    };
  }
}
(async () => {
  const phase = process.argv[2] || "before";
  const mobile = process.argv.includes("--mobile");
  const requestedView = process.argv
    .find((v) => v.startsWith("--view="))
    ?.split("=")[1];
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1366, height: 768 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /THREE|shader|WebGL/i.test(m.text()))
      errors.push(m.text());
  });
  await page.goto(
    (process.env.QA_URL || "http://127.0.0.1:4182") +
      "/__dev/commercial-map-rendering",
    { waitUntil: "domcontentloaded", timeout: 120000 },
  );
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.territoryQa === "ready",
    {},
    { timeout: 90000 },
  );
  await page.waitForTimeout(8000);
  await page.addStyleTag({
    content: ".commercial-map-district-qa {visibility:hidden}",
  });
  await page.screenshot({
    path: `docs/screenshots/exterior-upgrade/${phase}-${mobile ? "mobile-" : ""}initial.png`,
  });
  const report = { errors, poses: {} };
  for (const [id, pose] of Object.entries(poses)) {
    if (requestedView && id !== requestedView) continue;
    if (process.argv.includes("--fishers") && !id.startsWith("fisher-"))
      continue;
    if (mobile && !["overview", "neighbourhood", "water"].includes(id))
      continue;
    await page.evaluate(
      (p) =>
        window.dispatchEvent(new CustomEvent("territory-qa", { detail: p })),
      pose,
    );
    await page.waitForFunction(
      (p) =>
        document.querySelector("canvas")?.dataset.territoryPose ===
        JSON.stringify(p),
      pose,
    );
    await page.waitForTimeout(1800);
    await page.screenshot({
      path: `docs/screenshots/exterior-upgrade/${phase}-${mobile ? "mobile-" : ""}${id}.png`,
    });
    report.poses[id] = await page.locator("canvas").evaluate((c) => ({
      health: JSON.parse(c.dataset.commercialMapRenderHealth || "{}"),
      exterior: JSON.parse(c.dataset.exteriorReport || "{}"),
      camera: JSON.parse(c.dataset.commercialMapCameraDiagnostics || "{}"),
    }));
  }
  report.measurements = {};
  for(const view of ['overview','neighbourhood','water']) {
    await page.evaluate(p => {
      delete document.querySelector('canvas').dataset.territoryReport;
      window.dispatchEvent(new CustomEvent('territory-qa',{detail:{...p,measure:true}}));
    },poses[view]);
    await page.waitForFunction(()=>!!document.querySelector('canvas')?.dataset.territoryReport,null,{timeout:20000});
    report.measurements[view]=await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.territoryReport));
  }
  report.performance = report.measurements.overview;
  fs.writeFileSync(
    `docs/screenshots/exterior-upgrade/${phase}-${requestedView || (mobile ? "mobile" : "desktop")}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report.performance));
  await browser.close();
})();
