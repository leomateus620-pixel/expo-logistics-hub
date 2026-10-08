// Real React/SVG in local Chromium; all Supabase requests are blocked.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { installQaFonts } = require('./presentation-fonts.cjs');
const base = process.env.DASHBOARD_BASE_URL || 'http://127.0.0.1:5196';
const phase = process.env.DASHBOARD_EVIDENCE_LABEL || 'after';
const out = path.resolve(process.env.DASHBOARD_EVIDENCE_DIR || 'docs/validation/dashboard-pavilion-inspection/evidence');
const html = fs.readFileSync(path.join(__dirname, 'presentation-qa.html'), 'utf8')
  .replace('__QA_ENTRY__', '/@fs/' + path.join(__dirname, 'pavilion-inspection-qa.tsx').replaceAll('\\', '/'));
const sizes = [{ name: 'desktop', width: 1920, height: 1080 }, { name: 'notebook', width: 1366, height: 768 }, { name: 'mobile', width: 390, height: 844 }];
const pavilions = [{ number: 1, id: 'B1' }, { number: 3, id: 'B6' }, { number: 5, id: 'B8' }, { number: 7, id: 'B10' },
  { number: 8, id: 'B4' }, { number: 12, id: 'B3' }, { number: 13, id: 'B5' }, { number: 14, id: 'B2' }];
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
fs.mkdirSync(out, { recursive: true });

async function crop(page, locator, file) {
  await page.addStyleTag({ content: '.commercial-dashboard-overview-header { visibility:hidden !important; }' }).then(async style => {
    try { await locator.screenshot({ path: path.join(out, file), animations: 'disabled' }); }
    finally { await style.evaluate(element => element.remove()); }
  });
}

async function geometryMetric(panel) {
  return panel.evaluate(element => {
    const svg = element.querySelector('svg'), matrix = svg.getScreenCTM(), vb = svg.viewBox.baseVal;
    const modules = [...svg.querySelectorAll('path[data-entity-id]')];
    const rects = modules.map(module => module.getBoundingClientRect());
    const svgRect = svg.getBoundingClientRect();
    const outline = svg.querySelector('path[data-outline="pavilion"]')?.getBoundingClientRect();
    const containedInViewport = [...svg.querySelectorAll('path[data-entity-id], path[data-outline], g[data-access-kind] rect')].every(shape => {
      const rect = shape.getBoundingClientRect();
      return rect.left >= svgRect.left - 1 && rect.right <= svgRect.right + 1 && rect.top >= svgRect.top - 1 && rect.bottom <= svgRect.bottom + 1;
    });
    const outsideOutline = outline ? modules.filter(module => {
      const rect = module.getBoundingClientRect();
      return rect.left < outline.left - 1 || rect.right > outline.right + 1 || rect.top < outline.top - 1 || rect.bottom > outline.bottom + 1;
    }).map(module => module.dataset.entityId) : [];
    const scale = Math.hypot(matrix.a, matrix.b);
    const labels = [...svg.querySelectorAll('.commercial-dashboard-module-number')].map(text => ({ label: text.textContent, pixels: parseFloat(getComputedStyle(text).fontSize) * scale }));
    const markers = [...svg.querySelectorAll('g[data-access-kind] rect')].map(marker => marker.getBoundingClientRect());
    const supportLabelCollisions = [...svg.querySelectorAll('.commercial-dashboard-support-label')].filter(label => {
      const rect = label.getBoundingClientRect();
      return markers.some(marker => rect.left < marker.right && rect.right > marker.left && rect.top < marker.bottom && rect.bottom > marker.top);
    }).map(label => label.textContent);
    const tools = element.closest('.commercial-dashboard-minimap').querySelector('.commercial-dashboard-map-tools').getBoundingClientRect();
    const panelRect = element.getBoundingClientRect();
    return { width: element.clientWidth, height: element.clientHeight, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight,
      preserveAspectRatio: svg.getAttribute('preserveAspectRatio'), viewBox: { x: vb.x, y: vb.y, width: vb.width, height: vb.height },
      containedInViewport, outsideOutline, toolsBelow: tools.top >= panelRect.bottom - 1, labels,
      moduleWidth: Math.max(...rects.map(rect => rect.right)) - Math.min(...rects.map(rect => rect.left)),
      moduleHeight: Math.max(...rects.map(rect => rect.bottom)) - Math.min(...rects.map(rect => rect.top)),
      identifiers: modules.map(module => module.dataset.entityId).sort(), paths: modules.map(module => [module.dataset.entityId, module.getAttribute('d')]),
      accesses: svg.querySelectorAll('[data-access-kind]').length, supports: svg.querySelectorAll('[data-outline="support"]').length, supportLabelCollisions,
    };
  });
}

