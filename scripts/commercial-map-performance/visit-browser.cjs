const path = require('node:path');
const fs = require('node:fs');
// Install Playwright locally or point PLAYWRIGHT_MODULE to an existing runtime.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.resolve(process.env.VISIT_OUTPUT || 'docs/validation/visit-mode/evidence');
fs.mkdirSync(out, { recursive: true });
async function launch(mobile = false) {
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true,
    args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [] });
  const context = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  return { browser, page, errors };
}
async function boot(page, port = 5183) {
  await page.goto(`${process.env.VISIT_BASE_URL || `http://127.0.0.1:${port}`}/__dev/commercial-map-rendering?persistedStage=1${process.env.VISIT_EXTRA_QUERY ? `&${process.env.VISIT_EXTRA_QUERY}` : ''}`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  const progress = process.env.VISIT_BOOT_DEBUG === '1' ? setInterval(async () => {
    try {
      const state = await page.evaluate(() => ({ at: performance.now(), boot: window.__commercialMapPerformance,
        canvas: document.querySelector('canvas') ? { ...document.querySelector('canvas').dataset } : null,
        focused: document.hasFocus(), visibility: document.visibilityState }));
      save('boot-progress.json', state);
      console.log(JSON.stringify({ bootProgress: state.at, health: state.canvas?.commercialMapRenderHealth,
        stage: state.boot?.events?.at(-1), hydration: state.canvas?.commercialMapHydration }));
    } catch { /* page closure is handled by the owning harness */ }
  }, 20000) : null;
  try {
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 180000 });
  } catch (error) {
    save('boot-failure.json', await page.evaluate(() => ({ boot: window.__commercialMapPerformance,
      canvas: document.querySelector('canvas') ? { ...document.querySelector('canvas').dataset } : null,
      renderer: window.__commercialMapRuntimeDiagnostics?.capture(), body: document.body.innerText })));
    await page.screenshot({ path: path.join(out, 'boot-failure.png') });
    throw error;
  } finally { clearInterval(progress); }
  if (process.env.VISIT_BOOT_CAPTURE) save(process.env.VISIT_BOOT_CAPTURE, await page.evaluate(() => ({
    at: performance.now(), boot: window.__commercialMapPerformance,
    health: JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth || 'null'),
    hydration: document.querySelector('canvas').dataset.commercialMapHydration,
    renderer: window.__commercialMapRuntimeDiagnostics?.capture(),
  })));
  await page.waitForTimeout(6000);
  console.log('hydrated');
}
async function click(page, name) {
  // QA controls are deliberately hidden in the district presentation layout.
  await page.getByRole('button', { name, exact: true, includeHidden: true }).evaluate(button => button.click());
}
async function snapshot(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    canvas.dispatchEvent(new Event('commercial-map-snapshot-environment'));
    const { materialIds: _ids, ...environment } = window.__commercialMapEnvironmentSnapshot || {};
    const d = window.__commercialMapRuntimeDiagnostics;
    return { environment, renderer: d?.capture(), health: JSON.parse(canvas.dataset.commercialMapRenderHealth || 'null'),
      identity: { canvasMounts: d?.canvasMounts, rendererCreates: d?.rendererCreates, controlsCreates: d?.controlsCreates,
        activeCanvases: d?.activeCanvases, activeControls: d?.activeControls },
      character: JSON.parse(canvas.dataset.visitCharacter || 'null'), visit: window.__commercialMapVisitDiagnostics?.capture(),
      poi: document.querySelector('[data-visit-poi-card]')?.textContent,
      visitError: document.querySelector('.visit-hud__error')?.textContent,
      poiCount: document.querySelectorAll('[data-visit-poi-card]').length,
      visible: document.visibilityState, focused: document.hasFocus(),
      userAgent: navigator.userAgent, canvas: { width: canvas.clientWidth, height: canvas.clientHeight } };
  });
}
async function enter(page, region) {
  if (region) await page.evaluate(spawnId => window.dispatchEvent(new CustomEvent('commercial-map:visit-spawn-qa', { detail: { spawnId } })), region);
  else await click(page, 'Modo Visita');
  await page.waitForFunction(() => document.querySelector('[data-visit-hud]')?.dataset.visitPhase === 'active', null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  const error = await page.evaluate(() => document.querySelector('.visit-hud__error')?.textContent);
  if (error) {
    save(`failed-entry-${region || 'entrance'}.json`, await snapshot(page));
    await page.screenshot({ path: path.join(out, `failed-entry-${region || 'entrance'}.png`) });
    throw Error(error);
  }
}
async function leave(page) {
  await click(page, 'Sair do Modo Visita');
  await page.waitForFunction(() => !document.querySelector('[data-visit-hud]'), null, { timeout: 60000 });
  await page.waitForTimeout(1000);
}
async function reset(page) { await page.evaluate(() => window.__commercialMapVisitDiagnostics?.resetSamples()); }
function save(name, result) { fs.writeFileSync(path.join(out, name), JSON.stringify(result, null, 2)); }
function assertPresented(row) {
  if (!row.health || row.health.status !== 'ready' || row.health.contextLosses || row.health.lastErrorCode
    || !row.renderer || row.renderer.calls <= 10 || row.visitError) {
    throw Error(`Invalid presented map sample: ${JSON.stringify({ health: row.health, renderer: row.renderer, error: row.visitError })}`);
  }
}
module.exports = { out, launch, boot, click, snapshot, enter, leave, reset, save, assertPresented };
