// Local read-only browser evidence. The intercepted page loads the real
// Dashboard directly, bypassing App/router/session/WebGL startup.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { installQaFonts } = require('./presentation-fonts.cjs');
const base = process.env.DASHBOARD_BASE_URL || 'http://127.0.0.1:5191';
const phase = process.env.DASHBOARD_EVIDENCE_LABEL || 'after';
const out = path.resolve(process.env.DASHBOARD_EVIDENCE_DIR || 'docs/validation/dashboard-presentation/evidence');
const html = fs.readFileSync(path.join(__dirname, 'presentation-qa.html'), 'utf8')
  .replace('__QA_ENTRY__', '/@fs/' + path.join(__dirname, 'presentation-qa.tsx').replaceAll('\\', '/'));
fs.mkdirSync(out, { recursive: true });
const sizes = [{ name: 'desktop', width: 1920, height: 1080 }, { name: 'notebook', width: 1366, height: 768 }, { name: 'mobile', width: 390, height: 844 }];
const pavilions = [{ number: 1, id: 'B1' }, { number: 3, id: 'B6' }, { number: 5, id: 'B8' }, { number: 7, id: 'B10' },
  { number: 8, id: 'B4' }, { number: 12, id: 'B3' }, { number: 13, id: 'B5' }, { number: 14, id: 'B2' }];
const settle = async page => { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); };

