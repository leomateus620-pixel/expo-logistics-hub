const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs");
const poses = {
  general: { target: [12, 0, -30], position: [12, 245, -29.9] },
  br472: { target: [65, 0, 0], position: [65, 110, 0.1] },
  arena: { target: [49, 0, 12], position: [65, 60, 54] },
  gate5: { target: [-1.4373, 0, -44.2478], position: [-1.4373, 100, -44.1478] },
  ubiretama: { target: [50, 0, 10], position: [50, 65, 10.1] },
  north: { target: [95, 0, -70], position: [95, 105, -69.9] },
  south: { target: [32, 0, 137], position: [32, 90, 137.1] },
  bathing: { target: [-27, 0, 117], position: [-27, 145, 117.1] },
  oblique: { target: [15, 0, -20], position: [105, 130, 160] },
};
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
  await page.goto(
    (process.env.QA_URL || "http://127.0.0.1:4182") +
      "/__dev/commercial-map-rendering",
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
    path: `docs/screenshots/territory/${phase}-${mobile ? "mobile-" : ""}initial.png`,
  });
  const report = { errors, poses: {} };
  for (const [id, pose] of Object.entries(poses)) {
    if (requestedView && id !== requestedView) continue;
    if (mobile && !["general", "oblique", "gate5"].includes(id)) continue;
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
      path: `docs/screenshots/territory/${phase}-${mobile ? "mobile-" : ""}${id}.png`,
    });
    report.poses[id] = await page.locator("canvas").evaluate((c) => ({
      health: JSON.parse(c.dataset.commercialMapRenderHealth || "{}"),
      camera: JSON.parse(c.dataset.commercialMapCameraDiagnostics || "{}"),
    }));
  }
  await page.evaluate(
    (p) =>
      window.dispatchEvent(
        new CustomEvent("territory-qa", { detail: { ...p, measure: true } }),
      ),
    poses.oblique,
  );
  await page.waitForTimeout(8000);
  report.performance = await page
    .locator("canvas")
    .evaluate((c) => JSON.parse(c.dataset.territoryReport || "{}"));
  fs.writeFileSync(
    `docs/screenshots/territory/${phase}-${requestedView || (mobile ? "mobile" : "desktop")}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report.performance));
  await browser.close();
})();
