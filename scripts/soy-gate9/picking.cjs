const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
(async () => {
  const report = [];
  for (const mobile of [false, true]) {
    const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
    try {
      const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 }, isMobile: mobile, hasTouch: mobile });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto((process.env.QA_URL || 'http://127.0.0.1:4189') + '/__dev/commercial-map-rendering', { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => document.querySelector('canvas')?.dataset.territoryQa === 'ready', null, { timeout: 90000 });
      await page.getByRole('button', { name: 'Tela limpa', exact: true }).click();
      await page.addStyleTag({ content: '.commercial-map-district-qa {visibility:hidden}' });
      await page.waitForTimeout(8000);
      for (const [id, target] of [['E-07', [-0.043636, 0.3, -9.665455]], ['RES-A9', [10.5069, 0.8, -38.5037]]]) {
        await page.evaluate(async ({ target }) => {
          (await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore.getState().setSelectedEntityId(null);
          window.dispatchEvent(new CustomEvent('territory-qa', { detail: { target, position: [target[0] + 6, 8, target[2]] } }));
        }, { target });
        await page.waitForTimeout(1800);
        const box = await page.locator('canvas').boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        if (mobile) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
        await page.waitForTimeout(500);
        const selected = await page.evaluate(async () => (await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore.getState().selectedEntityId);
        report.push({ mobile, id, selected, correct: selected === `reference:2026:${id.toLowerCase()}`, errors });
      }
    } finally { await browser.close(); }
  }
  fs.writeFileSync('docs/screenshots/soy-gate9/picking.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (report.some(r => !r.correct || r.errors.length)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
