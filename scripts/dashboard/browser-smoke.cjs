const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const out = path.resolve(process.env.DASHBOARD_EVIDENCE_DIR || 'docs/validation/dashboard-integrated/evidence');
const base = process.env.DASHBOARD_BASE_URL || 'http://127.0.0.1:5189';
const sizes = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'notebook', width: 1366, height: 768 },
  { name: 'mobile', width: 390, height: 844, mobile: true },
  { name: 'compact-mobile', width: 320, height: 740, mobile: true },
];
const requestedSizes = process.env.DASHBOARD_VIEWPORTS?.split(',');
fs.mkdirSync(out, { recursive: true });

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function mapState(page) {
  return page.evaluate(async () => {
    const { useCommercialMapStore } = await import('/src/features/commercial-map/state/useCommercialMapStore.ts');
    const state = useCommercialMapStore.getState();
    return Object.fromEntries(['selectedEntityId', 'interiorEntityId', 'selectedModuleId', 'activeSegmentId',
      'cameraPreset', 'cameraSequence', 'interiorViewSequence'].map(key => [key, state[key]]));
  });
}
async function expectedScopes(page) {
  return page.evaluate(async () => {
    const [{ OFFICIAL_REFERENCE_DATA }, { presentCommercialMapData }, { buildCommercialDashboardSnapshot },
      { STATUS_CONFIG, COMMERCIAL_PHASES }, { toCommercialPhase }, formatters] = await Promise.all([
      import('/src/features/commercial-map/data/officialReference2026.ts'),
      import('/src/features/commercial-map/hooks/useCommercialMap.ts'),
      import('/src/features/commercial-map/dashboard/commercialDashboardAnalytics.ts'),
      import('/src/features/commercial-map/constants.ts'),
      import('/src/features/commercial-map/types.ts'),
      import('/src/features/commercial-map/dashboard/commercialDashboardFormatters.ts'),
    ]);
    const snapshot = buildCommercialDashboardSnapshot(presentCommercialMapData(OFFICIAL_REFERENCE_DATA));
    const summarize = aggregate => ({
      total: aggregate.totalLots, commercial: aggregate.commercialLots, saleOpen: aggregate.saleOpenLots,
      distinctSaleOpen: new Set(aggregate.records.filter(record => record.lot.status === 'SALE_OPEN').map(record => record.lot.id)).size,
      sold: aggregate.soldLots, unavailable: aggregate.unavailableLots,
      knownValueLots: aggregate.knownValueLots,
      saleOpenPricedLots: aggregate.byStatus.SALE_OPEN.pricedLotCount,
      saleOpenValueLabel: aggregate.byStatus.SALE_OPEN.pricedLotCount > 0
        ? formatters.formatDashboardCurrency(aggregate.saleOpenValue, true) : '—',
      totalValueLabel: aggregate.knownValueLots > 0
        ? formatters.formatDashboardCurrency(aggregate.totalKnownValue, true) : '—',
      areaLabel: formatters.formatDashboardAreaWithCoverage(aggregate.totalAreaSqm, aggregate.commercialLots,
        aggregate.lotsWithoutOfficialArea, aggregate.commercialLots),
      rows: [...COMMERCIAL_PHASES, ...(aggregate.unavailableLots ? ['UNAVAILABLE'] : [])].map(status => ({
        status, label: STATUS_CONFIG[status].label,
        count: aggregate.records.filter(record => status === 'UNAVAILABLE' ? record.lot.status === status
          : record.lot.status !== 'UNAVAILABLE' && toCommercialPhase(record.lot.status) === status).length,
      })),
    });
    return { overall: summarize(snapshot.overall), external: summarize(snapshot.external),
      internal: summarize(snapshot.internal), pending: summarize(snapshot.unclassified),
      segments: snapshot.segments.map(aggregate => ({ name: aggregate.segment.name, ...summarize(aggregate) })),
      pavilions: snapshot.pavilions.map(aggregate => ({ name: aggregate.definition.officialName,
        number: aggregate.definition.pavilionNumber, id: aggregate.definition.publicIdentifier, ...summarize(aggregate) })),
    };
  });
}
async function fitEvidence(map, title) {
  const viewport = map.locator('.commercial-dashboard-map-scroll');
  await viewport.locator('.commercial-dashboard-map-surface').waitFor();
  assert.equal(await viewport.getAttribute('data-map-fit'), 'true', title + ': initial fit');
  const result = await viewport.evaluate(element => {
    const svg = element.querySelector('svg');
    const bounds = svg?.getBBox();
    const viewBox = svg?.viewBox.baseVal;
    const rect = element.getBoundingClientRect();
    const svgRect = svg?.getBoundingClientRect();
    return { width: element.clientWidth, height: element.clientHeight, scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight, left: element.scrollLeft, top: element.scrollTop, zoom: element.dataset.mapFit,
      preserveAspectRatio: svg?.getAttribute('preserveAspectRatio'),
      content: bounds && { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      viewBox: viewBox && { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height },
      svgFitsViewport: !svgRect || (svgRect.left >= rect.left - 1 && svgRect.top >= rect.top - 1
        && svgRect.right <= rect.right + 1 && svgRect.bottom <= rect.bottom + 1),
      positioned: element.querySelectorAll('path[data-entity-id]').length,
      accesses: element.querySelectorAll('[data-access-kind]').length,
      numbers: element.querySelectorAll('.commercial-dashboard-module-number').length,
    };
  });
  assert(result.width > 0 && result.height > 0, title + ': sized viewport');
  assert(result.scrollWidth <= result.width + 1, title + ': no mandatory horizontal map scrolling');
  assert(result.scrollHeight <= result.height + 1, title + ': no mandatory vertical map scrolling');
  assert.equal(result.left, 0, title + ': scrollLeft reset');
  assert.equal(result.top, 0, title + ': scrollTop reset');
  assert(result.svgFitsViewport, title + ': SVG fits its panel');
  if (result.content) {
    assert.equal(result.preserveAspectRatio, 'xMidYMid meet');
    const box = result.viewBox;
    const content = result.content;
    assert(content.x >= box.x - 1 && content.y >= box.y - 1
      && content.x + content.width <= box.x + box.width + 1
      && content.y + content.height <= box.y + box.height + 1,
    title + ': lots, outlines, identifiers and access symbols contained in viewBox');
  }
  return result;
}
async function assertScope(page, title, expected) {
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  const map = page.getByRole('region', { name: 'Mini mapa comercial: ' + title, exact: true });
  const distribution = page.getByRole('complementary', { name: 'Distribuição de ' + title, exact: true });
  await distribution.getByRole('heading', { name: 'Distribuição comercial', exact: true }).waitFor();
  await settle(page);
  const metrics = page.getByLabel('Indicadores de ' + title, { exact: true });
  const values = await metrics.locator(':scope > div > strong').allTextContents();
  assert.equal(values[0], expected.commercial.toLocaleString('pt-BR'));
  assert.equal(values[1], expected.saleOpen.toLocaleString('pt-BR'));
  assert.equal(expected.saleOpen, expected.distinctSaleOpen, title + ': SALE_OPEN distinct lots');
  assert.equal(values[3], expected.areaLabel, title + ': official area');
  for (const row of expected.rows) {
    const button = distribution.getByRole('button', { name: new RegExp('^' + row.label + ':') });
    assert.equal(await button.locator('strong').textContent(), row.count.toLocaleString('pt-BR'), title + ': legend ' + row.status);
  }
  const evidence = await fitEvidence(map, title);
  assert.equal(await map.getByRole('combobox').locator('option').count() - 1, expected.total,
    title + ': all records remain selectable including invalid geometry');
  assert(evidence.positioned <= expected.total, title + ': map is subset of the same records');
  assert.equal(await page.locator('.commercial-dashboard-map-legend[aria-label="Legenda das situações comerciais"]').count(), 0,
    'one integrated commercial legend');
  return { map, distribution, evidence };
}
async function screenshot(page, prefix, name, map) {
  await page.mouse.move(0, 0);
  if (map) await map.scrollIntoViewIfNeeded();
  else await page.locator('.commercial-dashboard-overlay').evaluate(element => { element.scrollTop = 0; });
  await settle(page);
  await page.screenshot({ path: path.join(out, 'after-' + prefix + '-' + name + '.png') });
}
async function run(browser, size) {
  console.log('Testing ' + size.name + ' ' + size.width + 'x' + size.height);
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1,
    isMobile: Boolean(size.mobile), hasTouch: Boolean(size.mobile) });
  page.setDefaultTimeout(30000);
  const errors = [];
  const timings = [];
  page.on('pageerror', error => errors.push(error.message));
  // Existing DEV reference, still read-only. Only this browser response exposes
  // analytics, without altering production permissions or inventory sources.
  await page.route('**/src/features/commercial-map/CommercialMapPage.tsx*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    assert(source.includes('canViewMapAnalytics: false'));
    await route.fulfill({ response, body: source.replace('canViewMapAnalytics: false', 'canViewMapAnalytics: true') });
  });
  try {
    // A local antivirus request can delay DOMContentLoaded. Readiness below is
    // asserted through the application's actual controls and rendered dialog.
    await page.goto(base + '/__dev/commercial-map-interface', { waitUntil: 'commit', timeout: 90000 });
    const prompt = page.getByRole('button', { name: 'Agora não' });
    if (await prompt.isVisible().catch(() => false)) await prompt.click();
    const open = async () => {
      await page.getByRole('button', { name: 'Gestão', exact: true }).click({ timeout: 90000 });
      await page.getByRole('button', { name: 'Dashboard Comercial', exact: true }).click();
      await page.getByRole('dialog', { name: 'Dashboard Comercial', exact: true }).waitFor();
      await page.getByRole('heading', { name: 'Todas as áreas externas', exact: true }).waitFor();
      await settle(page);
    };
    await page.getByRole('button', { name: 'Gestão', exact: true }).waitFor({ timeout: 90000 });
    await page.waitForFunction(() => {
      const value = document.querySelector('canvas')?.dataset.commercialMapRenderHealth;
      return value && JSON.parse(value).status === 'ready';
    }, undefined, { timeout: 90000 });
    const initialState = await mapState(page);
    await page.evaluate(() => { window.__dashboardCanvasBefore = document.querySelector('canvas'); });
    await open();
    const expected = await expectedScopes(page);
    assert.equal(expected.overall.saleOpen, expected.overall.distinctSaleOpen);
    const kpis = await page.getByRole('region', { name: 'Indicadores comerciais principais', exact: true }).locator('.commercial-dashboard-kpi > strong').allTextContents();
    assert.equal(kpis.length, 5);
    assert.equal(kpis[1], expected.overall.saleOpen.toLocaleString('pt-BR'));
    const financial = page.getByRole('region', { name: 'Valores cadastrais globais', exact: true });
    const values = await financial.locator('.commercial-dashboard-kpi > strong').allTextContents();
    assert.equal(values.length, 2);
    assert.equal(values[0], expected.overall.saleOpenValueLabel, 'global existing SALE_OPEN cadastral subtotal');
    assert.equal(values[1], expected.overall.totalValueLabel, 'global existing cadastral sum, unavailable excluded');
    assert.equal(await financial.getByText('Valor cadastral · não é receita recebida', { exact: true }).count(), 2);
    assert.equal(await page.locator('.commercial-dashboard-value-chart').count(), 0);
    assert(!/Valor comercial conhecido|Valor comercial dos lotes vendidos|Distribuição do valor comercial|Potencial comercial pendente/.test(await page.getByRole('dialog').innerText()));
    assert.equal(await page.locator('.commercial-dashboard-close').evaluate(button => document.activeElement === button), true, 'initial focus on close');
    let current = await assertScope(page, 'Todas as áreas externas', expected.external);
    timings.push({ scope: 'Todas as áreas externas', ...current.evidence });
    await screenshot(page, size.name, 'overview');
    const firstScreen = await page.evaluate(() => {
      const map = document.querySelector('.commercial-dashboard-map-scroll').getBoundingClientRect();
      const distribution = document.querySelector('.commercial-dashboard-distribution').getBoundingClientRect();
      return { mapTop: map.top, mapHeight: map.height, mapBottom: map.bottom,
        distributionTop: distribution.top, distributionBottom: distribution.bottom, height: innerHeight };
    });
    for (const segment of expected.segments) {
      const start = Date.now();
      await page.getByRole('group', { name: 'Selecionar área externa' }).getByRole('button', { name: new RegExp(segment.name) }).click();
      current = await assertScope(page, segment.name, segment);
      assert(await current.map.locator('path[data-outline="segment"]').count());
      assert(await current.map.locator('path[data-outline="block"]').count());
      timings.push({ scope: segment.name, ms: Date.now() - start, ...current.evidence });
      if (segment.name !== 'Exporural') await screenshot(page, size.name,
        segment.name.startsWith('Indústria') ? 'industry' : 'automotive', current.map);
      if (segment.name === 'Exporural') {
        await screenshot(page, size.name, 'exporural', current.map);
        const countBefore = await current.map.locator('path[data-entity-id]').count();
        const metricBefore = await page.locator('.commercial-dashboard-scope-metrics').innerText();
        const status = current.distribution.getByRole('button', { name: /^Vendido:/ });
        await status.click();
        await page.mouse.move(0, 0);
        await settle(page);
        assert.equal(await status.getAttribute('aria-pressed'), 'true');
        assert.equal(await current.map.locator('path[data-entity-id]').count(), countBefore, 'highlight retains every lot');
        assert.equal(await page.locator('.commercial-dashboard-scope-metrics').innerText(), metricBefore, 'highlight preserves totals');
        assert(await current.map.locator('path[data-entity-id][opacity="0.16"]').count() > 0, 'legend dims map statuses');
        await status.click();
        await page.mouse.move(0, 0);
        await current.map.getByRole('button', { name: 'Ampliar planta de ' + segment.name, exact: true }).click();
        await settle(page);
        assert.equal(await current.map.locator('[data-map-fit]').getAttribute('data-map-fit'), 'false');
        await current.map.locator('[data-map-fit]').evaluate(element => { element.scrollLeft = 100; element.scrollTop = 40; });
        await current.map.getByRole('button', { name: 'Ajustar ao espaço: ' + segment.name, exact: true }).click();
        await settle(page);
        await fitEvidence(current.map, segment.name + ' reset');
        await current.distribution.getByRole('button', { name: 'Área oficial', exact: true }).click();
        assert.equal(await current.distribution.getByRole('button', { name: 'Área oficial', exact: true }).getAttribute('aria-pressed'), 'true');
        await current.distribution.getByRole('button', { name: 'Quantidade', exact: true }).click();
        // Leave inspection zoom active to verify reset on the following scope.
        await current.map.getByRole('button', { name: 'Ampliar planta de ' + segment.name, exact: true }).click();
      }
    }
    for (const pavilion of expected.pavilions) {
      const start = Date.now();
      await page.getByRole('group', { name: 'Selecionar pavilhão' }).getByRole('button', { name: pavilion.name, exact: true }).click();
      current = await assertScope(page, pavilion.name, pavilion);
      assert.equal(await page.locator('[data-dashboard-pavilion]').count(), 1);
      assert.equal(await page.locator('[data-dashboard-pavilion]').getAttribute('data-dashboard-pavilion'), pavilion.id);
      assert(current.evidence.accesses > 0, pavilion.name + ': official access markers');
      assert(current.evidence.numbers > 0, pavilion.name + ': persisted module numbers');
      const module = current.map.locator('path[data-entity-id]').first();
      await module.focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      assert.equal(await current.map.locator('path[aria-pressed="true"]').count(), 1, pavilion.name + ': keyboard selection');
      timings.push({ scope: pavilion.name, ms: Date.now() - start, ...current.evidence });
      if ([1, 13, 14].includes(pavilion.number)) await screenshot(page, size.name, 'pavilion-' + pavilion.number, size.mobile ? current.map : undefined);
    }
    await page.getByRole('group', { name: 'Selecionar pavilhão' }).getByRole('button', { name: 'Todos', exact: true }).click();
    current = await assertScope(page, 'Todos os pavilhões', expected.internal);
    timings.push({ scope: 'Todos os pavilhões', ...current.evidence });
    assert.equal(await page.locator('[data-dashboard-pavilion]').count(), 0, 'consolidated internal scope uses the shared overview map');
    const pavilion13 = expected.pavilions.find(pavilion => pavilion.number === 13);
    await page.getByRole('group', { name: 'Selecionar pavilhão' }).getByRole('button', { name: pavilion13.name, exact: true }).click();
    current = await assertScope(page, pavilion13.name, pavilion13);
    await current.map.getByRole('button', { name: 'Ampliar planta de ' + pavilion13.name, exact: true }).click();
    await settle(page);
    assert.equal(await current.map.locator('[data-map-fit]').getAttribute('data-map-fit'), 'false');
    await page.setViewportSize({ width: size.width - 10, height: size.height - 10 });
    await settle(page);
    await fitEvidence(current.map, pavilion13.name + ' resize');
    await page.setViewportSize({ width: size.width, height: size.height });
    await settle(page);
    if (expected.pending.total) {
      await page.getByRole('button', { name: /^Classificação pendente / }).click();
      await assertScope(page, 'Classificação pendente', expected.pending);
    }
    const layout = await page.locator('.commercial-dashboard-overlay').evaluate(element => ({
      width: element.clientWidth, scrollWidth: element.scrollWidth,
      sameCanvas: document.querySelector('canvas') === window.__dashboardCanvasBefore,
      canvases: document.querySelectorAll('canvas').length,
      pavilionButtons: [...element.querySelectorAll('.commercial-dashboard-pavilion-selectors button')].map(button => ({
        width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height,
      })), health: document.querySelector('canvas')?.dataset.commercialMapRenderHealth || null,
    }));
    assert(layout.scrollWidth <= layout.width + 1, 'no horizontal dashboard overflow');
    assert(layout.sameCanvas);
    assert.equal(layout.canvases, 1);
    assert(layout.pavilionButtons.every(button => button.width >= 44 && button.height >= 44));
    assert.deepEqual(await mapState(page), initialState, 'presentation changes preserve map selection and camera commands');
    await page.keyboard.press('Escape');
    await settle(page);
    assert.equal(await page.getByRole('dialog', { name: 'Dashboard Comercial' }).count(), 0);
    assert.deepEqual(await mapState(page), initialState, 'Escape preserves map selection and camera commands');
    assert.equal(await page.getByRole('button', { name: 'Gestão', exact: true }).evaluate(button => document.activeElement === button), true, 'Escape restores management focus');
    await open();
    await assertScope(page, 'Todas as áreas externas', expected.external);
    await page.getByRole('button', { name: 'Fechar Dashboard Comercial', exact: true }).click();
    await settle(page);
    assert.deepEqual(await mapState(page), initialState, 'close preserves map selection and camera commands');
    assert.equal(await page.getByRole('button', { name: 'Gestão', exact: true }).evaluate(button => document.activeElement === button), true, 'close restores management focus');
    // Exercise the page's existing navigation callback for external and B5
    // selections, after testing ordinary closure without camera changes.
    await open();
    current = await assertScope(page, 'Todas as áreas externas', expected.external);
    const lotId = await current.map.locator('path[data-entity-id]').first().getAttribute('data-entity-id');
    await current.map.getByRole('combobox').selectOption(lotId);
    await current.map.getByRole('button', { name: 'Ver no mapa' }).click();
    await settle(page);
    assert.equal(await page.getByRole('dialog', { name: 'Dashboard Comercial' }).count(), 0);
    assert.equal((await mapState(page)).selectedEntityId, lotId);
    await open();
    await page.getByRole('group', { name: 'Selecionar pavilhão' }).getByRole('button', { name: pavilion13.name, exact: true }).click();
    current = await assertScope(page, pavilion13.name, pavilion13);
    const moduleId = await current.map.locator('path[data-entity-id]').first().getAttribute('data-entity-id');
    await current.map.getByRole('combobox').selectOption(moduleId);
    await current.map.getByRole('button', { name: 'Ver no mapa' }).click();
    await settle(page);
    assert.equal(await page.getByRole('dialog', { name: 'Dashboard Comercial' }).count(), 0);
    const originalCallback = await page.evaluate(async id => {
      const { OFFICIAL_REFERENCE_DATA } = await import('/src/features/commercial-map/data/officialReference2026.ts');
      const entity = OFFICIAL_REFERENCE_DATA.entities.find(entity => entity.id === id);
      return { parent: entity.parentEntityId, module: entity.metadata.pavilionModuleKey };
    }, moduleId);
    const selection = await mapState(page);
    assert.equal(selection.selectedEntityId, originalCallback.parent);
    assert.equal(selection.interiorEntityId, originalCallback.parent);
    assert.equal(selection.selectedModuleId, originalCallback.module);
    assert.deepEqual(errors, []);
    const result = { viewport: size, fixture: 'OFFICIAL_REFERENCE_DATA through presentCommercialMapData, analytics enabled only in test browser response',
      expected, timings, firstScreen, layout, errors, url: page.url(),
      checks: ['distinct SALE_OPEN lots', 'same-scope map/metrics/chart/legend', 'official area', 'all eight pavilions including B5',
        'viewBox content and access symbols', 'no mandatory map scrolling', 'zoom/reset/scope-change/resize',
        'quantity/area metric', 'highlight keeps lots and totals', 'keyboard selection',
        'same Canvas', 'Escape and close restore focus', 'map camera and selection preserved', 'original Ver no mapa callback'] };
    fs.writeFileSync(path.join(out, size.name + '-browser.json'), JSON.stringify(result, null, 2));
    console.log('Passed ' + size.name + ': ' + timings.length + ' spatial scopes, fit/zoom/reset/resize/highlight/close');
  } catch (error) {
    await page.screenshot({ path: path.join(out, size.name + '-failure.png') }).catch(() => {});
    fs.writeFileSync(path.join(out, size.name + '-failure.json'), JSON.stringify({ errors, message: error.message,
      body: (await page.locator('body').innerText()).slice(0, 12000) }, null, 2));
    throw error;
  } finally { await page.close(); }
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11'] });
  try {
    for (const size of sizes.filter(size => !requestedSizes || requestedSizes.includes(size.name))) await run(browser, size);
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    // No analytics interception on this page: existing read-only permission
    // must keep the dashboard unavailable even with the same reference data.
    await page.goto(base + '/__dev/commercial-map-interface?webgl=unavailable', { waitUntil: 'commit', timeout: 90000 });
    await page.locator('.commercial-map-shell').waitFor({ timeout: 90000 });
    await settle(page);
    assert.equal(await page.getByRole('button', { name: 'Dashboard Comercial', exact: true }).count(), 0);
    assert.equal(await page.getByRole('dialog', { name: 'Dashboard Comercial' }).count(), 0);
    fs.writeFileSync(path.join(out, 'permissions-browser.json'), JSON.stringify({ fixture: 'existing read-only DEV permissions, no analytics interception',
      canViewMapAnalytics: false, dashboardButtons: 0, dashboardDialogs: 0 }, null, 2));
    await page.close();
  }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
