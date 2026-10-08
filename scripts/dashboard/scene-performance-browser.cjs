const fs = require('node:fs');
const path = require('node:path');
// Read-only, local integrated fixture; intercepted backend requests never run.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SCENE_BASE_URL || 'http://127.0.0.1:5195';
const out = process.env.SCENE_OUTPUT || 'docs/validation/dashboard-interaction-performance/scene';
const label = process.env.SCENE_LABEL || 'baseline';
const duration = Number(process.env.SCENE_INTERVAL_MS || 10000);
fs.mkdirSync(out, { recursive: true });
const save = (name, value) => fs.writeFileSync(path.join(out, `${label}-${name}.json`), JSON.stringify(value, null, 2));
const percentile = (values, ratio) => [...values].sort((a,b)=>a-b)[Math.min(values.length-1, Math.ceil(values.length*ratio)-1)] ?? null;
async function dashboardSweep(page) {
  const records = [];
  async function interact(name, locator, predicate, event = 'click') {
    await locator.scrollIntoViewIfNeeded();
    await page.evaluate(({ name, predicate, event }) => {
      window.__sceneProbe.pending = { name, event, predicate: new Function('return ' + predicate),
        renderStart: window.__dashPerf.renders.length, geometryStart: window.__dashPerf.geometry.length };
    }, { name, predicate, event });
    if (event === 'mouseover') await locator.hover(); else if (event === 'focusin') await locator.focus(); else await locator.click();
    await page.waitForFunction(() => window.__sceneProbe.pending?.complete, null, { timeout: 30000 });
    records.push(await page.evaluate(() => {
      const pending = window.__sceneProbe.pending;
      const result = { name: pending.name, start: pending.start, inputDelay: pending.start - pending.eventStart,
        feedback: pending.feedback, consistent: pending.consistent,
        renders: window.__dashPerf.renders.slice(pending.renderStart), geometry: window.__dashPerf.geometry.slice(pending.geometryStart) };
      window.__sceneProbe.pending = null; return result;
    }));
    save('integrated-interactions-progress', { records });
  }
  const scope = text => `document.querySelector('.commercial-dashboard-scope-heading h2')?.textContent===${JSON.stringify(text)}`;
  const external = page.getByRole('group', { name: 'Selecionar área externa' });
  const pavilions = page.getByRole('group', { name: 'Selecionar pavilhão' });
  for (let repetition = 0; repetition < 3; repetition++) {
    for (let index = 1; index < await external.getByRole('button').count(); index++) {
      const button = external.getByRole('button').nth(index);
      const text = await button.evaluate(element => [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim());
      await interact('external', button, scope(text));
    }
    for (const number of [1,3,5,7,8,12,13,14]) {
      const button = pavilions.getByRole('button', { name: new RegExp(`^Pavilhão ${number} —`) });
      await interact('pavilion', button, `document.querySelector('[data-dashboard-pavilion] .commercial-dashboard-map-heading strong')?.textContent===${JSON.stringify(await button.getAttribute('aria-label'))}`);
      await page.locator('[data-dashboard-pavilion] path[data-entity-id]').first().waitFor();
    }
    const paths = page.locator('[data-dashboard-pavilion] path[data-entity-id]');
    // Selection intentionally owns the active outline over hover. Exercise all
    // transient states first so the hover predicate describes the actual UI.
    for (let index = 0; index < 3; index++) {
      const target = paths.nth(index), id = await target.getAttribute('data-entity-id');
      await interact('hover', target, `document.querySelector('[data-entity-id="${id}"]')?.getAttribute('stroke-width')==='3.5'`, 'mouseover');
    }
    for (let index = 0; index < 3; index++) {
      const target = paths.nth(index), id = await target.getAttribute('data-entity-id');
      await interact('focus', target, `document.activeElement?.getAttribute('data-entity-id')===${JSON.stringify(id)}`, 'focusin');
    }
    for (let index = 0; index < 3; index++) {
      const target = paths.nth(index), id = await target.getAttribute('data-entity-id');
      await interact('selection', target, `document.querySelector('[data-entity-id="${id}"]')?.getAttribute('aria-pressed')==='true'`);
    }
    for (const metric of ['Área oficial','Quantidade']) await interact('metric', page.getByRole('button', { name: metric, exact: true }),
      `[...document.querySelectorAll('[aria-label="Métrica de distribuição"] button')].some(button=>button.textContent===${JSON.stringify(metric)}&&button.getAttribute('aria-pressed')==='true')`);
    for (let index = 0; index < 2; index++) await interact('status-highlight', page.locator('.commercial-dashboard-status-list button').nth(index),
      `document.querySelectorAll('.commercial-dashboard-status-list button')[${index}]?.getAttribute('aria-pressed')==='true'`);
    for (const stage of ['2ª Etapa','Renovação','2ª Etapa','Renovação']) {
      await interact('price-stage', page.getByRole('button', { name: stage, exact: true }),
        `[...document.querySelectorAll('[aria-label="Etapa dos preços oficiais"] button')].some(button=>button.textContent===${JSON.stringify(stage)}&&button.getAttribute('aria-pressed')==='true')`);
    }
    await interact('close', page.getByRole('button', { name: 'Fechar Dashboard Comercial' }), `!document.querySelector('#commercial-dashboard-overlay')`);
    await interact('reopen', page.locator('[data-commercial-dashboard-trigger]'), `!!document.querySelector('.commercial-dashboard-workspace')`);
  }
  const summary = Object.fromEntries([...new Set(records.map(row => row.name))].map(name => {
    const rows = records.filter(row => row.name === name);
    return [name, Object.fromEntries(['inputDelay','feedback','consistent'].map(key => [key,
      { n: rows.length, median: percentile(rows.map(row => row[key]), .5), p95: percentile(rows.map(row => row[key]), .95), worst: Math.max(...rows.map(row => row[key])) }]))];
  }));
  save('integrated-interactions', { repetitions: 3, records, summary,
    limitation: 'Official read-only fixture: no authenticated sales/contract operations or refetch mutations.' });
  console.log(JSON.stringify({ integratedInteractions: summary }));
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    const diagnostics = window.__commercialMapRuntimeDiagnostics;
    let gpu = null;
    if (canvas) {
      const gl = canvas.getContext('webgl2');
      if (gl) { const debug = gl.getExtension('WEBGL_debug_renderer_info'); gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); }
    }
    const { readLatestCommercialMapRenderHealth } = await import('/src/features/commercial-map/utils/renderingHealth.ts');
    const state = (await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore.getState();
    const keys = ['commercialMapReady', 'commercialMapEssentialReady', 'commercialMapHydration',
      'commercialMapPreparing', 'commercialMapRenderHealth', 'commercialMapQuality',
      'commercialMapPostBudget', 'commercialMapCameraDiagnostics', 'commercialMapInventoryCounts',
      'commercialMapPresentationVisible'];
    return { at: performance.now(), navigationStart: performance.timeOrigin, url: location.href,
      dataset: canvas ? Object.fromEntries(keys.map(key => [key, canvas.dataset[key] ?? null])) : null,
      health: readLatestCommercialMapRenderHealth(canvas), renderer: diagnostics?.capture(),
      identity: diagnostics ? { mounts: diagnostics.canvasMounts, rendererCreates: diagnostics.rendererCreates,
        controlsCreates: diagnostics.controlsCreates, rendererIds: diagnostics.rendererIds,
        sceneIds: diagnostics.sceneIds, cameraIds: diagnostics.cameraIds,
        contextLost: diagnostics.contextLost, contextRestored: diagnostics.contextRestored } : null,
      boot: window.__commercialMapPerformance, gpu, userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory,
      dpr: devicePixelRatio, viewport: [innerWidth, innerHeight], visibility: document.visibilityState,
      dashboardOpen: Boolean(document.querySelector('#commercial-dashboard-overlay')),
      selection: { entityId: state.selectedEntityId, moduleId: state.selectedModuleId, interiorId: state.interiorEntityId,
        segmentId: state.activeSegmentId, workspace: state.workspaceMode, rain: state.rainModeActive, night: state.nightModeActive },
      loader: document.querySelector('[data-map-boot]')?.textContent,
      longTasks: window.__sceneProbe?.longTasks ?? [],
    };
  });
}
async function interval(page, name) {
  const before = await snapshot(page);
  await page.waitForTimeout(duration);
  const after = await snapshot(page);
  if (after.navigationStart !== before.navigationStart || !after.health || !before.health) {
    save(`${name}-invalid`, { name, reason: 'Navigation or lost readiness invalidates the measured interval', before, after });
    throw new Error(`Invalid ${name} interval: navigation/readiness changed`);
  }
  const result = { name, elapsedMs: after.at - before.at,
    presentedFramesDelta: after.health && before.health ? after.health.presentedFrames - before.health.presentedFrames : null,
    longTasks: after.longTasks.filter(task => task.startTime >= before.at), before, after };
  save(name, result);
  console.log(JSON.stringify({ name, elapsedMs: result.elapsedMs, presentedFramesDelta: result.presentedFramesDelta, longTasks: result.longTasks.length,
    health: after.health, resources: after.renderer, identity: after.identity }));
  return result;
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11'] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1,
    timezoneId: 'America/Sao_Paulo' });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [], failedRequests = [], navigationEvents = [], consoleEvents = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigationEvents.push({ at: Date.now(), url: frame.url() }); });
  page.on('console', message => { if (message.type() === 'error' || message.text().includes('[vite]')) consoleEvents.push({ type: message.type(), text: message.text() }); });
  await page.route('**/rest/v1/**', route => route.abort());
  await page.route('**/auth/v1/**', route => route.abort());
  await page.addInitScript(() => {
    window.__sceneProbe = { longTasks: [] };
    window.__dashPerf = { renders: [], geometry: [] };
    const begin = event => {
      const pending = window.__sceneProbe.pending;
      if (!pending || pending.event !== event.type || pending.start !== undefined) return;
      pending.start = performance.now(); pending.eventStart = event.timeStamp;
      requestAnimationFrame(() => requestAnimationFrame(() => { pending.feedback = performance.now() - pending.start; }));
      const check = () => { if (pending.predicate()) requestAnimationFrame(() => {
        pending.consistent = performance.now() - pending.start; pending.complete = true;
      }); else requestAnimationFrame(check); }; requestAnimationFrame(check);
    };
    for (const event of ['click','mouseover','focusin']) document.addEventListener(event, begin, true);
    try { new PerformanceObserver(list => {
      window.__sceneProbe.longTasks.push(...list.getEntries().map(entry => ({ startTime: entry.startTime, duration: entry.duration })));
      if (window.__sceneProbe.longTasks.length > 500) window.__sceneProbe.longTasks.splice(0, window.__sceneProbe.longTasks.length - 500);
    }).observe({ type: 'longtask', buffered: true }); } catch {}
  });
  try {
    await page.goto(base + '/__dev/commercial-map-interface?qualityQa=HIGH', { waitUntil: 'domcontentloaded', timeout: 120000 });
    let ready = false;
    let navigationStart = null;
    let navigationAttempts = 0;
    let reloads = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      await page.waitForTimeout(15000);
      const row = await snapshot(page);
      if (navigationStart !== row.navigationStart) {
        if (navigationStart !== null) reloads += 1;
        navigationStart = row.navigationStart;
        navigationAttempts = 0;
      }
      navigationAttempts += 1;
      save('boot-progress', { ...row, errors, failedRequests });
      console.log(JSON.stringify({ bootAt: row.at, health: row.health, hydration: row.dataset?.commercialMapHydration,
        lastStage: row.boot?.events?.at(-1), errors: errors.slice(-2) }));
      if (row.dataset?.commercialMapReady === 'true' && row.health?.status === 'ready'
        && row.health.path === 'post' && row.boot?.events?.some(stage => stage.name === 'critical-post:end')) { ready = true; break; }
      if (navigationAttempts >= 12) break;
    }
    save('startup', { ready, reloads,
      readinessGate: 'commercialMapReady=true, healthy post path, critical-post:end; full hydration may remain pending',
      fixture: 'Official read-only integrated CommercialMapPage inventory',
      cache: 'fresh browser context; OS/driver shader caches retained; Vite server warmed',
      snapshot: await snapshot(page), errors, failedRequests });
    await page.screenshot({ path: path.join(out, `${label}-startup.png`) });
    if (!ready) { console.log('Scene did not become fully ready within bounded probe. No integrated performance claim.'); return; }
    const module = '/src/features/commercial-map/state/useCommercialMapStore.ts';
    const setRain = value => page.evaluate(async ({ module, value }) => { (await import(module)).useCommercialMapStore.getState().setRainModeActive(value); }, { module, value });
    await setRain(false);
    await page.waitForTimeout(4000);
    await interval(page, 'visible-dry');
    await page.locator('[data-commercial-dashboard-trigger]').click();
    await page.locator('#commercial-dashboard-overlay').waitFor();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, `${label}-dashboard-open.png`), animations: 'disabled' });
    await interval(page, 'covered-dry');
    await setRain(true);
    await page.waitForTimeout(3500);
    await interval(page, 'covered-rain');
    if (process.env.SCENE_SWEEP === '1') await dashboardSweep(page);
    await page.getByRole('button', { name: 'Fechar Dashboard Comercial' }).click();
    await page.waitForTimeout(3500);
    const resumed = await interval(page, 'resumed-rain');
    await setRain(false);
    await page.waitForTimeout(4000);
    const selectedEntity = await page.evaluate(async () => {
      const { OFFICIAL_REFERENCE_DATA } = await import('/src/features/commercial-map/data/officialReference2026.ts');
      const entity = OFFICIAL_REFERENCE_DATA.entities.find(item => item.classification === 'SELLABLE_LOT');
      const state = (await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore.getState();
      state.setSelectedEntityId(entity.id); state.focusSelection(); return entity.id;
    });
    await page.waitForTimeout(1800);
    const rectangle = await page.locator('canvas').boundingBox();
    const x = rectangle.x + rectangle.width * .5, y = rectangle.y + rectangle.height * .5;
    await page.mouse.move(x,y); await page.mouse.down({ button: 'right' });
    await page.mouse.move(x+48,y+24,{ steps: 6 }); await page.mouse.up({ button: 'right' });
    await page.mouse.wheel(0,80);
    await page.waitForTimeout(1500);
    const cycleBaseline = await snapshot(page);
    const cycles = [];
    save('cycles-progress', { selectedEntity, cycleBaseline, cycles, navigationEvents, consoleEvents });
    for (let index = 0; index < 3; index++) {
      await page.locator('[data-commercial-dashboard-trigger]').click();
      await page.locator('#commercial-dashboard-overlay').waitFor();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Fechar Dashboard Comercial' }).click();
      await page.waitForTimeout(1000);
      cycles.push(await snapshot(page));
      save('cycles-progress', { selectedEntity, cycleBaseline, cycles, navigationEvents, consoleEvents });
    }
    save('cycles', { selectedEntity, selectionSetup: 'Canonical local store selection, followed by real right-button pointer pan and wheel zoom',
      cycleBaseline, cycles, errors, failedRequests,
      resourceDeltas: cycles.map(row => Object.fromEntries(['geometries','textures','programs'].map(key => [key, row.renderer[key] - cycleBaseline.renderer[key]]))),
      sameCanvasAndControls: cycles.every(row => row.identity.mounts === 1 && row.identity.rendererCreates === 1 && row.identity.controlsCreates === 1),
      sameCameraAndSelection: cycles.every(row => JSON.stringify(row.selection) === JSON.stringify(cycleBaseline.selection)
        && row.dataset.commercialMapCameraDiagnostics === cycleBaseline.dataset.commercialMapCameraDiagnostics) });
    if (process.env.SCENE_DPR === '1') {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width:1366, height:768, deviceScaleFactor:2, mobile:false });
      await page.evaluate(() => document.querySelector('canvas').dispatchEvent(new CustomEvent('commercial-map-quality-test', { detail: { tier:'HIGH' } })));
      await page.waitForFunction(() => window.__commercialMapRuntimeDiagnostics?.capture()?.dpr > 1.1, null, { timeout:20000 });
      const before = await snapshot(page);
      await page.locator('[data-commercial-dashboard-trigger]').click(); await page.locator('#commercial-dashboard-overlay').waitFor();
      const covered = await snapshot(page);
      await page.getByRole('button', { name:'Fechar Dashboard Comercial' }).click(); await page.waitForTimeout(1000);
      const after = await snapshot(page);
      save('adapted-dpr', { deviceScaleFactorEmulation:2, before, covered, after,
        preserved: before.renderer.dpr === covered.renderer.dpr && before.renderer.dpr === after.renderer.dpr });
      await cdp.send('Emulation.clearDeviceMetricsOverride');
      await page.evaluate(() => document.querySelector('canvas').dispatchEvent(new CustomEvent('commercial-map-quality-test', { detail:{ tier:null } })));
      await page.waitForTimeout(1000);
    }
    if (process.env.SCENE_RECOVERY === '1') {
      await page.locator('[data-commercial-dashboard-trigger]').click();
      await page.locator('#commercial-dashboard-overlay').waitFor();
      const before = await snapshot(page);
      const supported = await page.evaluate(() => {
        const gl = document.querySelector('canvas').getContext('webgl2');
        const extension = gl.getExtension('WEBGL_lose_context');
        if (!extension) return false;
        extension.loseContext(); setTimeout(() => extension.restoreContext(), 1000); return true;
      });
      if (supported) {
        await page.waitForFunction(() => window.__commercialMapRuntimeDiagnostics?.contextRestored > 0, null, { timeout: 30000 });
        const covered = await snapshot(page);
        await page.getByRole('button', { name: 'Fechar Dashboard Comercial' }).click();
        await page.waitForFunction(() => {
          const health = JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth || 'null');
          return health?.status === 'ready' && health.path === 'post';
        }, null, { timeout: 90000 });
        await page.waitForTimeout(1000);
        save('recovery', { supported, before, covered, after: await snapshot(page), errors });
      } else save('recovery', { supported: false });
    }
    await page.screenshot({ path: path.join(out, `${label}-resumed.png`) });
  } catch (error) {
    save('failure', { message: error.message, stack: error.stack, errors, failedRequests, navigationEvents, consoleEvents, url: page.url(),
      state: await snapshot(page).catch(() => null) });
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
