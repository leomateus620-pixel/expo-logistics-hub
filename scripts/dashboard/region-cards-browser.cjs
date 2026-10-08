// Isolated UI QA: the real Dashboard, official-reference inventory and intercepted
// existing read RPCs. Every other Supabase request is denied before networking.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { PNG } = require(require.resolve('pngjs', { paths: [process.env.PLAYWRIGHT_MODULE || __dirname] }));
const { installQaFonts } = require('./presentation-fonts.cjs');
const base = process.env.DASHBOARD_BASE_URL || 'http://127.0.0.1:5194';
const phase = process.env.DASHBOARD_EVIDENCE_LABEL || 'after';
const out = path.resolve(process.env.DASHBOARD_EVIDENCE_DIR || 'docs/validation/dashboard-region-cards/evidence');
const sizes = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'notebook', width: 1366, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
];
fs.mkdirSync(out, { recursive: true });
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function protectedRegion(page, name, selector) {
  const element = page.locator(selector);
  const bounds = await element.boundingBox();
  const png = await element.screenshot({ animations: 'disabled' });
  fs.writeFileSync(path.join(out, `${phase}-${name}-protected-${name === 'unused' ? '' : selector.includes('header') ? 'header' : selector.includes('finance') ? 'finance' : selector.includes('progress') ? 'progress' : 'kpis'}.png`), png);
  return { bounds, sha256: crypto.createHash('sha256').update(png).digest('hex') };
}

function compareProtected(before, after, size) {
  const results = {};
  for (const key of ['header', 'finance', 'progress', 'kpis']) {
    const previous = key === 'kpis' ? before[key] : [before[key]];
    const current = key === 'kpis' ? after[key] : [after[key]];
    results[key] = previous.map((reference, i) => {
      assert.deepEqual(current[i].bounds, reference.bounds, `${size.name} ${key}: exact protected layout`);
      const suffix = key === 'kpis' ? `kpi-${i + 1}` : key;
      const first = PNG.sync.read(fs.readFileSync(path.join(out, `before-${size.name}-protected-${suffix}.png`)));
      const second = PNG.sync.read(fs.readFileSync(path.join(out, `after-${size.name}-protected-${suffix}.png`)));
      assert.equal(second.width, first.width);
      assert.equal(second.height, first.height);
      let changedChannels = 0, maxChannelDelta = 0;
      for (let channel = 0; channel < first.data.length; channel++) {
        const delta = Math.abs(first.data[channel] - second.data[channel]);
        if (delta) changedChannels++;
        maxChannelDelta = Math.max(maxChannelDelta, delta);
      }
      // Chromium's gradient compositing can differ by two 8-bit color units.
      // Layout is exact; no changed channel may exceed that rendering tolerance.
      assert(maxChannelDelta <= 2, `${size.name} ${key}: protected pixels (maximum two color units)`);
      return { exactPng: current[i].sha256 === reference.sha256, changedChannels, maxChannelDelta };
    });
  }
  return results;
}

