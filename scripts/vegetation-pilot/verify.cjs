const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
// Assertions compare every matrix element in memory; artifacts retain compact fingerprints.
const evidence = (key, value) =>
  key === "transforms" && Array.isArray(value)
    ? {
        elements: value.length,
        sha256: crypto
          .createHash("sha256")
          .update(JSON.stringify(value))
          .digest("hex"),
      }
    : value;
const sharp = require(process.env.SHARP_MODULE || "sharp");
const out = path.resolve("docs/screenshots/vegetation-pilot");
const device = process.argv[2] || "desktop";
const vp =
  device === "desktop"
    ? { width: 1440, height: 960 }
    : { width: 390, height: 844 };
let browser;
(async () => {
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({
    viewport: vp,
    isMobile: device !== "desktop",
    hasTouch: device !== "desktop",
  });
  const report = { device, errors: [], samples: [], checks: {} };
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") report.errors.push(m.text());
  });
  await page.goto("http://127.0.0.1:4196/__dev/commercial-map-rendering");
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
    content: ".commercial-map-district-qa{visibility:hidden}",
  });
  const poses = JSON.parse(
    fs.readFileSync(path.join(out, "after-desktop.json")),
  ).poses;
  const inspect = async () => {
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent("territory-qa", {
          detail: { inspectVegetation: true },
        }),
      ),
    );
    return page.locator("canvas").evaluate((c) => ({
      health: JSON.parse(c.dataset.commercialMapRenderHealth || "{}"),
      objects: JSON.parse(c.dataset.vegetationInspection || "[]"),
      resources: window.__commercialMapRuntimeDiagnostics?.capture(),
    }));
  };
  const move = async (pose) => {
    await page.evaluate(
      (p) =>
        window.dispatchEvent(new CustomEvent("territory-qa", { detail: p })),
      pose,
    );
    await page.waitForTimeout(260);
  };
  await move(poses["a-medium"]);
  const first = await inspect();
  const ids = first.objects
    .filter((o) => o.name.startsWith("vegetation-pilot-trees-"))
    .flatMap((o) => o.data.treeIds);
  const expected = await page.evaluate(async () => {
    const { COMMERCIAL_MAP_TREES: trees } = await import(
      "/src/features/commercial-map/data/commercialTrees.ts"
    );
    const { selectParkAccessCompatibleTreesForPresentation: access } =
      await import(
        "/src/features/commercial-map/data/parkAccessEnvironment.ts"
      );
    const { selectRearRoadCompatibleTreesForPresentation: roads } =
      await import(
        "/src/features/commercial-map/utils/rearRoadTreeClearance.ts"
      );
    return roads(access(trees))
      .filter((t) =>
        ["QUADRA_A", "QUADRA_B", "PARKING_EXHIBITORS_VISITORS"].includes(
          t.area,
        ),
      )
      .map((t) => t.id)
      .sort();
  });
  assert.deepEqual([...ids].sort(), expected);
  report.checks.pilotInventory = new Set(ids).size === expected.length;
  report.inventory = { expected, rendered: ids.length };
  fs.writeFileSync(
    path.join(out, `inventory-${device}.json`),
    JSON.stringify({ ids, expected, first }, evidence, 2),
  );
  console.log(
    "Rendered pilot inventory matches existing clearance rules:",
    ids.length,
  );
  assert(report.checks.pilotInventory);
  const initialMatrices = first.objects
    .filter((o) => o.name.startsWith("pilot-canopies-"))
    .map((o) => o.transforms);
  for (let i = 0; i < 36; i++) {
    const t = (i < 18 ? i : 35 - i) / 17;
    const target = poses["a-medium"].target;
    await move({
      target,
      position: [
        target[0] + 5 + t * 85,
        target[1] + 2 + t * 85,
        target[2] + 7 + t * 110,
      ],
    });
    const snap = await inspect();
    assert.equal(snap.health.contextLosses, 0);
    assert.equal(snap.health.lastErrorCode, null);
    const matrices = snap.objects
      .filter((o) => o.name.startsWith("pilot-canopies-"))
      .map((o) => o.transforms);
    assert.deepEqual(matrices, initialMatrices);
    assert.equal(
      snap.objects
        .filter((o) => o.name.startsWith("pilot-canopies-"))
        .reduce((n, o) => n + o.count, 0),
      expected.length,
    );
    // Read compositor output: health counters alone cannot detect a monochrome frame.
    const pixels = await page.locator("canvas").screenshot();
    const stats = await sharp(pixels).resize(96, 64).stats();
    const variation = Math.max(
      ...stats.channels.slice(0, 3).map((c) => c.stdev),
    );
    assert(
      variation > 8,
      `Blank/monochrome candidate at zoom ${i}: ${variation}`,
    );
    report.samples.push({
      i,
      variation,
      health: snap.health,
      resources: snap.resources,
    });
    if ([0, 8, 17, 26, 35].includes(i))
      fs.writeFileSync(path.join(out, `zoom-${device}-${i}.png`), pixels);
  }
  report.checks.zoomInventoryAndTransforms = true;
  const storeAction = async (action) =>
    page.evaluate(async (action) => {
      const s = (
        await import(
          "/src/features/commercial-map/state/useCommercialMapStore.ts"
        )
      ).useCommercialMapStore.getState();
      if (action === "hide") s.setTreesVisible(false);
      if (action === "show") s.setTreesVisible(true);
      if (action === "night") s.setNightModeActive(true);
      if (action === "day") s.setNightModeActive(false);
      if (action === "reduced") s.setReducedGraphics(true);
      if (action === "full") s.setReducedGraphics(false);
    }, action);
  await move(poses["parking-ground"]);
  await storeAction("hide");
  await page.waitForTimeout(800);
  const hidden = await inspect();
  report.checks.treeToggle =
    hidden.objects
      .filter((o) => o.name.startsWith("vegetation-pilot-trees-"))
      .every((o) => !o.visible) &&
    hidden.objects.find((o) => o.name === "vegetation-pilot-ground-cover")
      ?.visible === false;
  assert(report.checks.treeToggle);
  await storeAction("show");
  for (const action of ["night", "reduced", "full", "day"]) {
    await storeAction(action);
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(out, `mode-${device}-${action}.png`),
    });
    report[action] = await inspect();
    assert.equal(report[action].health.contextLosses, 0);
    assert.equal(report[action].health.lastErrorCode, null);
  }
  // Release DEV camera lock so wheel/orbit below exercises actual controls.
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("territory-qa", { detail: { release: true } }),
    ),
  );
  await page.waitForTimeout(1000);
  const box = await page.locator("canvas").boundingBox();
  const before = await page
    .locator("canvas")
    .evaluate((c) => c.dataset.commercialMapCameraDiagnostics);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.wheel(0, -700);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.57, {
    steps: 16,
  });
  await page.mouse.up();
  await page.waitForTimeout(1800);
  const after = await page
    .locator("canvas")
    .evaluate((c) => c.dataset.commercialMapCameraDiagnostics);
  report.checks.navigation = before !== after;
  assert(report.checks.navigation);
  report.final = await inspect();
  fs.writeFileSync(
    path.join(out, `verification-${device}.json`),
    JSON.stringify(report, evidence, 2),
  );
  assert.equal(report.errors.length, 0);
  console.log(device, report.checks, report.final.health);
  await browser.close();
})().catch(async (e) => {
  console.error(e);
  await browser?.close();
  process.exitCode = 1;
});