async function stackedFlow(page, width) {
  if (width > 1100) return null;
  const bounds = await page.locator('.commercial-dashboard-integrated-analysis').evaluate(element => {
    const spatial=element.querySelector('.commercial-dashboard-spatial-card').getBoundingClientRect();
    const map=element.querySelector('.commercial-dashboard-minimap').getBoundingClientRect();
    const chart=element.querySelector('.commercial-dashboard-distribution').getBoundingClientRect();
    return {gap:chart.top-spatial.bottom,spatialHeight:spatial.height,mapHeight:map.height};
  });
  assert(bounds.gap >= 11,'Stacked chart stays below the complete plant after screenshots and metric changes');
  assert(bounds.spatialHeight >= bounds.mapHeight-1,'Spatial card contains the complete minimap');
  return bounds;
}

async function run(browser, size) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, hasTouch: size.name === 'mobile', isMobile: size.name === 'mobile', timezoneId: 'America/Sao_Paulo' });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [], backendRequests = [], metrics = [], checks = {};
  await installQaFonts(page);
  await page.route('**/__pavilion-inspection-qa', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.route('**/*.supabase.co/**', route => { backendRequests.push(route.request().url()); return route.abort(); });
  page.on('pageerror', error => errors.push(error.message));
  try {
    console.log(`${phase}: ${size.name} loading persisted-projection fixture`);
    await page.goto(base + '/__pavilion-inspection-qa', { waitUntil: 'commit', timeout: 90000 });
    await page.getByRole('heading', { name: 'Dashboard Comercial', exact: true }).waitFor({ timeout: 90000 });
    await page.waitForFunction(() => ['Manrope', 'Sora'].every(family => [...document.fonts].some(face => face.family.includes(family))));
    await page.evaluate(async () => { await Promise.all(['400','500','600','700'].flatMap(weight => ['Manrope','Sora'].map(family => document.fonts.load(`${weight} 16px "${family}"`)))); await document.fonts.ready; });
    await settle(page);
    if (process.env.DASHBOARD_INTERACTION_ONLY) {
      const interaction = await verifyInteraction(page,size);
      assert.deepEqual(errors,[]); assert.deepEqual(backendRequests,[]);
      fs.writeFileSync(path.join(out,`${phase}-${size.name}-interaction.json`),JSON.stringify({interaction,errors,backendRequests},null,2));
      return;
    }
    await page.screenshot({ path: path.join(out, `${phase}-${size.name}-overview.png`), animations: 'disabled' });
    const protectedLayout = await page.locator('.commercial-dashboard-overview-header, .commercial-dashboard-overview__finance, .commercial-dashboard-overview__kpis, .commercial-dashboard-overview-progress, .commercial-dashboard-overview__summary, .commercial-dashboard-scope-selector').evaluateAll(elements => elements.map(element => {
      const { x, y, width, height } = element.getBoundingClientRect(); return { className: element.className, x, y, width, height };
    }));
    for (const { number, id } of pavilions) {
      await page.getByRole('group', { name: 'Selecionar pavilhão' }).getByRole('button', { name: new RegExp(`^Pavilhão ${number} —`) }).click();
      const map = page.locator(`[data-dashboard-pavilion="${id}"] .commercial-dashboard-minimap`), panel = map.locator('.commercial-dashboard-map-scroll');
      await panel.locator('path[data-entity-id]').first().waitFor();
      await panel.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await settle(page);
      const metric = await geometryMetric(panel);
      const source = await page.evaluate(id => {
        const { data, snapshot } = window.__pavilionQa;
        const pavilion = snapshot.pavilions.find(item => item.definition.publicIdentifier === id);
        return { geometry: pavilion.records.map(({ entity, lot }) => [entity.id, lot.id, lot.lotNumber, entity.geometry]).sort((a,b) => a[0].localeCompare(b[0])),
          aggregate: { commercialLots:pavilion.commercialLots, totalLots:pavilion.totalLots, soldLots:pavilion.soldLots, saleOpenLots:pavilion.saleOpenLots, totalAreaSqm:pavilion.totalAreaSqm, soldAreaSqm:pavilion.soldAreaSqm },
          commercial: data.lots.filter(lot => pavilion.records.some(record => record.lot.id === lot.id)).map(lot => [lot.id,lot.status,lot.sales,lot.officialPricing2028,lot.currentBuyer]) };
      }, id);
      metric.geometryHash = hash(source.geometry); metric.commercialHash = hash(source.commercial); metric.aggregate = source.aggregate;
      assert(metric.containedInViewport, `P${number}: shapes fit viewport`);
      assert(metric.scrollWidth <= metric.width + 1 && metric.scrollHeight <= metric.height + 1, `P${number}: initial fit without scroll`);
      assert.equal(metric.preserveAspectRatio, 'xMidYMid meet');
      if (phase === 'after') {
        assert(metric.toolsBelow, `P${number}: controls below viewport`);
        assert.deepEqual(metric.outsideOutline, [], `P${number}: every cadastral module inside aligned hall`);
        assert.deepEqual(metric.supportLabelCollisions, [], `P${number}: support labels clear of access icons`);
        assert.equal(await map.locator('.commercial-dashboard-lot-detail').count(), 0);
        const before = JSON.parse(fs.readFileSync(path.join(out, `before-${size.name}.json`), 'utf8')).metrics.find(item => item.number === number);
        assert.equal(metric.geometryHash, before.geometryHash); assert.equal(metric.commercialHash, before.commercialHash);
        assert.deepEqual(metric.aggregate, before.aggregate); assert.deepEqual(metric.identifiers, before.identifiers);
        if (![8,13].includes(number)) assert.deepEqual(metric.paths, before.paths, `P${number}: unrelated SVG paths unchanged`);
      }
      await crop(page, panel, `${phase}-${size.name}-pavilion-${number}-plant.png`);
      await crop(page, page.locator('.commercial-dashboard-integrated-analysis'), `${phase}-${size.name}-pavilion-${number}-analysis.png`);
      const chart = page.locator('.commercial-dashboard-distribution');
      await page.getByRole('group', { name: 'Métrica de distribuição' }).getByRole('button', { name: 'Área oficial', exact: true }).click();
      await settle(page);
      await crop(page, chart, `${phase}-${size.name}-pavilion-${number}-area.png`);
      if (phase === 'after') {
        const areaFields = await page.evaluate(id => window.__pavilionQa.snapshot.pavilions
          .find(item => item.definition.publicIdentifier === id).records.slice(0,3)
          .map(record => [record.entity.id,record.lot.officialAreaSqm]),id);
        await page.evaluate(fields => window.__pavilionQa.updateAreas(Object.fromEntries(fields.map(([key],index) => [key,[3,6,9][index]]))),areaFields);
        await settle(page);
        assert(await chart.locator('.commercial-dashboard-donut').count() === 1,'Known official area renders its donut');
        await crop(page,chart,`${phase}-${size.name}-pavilion-${number}-area-known.png`);
        await page.evaluate(fields => window.__pavilionQa.updateAreas(Object.fromEntries(fields)),areaFields);
        await settle(page);
      }
      await page.getByRole('group', { name: 'Métrica de distribuição' }).getByRole('button', { name: 'Quantidade', exact: true }).click();
      await settle(page);
      if (phase === 'after') metric.stackedFlow = await stackedFlow(page,size.width);
      metrics.push({ number, ...metric });
      console.log(`${phase}: ${size.name} P${number}, modules=${metric.identifiers.length}, outside=${metric.outsideOutline.length}, labels=${Math.min(...metric.labels.map(item => item.pixels)).toFixed(1)}px`);
    }
    if (phase === 'after') checks.interaction = await verifyInteraction(page, size);
    const beforeFile = path.join(out, `before-${size.name}.json`);
    if (phase === 'after') assert.deepEqual(protectedLayout, JSON.parse(fs.readFileSync(beforeFile, 'utf8')).protectedLayout, 'Upper regions and selectors retain exact layout');
    assert.deepEqual(errors, []); assert.deepEqual(backendRequests, []);
    fs.writeFileSync(path.join(out, `${phase}-${size.name}.json`), JSON.stringify({ phase,size,fixture:'Local persisted-projection reproduction with test-only prices/identities; no authentication, Supabase, WebGL or production data', metrics, protectedLayout, checks, errors, backendRequests }, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(out, `${phase}-${size.name}-failure.png`), animations: 'disabled' }).catch(() => {});
    fs.writeFileSync(path.join(out, `${phase}-${size.name}-failure.json`), JSON.stringify({ message:error.message,errors,backendRequests,metrics }, null, 2));
    throw error;
  } finally { await context.close(); }
}

