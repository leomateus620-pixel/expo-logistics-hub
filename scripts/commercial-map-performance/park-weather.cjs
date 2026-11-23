// Smoke in the production fixture. Run after time-sensitive startup/navigation samples.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { views, pose } = require('./park-appearance.cjs');
const origin = process.env.PARK_URL || 'http://127.0.0.1:4244';
const output = path.resolve(process.env.PARK_OUTPUT || '/tmp/park-weather');

async function main() {
  assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const report = { browser: browser.version(), views: {}, errors: [] };
  page.on('pageerror', e => report.errors.push(e.message));
  try {
    await page.addInitScript(() => localStorage.setItem('commercial-map:appearance', 'warm-natural'));
    await page.goto(origin + '/__dev/commercial-map-rendering?exporural2028=1&persistedStage=1&benvenutoQa=1&externalLotPresentationQa=1&externalLotsQa=1&soldLocksQa=1&qualityQa=MEDIUM');
    await page.waitForFunction(() => window.__benvenutoQa && document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 120000 });
    await page.addStyleTag({ content: '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}' });
    await pose(page, views.find(v => v.name === '05-pavilhoes'));
    report.revision = await page.evaluate(() => fetch('/qa-build-manifest.json').then(r => r.json()).then(r => r.revision));
    const read = () => {
      const qa = window.__benvenutoQa, state = qa.map.getState();
      const { scene, camera, gl, controls } = qa.root.getState();
      const sky = scene.getObjectByName('CommercialMapPhysicalSunriseSky').material.uniforms;
      const sun = scene.getObjectByName('CommercialMapAuthoritativeSunLight');
      const groups = [];
      let power = false, lunar = false, apollo = false;
      scene.traverseVisible(node => {
        if (node.name === 'vegetacao-arvore-lunar') lunar = true;
        if (node.name === 'replica-apollo-xiv') apollo = true;
        if (node.name === 'camada-infraestrutura-eletrica-comercial') power = true;
        if (node.name === 'camada-arvores-comerciais' || node.name === 'camada-arvores-quadras-ab') groups.push(node);
      });
      let casters = 0;
      for (const group of groups) group.traverseVisible(obj => { if (obj.isMesh && obj.castShadow && obj.count !== 0) casters++; });
      const hydro = scene.getObjectByName('camada-infraestrutura-hidrologica-comercial');
      return { position: camera.position.toArray(), target: controls.target.toArray(), trees: state.treesVisible,
        treeGroups: groups.length, power, lunar, apollo, treeCasterBatches: casters, hydrology: Boolean(hydro?.visible && state.hydrologicalModeActive),
        profile: state.appearance, phase: state.sunrisePhase, sequence: state.sunriseSequence,
        startedAt: state.sunriseStartedAt, progress: sky.sunriseProgress.value, rain: sky.rainBlend.value,
        night: sky.nightBlend.value, sun: sun.intensity, sunColor: sun.color.getHexString(), positionSun: sun.position.toArray(),
        fog: scene.fog.color.getHexString(), health: JSON.parse(gl.domElement.dataset.commercialMapRenderHealth) };
    };
    async function capture(name) {
      const state = await page.evaluate(read);
      report.views[name] = state;
      await page.screenshot({ path: path.join(output, name + '.jpg'), quality: 81 });
      assert.equal(state.health.status, 'ready'); assert.equal(state.health.contextLosses, 0);
      return state;
    }
    const action = (name, arg) => page.evaluate(([name, arg]) => window.__benvenutoQa.map.getState()[name](arg), [name, arg]);
    await page.evaluate(() => window.__benvenutoQa.map.setState({ sunrisePhase: 'complete', sunriseStartedAt: null, rainModeActive: false, nightModeActive: false }));
    await page.waitForFunction(() => window.__benvenutoQa.root.getState().scene.getObjectByName('CommercialMapPhysicalSunriseSky').material.uniforms.sunriseProgress.value === 1);
    const day = await capture('dia');
    await action('setRainModeActive', true);
    await page.waitForFunction(() => window.__benvenutoQa.root.getState().scene.getObjectByName('CommercialMapPhysicalSunriseSky').material.uniforms.rainBlend.value === 1);
    const rain = await capture('chuva');
    assert(rain.sun < day.sun && day.fog !== rain.fog);
    await action('setRainModeActive', false);
    await page.waitForFunction(() => window.__benvenutoQa.root.getState().scene.getObjectByName('CommercialMapPhysicalSunriseSky').material.uniforms.rainBlend.value === 0);
    await pose(page, views.find(v => v.name === '12-arvore-lunar'));
    const treeDay = await capture('arvore-lunar');
    await action('setTreesVisible', false);
    await page.waitForFunction(() => {
      let n = 0; window.__benvenutoQa.root.getState().scene.traverseVisible(o => { if (o.name.startsWith('camada-arvores-')) n++; }); return n === 0;
    });
    const hidden = await capture('arvores-ocultas');
    assert(treeDay.treeGroups && treeDay.treeCasterBatches && !hidden.treeGroups && !hidden.treeCasterBatches);
    assert(treeDay.power && !hidden.power);
    assert(treeDay.lunar && !hidden.lunar && treeDay.apollo && hidden.apollo);
    await action('setTreesVisible', true);
    await page.waitForFunction(() => window.__benvenutoQa.root.getState().scene.getObjectByName('camada-arvores-comerciais')?.visible);
    await pose(page, views.find(v => v.name === '05-pavilhoes'));
    await action('setHydrologicalModeActive', true);
    await page.waitForFunction(() => window.__benvenutoQa.root.getState().scene.getObjectByName('camada-infraestrutura-hidrologica-comercial')?.visible);
    assert((await capture('hidrologia')).hydrology);
    await action('setHydrologicalModeActive', false);
    await action('requestSunrise');
    await page.waitForFunction(() => {
      const q = window.__benvenutoQa; const p = q.root.getState().scene.getObjectByName('CommercialMapPhysicalSunriseSky').material.uniforms.sunriseProgress.value;
      return q.map.getState().sunrisePhase === 'running' && p > .008 && p < .92;
    });
    const dawn = await capture('amanhecer');
    await action('setAppearance', 'classic');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const classic = await page.evaluate(read);
    assert.equal(classic.profile, 'classic'); assert.equal(classic.sequence, dawn.sequence);
    report.classicDuringSunrise = classic;
    await action('setAppearance', 'warm-natural');
    await page.waitForFunction(p => window.__benvenutoQa.root.getState().scene.getObjectByName('CommercialMapPhysicalSunriseSky').material.uniforms.sunriseProgress.value > p, dawn.progress);
    const restored = await page.evaluate(read);
    assert.equal(restored.sequence, dawn.sequence);
    if (restored.phase === 'running') assert.equal(restored.startedAt, dawn.startedAt);
    assert.deepEqual(restored.position, dawn.position); assert.deepEqual(restored.target, dawn.target);
    report.afterAppearanceSwitch = restored;
    assert.equal(report.errors.length, 0);
  } finally {
    fs.writeFileSync(path.join(output, 'clima.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