async function run(browser, size) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1,
    timezoneId: 'America/Sao_Paulo', isMobile: size.name === 'mobile', hasTouch: size.name === 'mobile' });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await installQaFonts(page);
  const errors = [], backendRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.log(`browser: ${message.text().slice(0, 800)}`); });
  page.on('requestfailed', request => console.log(`request failed: ${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) console.log(`HTTP ${response.status()}: ${response.url()}`); });
  await page.route('**/__dashboard-presentation-qa', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.route('**/rest/v1/**', route => { backendRequests.push(route.request().url()); return route.abort(); });
  try {
    console.log(`${phase}: ${size.name} loading isolated Dashboard`);
    await page.goto(base + '/__dashboard-presentation-qa', { waitUntil: 'commit', timeout: 60000 });
    await page.getByRole('heading', { name: 'Dashboard Comercial', exact: true }).waitFor();
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 6000))]));
    await settle(page);
    await page.screenshot({ path: path.join(out, `${phase}-${size.name}-overview.png`), animations: 'disabled' });
    const metrics = [];
    for (const { number, id } of pavilions) {
      await page.getByRole('group', { name: 'Selecionar pavilhão' }).getByRole('button', { name: new RegExp(`^Pavilhão ${number} —`) }).click();
      const map = page.locator(`[data-dashboard-pavilion="${id}"] .commercial-dashboard-minimap`);
      const panel = map.locator('.commercial-dashboard-map-scroll');
      await panel.waitFor();
      await panel.locator('svg path[data-entity-id]').first().waitFor();
      await panel.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await settle(page);
      const metric = await panel.evaluate(element => {
        const svg = element.querySelector('svg'), vb = svg.viewBox.baseVal, matrix = svg.getScreenCTM();
        const scale = Math.hypot(matrix.a, matrix.b);
        const numbers = [...svg.querySelectorAll('.commercial-dashboard-module-number')].map(text => {
          const rectangle = text.getBoundingClientRect();
          return { label: text.textContent, pixels: parseFloat(getComputedStyle(text).fontSize) * scale,
            width: rectangle.width, height: rectangle.height };
        });
        const modules = [...svg.querySelectorAll('path[data-entity-id]')], rects = modules.map(module => module.getBoundingClientRect());
        const svgRectangle = svg.getBoundingClientRect();
        const visibleShapes = [...svg.querySelectorAll('path[data-entity-id], path[data-outline], g[data-access-kind] rect')];
        const markerRectangles = [...svg.querySelectorAll('g[data-access-kind] rect')].map(element => element.getBoundingClientRect());
        const supportLabelCollisions = [...svg.querySelectorAll('.commercial-dashboard-support-label')].filter(label => {
          const rect = label.getBoundingClientRect();
          return markerRectangles.some(marker => rect.left < marker.right && rect.right > marker.left && rect.top < marker.bottom && rect.bottom > marker.top);
        }).map(label => label.textContent);
        const contained = visibleShapes.every(shape => {
          const rect = shape.getBoundingClientRect();
          return rect.left >= svgRectangle.left - 1 && rect.right <= svgRectangle.right + 1
            && rect.top >= svgRectangle.top - 1 && rect.bottom <= svgRectangle.bottom + 1;
        });
        return { width: element.clientWidth, height: element.clientHeight, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight,
          fit: element.dataset.mapFit, preserveAspectRatio: svg.getAttribute('preserveAspectRatio'), contained,
          viewBox: { x: vb.x, y: vb.y, width: vb.width, height: vb.height },
          screenBounds: { width: Math.max(...rects.map(rect => rect.right)) - Math.min(...rects.map(rect => rect.left)),
            height: Math.max(...rects.map(rect => rect.bottom)) - Math.min(...rects.map(rect => rect.top)) },
          modules: modules.length, identifiers: modules.map(module => module.dataset.entityId).sort(),
          accesses: svg.querySelectorAll('[data-access-kind]').length, supports: svg.querySelectorAll('[data-outline="support"]').length, supportLabelCollisions, numbers };
      });
      const source = await page.evaluate(id => {
        const data = window.__dashboardQa.data, pavilion = data.entities.find(entity => entity.publicIdentifier === id);
        return JSON.stringify(data.lots.filter(lot => data.entities.find(entity => entity.id === lot.entityId)?.parentEntityId === pavilion.id)
          .map(lot => [lot.id, lot.entityId, lot.lotNumber, data.entities.find(entity => entity.id === lot.entityId).geometry])
          .sort((a, b) => a[0].localeCompare(b[0])));
      }, id);
      metric.persistedGeometryHash = crypto.createHash('sha256').update(source).digest('hex');
      assert.equal(metric.fit, 'true');
      assert.equal(metric.preserveAspectRatio, 'xMidYMid meet');
      assert(metric.contained, `P${number}: modules, official contours, support rooms and access symbols fully contained`);
      assert(metric.scrollWidth <= metric.width + 1 && metric.scrollHeight <= metric.height + 1, `P${number}: initial fit without internal scroll`);
      assert(metric.modules > 0 && metric.accesses > 0 && metric.numbers.length > 0);
      if (phase === 'after') {
        assert.deepEqual(metric.supportLabelCollisions, [], `P${number}: support labels clear of access symbols`);
        const beforePath = path.join(out, `before-${size.name}.json`);
        if (fs.existsSync(beforePath)) {
          const before = JSON.parse(fs.readFileSync(beforePath, 'utf8')).metrics.find(item => item.number === number);
          assert.deepEqual(metric.identifiers, before.identifiers, `P${number}: preserved module entities`);
          assert.equal(metric.persistedGeometryHash, before.persistedGeometryHash, `P${number}: preserved persisted polygons and official numbers`);
          assert.deepEqual(metric.numbers.map(item => item.label).sort(), before.numbers.map(item => item.label).sort());
        }
      }
      metrics.push({ number, ...metric });
      await page.screenshot({ path: path.join(out, `${phase}-${size.name}-pavilion-${number}.png`), animations: 'disabled' });
      await panel.screenshot({ path: path.join(out, `${phase}-${size.name}-pavilion-${number}-plant.png`), animations: 'disabled' });
      if (phase === 'after') {
        const firstModule = panel.locator('path[data-entity-id]').first();
        const entityId = await firstModule.getAttribute('data-entity-id');
        await firstModule.click();
        await map.getByRole('button', { name: /^Ampliar planta de/ }).click();
        assert.equal(await panel.getAttribute('data-map-fit'), 'false');
        await page.evaluate(entityId => window.__dashboardQa.updateCommercialStatus(entityId), entityId);
        await settle(page);
        assert.equal(await panel.getAttribute('data-map-fit'), 'false', 'Commercial refresh retains zoom');
        assert.equal(await panel.locator(`path[data-entity-id="${entityId}"]`).getAttribute('aria-pressed'), 'true', 'Commercial refresh retains selection');
        await map.getByRole('button', { name: /^Ajustar ao espaço:/ }).click();
        await settle(page);
        assert.equal(await panel.getAttribute('data-map-fit'), 'true');
      }
      const pixels = metric.numbers.map(item => item.pixels).sort((a, b) => a - b);
      console.log(`${phase}: ${size.name} P${number} ${metric.modules} modules, ${metric.width}×${metric.height}, labels min=${pixels[0].toFixed(1)} median=${pixels[Math.floor(pixels.length / 2)].toFixed(1)}px`);
    }
    if (phase === 'after') {
      const map = page.locator('[data-dashboard-pavilion] .commercial-dashboard-minimap');
      await map.getByRole('button', { name: /^Ampliar planta de/ }).click();
      await page.setViewportSize({ width: size.width - 30, height: size.height - 30 });
      await settle(page);
      assert.equal(await page.locator('[data-dashboard-pavilion] [data-map-fit]').getAttribute('data-map-fit'), 'true', 'Actual container resize fits current pavilion');
      await page.setViewportSize({ width: size.width, height: size.height });
      await settle(page);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(backendRequests, [], 'No backend operations in pavilion QA');
    fs.writeFileSync(path.join(out, `${phase}-${size.name}.json`), JSON.stringify({ size, phase, fixture: 'Official reference inventory; isolated local React harness; no session, backend operations or WebGL',
      metrics, checks: { fullFit: true, preservedAspectRatio: true, ...(phase === 'after' ? { zoom: true, commercialRefreshPreservesSelectionAndZoom: true, resizeFits: true } : {}) }, errors, backendRequests }, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(out, `${phase}-${size.name}-failure.png`), animations: 'disabled', timeout: 10000 }).catch(() => {});
    fs.writeFileSync(path.join(out, `${phase}-${size.name}-failure.json`), JSON.stringify({ message: error.message, errors,
      text: (await page.locator('body').innerText()).slice(0, 6000), stage: await page.evaluate(() => window.__dashboardQaStage ?? 'HTML only') }, null, 2));
    throw error;
  } finally { await context.close(); }
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const size of sizes.filter(size => !process.env.DASHBOARD_VIEWPORTS || process.env.DASHBOARD_VIEWPORTS.split(',').includes(size.name))) await run(browser, size);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
