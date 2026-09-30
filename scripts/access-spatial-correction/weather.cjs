// Read-only, local reference fixture. No authentication or commercial writes.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp = require(process.env.SHARP_MODULE || (process.env.PLAYWRIGHT_MODULE
  ? path.join(path.dirname(process.env.PLAYWRIGHT_MODULE), 'sharp') : 'sharp'));
const phase = process.argv[2] || 'after', base = process.argv[3] || 'http://127.0.0.1:4221';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('Local fixture URL required');
const out = path.resolve('docs/validation/access-spatial-correction', phase);
const cloudOnly = process.env.WEATHER_QA_CLOUD_ONLY === '1';
const targetY = cloudOnly ? 17 : 14;
const report = { phase, base, evidence: 'Local Chrome with the current opt-in 2028 reference fixture. No production or physical-device evidence.',
  pose: { target: [8.989090909, targetY, -37.03727292], position: [32.989090909, targetY + 19, -7.03727292] },
  errors: [], console: [], cycles: [], screenshots: [] };
const assert = (value, message) => { if (!value) throw new Error(message); };

async function snapshot(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas'), q = window.__benvenutoQa, { scene } = q.root.getState();
    const d = window.__commercialMapRuntimeDiagnostics, tower = scene.getObjectByName('gate9-communication-tower');
    const geometryIds = [], materialIds = [], lights = [];
    tower?.traverse(o => {
      if (o.geometry) geometryIds.push(o.geometry.uuid);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materialIds.push(m.uuid));
      if (o.isLight) lights.push({ name: o.name, uuid: o.uuid, intensity: o.intensity });
    });
    return { atMs: performance.now(), canvasCount: document.querySelectorAll('canvas').length,
      mediaReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      reducedGraphics: q.map.getState().reducedGraphics,
      timeline: JSON.parse(canvas.dataset.gateNineCommunicationTower || 'null'),
      rain: JSON.parse(canvas.dataset.commercialMapRain || 'null'),
      health: JSON.parse(canvas.dataset.commercialMapRenderHealth || 'null'),
      renderer: d?.capture(), identity: d && { canvasMounts: d.canvasMounts, rendererCreates: d.rendererCreates,
        controlsCreates: d.controlsCreates, activeCanvases: d.activeCanvases, activeControls: d.activeControls },
      tower: tower && { uuid: tower.uuid, visible: tower.visible, position: tower.position.toArray(),
        geometryIds: [...new Set(geometryIds)].sort(), materialIds: [...new Set(materialIds)].sort(), lights },
      boltVisible: scene.getObjectByName('gate9-lightning-discharge')?.visible,
      steelEmissive: scene.getObjectByName('gate9-tower-steel')?.material?.emissiveIntensity,
    };
  });
}
function assertResident(sample, baseline) {
  assert(sample.canvasCount === 1, 'Expected exactly one DOM Canvas');
  assert(sample.identity?.canvasMounts === 1 && sample.identity.rendererCreates === 1 && sample.identity.controlsCreates === 1,
    'Canvas/renderer/controls identity changed');
  assert(sample.health?.status === 'ready' && !sample.health.contextLosses, 'Renderer health/context loss');
  assert(sample.tower.geometryIds.length === 8 && sample.tower.materialIds.length === 8 && sample.tower.lights.length === 2,
    'Unexpected resident tower resource budget');
  if (baseline) {
    assert(sample.tower.uuid === baseline.tower.uuid, 'Tower was remounted');
    assert(JSON.stringify(sample.tower.geometryIds) === JSON.stringify(baseline.tower.geometryIds), 'Tower geometries were rebuilt');
    assert(JSON.stringify(sample.tower.materialIds) === JSON.stringify(baseline.tower.materialIds), 'Tower materials were rebuilt');
    assert(sample.tower.lights.every((light, i) => light.uuid === baseline.tower.lights[i].uuid), 'Tower lights were replaced');
  }
}
async function setRain(page, enabled) {
  return page.evaluate(enabled => {
    const q = window.__benvenutoQa;
    q.map.getState().setRainModeActive(enabled); q.root.getState().invalidate();
    return performance.now();
  }, enabled);
}
async function observeBurst(page, requestedAtMs, stopAtMs = 4900) {
  return page.evaluate(({ requestedAtMs, stopAtMs }) => new Promise(resolve => {
    const samples = [], captures = [], q = window.__benvenutoQa, canvas = document.querySelector('canvas');
    const sample = () => {
      const now = performance.now(), d = JSON.parse(canvas.dataset.gateNineCommunicationTower || 'null');
      if (d) {
        const { scene, camera } = q.root.getState(), steel = scene.getObjectByName('gate9-tower-steel');
        const bolt = scene.getObjectByName('gate9-lightning-discharge'), light = scene.getObjectByName('gate9-lightning-top');
        const entry = { sinceRequestMs: now - requestedAtMs, phase: d.phase, elapsedMs: d.elapsedMs,
          energy: d.energy, activations: d.activations, strikes: d.strikes, boltVisible: bolt.visible,
          steelEmissive: steel.material.emissiveIntensity, topLightIntensity: light.intensity };
        samples.push(entry);
        // Export inside the same RAF task as rendering: preserveDrawingBuffer is
        // deliberately unnecessary. This captures the actual WebGL pixels.
        if (d.phase === 'strike' && d.elapsedMs >= 3042 && d.energy > .45 && captures.length < 3) {
          const channel = scene.getObjectByName('gate9-lightning-channel-0'), p = channel.geometry.attributes.position;
          channel.updateWorldMatrix(true, false);
          const points = [];
          for (let i = 0; i < Math.min(3000, p.count); i += 15) {
            const v = camera.position.clone().set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(channel.matrixWorld).project(camera);
            points.push([(v.x + 1) * canvas.width / 2, (1 - v.y) * canvas.height / 2]);
          }
          captures.push({ ...entry, points, png: canvas.toDataURL('image/png') });
        }
      }
      if (now - requestedAtMs >= stopAtMs) resolve({ samples, captures });
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }), { requestedAtMs, stopAtMs });
}
async function verifyPixels(capture, file) {
  const png = Buffer.from(capture.png.split(',')[1], 'base64');
  fs.writeFileSync(file, png);
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const luminance = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= info.width || y >= info.height) return 0;
    const i = (y * info.width + x) * 4;
    return (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) * data[i + 3] / 255;
  };
  let visible = 0, contrasted = 0, peak = 0;
  for (const [x, y] of capture.points) {
    if (x < 12 || y < 12 || x >= info.width - 12 || y >= info.height - 12) continue;
    visible++;
    let channel = 0;
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) channel = Math.max(channel, luminance(x + dx, y + dy));
    const surroundings = [luminance(x - 11, y), luminance(x + 11, y), luminance(x, y - 11), luminance(x, y + 11)];
    const ambient = surroundings.reduce((a, b) => a + b) / surroundings.length;
    peak = Math.max(peak, channel);
    if (channel > 150 && channel > ambient + 25) contrasted++;
  }
  return { width: info.width, height: info.height, bytes: png.length, visibleChannelSamples: visible,
    contrastedChannelSamples: contrasted, peakLuminance: peak,
    criterion: 'Actual rendered main-channel pixels exceed nearby sky/scene luminance by 25, and exceed luminance 150.' };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11'] });
  let context;
  try {
    report.browser = browser.version();
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) report.console.push({ type: m.type(), text: m.text() }); });
    await page.goto(base + '/__dev/commercial-map-rendering?persistedStage=1&benvenutoQa=1&exporural2028=1',
      { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__benvenutoQa && document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete',
      null, { timeout: 240000 });
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth || '{}').status === 'ready'
      && document.querySelector('canvas')?.dataset.gateNineCommunicationTower, null, { timeout: 120000 });
    await page.addStyleTag({ content: '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;height:100vh!important;width:100vw!important}' });
    await page.evaluate(pose => {
      const q = window.__benvenutoQa;
      q.map.getState().setRainModeActive(false);
      window.dispatchEvent(new CustomEvent('territory-qa', { detail: {
        ...pose, keepRendering: true,
      } }));
    }, report.pose);
    await page.waitForTimeout(1800);
    report.initial = await snapshot(page);
    assertResident(report.initial);
    const construction = cloudOnly ? 'tower-cloud-full-construction.png' : 'tower-weather-construction.png';
    await page.screenshot({ path: path.join(out, construction) });
    report.screenshots.push(construction);
    if (cloudOnly) {
      const requestedAt = await setRain(page, true), observed = await observeBurst(page, requestedAt);
      assert(observed.captures.length, 'No live discharge for the cloud-framing capture');
      const capture = observed.captures.sort((a, b) => b.energy - a.energy)[0], screenshot = 'tower-lightning-cloud-full.png';
      const pixels = await verifyPixels(capture, path.join(out, screenshot));
      assert(pixels.contrastedChannelSamples > 25, 'Complete-cloud view did not contain a luminous channel');
      report.cloud = { requestedAt, samples: observed.samples, pixels, screenshot,
        capturedFrame: { ...capture, png: undefined, points: undefined } };
      report.screenshots.push(screenshot);
      await setRain(page, false); await page.waitForTimeout(300);
      report.final = await snapshot(page); assertResident(report.final, report.initial);
      assert(!report.errors.length && !report.console.some(m => m.type === 'error'), 'Cloud framing emitted browser/GLSL errors');
      report.status = 'passed';
      console.log(JSON.stringify({ status: report.status, cloud: pixels, errors: report.errors, console: report.console }));
      return;
    }
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.emulateMedia({ reducedMotion: cycle ? 'reduce' : 'no-preference' });
      await setRain(page, false); await page.waitForTimeout(450);
      const before = await snapshot(page), requestedAt = await setRain(page, true);
      const observed = await observeBurst(page, requestedAt);
      const firstStrike = observed.samples.find(s => s.phase === 'strike');
      assert(firstStrike && firstStrike.elapsedMs >= 3000 && firstStrike.sinceRequestMs >= 2950, 'Lightning struck before its three-second delay');
      assert(observed.samples.filter(s => s.phase === 'waiting').every(s => !s.boltVisible && s.energy === 0), 'Bolt visible while waiting');
      assert(observed.samples.some(s => s.phase === 'complete' && !s.boltVisible && s.steelEmissive === 0 && s.topLightIntensity === 0), 'Lightning did not finish cleanly');
      assert(observed.samples.at(-1).strikes === before.timeline.strikes + 1, 'Activation did not produce exactly one discharge');
      assert(observed.captures.length, 'No live illuminated channel frame was captured');
      const capture = observed.captures.sort((a, b) => b.energy - a.energy)[0];
      const screenshot = `tower-lightning-cycle-${cycle + 1}${cycle ? '-reduced-motion' : ''}.png`;
      const pixels = await verifyPixels(capture, path.join(out, screenshot));
      assert(pixels.contrastedChannelSamples > 25, 'Lightning timeline ran without a visible channel in the rendered pixels');
      const after = await snapshot(page);
      assertResident(after, report.initial);
      report.cycles.push({ cycle: cycle + 1, requestedAt, firstStrike, before, after, samples: observed.samples,
        capturedFrame: { ...capture, png: undefined, points: undefined }, pixels, screenshot });
      report.screenshots.push(screenshot);
    }
    // Warm cycles retain the whole shared renderer budget as well as tower UUIDs.
    const warmStart = report.cycles[0].after.renderer, warmEnd = report.cycles[2].after.renderer;
    for (const field of ['geometries', 'textures', 'programs']) assert(warmEnd[field] <= warmStart[field], `Warm Rain cycles grew ${field}`);
    await setRain(page, false); await page.waitForTimeout(250);
    const beforeCancel = await snapshot(page), cancelRequest = await setRain(page, true);
    await page.waitForTimeout(1200); await setRain(page, false); await page.waitForTimeout(2300);
    report.cancelBeforeDelay = { requestedAt: cancelRequest, before: beforeCancel, after: await snapshot(page) };
    assert(report.cancelBeforeDelay.after.timeline.strikes === beforeCancel.timeline.strikes, 'Cancelled Rain still fired a strike');
    assert(!report.cancelBeforeDelay.after.boltVisible && report.cancelBeforeDelay.after.steelEmissive === 0, 'Cancelled Rain left tower illuminated');
    const midRequest = await setRain(page, true);
    await page.waitForFunction(() => {
      const d = JSON.parse(document.querySelector('canvas')?.dataset.gateNineCommunicationTower || 'null');
      return d?.phase === 'strike' && d.energy > .25;
    }, null, { polling: 'raf', timeout: 15000 });
    report.cancelDuringStrike = { requestedAt: midRequest, before: await snapshot(page) };
    await setRain(page, false); await page.waitForTimeout(200);
    report.cancelDuringStrike.after = await snapshot(page);
    assert(!report.cancelDuringStrike.after.boltVisible && report.cancelDuringStrike.after.steelEmissive === 0
      && report.cancelDuringStrike.after.tower.lights.every(light => light.intensity === 0), 'Disabling Rain failed to cancel its visible flash');
    await page.evaluate(() => { const q = window.__benvenutoQa; q.map.getState().setReducedGraphics(true); q.root.getState().invalidate(); });
    await page.waitForTimeout(900);
    const reducedBefore = await snapshot(page), reducedRequest = await setRain(page, true);
    const reducedObserved = await observeBurst(page, reducedRequest);
    assert(reducedObserved.captures.length, 'Reduced graphics suppressed the requested lightning event');
    const reducedCapture = reducedObserved.captures.sort((a, b) => b.energy - a.energy)[0];
    const reducedFile = 'tower-lightning-reduced-graphics.png';
    const reducedPixels = await verifyPixels(reducedCapture, path.join(out, reducedFile));
    const reducedAfter = await snapshot(page); assertResident(reducedAfter, report.initial);
    assert(reducedAfter.reducedGraphics && reducedAfter.mediaReducedMotion, 'Reduced settings were not applied');
    assert(reducedAfter.timeline.strikes === reducedBefore.timeline.strikes + 1 && reducedPixels.contrastedChannelSamples > 25,
      'Reduced graphics did not render one complete visible discharge');
    report.reducedGraphics = { before: reducedBefore, after: reducedAfter, samples: reducedObserved.samples,
      capturedFrame: { ...reducedCapture, png: undefined, points: undefined }, pixels: reducedPixels, screenshot: reducedFile };
    report.screenshots.push(reducedFile);
    await setRain(page, false); await page.waitForTimeout(500);
    report.final = await snapshot(page); assertResident(report.final, report.initial);
    assert(report.errors.length === 0, 'Browser JavaScript errors');
    assert(!report.console.some(m => m.type === 'error'), 'Browser/GLSL console errors');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = String(error.stack || error); throw error;
  } finally {
    fs.writeFileSync(path.join(out, cloudOnly ? 'weather-cloud.json' : 'weather.json'), JSON.stringify(report, null, 2));
    if (context) await context.close();
    await browser.close();
  }
  console.log(JSON.stringify({ status: report.status, cycles: report.cycles.map(c => ({ cycle: c.cycle,
    firstStrikeMs: Math.round(c.firstStrike.sinceRequestMs), pixels: c.pixels, resources: c.after.renderer })),
    reducedGraphics: report.reducedGraphics?.pixels, errors: report.errors, console: report.console }));
})().catch(error => { console.error(error); process.exitCode = 1; });
