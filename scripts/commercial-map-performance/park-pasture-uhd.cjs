// Native-pixel exterior comparison. The first view also records the application's
// own drawing buffer before making the two laboratory buffers exactly equal.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const url = new URL(process.env.PARK_URL || 'http://127.0.0.1:4244');
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw Error('Local fixture required');
const out = process.env.PARK_OUTPUT || '/tmp/park-uhd';
const warm = process.env.PARK_PROFILE !== 'classic';
const route = '/__dev/commercial-map-rendering?benvenutoQa=1&exporural2028=1&persistedStage=1&externalLotsQa=1&qualityQa=HIGH';
const views = [
  { id: 'geral', target: [0, 0, -13], position: [2, 123, 108] },
  { id: 'contracampo', target: [3, 0, -2], position: [-103, 96, 7] },
  { id: 'horizonte', target: [1, 1.4, 0], position: [-49, 10.1, -32] },
];
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });
  const rows = [];
  try {
    await page.addInitScript(warm => {
      localStorage.setItem('commercial-map:appearance', warm ? 'warm-natural' : 'classic');
      localStorage.setItem('commercial-map:quality', 'detail');
    }, warm);
    await page.goto(new URL(route, url).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__benvenutoQa && document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 180000 });
    await page.addStyleTag({ content: '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa,.commercial-map-rendering-diagnostics__stress{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}' });
    await page.evaluate(warm => {
      const map = window.__benvenutoQa.map;
      map.setState({ sunrisePhase: 'complete', sunriseStartedAt: null, nightModeActive: false, rainModeActive: false });
      // This QA route explicitly resets reduced graphics on mount.
      if (warm) map.getState().setQualityPreference('detail');
    }, warm);
    if (warm) await page.waitForFunction(() =>
      window.__benvenutoQa.root.getState().gl.domElement.width === 3840, null, { timeout: 30000 });
    await page.waitForTimeout(1000);
    const cdp = await page.context().newCDPSession(page);
    const initialBuffer = await page.evaluate(() => {
      const { gl } = window.__benvenutoQa.root.getState();
      return [gl.domElement.width, gl.domElement.height];
    });
    // Both sides use the same real pixel count. No screenshot upscaling.
    if (!warm) await page.evaluate(() => window.__benvenutoQa.root.getState().setDpr(1));
    for (const view of views) {
      await page.evaluate(view => window.dispatchEvent(new CustomEvent('territory-qa', { detail: view })), view);
      await page.waitForTimeout(550);
      const result = await page.evaluate(() => {
        const { camera, controls, gl, scene } = window.__benvenutoQa.root.getState();
        const material = scene.getObjectByName('CommercialMapOuterGround')?.material;
        return { position: camera.position.toArray(), target: controls.target.toArray(), buffer: [gl.domElement.width, gl.domElement.height],
          dpr: gl.getPixelRatio(), surface: material?.name, health: JSON.parse(gl.domElement.dataset.commercialMapRenderHealth),
          images: performance.getEntriesByType('resource').filter(r => r.name.includes('/maps/materials/')).map(r => new URL(r.name).pathname) };
      });
      assert.deepEqual(result.buffer, [3840, 2160], 'Actual WebGL drawing buffer');
      const frame = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, fromSurface: true });
      fs.writeFileSync(path.join(out, view.id + '.png'), Buffer.from(frame.data, 'base64'));
      rows.push({ id: view.id, ...result });
    }
    fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify({ browser: browser.version(), profile: warm ? 'warm-natural' : 'classic', initialBuffer, views: rows }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