async function verifyInteraction(page, size) {
  const checks = {}, inspected = [];
  const visibleCard = map => map.locator('.commercial-dashboard-pavilion-context-anchor[aria-hidden="false"]');
  async function contained(map, reason) {
    const card = visibleCard(map);
    await card.waitFor({ state: 'visible' });
    await settle(page);
    const result = await map.evaluate(element => {
      const frame = element.querySelector('.commercial-dashboard-pavilion-frame'), card = element.querySelector('.commercial-dashboard-pavilion-context-anchor');
      const box = frame.getBoundingClientRect(), detail = card.getBoundingClientRect();
      const viewport = element.querySelector('.commercial-dashboard-map-scroll');
      return { inside: detail.left >= box.left - .5 && detail.right <= box.right + .5 && detail.top >= box.top - .5 && detail.bottom <= box.bottom + .5,
        bounds: { width:detail.width,height:detail.height }, placement:card.dataset.placement,
        width:viewport.clientWidth, scrollWidth:viewport.scrollWidth, text:card.innerText };
    });
    assert(result.inside, reason); return result;
  }
  for (const { number,id } of pavilions) {
    await page.getByRole('group', { name:'Selecionar pavilhão' }).getByRole('button', { name:new RegExp(`^Pavilhão ${number} —`) }).click();
    const map = page.locator(`[data-dashboard-pavilion="${id}"] .commercial-dashboard-minimap`);
    const panel = map.locator('.commercial-dashboard-map-scroll'), paths = panel.locator('path[data-entity-id]');
    await paths.first().waitFor(); await panel.scrollIntoViewIfNeeded(); await settle(page);
    const ids = await paths.evaluateAll(elements => elements.slice(0,3).map(element => element.dataset.entityId));
    await page.mouse.move(0,0);
    await paths.first().evaluate(element => element.focus({ preventScroll:true })); await settle(page);
    let result = await contained(map, `P${number}: keyboard preview contained`);
    assert.equal(await visibleCard(map).getAttribute('data-mode'),'preview');
    assert.equal(await map.getByRole('button', { name:'Ver no mapa',exact:true }).count(),0);
    assert(result.text.includes('Renovação') && result.text.includes('Segunda Etapa'));
    assert(/R\$\s*0,00/.test(result.text), 'Zero official price remains zero');
    await page.keyboard.press('Enter');
    await contained(map, `P${number}: selected card contained`);
    assert.equal(await visibleCard(map).getAttribute('data-mode'),'selected');
    assert.equal(await paths.first().getAttribute('aria-pressed'),'true');
    await page.keyboard.press('Escape'); await settle(page);
    assert.equal(await visibleCard(map).count(),0,'Escape does not immediately reopen the focused selected lot');
    assert.equal(await paths.first().getAttribute('aria-pressed'),'true','Escape preserves selection');
    assert.equal(await paths.first().evaluate(element => document.activeElement === element),true);
    assert.equal(await page.getByRole('heading',{name:'Dashboard Comercial',exact:true}).count(),1);
    if (size.name === 'mobile') {
      await paths.first().tap(); await settle(page);
      assert.equal(await visibleCard(map).getAttribute('data-mode'),'selected','A real emulated touch pins the module');
      await contained(map,`P${number}: touch detail contained`);
      await map.getByRole('button',{name:'Fechar dados do lote'}).tap(); await settle(page);
      assert.equal(await visibleCard(map).count(),0);
    }
    // Reopen from the actual accessible selector; moving controls below the map
    // must retain their selection behavior.
    await map.getByRole('combobox').selectOption(ids[1]); await panel.scrollIntoViewIfNeeded(); await settle(page);
    result = await contained(map, `P${number}: open-sale selected card contained`);
    assert(result.text.includes('Valor negociado do lote') && result.text.includes('Expositor de teste'));
    await crop(page,map.locator('.commercial-dashboard-pavilion-frame'),`${phase}-${size.name}-pavilion-${number}-selected.png`);
    await map.getByRole('button',{name:'Ver no mapa',exact:true}).click();
    assert.equal(await page.evaluate(() => window.__viewedLot),ids[1],'Existing callback receives the cadastral entity ID');
    if (size.name !== 'mobile') {
      const hoverId = await paths.evaluateAll(elements => elements.find(element => {
        const rect = element.getBoundingClientRect();
        return element.getAttribute('aria-pressed') !== 'true'
          && document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === element;
      })?.dataset.entityId);
      assert(hoverId,`P${number}: an unobscured module is available for real pointer interaction`);
      await panel.locator(`path[data-entity-id="${hoverId}"]`).hover(); await settle(page);
      assert.equal(await visibleCard(map).getAttribute('data-mode'),'preview','Hover temporarily previews another module');
      assert.equal(await paths.nth(1).getAttribute('aria-pressed'),'true');
      await page.mouse.move(0,0); await settle(page);
      assert.equal(await visibleCard(map).getAttribute('data-mode'),'selected','Leaving the map restores pinned details');
    }
    await map.getByRole('button',{name:'Fechar dados do lote'}).click(); await settle(page);
    assert.equal(await visibleCard(map).count(),0);
    assert.equal(await map.getByRole('combobox').inputValue(),ids[1]);
    // All four extremities: select real modules nearest each viewport corner.
    const corners = await paths.evaluateAll(elements => {
      const panel = elements[0].closest('.commercial-dashboard-map-scroll').getBoundingClientRect();
      return [[panel.left,panel.top],[panel.right,panel.top],[panel.left,panel.bottom],[panel.right,panel.bottom]].map(([x,y]) => elements.reduce((best,element) => {
        const r=element.getBoundingClientRect(), distance=Math.hypot((r.left+r.right)/2-x,(r.top+r.bottom)/2-y);
        return !best || distance<best.distance ? {id:element.dataset.entityId,distance}:best;
      },null).id);
    });
    for (const entityId of corners) {
      await map.getByRole('combobox').selectOption(entityId); await panel.scrollIntoViewIfNeeded(); await settle(page);
      await contained(map,`P${number}: edge detail remains inside viewport`);
    }
    await map.getByRole('button',{name:'Fechar dados do lote'}).click(); await settle(page);
    await map.getByRole('combobox').selectOption(ids[1]); await panel.scrollIntoViewIfNeeded(); await settle(page);
    await map.getByRole('button',{name:/^Ampliar planta de/}).click(); await settle(page);
    const scrollBefore = await panel.evaluate(element => ({width:element.scrollWidth,height:element.scrollHeight}));
    assert.equal(await panel.getAttribute('data-map-fit'),'false');
    await page.evaluate(entityId => window.__pavilionQa.updateStatus(entityId,'SOLD'),ids[1]); await settle(page);
    assert.equal(await panel.getAttribute('data-map-fit'),'false','Status refresh retains zoom');
    assert.equal(await paths.nth(1).getAttribute('aria-pressed'),'true','Status refresh retains selection');
    assert.deepEqual(await panel.evaluate(element => ({width:element.scrollWidth,height:element.scrollHeight})),scrollBefore,'Card does not change zoom scroll dimensions');
    await panel.evaluate(element => { element.scrollTop=element.scrollHeight; element.scrollLeft=element.scrollWidth; }); await settle(page);
    const cardAnchorVisible = await map.evaluate(element => {
      const card=element.querySelector('.commercial-dashboard-pavilion-context-anchor');
      return card?.getAttribute('aria-hidden') === 'false';
    });
    if (cardAnchorVisible) await contained(map,`P${number}: scrolled card clamped`);
    await map.getByRole('button',{name:/^Ajustar ao espaço:/}).click(); await panel.scrollIntoViewIfNeeded(); await settle(page);
    assert.equal(await panel.getAttribute('data-map-fit'),'true');
    await contained(map,`P${number}: fit restores anchored selection`);
    inspected.push(number);
  }
  // Status highlight still affects the real SVG, without removing inventory.
  const map = page.locator('[data-dashboard-pavilion] .commercial-dashboard-minimap');
  await map.getByRole('combobox').selectOption(''); await page.mouse.move(0,0); await settle(page);
  const chart = page.locator('.commercial-dashboard-distribution');
  const moduleCount = await map.locator('path[data-entity-id]').count();
  await chart.getByRole('button',{name:/^Vendido:/}).click(); await settle(page);
  assert.equal(await map.locator('path[data-entity-id]').count(),moduleCount);
  assert(await map.locator('path[data-status="AVAILABLE"][opacity="0.16"]').count()>0);
  await chart.getByRole('button',{name:/^Vendido:/}).click(); await page.mouse.move(0,0); await settle(page);
  assert.equal(await map.locator('path[data-entity-id][opacity="0.16"]').count(),0);
  assert.equal(await page.locator('.commercial-dashboard-scope-metrics > div > small').count(),0);
  assert.equal(await page.locator('[data-dashboard-pavilion] .commercial-dashboard-map-heading').count(),0);
  assert.equal(await page.locator('.commercial-dashboard-distribution .commercial-dashboard-donut-detail').count(),0);
  checks.pavilions = inspected;
  checks.input = size.name === 'mobile' ? 'Chromium touch emulation plus keyboard' : 'mouse plus keyboard';
  checks.card = {focusPreview:true,pinnedSelection:true,escapeRetainsSelectionAndFocus:true,allFourEdges:true,twoOfficialStages:true,zeroValue:true,buyer:true,existingMapCallback:true,zoom:true,scroll:true,refreshRetainsZoomAndSelection:true};
  checks.statusHighlight = true;
  for (const width of [320,390,768,1000,1366,1920]) {
    await page.setViewportSize({ width, height:size.height }); await settle(page);
    const overflow = await page.locator('.commercial-dashboard-overlay').evaluate(element => element.scrollWidth > element.clientWidth + 1);
    assert.equal(overflow, false, `No horizontal page overflow at ${width}px`);
    await stackedFlow(page,width);
  }
  await page.setViewportSize(size); await settle(page);
  checks.responsiveWidths = [320,390,768,1000,1366,1920];
  return checks;
}

(async () => {
  const browser = await chromium.launch({ channel:'chrome',headless:true });
  try { for (const size of sizes.filter(size => !process.env.DASHBOARD_VIEWPORTS || process.env.DASHBOARD_VIEWPORTS.split(',').includes(size.name))) await run(browser,size); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
