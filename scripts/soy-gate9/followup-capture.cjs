const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
let activeBrowser;
const output = 'docs/screenshots/map-startup';
const phase = process.argv[2] || 'before';
const mobile = process.argv.includes('--mobile');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
  activeBrowser = browser;
  const page = await browser.newPage({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const errors = [];
  page.on('pageerror', (e) => (errors.push(e.message), console.error(e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error' && /shader|THREE|WebGL/i.test(m.text()))
      errors.push(m.text());
  });
  await page.goto(
    (process.env.QA_URL || 'http://127.0.0.1:4189') +
      '/__dev/commercial-map-rendering' + (process.env.PERSISTED_STAGE ? '?persistedStage' : ''),
    { waitUntil: 'domcontentloaded', timeout: 120000 },
  );
  await page.waitForFunction(
    () => document.querySelector('canvas')?.dataset.territoryQa === 'ready',
    null,
    { timeout: 90000 },
  );
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth || '{}').status === 'ready', null, { timeout: 120000 });
  await page.waitForTimeout(2000);
  const inventory = await page.evaluate(async()=>{const m=await import('/src/features/commercial-map/data/officialReference2026.ts');const l=await import('/src/features/commercial-map/utils/lactalisStage.ts');return {entities:m.OFFICIAL_REFERENCE_ENTITIES.filter(e=>['B7','B13','A9','E-07','SAN-COZINHA','RES-A9','RUA-MONTEVIDEU-COZINHA'].includes(e.publicIdentifier)),stage:l.LACTALIS_STAGE_LAYOUT};});
  const stageReport = await page.evaluate(async (fixture) => { const m = await import('/src/features/commercial-map/utils/lactalisOrientationProposal.ts'); const ref = await import('/src/features/commercial-map/data/officialReference2026.ts'); const entities = ref.OFFICIAL_REFERENCE_ENTITIES.map(e => fixture[e.publicIdentifier] ? {...e, geometry:{...e.geometry, coordinates:fixture[e.publicIdentifier].geometry.coordinates}} : e); return m.lactalisAudienceOrientationProposal(entities); }, process.env.PERSISTED_STAGE ? JSON.parse(fs.readFileSync('src/test/fixtures/soyGatePersistedLayout.json', 'utf8')) : {});
  const poses = {
    restroomTop:{target:[0,-0.0,-9.6],position:[0,15,-9.61]},
    restroomFront:{target:[0,0.4,-9.6],position:[7,4,-9.6]},
    restroomRear:{target:[0,0.4,-9.6],position:[-6,4,-12]},
    kitchenContext:{target:[2,0,-9.6],position:[11,10,-3]},
    gate9Top:{target:[11,-0.0,-38],position:[11,22,-38.01]},
    gate9:{target:[10.6,0.5,-38.5],position:[17,5,-33]},
    stageTop:{target:[16.47,0,12.8],position:[16.47,14,12.79]},
    stageLot11:{target:[16.47,0.75,12.8],position:[11.94,2.4,14.94]},
    stageLot12:{target:[16.47,0.75,12.8],position:[11.94,2.4,12.55]},
    stageRear:{target:[16.47,0.75,12.8],position:[22,4,12.8]},
    overview:{target:[0,0,0],position:[100,140,160]},
  };
  const report = { phase, mobile, errors, inventory, poses, stageReport, measurements: {} };
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
  for (const name of ['kitchenContext', 'gate9', 'stageLot11', 'overview']) {
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
      phase, mobile,
      measurements: report.measurements,
      errors,
    }),
  );
  await browser.close();
})().catch(async (e) => {
  await activeBrowser?.close();
  console.error(e);
  process.exit(1);
});
