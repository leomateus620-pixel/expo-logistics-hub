const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const output = 'docs/screenshots/exporural-upgrade';
const phase = process.argv[2] || 'before';
const mobile = process.argv.includes('--mobile');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /shader|THREE|WebGL/i.test(m.text()))
      errors.push(m.text());
  });
  await page.goto(
    (process.env.QA_URL || 'http://127.0.0.1:4188') +
      '/__dev/commercial-map-rendering',
    { waitUntil: 'domcontentloaded', timeout: 120000 },
  );
  await page.waitForFunction(
    () => document.querySelector('canvas')?.dataset.territoryQa === 'ready',
    null,
    { timeout: 90000 },
  );
  await page.waitForTimeout(8000);
  const inventory = await page.evaluate(async () => {
    const { OFFICIAL_REFERENCE_ENTITIES } =
      await import('/src/features/commercial-map/data/officialReference2026.ts');
    const {
      strategicLandmarkBounds,
      strategicLandmarkFacingRadians,
      strategicLandmarkVisualHeight,
    } = await import('/src/features/commercial-map/utils/landmarks.ts');
    const {
      EXPORURAL_STEAKHOUSE_LAYOUT,
      resolveExporuralSteakhouseDimensions,
    } =
      await import('/src/features/commercial-map/utils/exporuralSteakhouse.ts');
    const entity = OFFICIAL_REFERENCE_ENTITIES.find(
      (e) => e.publicIdentifier === 'C4',
    );
    const bounds = strategicLandmarkBounds(entity);
    return {
      entity,
      restroom: OFFICIAL_REFERENCE_ENTITIES.find(
        (e) => e.publicIdentifier === 'E-06',
      ),
      bounds,
      height: strategicLandmarkVisualHeight(entity),
      orientation: strategicLandmarkFacingRadians(entity),
      layout: EXPORURAL_STEAKHOUSE_LAYOUT,
      dimensions: resolveExporuralSteakhouseDimensions(bounds),
      officialEntities: OFFICIAL_REFERENCE_ENTITIES,
    };
  });
  inventory.officialEntitiesSha256 = createHash('sha256')
    .update(JSON.stringify(inventory.officialEntities))
    .digest('hex');
  inventory.officialEntityCount = inventory.officialEntities.length;
  delete inventory.officialEntities;
  const x = inventory.bounds.centerX,
    z = inventory.bounds.centerZ,
    d = inventory.dimensions;
  const poses = {
    context: { target: [x - 1, 1, z], position: [x - 14, 10, z - 15] },
    restaurant: { target: [x, 0.6, z], position: [x - 3.4, 2.4, z - 4.5] },
    restroom: {
      target: [x + d.annexCenterX, 0.4, z + d.annexCenterZ],
      position: [x + d.annexCenterX - 2, 1.9, z + d.annexCenterZ + 2.8],
    },
    turbine: {
      target: [x + d.turbineCenterX, 3, z + d.turbineCenterZ],
      position: [x + d.turbineCenterX - 4, 3.6, z + d.turbineCenterZ - 4],
    },
    top: { target: [x - 1, 0, z], position: [x - 1, 13, z - 0.01] },
    overview: { target: [0, 0, 0], position: [100, 140, 160] },
  };
  const report = { phase, mobile, errors, inventory, poses, measurements: {} };
  await page.addStyleTag({
    content: '.commercial-map-district-qa {visibility:hidden}',
  });
  for (const [name, pose] of Object.entries(poses)) {
    await page.evaluate(
      (p) =>
        window.dispatchEvent(new CustomEvent('territory-qa', { detail: p })),
      pose,
    );
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: path.join(output, `${phase}-${mobile ? 'mobile-' : ''}${name}.png`),
    });
  }
  for (const name of ['context', 'overview']) {
    await page.evaluate((p) => {
      delete document.querySelector('canvas').dataset.territoryReport;
      window.dispatchEvent(
        new CustomEvent('territory-qa', { detail: { ...p, measure: true } }),
      );
    }, poses[name]);
    await page.waitForFunction(
      () => document.querySelector('canvas')?.dataset.territoryReport,
      null,
      { timeout: 30000 },
    );
    report.measurements[name] = await page
      .locator('canvas')
      .evaluate((c) => JSON.parse(c.dataset.territoryReport));
  }
  report.browser = browser.version();
  fs.writeFileSync(
    path.join(output, `${phase}-${mobile ? 'mobile' : 'desktop'}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      phase, mobile, bounds: inventory.bounds,
      measurements: report.measurements,
      errors,
    }),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