async function capture(page, size, calls, errors) {
  await page.locator('.commercial-dashboard-overlay').evaluate(element => { element.scrollTop = 0; });
  await page.mouse.move(0, 0);
  await settle(page);
  await page.screenshot({ path: path.join(out, `${phase}-${size.name}-overview.png`), animations: 'disabled' });
  const protectedRegions = {};
  for (const [key, selector] of [
    ['header', '.commercial-dashboard-overview-header'],
    ['finance', '.commercial-dashboard-overview__finance'],
    ['progress', '.commercial-dashboard-overview-progress'],
    ['kpis', '.commercial-dashboard-overview__kpis'],
  ]) {
    if (key !== 'kpis') protectedRegions[key] = await protectedRegion(page, size.name, selector);
    else {
      // The original fifth (area) KPI is intentionally in scope. Compare only
      // the four protected KPI children, with their original grid positions.
      const items = page.locator(selector + ' > article:not(.commercial-dashboard-overview-kpi--area)');
      protectedRegions.kpis = [];
      for (let i = 0; i < await items.count(); i++) {
        const item = items.nth(i), bounds = await item.boundingBox();
        const png = await item.screenshot({ animations: 'disabled' });
        fs.writeFileSync(path.join(out, `${phase}-${size.name}-protected-kpi-${i + 1}.png`), png);
        protectedRegions.kpis.push({ bounds, sha256: crypto.createHash('sha256').update(png).digest('hex') });
      }
    }
  }
  const region = page.locator(phase === 'before' ? '.commercial-dashboard-sales-entry' : '.commercial-dashboard-region-summary');
  // Region crops alone temporarily hide sticky headers so their pixels cannot
  // cover the card tops. Protected captures and all interactions use real UI.
  const cropStyle = await page.addStyleTag({ content: '.commercial-dashboard-overview-header,.commercial-map-module__bar{visibility:hidden!important}' });
  try {
    await region.screenshot({ path: path.join(out, `${phase}-${size.name}-summary.png`), animations: 'disabled' });
    if (phase === 'before') await page.locator('.commercial-dashboard-overview-kpi--area').screenshot({ path: path.join(out, `before-${size.name}-area.png`), animations: 'disabled' });
    await page.locator('.commercial-dashboard-scope-selector').screenshot({ path: path.join(out, `${phase}-${size.name}-selectors.png`), animations: 'disabled' });
  } finally { await cropStyle.evaluate(element => element.remove()); }
  const overflow = await page.locator('.commercial-dashboard-overlay').evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
  assert(overflow.scrollWidth <= overflow.width + 1, `${size.name}: no page overflow`);
  return { size, phase, protectedRegions, overflow, calls, errors };
}

const integer = value => new Intl.NumberFormat('pt-BR').format(value);
const percent = value => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value < 100 && value > 99.9 ? 99.9 : value) + '%';
const summaryValues = page => page.locator('.commercial-dashboard-sales-summary__value').allTextContents();
const expectedScope = (page, id) => page.evaluate(scopeId => {
  const snapshot = window.__regionQa.snapshot;
  const aggregate = scopeId === 'external:all' ? snapshot.external : scopeId.startsWith('external:')
    ? snapshot.segments.find(item => `external:${item.segmentId}` === scopeId)
    : snapshot.pavilions.find(item => `pavilion:${item.definition.publicIdentifier}` === scopeId);
  return { total: aggregate.totalLots, commercial: aggregate.commercialLots, open: aggregate.saleOpenLots, sold: aggregate.soldLots,
    title: aggregate.definition?.officialName ?? aggregate.segment?.name ?? 'Todas as áreas externas',
    entities: aggregate.records.map(record => record.entity.id).sort() };
}, id);

async function verifyScope(page, id, interaction = 'click') {
  const card = page.locator(`[data-scope-id="${id}"]`);
  const expected = await expectedScope(page, id);
  assert.equal((await card.locator('.commercial-dashboard-scope-card__quantity').textContent()).replace(/\s/g, ''), `${integer(expected.total)}${id.startsWith('pavilion:') ? 'lotes' : 'espaços'}`);
  assert.equal(await card.locator('.commercial-dashboard-scope-card__percentage').innerText(), expected.commercial
    ? percent((expected.open + expected.sold) / expected.commercial * 100) : '—');
  await card.locator('.commercial-dashboard-scope-card__select')[interaction]();
  await page.locator('.commercial-dashboard-scope-heading h2').filter({ hasText: expected.title }).waitFor();
  await page.locator(`.commercial-dashboard-minimap[aria-label="Mini mapa comercial: ${expected.title}"]`).waitFor();
  await settle(page);
  assert.equal(await card.getAttribute('data-selected'), 'true');
  assert.equal(await page.locator('.commercial-dashboard-scope-card[data-selected="true"]').count(), 1);
  const values = await page.locator('.commercial-dashboard-scope-metrics > div > strong').allTextContents();
  assert.equal(values[0], integer(expected.commercial));
  assert.equal(values[1], integer(expected.open));
  assert(values[2].startsWith(integer(expected.sold)));
  const distribution = page.locator(`.commercial-dashboard-distribution[aria-label="Distribuição de ${expected.title}"]`);
  await distribution.waitFor();
  assert.equal(await distribution.locator('.commercial-dashboard-status-list button').filter({ hasText: 'Venda em aberto' }).locator('strong').innerText(), integer(expected.open));
  assert.equal(await distribution.locator('.commercial-dashboard-status-list button').filter({ hasText: 'Vendido' }).locator('strong').innerText(), integer(expected.sold));
  const mapEntities = await page.locator('.commercial-dashboard-map-svg path[data-entity-id]').evaluateAll(paths => paths.map(item => item.dataset.entityId).sort());
  assert.deepEqual(mapEntities, [...new Set(expected.entities)].sort(), `${id}: map uses the same canonical records`);
  return { id, title: expected.title, totals: expected, mapEntities: mapEntities.length };
}

