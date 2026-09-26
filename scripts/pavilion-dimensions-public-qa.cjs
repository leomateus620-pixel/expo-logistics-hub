const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const output = path.resolve('docs/validation/pavilion-dimensions/public'); fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11'] });
  const report = [];
  try {
    for (const [profile, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
      for (const id of ['B6', 'B2']) {
        const page = await browser.newPage({ viewport, deviceScaleFactor: 1, isMobile: profile === 'mobile', hasTouch: profile === 'mobile' });
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(`http://127.0.0.1:4201/scripts/pavilion-plan-qa.html?consumer=public&pavilion=${id}`, { timeout: 120000 });
        await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapReady === 'true', null, { timeout: 120000 });
        for (const [action, label] of [['vertical', 'Visualizar pavilhão na vertical'], ['horizontal', 'Visualizar pavilhão na horizontal'], ['inspect', 'Aproximar lotes']]) {
          await page.getByRole('button', { name: label, exact: true }).click(); await page.waitForTimeout(1200);
          const state = await page.evaluate(() => ({ canvasCount: document.querySelectorAll('canvas').length, annotations: [...document.querySelectorAll('[data-dimension-id]')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.textContent), markers: document.querySelectorAll('[data-wayfinding-id]').length, canvas: { ...document.querySelector('canvas').dataset }, overflow: document.documentElement.scrollWidth > innerWidth }));
          assert.equal(state.canvasCount, 1); assert.equal(state.overflow, false); assert.equal(errors.length, 0);
          assert.equal(state.markers, 6);
          await page.screenshot({ path: path.join(output, `${profile}-${id}-${action}.png`) });
          report.push({ profile, id, action, errors, ...state });
          console.log('public', profile, id, action, state.annotations.join('; '));
        }
        await page.close();
      }
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
