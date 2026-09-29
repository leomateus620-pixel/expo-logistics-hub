const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.resolve('docs/validation/benvenuto/after');
const base = process.env.BENVENUTO_URL || 'http://127.0.0.1:5198';
const snapshot = page => page.evaluate(() => ({
  character: JSON.parse(document.querySelector('canvas').dataset.visitCharacter || 'null'),
  health: JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth || 'null'),
}));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11'] });
  try {
    for (const mobile of [false, true]) {
      const device = mobile ? 'mobile-emulated' : 'desktop';
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
        deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/__dev/commercial-map-rendering?persistedStage=1&benvenutoQa=1');
      await page.waitForFunction(() => window.__benvenutoQa && document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 240000 });
      await page.addStyleTag({ content: '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;height:100vh!important;width:100vw!important}' });
      await page.evaluate(() => { const q = window.__benvenutoQa; q.visit.getState().start({ entityId: q.data.entities.find(e => e.publicIdentifier === 'B2').id }); });
      await page.waitForFunction(() => document.querySelector('[data-visit-hud]')?.dataset.visitPhase === 'active', null, { timeout: 90000 });
      await page.waitForTimeout(1500);
      const report = { device, method: 'Actual keyboard walk from canonical B2 entrance, no pose teleport', start: await snapshot(page), route: [], errors };
      // Telemetry publishes at 1 Hz: stop before the desired street center to
      // allow a final sample interval and deceleration, avoiding the sidewalk.
      const targetZ = await page.evaluate(() => window.__benvenutoQa.point([2700, 3820])[1]);
      await page.keyboard.down('d');
      for (let step = 0; step < 50; step++) {
        await page.waitForTimeout(1000);
        const s = await snapshot(page); report.route.push(s);
        if (s.character.position.z <= targetZ) break;
      }
      await page.keyboard.up('d'); await page.waitForTimeout(1500);
      report.arrival = await snapshot(page);
      await page.screenshot({ path: path.join(out, device + '-visit-street.png') });
      await page.keyboard.down('w'); await page.waitForTimeout(6000); await page.keyboard.up('w');
      await page.waitForTimeout(1500);
      report.walked = await snapshot(page);
      await page.screenshot({ path: path.join(out, device + '-visit-street-walked.png') });
      const a = report.arrival.character.position, b = report.walked.character.position;
      report.travelMetres = Math.hypot(b.x - a.x, b.z - a.z) / .15;
      report.passed = Math.abs(a.z - targetZ) < .5 && Math.abs(a.y - .044) < .001
        && Math.abs(b.y - .044) < .001 && report.travelMetres > 2 && !errors.length;
      fs.writeFileSync(path.join(out, device + '-street-walk.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ device, passed: report.passed, arrival: a, walked: b, travelMetres: report.travelMetres, errors }));
      await context.close();
      if (!report.passed) throw Error('Street walking check failed');
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