async function verifyInteraction(page, size, calls, control) {
  const checks = { filters: [], responsive: [] };
  const interaction = size.name === 'mobile' ? 'tap' : 'click';
  await page.locator('.commercial-dashboard-sales-summary[data-summary-state="ready"]').waitFor();
  assert.deepEqual(await summaryValues(page), ['41', '17', '9']);
  assert.equal(calls.filter(call => call.name === 'list_commercial_sale_orders').length, 3, 'summary only requests one existing page for each total');
  assert.deepEqual(calls.map(call => call.body.p_status).sort(), [null, 'PENDING', 'SIGNED'].sort());
  assert(calls.every(call => call.body.p_offset === 0 && call.body.p_limit === 20 && call.body.p_search === null && call.body.p_has_document === null));
  assert.equal(await page.locator('button button').count(), 0, 'no nested information buttons');
  const ids = await page.locator('.commercial-dashboard-scope-card').evaluateAll(cards => cards.map(card => card.dataset.scopeId));
  assert.equal(ids.length, 12);
  assert.equal(await page.getByRole('group', { name: 'Selecionar pavilhão' }).getByRole('button', { name: 'Todos', exact: true }).count(), 0);
  for (const id of ids) { console.log(`${size.name}: filter ${id}`); checks.filters.push(await verifyScope(page, id, interaction)); }
  const selected = await page.locator('.commercial-dashboard-scope-card[data-selected="true"]').getAttribute('data-scope-id');
  for (const id of ids) {
    const info = page.locator(`[data-scope-id="${id}"] .commercial-dashboard-overview-info-trigger`);
    await info[interaction]();
    await page.locator('.commercial-dashboard-overview-info__panel').waitFor();
    assert.equal(await page.locator('.commercial-dashboard-scope-card[data-selected="true"]').getAttribute('data-scope-id'), selected, 'details do not select a card');
    await page.keyboard.press('Escape');
    await page.locator('.commercial-dashboard-overview-info__panel').waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('heading', { name: 'Dashboard Comercial', exact: true }).count(), 1);
  }
  const first = page.locator('[data-scope-id="external:all"]');
  await first.locator('.commercial-dashboard-scope-card__select').focus();
  await page.keyboard.press('Enter');
  assert.equal(await first.getAttribute('data-selected'), 'true');
  await page.keyboard.press('Tab');
  await page.locator('.commercial-dashboard-overview-info__panel').waitFor();
  assert(await first.locator('.commercial-dashboard-overview-info-trigger').evaluate(element => document.activeElement === element));
  await page.keyboard.press('Escape');

  const lot = await page.evaluate(() => window.__regionQa.snapshot.external.records.find(record => record.officialAreaSqm !== null).lot.id);
  for (const status of ['SALE_OPEN', 'SOLD', 'AVAILABLE']) {
    await page.evaluate(({ lot, status }) => window.__regionQa.updateLot(lot, status), { lot, status });
    await settle(page);
    const expected = await page.evaluate(() => {
      const { overall } = window.__regionQa.snapshot;
      return { percentage: (overall.saleOpenAreaSqm + overall.soldAreaSqm) / overall.totalAreaSqm * 100,
        open: overall.saleOpenLots, sold: overall.soldLots };
    });
    assert.equal(await page.locator('.commercial-dashboard-area-card__percentage').innerText(), percent(expected.percentage));
    checks.filters.push({ mutation: status, ...(await verifyScope(page, 'external:all', interaction)) });
    if (status === 'SOLD') await page.locator('.commercial-dashboard-region-summary').screenshot({ path: path.join(out, `after-${size.name}-known-area-progress.png`), animations: 'disabled' });
  }

  for (const width of [320, 390, 768, 1000, 1366, 1920]) {
    await page.setViewportSize({ width, height: size.height });
    await settle(page);
    const metrics = await page.evaluate(() => {
      const overlay = document.querySelector('.commercial-dashboard-overlay');
      const bounds = element => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, right: rect.right, width: rect.width, height: rect.height }; };
      const regions = [...document.querySelectorAll('.commercial-dashboard-region-summary > *, .commercial-dashboard-scope-card')].map(bounds);
      const clipped = [...document.querySelectorAll('.commercial-dashboard-scope-card__name, .commercial-dashboard-scope-card__percentage, .commercial-dashboard-sales-summary__value, .commercial-dashboard-area-card__value')]
        .filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent);
      return { width: overlay.clientWidth, scrollWidth: overlay.scrollWidth, regions, clipped,
        area: bounds(document.querySelector('.commercial-dashboard-area-card')),
        openKpi: bounds(document.querySelector('.commercial-dashboard-overview-kpi--open')),
        externalColumns: getComputedStyle(document.querySelector('.commercial-dashboard-scope-grid--external')).gridTemplateColumns.split(' ').length,
        pavilionColumns: getComputedStyle(document.querySelector('.commercial-dashboard-scope-grid--pavilions')).gridTemplateColumns.split(' ').length };
    });
    assert(metrics.scrollWidth <= metrics.width + 1, `${width}: no horizontal page scrolling`);
    assert.deepEqual(metrics.clipped, [], `${width}: labels and values fit`);
    assert(metrics.regions.every(rect => rect.x >= -1 && rect.right <= width + 1 && rect.width > 0));
    if (width >= 1200) assert(Math.abs(metrics.area.right - metrics.openKpi.right) <= 1, 'area aligns with the second upper KPI column');
    checks.responsive.push({ viewport: width, ...metrics });
  }
  await page.setViewportSize({ width: size.width, height: size.height });
  await settle(page);

  await verifyScope(page, 'pavilion:B5', interaction);
  const selectedModule = page.locator('.commercial-dashboard-map-svg path[data-entity-id]').first();
  const selectedEntity = await selectedModule.getAttribute('data-entity-id');
  await selectedModule.click();
  assert.equal(await selectedModule.getAttribute('aria-pressed'), 'true');
  await page.getByRole('group', { name: 'Métrica de distribuição' }).getByRole('button', { name: 'Área oficial', exact: true }).click();

  const access = page.getByRole('button', { name: 'Acessar vendas e contratos' });
  await access.scrollIntoViewIfNeeded();
  const scroll = await page.locator('.commercial-dashboard-overlay').evaluate(element => element.scrollTop);
  await access.click();
  await page.locator('.cso-card').first().waitFor();
  assert.equal(await page.locator('.cso-card').count(), 20);
  assert((await page.getByRole('navigation', { name: 'Páginas de vendas' }).innerText()).includes('3'));
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.cso-list')?.getAttribute('aria-busy') === 'false');
  assert(calls.some(call => call.body?.p_offset === 20), 'list still paginates while the summary is global');
  await page.getByRole('button', { name: 'Voltar à visão geral', exact: true }).click();
  await access.waitFor();
  await settle(page);
  assert(await access.evaluate(element => document.activeElement === element), 'return restores entry focus');
  assert(Math.abs(await page.locator('.commercial-dashboard-overlay').evaluate(element => element.scrollTop) - scroll) <= 1, 'return restores overview scroll');
  assert.equal(await page.locator('[data-scope-id="pavilion:B5"]').getAttribute('data-selected'), 'true', 'return restores the selected pavilion');
  assert.equal(await page.locator(`.commercial-dashboard-map-svg path[data-entity-id="${selectedEntity}"]`).getAttribute('aria-pressed'), 'true', 'return restores selected map module');
  assert.equal(await page.getByRole('group', { name: 'Métrica de distribuição' }).getByRole('button', { name: 'Área oficial', exact: true }).getAttribute('aria-pressed'), 'true', 'return restores the selected chart metric');
  assert.deepEqual(await summaryValues(page), ['41', '17', '9']);

  control.delay = 150;
  control.totals = { total: 42, pending: 18, signed: 10 };
  await page.evaluate(() => { void window.__regionQa.invalidateSales(); });
  await page.locator('.commercial-dashboard-sales-summary[aria-busy="true"]').waitFor();
  assert.deepEqual(await summaryValues(page), ['41', '17', '9'], 'refresh retains previous same-context valid totals');
  await page.waitForFunction(() => [...document.querySelectorAll('.commercial-dashboard-sales-summary__value')].map(element => element.textContent).join(',') === '42,18,10');
  control.delay = 0;
  control.error = 'transient';
  await page.evaluate(() => { void window.__regionQa.invalidateSales(); });
  await page.locator('.commercial-dashboard-sales-summary[data-summary-state="stale"]').waitFor();
  assert.deepEqual(await summaryValues(page), ['42', '18', '10'], 'failed refresh keeps known totals with a stale status');
  await page.evaluate(() => window.__regionQa.changeContext({ projectId: 'qa-other-project' }));
  await page.locator('.commercial-dashboard-sales-summary[data-summary-state="unavailable"]').waitFor();
  assert.deepEqual(await summaryValues(page), ['—', '—', '—'], 'failed new project does not show another project or zero');
  control.error = null;
  await page.evaluate(() => { void window.__regionQa.invalidateSales(); });
  await page.locator('.commercial-dashboard-sales-summary[data-summary-state="ready"]').waitFor();
  const beforeDenied = calls.length;
  await page.evaluate(() => window.__regionQa.changeContext({ canManageSales: false }));
  await page.locator('.commercial-dashboard-sales-summary[data-summary-state="restricted"]').waitFor();
  assert.deepEqual(await summaryValues(page), ['—', '—', '—']);
  assert.equal(calls.length, beforeDenied, 'no summary reads without authorization');
  await page.evaluate(() => window.__regionQa.changeContext({ canManageSales: true }));
  await page.locator('.commercial-dashboard-sales-summary[data-summary-state="ready"]').waitFor();
  control.error = 'permission';
  await page.evaluate(() => { void window.__regionQa.invalidateSales(); });
  await page.locator('.commercial-dashboard-sales-summary[data-summary-state="restricted"]').waitFor();
  assert.deepEqual(await summaryValues(page), ['—', '—', '—'], 'RPC denied reading suppresses cached totals');
  control.error = null;
  checks.sales = { paginatedTotal: 41, firstPage: 20, pendingIncludesPartial: 17, signed: 9,
    refreshRetainsData: true, failedRefreshStale: true, failedNewProjectUnavailable: true, deniedReadSuppressesCachedData: true,
    unauthorizedNoReads: true, returnFocus: true, returnScroll: true, returnPavilion: true, returnModule: true, returnMetric: true };
  checks.info = { noNestedButtons: true, siblingInfoDoesNotSelect: true, keyboardFocus: true, enterSelects: true, escapeKeepsDashboard: true, input: interaction === 'tap' ? 'Chromium touch emulation' : 'mouse' };
  return checks;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const size of sizes.filter(item => !process.env.DASHBOARD_VIEWPORTS || process.env.DASHBOARD_VIEWPORTS.split(',').includes(item.name))) {
      console.log(`${phase}: ${size.name}`);
      const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1, isMobile: size.name === 'mobile', hasTouch: size.name === 'mobile' });
      page.setDefaultTimeout(60000);
      await installQaFonts(page);
      const calls = [], errors = [];
      const control = { totals: { total: 41, pending: 17, signed: 9 }, error: null, delay: 0 };
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*.supabase.co/**', async route => {
        const request = route.request(), name = request.url().split('/').pop();
        let body = null;
        try { body = request.postDataJSON(); } catch { /* non-JSON request */ }
        calls.push({ name, body, method: request.method() });
        const fixture = await page.evaluate(() => window.__salesQa);
        let response;
        if (name === 'list_commercial_sale_orders') {
          if (control.delay) await new Promise(resolve => setTimeout(resolve, control.delay));
          if (control.error) return route.fulfill({ status: control.error === 'permission' ? 403 : 503, contentType: 'application/json', body: JSON.stringify({ message: control.error === 'permission' ? 'MAP_PERMISSION_DENIED' : 'QA transient read failure' }) });
          const filter = body?.p_status;
          response = { rows: fixture.rows, total: filter === 'PENDING' ? control.totals.pending : filter === 'SIGNED' ? control.totals.signed : control.totals.total, documentsAccessible: true };
        } else if (name === 'get_commercial_sale_order_detail') response = fixture.detail;
        else if (name === 'get_sale_order_revisions') response = fixture.revisions;
        else return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'QA disallows backend writes and external data' }) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
      });
      try {
        await page.goto(base + `/scripts/dashboard/${phase === 'before' ? 'presentation-sales-qa' : 'region-cards-qa'}.html`, { waitUntil: 'commit', timeout: 90000 });
        await page.getByRole('button', { name: 'Acessar vendas e contratos' }).waitFor();
        console.log(`${size.name}: dashboard ready, waiting for fonts`);
        // The stylesheet is added by a React portal. Wait for its faces before
        // document.fonts.ready, which otherwise can resolve before registration.
        await page.waitForFunction(() => ['Manrope', 'Sora'].every(family => [...document.fonts].some(face => face.family.includes(family))));
        await page.evaluate(async () => {
          await Promise.all(['400', '500', '600', '700'].flatMap(weight => ['Manrope', 'Sora'].map(family => document.fonts.load(`${weight} 16px "${family}"`))));
          await document.fonts.ready;
        });
        console.log(`${size.name}: fonts ready`);
        if (phase === 'after') await page.locator('.commercial-dashboard-sales-summary[data-summary-state="ready"]').waitFor();
        await settle(page);
        const report = await capture(page, size, calls, errors);
        if (phase === 'after') {
          const beforePath = path.join(out, `before-${size.name}.json`);
          if (fs.existsSync(beforePath)) {
            const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
            report.protectedComparison = compareProtected(before.protectedRegions, report.protectedRegions, size);
            report.excludedUpperRegionsMatch = true;
          }
          report.checks = await verifyInteraction(page, size, calls, control);
        }
        fs.writeFileSync(path.join(out, `${phase}-${size.name}.json`), JSON.stringify(report, null, 2));
        assert.deepEqual(errors, []);
        assert(calls.every(call => ['list_commercial_sale_orders', 'get_commercial_sale_order_detail', 'get_sale_order_revisions'].includes(call.name)), 'only intercepted existing read RPCs were requested');
      } catch (error) {
        await page.screenshot({ path: path.join(out, `${phase}-${size.name}-failure.png`), animations: 'disabled' });
        fs.writeFileSync(path.join(out, `${phase}-${size.name}-failure.json`), JSON.stringify({ message: error.message, calls, errors }, null, 2));
        throw error;
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
