const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const out = 'docs/screenshots/exporural-upgrade';
const mobile = process.argv.includes('--mobile');
let debugBrowser;
let debugPage;
const inventory = JSON.parse(
  fs.readFileSync(`${out}/before-desktop.json`, 'utf8'),
).inventory;
const x = inventory.bounds.centerX,
  z = inventory.bounds.centerZ;
(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  });
  debugBrowser=browser;
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1366, height: 768 },
    hasTouch: mobile,
    isMobile: mobile,
    deviceScaleFactor: 1,
    recordVideo: {
      dir: `${out}/video`,
      size: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 },
    },
  });
  const recordingStarted = Date.now();
  const page = await context.newPage(),
    errors = [];
  debugPage=page;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /THREE|shader|WebGL/.test(m.text()))
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
  await page.waitForTimeout(7000);
  const pose = async (p) => {
    await page.evaluate(
      (p) =>
        window.dispatchEvent(new CustomEvent('territory-qa', { detail: p })),
      p,
    );
    await page.waitForTimeout(1200);
  };
  const read = () =>
    page.evaluate(() => {
      window.dispatchEvent(new Event('exporural-qa'));
      return JSON.parse(document.querySelector('canvas').dataset.exporuralQa);
    });
  const select = (id) =>
    page.evaluate(async (id) => {
      const { useCommercialMapStore } =
        await import('/src/features/commercial-map/state/useCommercialMapStore.ts');
      useCommercialMapStore.getState().setSelectedEntityId(id);
    }, id);
  await page.addStyleTag({
    content: '.commercial-map-district-qa{visibility:hidden}',
  });
  await pose({ target: [x, 0.7, z], position: [x - 3.4, 2.4, z - 4.5] });
  const animationStartSeconds=(Date.now()-recordingStarted)/1000;
  const inactive = await read();
  assert.equal(inactive.activity.crew, 0);
  const [sx, sy] = inactive.screenC4;
  if (mobile) await page.touchscreen.tap(sx, sy);
  else await page.mouse.click(sx, sy);
  await page.waitForTimeout(1200);
  const active = await read();
  assert.ok(active.calls<=24 && active.triangles<=12000 && active.shadowCalls<=12);
  assert.equal(active.activity.selected, true);
  assert.equal(active.activity.crew, 3);
  assert.equal(active.activity.particles, 8);
  assert.equal(active.roofVisible, false);
  const crewIds = active.entries
    .filter((e) => /churrasqueiros|fumaca/.test(e.name))
    .map((e) => e.uuid);
  await pose({
    target: [x + 0.1, 0.13, z - 0.23],
    position: [x - 0.75, 2.3, z - 0.85],
  });
  await page.screenshot({
    path: `${out}/active-${mobile ? 'mobile' : 'desktop'}.png`,
  });
  await page.waitForTimeout(3000);
  const moving = await read();
  const turbinePose={target:[x+inventory.dimensions.turbineCenterX,3.45,z+inventory.dimensions.turbineCenterZ],position:[x+inventory.dimensions.turbineCenterX-4.3,3.85,z+inventory.dimensions.turbineCenterZ-4.3]};
  await pose(turbinePose);const visibleRotor=await read();await page.waitForTimeout(1600);
  assert.notEqual((await read()).rotor.phase,visibleRotor.rotor.phase);
  await page.screenshot({path:`${out}/active-turbine-${mobile?'mobile':'desktop'}.png`});
  await pose({target:[x+.1,.13,z-.23],position:[x-.75,2.3,z-.85]});
  await select(null);
  await page.waitForTimeout(1100);
  const cleared = await read();
  const animationEndSeconds = (Date.now() - recordingStarted) / 1000;
  assert.equal(cleared.activity.crew, 0);
  assert.equal(cleared.roofVisible, true);
  assert.equal(cleared.roofOpacity, 1);
  await page.waitForTimeout(400);
  assert.equal((await read()).activity.updates, cleared.activity.updates);
  await select(inventory.entity.id);
  await page.waitForTimeout(1100);
  await pose({target:[x+inventory.dimensions.annexCenterX,.4,z+inventory.dimensions.annexCenterZ],position:[x+inventory.dimensions.annexCenterX-2,1.9,z+inventory.dimensions.annexCenterZ+2.8]});
  const restroomHit=await read();

  if(mobile)await page.touchscreen.tap(...restroomHit.screenE06);else await page.mouse.click(...restroomHit.screenE06);
  await page.waitForTimeout(1100);
  const selectedRestroom=await page.evaluate(async()=>{const {useCommercialMapStore}=await import('/src/features/commercial-map/state/useCommercialMapStore.ts');return useCommercialMapStore.getState().selectedEntityId;});
  assert.equal(selectedRestroom,null); // E-06 remains excluded from the official active fixture.
  await pose({target:[x+.1,.13,z-.23],position:[x-.75,2.3,z-.85]});
  assert.equal((await read()).activity.crew, 0);
  await select(inventory.entity.id);
  await page.waitForTimeout(1200);
  await select('reference:2026:b10');await page.waitForTimeout(1000);
  await select(inventory.entity.id);await page.waitForTimeout(1000);
  const warm = await read();
  const snapshots = [];
  for (let i = 0; i < 20; i++) {
    await select(i % 2 ? 'reference:2026:b10' : null);
    await page.waitForTimeout(700);
    const off = await read();
    assert.equal(off.activity.crew, 0);
    await select(inventory.entity.id);
    await select(inventory.entity.id);
    await page.waitForTimeout(700);
    const on = await read();
    assert.equal(on.activity.crew, 3);
    assert.deepEqual(
      on.entries
        .filter((e) => /churrasqueiros|fumaca/.test(e.name))
        .map((e) => e.uuid),
      crewIds,
    );
    snapshots.push({ cycle: i + 1, memory: on.memory, activity: on.activity });
  }
  const final = await read();
  assert.deepEqual(final.memory, warm.memory);
  await pose(turbinePose);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(900);
  const reduced = await read();
  await page.waitForTimeout(400);
  const still = await read();
  assert.equal(reduced.rotor.phase, still.rotor.phase);
  assert.equal(still.activity.particles, 0);
  assert.equal(still.activity.crew, 3);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await select(null);
  await page.waitForTimeout(900);
  const health = await page
    .locator('canvas')
    .evaluate((c) => JSON.parse(c.dataset.commercialMapRenderHealth));
  assert.equal(health.contextLosses, 0);
  assert.equal(health.lastErrorCode, null);
  assert.deepEqual(errors, []);
  const video = page.video();
  await context.close();
  const videoPath = await video.path();
  fs.writeFileSync(
    `${out}/activity-${mobile ? 'mobile' : 'desktop'}.json`,
    JSON.stringify(
      {
        browser: browser.version(),
        mobile,
        errors,
        inactive,
        active,
        moving,
        cleared,
        warm,
        final,
        reduced,
        snapshots,
        health,
        videoPath, animationStartSeconds, animationEndSeconds,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      calls: active.calls,
      triangles: active.triangles,
      memory: final.memory,
      health,
      videoPath,
    }),
  );
  await browser.close();
})().catch(async (e) => {
  console.error(e);
  if(debugPage)await debugPage.screenshot({path:`${out}/activity-error.png`}).catch(()=>{});
  if(debugBrowser)await debugBrowser.close();
  process.exitCode=1;
});
