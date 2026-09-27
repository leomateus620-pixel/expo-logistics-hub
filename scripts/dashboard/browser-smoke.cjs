
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const out = path.resolve('docs/validation/dashboard-scopes/evidence');
const base = process.env.DASHBOARD_BASE_URL || 'http://127.0.0.1:5189';

async function run(mobile) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11'] });
  try {
    const page = await browser.newPage(mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Only the response used by this test browser enables analytics in the
    // existing read-only diagnostics fixture. Production permissions stay intact.
    await page.route('**/src/features/commercial-map/CommercialMapPage.tsx*', async route => {
      const response = await route.fetch();
      const source = await response.text();
      assert(source.includes('canViewMapAnalytics: false'));
      await route.fulfill({ response, body: source.replace('canViewMapAnalytics: false', 'canViewMapAnalytics: true') });
    });
    await page.goto(base + '/__dev/commercial-map-interface', { waitUntil: 'domcontentloaded', timeout: 90000 });
    const prompt = page.getByRole('button', { name: 'Agora não' });
    if (await prompt.isVisible().catch(() => false)) await prompt.click();
    const open = async () => {
      await page.getByRole('button', { name: 'Gestão', exact: true }).click();
      await page.getByRole('button', { name: 'Dashboard Comercial', exact: true }).click();
      await page.getByRole('heading', { name: 'Visão geral externa', exact: true }).waitFor();
    };
    await open().catch(async error => {
      await page.screenshot({ path: path.join(out, 'boot-failure.png') });
      console.log(JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(0, 3000) }));
      throw error;
    });
    const dialog = page.getByRole('dialog', { name: 'Dashboard Comercial' });
    await page.evaluate(() => { window.__dashboardCanvasBefore = document.querySelector('canvas'); });
    const prefix = mobile ? 'mobile' : 'desktop';
    await page.screenshot({ path: path.join(out, prefix + '-overview.png') });
    const areas = page.getByRole('group', { name: 'Selecionar área externa' });
    const timings = [];
    for (const name of ['Exporural', 'Indústria, Comércio e Serviços', 'Espaço do Automóvel']) {
      const button = areas.getByRole('button', { name: new RegExp(name) });
      await button.scrollIntoViewIfNeeded();
      const timing = await button.evaluate(async button => {
        const start = performance.now(); button.click();
        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
        return performance.now() - start;
      });
      timings.push({ scope: name, ms: timing });
      const map = page.getByRole('region', { name: 'Mini mapa comercial: ' + name, exact: true });
      assert(await map.locator('path[data-outline="segment"]').count());
      assert(await map.locator('path[data-outline="block"]').count());
      const first = map.locator('path[data-entity-id]').first();
      const id = await first.getAttribute('data-entity-id');
      await map.getByRole('combobox').selectOption(id);
      assert.equal(await first.getAttribute('aria-pressed'), 'true');
      await map.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, prefix + '-' + (name === 'Exporural' ? 'rural' : name.startsWith('Indústria') ? 'industry' : 'automotive') + '.png') });
      await map.getByRole('button', { name: 'Ver no mapa' }).click();
      assert.equal(await dialog.count(), 0);
      assert.equal(await page.evaluate(async () => {
        const { useCommercialMapStore } = await import('/src/features/commercial-map/state/useCommercialMapStore.ts');
        return useCommercialMapStore.getState().selectedEntityId;
      }), id);
      await open();
    }
    const pavilions = page.getByRole('group', { name: 'Selecionar pavilhão' });
    for (const number of [1, 3, 5, 7, 8, 12, 14]) {
      const button = pavilions.getByRole('button', { name: new RegExp('^Pavilhão ' + number + ' —') });
      await button.scrollIntoViewIfNeeded();
      const timing = await button.evaluate(async button => {
        const start = performance.now(); button.click();
        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
        return performance.now() - start;
      });
      const plan = page.locator('[data-dashboard-pavilion]');
      await plan.getByRole('combobox').waitFor();
      assert.equal(await plan.count(), 1);
      const module = plan.locator('path[data-entity-id]').first();
      await module.focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      assert.equal(await plan.locator('path[aria-pressed="true"]').count(), 1);
      const id = await plan.locator('path[aria-pressed="true"]').getAttribute('data-entity-id');
      const accessCount = await plan.locator('[data-access-kind]').count();
      assert(accessCount > 0);
      const numbers = await plan.locator('.commercial-dashboard-module-number').allTextContents();
      if (number === 7) { assert.equal(numbers.length, 57); assert(numbers.includes('57')); }
      timings.push({ scope: 'Pavilhão ' + number, ms: timing, modules: numbers.length, accesses: accessCount });
      await plan.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, prefix + '-pavilion-' + number + '.png') });
      // Exercise the page's original handler for every requested pavilion.
      await plan.getByRole('button', { name: 'Ver no mapa' }).click();
      assert.equal(await dialog.count(), 0);
      const selection = await page.evaluate(async id => {
        const { useCommercialMapStore } = await import('/src/features/commercial-map/state/useCommercialMapStore.ts');
        const { OFFICIAL_REFERENCE_DATA } = await import('/src/features/commercial-map/data/officialReference2026.ts');
        const entity = OFFICIAL_REFERENCE_DATA.entities.find(entity => entity.id === id);
        const state = useCommercialMapStore.getState();
        return { selected: state.selectedEntityId, interior: state.interiorEntityId, module: state.selectedModuleId,
          expectedParent: entity.parentEntityId, expectedModule: entity.metadata.pavilionModuleKey };
      }, id);
      assert.equal(selection.selected, selection.expectedParent);
      assert.equal(selection.interior, selection.expectedParent);
      assert.equal(selection.module, selection.expectedModule);
      await open();
    }
    await page.getByRole('button', { name: 'Consultar Pavilhão 13' }).click();
    assert.equal(await page.locator('[data-dashboard-pavilion="B5"] path[data-entity-id]').count(), 103);
    const layout = await page.evaluate(() => {
      const overlay = document.querySelector('.commercial-dashboard-overlay');
      return { width: innerWidth, overlayWidth: overlay.clientWidth, scrollWidth: overlay.scrollWidth,
        canvases: document.querySelectorAll('canvas').length, sameCanvas: document.querySelector('canvas') === window.__dashboardCanvasBefore,
        plans: document.querySelectorAll('[data-dashboard-pavilion]').length,
        selectedPavilionButtons: [...document.querySelectorAll('.commercial-dashboard-pavilion-selectors button')].map(b => ({ width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height })),
        health: document.querySelector('canvas')?.dataset.commercialMapRenderHealth || null };
    });
    assert(layout.scrollWidth <= layout.overlayWidth + 1, 'horizontal page overflow');
    assert(layout.sameCanvas);
    assert.equal(layout.canvases, 1);
    assert(layout.selectedPavilionButtons.every(b => b.width >= 44 && b.height >= 44));
    const result = { device: prefix, fixture: 'OFFICIAL_REFERENCE_DATA, test-only analytics permission', timings, errors, layout, url: page.url() };
    fs.writeFileSync(path.join(out, prefix + '-browser.json'), JSON.stringify(result, null, 2));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
}
(async () => { await run(false); await run(true); })().catch(error => { console.error(error); process.exit(1); });
