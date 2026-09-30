// Local production QA only. No application mutation, commercial writes or driver polling.
// PLAYWRIGHT_MODULE=<installed playwright path> NAV_PHASE=probe node this-file
// NAV_PHASE=compare uses one loaded scene, alternating A/B/B/A/A/B fresh-context trials.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const phase = process.env.NAV_PHASE || 'probe';
const scale = Number(process.env.NAV_DEVICE_DPR || 2);
const policy = process.env.NAV_QUALITY || 'HIGH';
const out = path.resolve(process.env.NAV_OUTPUT || 'docs/validation/navigation-resolution/evidence');
const endpoints = {
  baseline: process.env.NAV_BASELINE_URL || 'http://127.0.0.1:4231',
  candidate: process.env.NAV_CANDIDATE_URL || 'http://127.0.0.1:4232',
};
for (const url of Object.values(endpoints)) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw Error('Loopback fixture URL required');
}
if (!['probe', 'compare', 'visual', 'sustained'].includes(phase)) throw Error('Unknown NAV_PHASE');
const poses = {
  overview: { point: [3000, 2850], offset: [115, 120, 135] },
  close: { point: [2580, 3800], offset: [-11, 12, 5] },
};
const scenarios = process.env.NAV_SCENARIOS?.split(',') || (['probe', 'sustained'].includes(phase) ? ['continuous'] : ['continuous', 'short', 'zoom-pan']);
const viewNames = process.env.NAV_VIEWS?.split(',') || (['probe', 'sustained'].includes(phase) ? ['overview'] : Object.keys(poses));
const round = value => Number(value.toFixed(3));
function distribution(values) {
  const sorted = values.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  return { samples: sorted.length, medianMs: sorted.length ? round(sorted[Math.ceil(sorted.length * .5) - 1]) : null,
    p95Ms: sorted.length ? round(sorted[Math.ceil(sorted.length * .95) - 1]) : null,
    stallsOver50Ms: sorted.filter(v => v > 50).length,
    maxMs: sorted.length ? round(sorted.at(-1)) : null };
}
function save(name, value) { fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2)); }

async function boot(browser, label, trialName) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: scale });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.bringToFront();
  const qualityQuery = process.env.NAV_QUALITY === 'adaptive' ? '' : '&qualityQa=' + (process.env.NAV_QUALITY || 'HIGH');
  await page.goto(endpoints[label] + '/__dev/commercial-map-rendering?persistedStage=1&benvenutoQa=1' + qualityQuery,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  const progress = setInterval(async () => {
    try {
      const row = await page.evaluate(() => ({ at: performance.now(), visible: document.visibilityState,
        focused: document.hasFocus(), canvas: document.querySelector('canvas') ? { ...document.querySelector('canvas').dataset } : null,
        boot: window.__commercialMapPerformance?.events?.at(-1), errors: window.__commercialMapPerformance?.events?.filter(e => e.failed) }));
      save(`${trialName}-boot-progress.json`, row);
      console.log(JSON.stringify({ label, trialName, bootAt: row.at, boot: row.boot, health: row.canvas?.commercialMapRenderHealth,
        hydration: row.canvas?.commercialMapHydration, visible: row.visible, focused: row.focused }));
    } catch { /* owning boot reports the failure */ }
  }, 20000);
  try {
    await page.waitForFunction(() => window.__benvenutoQa && document.querySelector('canvas')?.dataset.commercialMapHydration === 'complete', null, { timeout: 600000 });
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas')?.dataset.commercialMapRenderHealth || '{}').status === 'ready', null, { timeout: 120000 });
  } catch (error) {
    save(`${trialName}-boot-failure.json`, await page.evaluate(() => ({ at: performance.now(), visible: document.visibilityState,
      focused: document.hasFocus(), canvas: document.querySelector('canvas') ? { ...document.querySelector('canvas').dataset } : null,
      boot: window.__commercialMapPerformance, renderer: window.__commercialMapRuntimeDiagnostics?.capture() })));
    await page.screenshot({ path: path.join(out, `${trialName}-boot-failure.png`) });
    throw error;
  } finally { clearInterval(progress); }
  await page.addStyleTag({ content: '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;height:100vh!important;width:100vw!important}' });
  await page.waitForTimeout(6000);
  await page.evaluate(() => {
    const q = window.__benvenutoQa, { gl } = q.root.getState(), c = gl.domElement;
    const d = window.__commercialMapRuntimeDiagnostics;
    if (!d) throw Error('Production diagnostics opt-in missing');
    const readJson = key => JSON.parse(c.dataset[key] || 'null');
    const serialTarget = target => target && ({ id: target.uuid || target.texture?.uuid, width: target.width,
      height: target.height, samples: target.samples, name: target.texture?.name || null });
    const state = { recording: false, events: [], frames: [], samples: [], targets: new Map(), lastSignature: '',
      setSizeCalls: 0, effectiveResizes: 0, setPixelRatioCalls: 0, pointerId: 1, pointerType: 'mouse' };
    function snapshot() {
      const { camera, controls, viewport, size } = q.root.getState();
      const map = q.map.getState();
      return { at: performance.now(), visible: document.visibilityState, focused: document.hasFocus(),
        css: { width: size.width, height: size.height, clientWidth: c.clientWidth, clientHeight: c.clientHeight },
        physical: { width: c.width, height: c.height }, dpr: gl.getPixelRatio(), storeDpr: viewport.dpr,
        quality: readJson('commercialMapQuality'), health: readJson('commercialMapRenderHealth'),
        renderTiming: readJson('commercialMapRenderTiming'), cameraId: camera.uuid,
        cameraNavigating: map.cameraNavigating, camera: camera.position.toArray(), target: controls.target.toArray(),
        targets: [...state.targets.values()],
        renderer: { calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures, programs: gl.info.programs?.length || 0 },
        identity: { canvasMounts: d.canvasMounts, rendererCreates: d.rendererCreates, controlsCreates: d.controlsCreates,
          activeCanvases: d.activeCanvases, activeControls: d.activeControls },
        selection: map.selectedEntityId, interior: map.interiorEntityId,
        inventory: readJson('commercialMapInventoryCounts') };
    }
    function event(type, extra = {}) {
      if (state.recording) state.events.push({ at: performance.now(), type, ...extra });
    }
    const oldSize = gl.setSize;
    gl.setSize = function(...args) {
      const before = { width: c.width, height: c.height }, value = oldSize.apply(this, args);
      if (state.recording) state.setSizeCalls++;
      const effective = before.width !== c.width || before.height !== c.height;
      if (effective) {
        if (state.recording) state.effectiveResizes++;
        event('effective-resize', { args, before, after: { width: c.width, height: c.height }, dpr: gl.getPixelRatio(),
          cameraNavigating: q.map.getState().cameraNavigating, quality: readJson('commercialMapQuality') });
      }
      return value;
    };
    const oldRatio = gl.setPixelRatio;
    gl.setPixelRatio = function(value) {
      const before = gl.getPixelRatio(), result = oldRatio.call(this, value);
      if (state.recording) state.setPixelRatioCalls++;
      event('set-pixel-ratio', { before, after: gl.getPixelRatio(), requested: value,
        cameraNavigating: q.map.getState().cameraNavigating, quality: readJson('commercialMapQuality') });
      return result;
    };
    const oldTarget = gl.setRenderTarget;
    gl.setRenderTarget = function(target, ...args) {
      if (target) {
        const next = serialTarget(target), previous = state.targets.get(next.id);
        if (!previous || previous.width !== next.width || previous.height !== next.height) {
          state.targets.set(next.id, next);
          event('target-size', { target: next, previous, dpr: gl.getPixelRatio() });
        }
      }
      return oldTarget.call(this, target, ...args);
    };
    // Preserve the built-in bounded ring; duplicate only frames within the active QA run.
    const oldPush = d.frameTimes.push;
    d.frameTimes.push = function(...rows) {
      if (state.recording) state.frames.push(...rows.map(row => ({ ...row })));
      return oldPush.apply(this, rows);
    };
    const unsubscribe = q.map.subscribe((next, previous) => {
      if (next.cameraNavigating !== previous.cameraNavigating) event('camera-navigation', { value: next.cameraNavigating });
    });
    c.addEventListener('pointerdown', e => { state.pointerId = e.pointerId; state.pointerType = e.pointerType; });
    const timer = setInterval(() => {
      if (!state.recording) return;
      const row = snapshot();
      state.samples.push(row);
      if (row.visible !== 'visible' || !row.focused) event('invalid-focus', { visible: row.visible, focused: row.focused });
    }, 100);
    window.__navigationResolutionQa = {
      snapshot, state,
      begin() {
        state.events.length = state.frames.length = state.samples.length = 0;
        state.setSizeCalls = state.effectiveResizes = state.setPixelRatioCalls = 0;
        d.resetSamples(); state.recording = true;
        state.before = snapshot(); event('run-start');
      },
      finish() {
        const after = snapshot(); event('run-end'); state.recording = false;
        const start = state.before.at;
        return { before: state.before, after, events: state.events, frames: state.frames, samples: state.samples,
          setSizeCalls: state.setSizeCalls, effectiveResizes: state.effectiveResizes, setPixelRatioCalls: state.setPixelRatioCalls,
          longTasks: d.longTasks.filter(row => row.at >= start && row.at <= after.at), qualityChanges: d.qualityChanges,
          bootLongTasks: window.__commercialMapPerformance?.longTasks?.filter(row => row.at >= start && row.at <= after.at) || [] };
      },
      attributes: gl.getContext().getContextAttributes(),
      gpuTimerExtension: gl.getContext().getExtension('EXT_disjoint_timer_query_webgl2') ? 'EXT_disjoint_timer_query_webgl2' : null,
      dispose() { clearInterval(timer); unsubscribe(); gl.setSize = oldSize; gl.setPixelRatio = oldRatio;
        gl.setRenderTarget = oldTarget; d.frameTimes.push = oldPush; },
    };
  });
  const environment = await page.evaluate(() => ({ userAgent: navigator.userAgent, platform: navigator.platform,
    viewport: { width: innerWidth, height: innerHeight }, devicePixelRatio, visualViewportScale: visualViewport?.scale,
    hardwareConcurrency: navigator.hardwareConcurrency, memoryHintGiB: navigator.deviceMemory || null,
    attributes: window.__navigationResolutionQa.attributes, renderer: window.__commercialMapRuntimeDiagnostics.capture(),
    gpuTimerExtension: window.__navigationResolutionQa.gpuTimerExtension,
    boot: window.__commercialMapPerformance?.summary,
    displayCadence: JSON.parse(document.querySelector('canvas').dataset.commercialMapExecutionPolicy || 'null') }));
  return { label, context, page, errors, environment };
}

async function pose(page, name) {
  await page.evaluate(({ point, offset }) => {
    const q = window.__benvenutoQa, [x, z] = q.point(point);
    window.dispatchEvent(new CustomEvent('territory-qa', { detail: { target: [x, 0, z], position: [x + offset[0], offset[1], z + offset[2]] } }));
  }, poses[name]);
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('territory-qa', { detail: { release: true } })));
  await settled(page);
}
async function settled(page) {
  try {
    await page.waitForFunction(() => !window.__benvenutoQa.map.getState().cameraNavigating, null, { timeout: 120000 });
  } catch (error) {
    save(`settle-failure-${policy}-dpr${scale}-${new URL(page.url()).port}.json`, await page.evaluate(() => ({ at: performance.now(),
      snapshot: window.__navigationResolutionQa?.snapshot(), frames: window.__commercialMapRuntimeDiagnostics?.frameTimes,
      canvas: { ...document.querySelector('canvas').dataset } })));
    throw error;
  }
  await page.waitForTimeout(500);
}
async function visualImage(page, filename) {
  const before = await page.evaluate(() => window.__navigationResolutionQa.snapshot());
  await page.screenshot({ path: path.join(out, filename) });
  const after = await page.evaluate(() => window.__navigationResolutionQa.snapshot());
  // Screenshot protocol brackets can span frames; preserve both actual camera poses.
  save(filename.replace(/\.png$/, '-metadata.json'), { file: filename, before, after,
    format: 'Lossless PNG screenshot at device scale; no performance claim for this separate run.' });
}
async function resetRenderTiming(page) {
  if (process.env.NAV_RENDER_TIMING !== '1') return;
  const checkbox = page.getByLabel('Medir CPU/GPU (DEV)', { exact: true });
  await checkbox.evaluate(input => { if (input.checked) input.click(); });
  await checkbox.evaluate(input => { if (!input.checked) input.click(); });
}
async function stopRenderTiming(page) {
  if (process.env.NAV_RENDER_TIMING !== '1') return;
  await page.getByLabel('Medir CPU/GPU (DEV)', { exact: true }).evaluate(input => { if (input.checked) input.click(); });
}
async function waitPoseStable(page, trialName, stage) {
  try {
    return await page.evaluate(() => new Promise((resolve, reject) => {
      const started = performance.now(), tolerance = 1e-4;
      let anchor = null, stableSince = null;
      const tick = () => {
        const now = performance.now(), q = window.__benvenutoQa;
        if (now - started > 120000) { reject(Error('Camera did not remain stable for 2s with navigation false')); return; }
        const { camera, controls } = q.root.getState();
        if (!controls || q.map.getState().cameraNavigating) {
          anchor = null; stableSince = null;
        } else {
          const values = [...camera.position.toArray(), ...controls.target.toArray()];
          if (!anchor || anchor.cameraId !== camera.uuid || values.some((v, i) => Math.abs(v - anchor.values[i]) > tolerance)) {
            anchor = { cameraId: camera.uuid, values }; stableSince = now;
          } else if (now - stableSince >= 2000) {
            resolve(window.__navigationResolutionQa.snapshot()); return;
          }
        }
        setTimeout(tick, 100);
      };
      tick();
    }));
  } catch (error) {
    save(`${trialName}-${stage}-pose-stability-failure.json`, await page.evaluate(() => window.__navigationResolutionQa.snapshot()));
    throw error;
  }
}
async function smoke(page, trialName) {
  const result = { trial: trialName, scope: 'Local fixture selection, orientation/resize and one intentional context loss. No commercial mutation.', stages: [] };
  const selected = await page.evaluate(() => {
    const q = window.__benvenutoQa, entity = q.data.entities.find(e => e.isSellable && !e.isArchived && e.classification === 'SELLABLE_LOT');
    if (!entity) throw Error('No fixture sellable lot for selection smoke');
    q.map.getState().setSelectedEntityId(entity.id);
    return entity.id;
  });
  await page.waitForTimeout(1000); // let the existing selection flight begin before waiting for its damping
  const baseline = await waitPoseStable(page, trialName, 'selection');
  result.before = baseline;
  function assertStage(row) {
    const expectedWidth = Math.floor(row.css.width * row.dpr), expectedHeight = Math.floor(row.css.height * row.dpr);
    if (row.selection !== selected || row.cameraId !== baseline.cameraId
      || JSON.stringify(row.identity) !== JSON.stringify(baseline.identity)
      || Math.abs(row.storeDpr - row.dpr) > .005
      || row.physical.width !== expectedWidth || row.physical.height !== expectedHeight
      || row.cameraNavigating || row.health?.status !== 'ready') throw Error('Selection, renderer identity or buffer synchronization failed; inspect smoke evidence');
  }
  for (const viewport of [{ width: 720, height: 1280 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => {
      const q = window.__benvenutoQa, { gl, size, viewport } = q.root.getState(), c = gl.domElement;
      const health = JSON.parse(c.dataset.commercialMapRenderHealth || '{}');
      return health.status === 'ready' && !q.map.getState().cameraNavigating
        && Math.abs(gl.getPixelRatio() - viewport.dpr) < .005
        && c.width === Math.floor(size.width * viewport.dpr) && c.height === Math.floor(size.height * viewport.dpr);
    }, null, { timeout: 120000 });
    const row = await waitPoseStable(page, trialName, `viewport-${viewport.width}x${viewport.height}`);
    result.stages.push({ type: 'viewport-resize', viewport, snapshot: row });
    save(`${trialName}-smoke.json`, result); assertStage(row);
  }
  result.beforeLoss = await waitPoseStable(page, trialName, 'before-loss');
  if (result.beforeLoss.cameraNavigating) throw Error('Invalid smoke precondition: camera still navigating before context loss');
  await page.getByRole('button', { name: 'Perder contexto (QA)', exact: true, includeHidden: true }).evaluate(button => button.click());
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.commercialMapRenderHealth || '{}').status === 'context-lost', null, { timeout: 120000 });
  result.stages.push({ type: 'intentional-context-loss', snapshot: await page.evaluate(() => window.__navigationResolutionQa.snapshot()) });
  save(`${trialName}-smoke.json`, result);
  await page.getByRole('button', { name: 'Restaurar contexto (QA)', exact: true, includeHidden: true }).evaluate(button => button.click());
  try {
    await page.waitForFunction(previousPath => {
      const c = document.querySelector('canvas'), health = JSON.parse(c.dataset.commercialMapRenderHealth || '{}');
      return health.status === 'ready' && health.path === previousPath && c.dataset.commercialMapHydration === 'complete';
    }, result.beforeLoss.health.path, { timeout: 600000 });
  } catch (error) {
    result.stages.push({ type: 'recovery-timeout', snapshot: await page.evaluate(() => window.__navigationResolutionQa.snapshot()) });
    save(`${trialName}-smoke.json`, result); throw error;
  }
  const after = await waitPoseStable(page, trialName, 'recovery');
  result.stages.push({ type: 'context-restored', snapshot: after });
  result.originalRenderPathRecovered = after.health.path === result.beforeLoss.health.path;
  result.cameraPreservedAfterRecovery = after.camera.every((v, i) => Math.abs(v - result.beforeLoss.camera[i]) < 1e-4)
    && after.target.every((v, i) => Math.abs(v - result.beforeLoss.target[i]) < 1e-4);
  save(`${trialName}-smoke.json`, result); assertStage(after);
  if (!result.originalRenderPathRecovered) throw Error('Original render path was not retained after recovery; inspect smoke evidence');
  if (!result.cameraPreservedAfterRecovery) throw Error('Camera pose changed during context recovery; inspect smoke evidence');
  result.passed = true; save(`${trialName}-smoke.json`, result);
  return result;
}
async function startVideo(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (typeof MediaRecorder === 'undefined') return { available: false, reason: 'MediaRecorder unavailable' };
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    if (!canvas.captureStream || !mime) return { available: false, reason: 'Canvas captureStream/MediaRecorder unavailable' };
    const stream = canvas.captureStream(60), recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 40000000 });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const metadata = { available: true, requestedFps: 60, mime, requestedBitsPerSecond: 40000000,
      startedAt: performance.now(), initialPhysical: { width: canvas.width, height: canvas.height },
      caveat: 'Native canvas stream, separate visual execution. WebM remains lossy; PNG snapshots and buffer telemetry establish renderer resolution.' };
    window.__navigationResolutionVideo = { recorder, stream, chunks, metadata };
    recorder.start();
    return metadata;
  });
}
async function stopVideo(page, filename) {
  const result = await page.evaluate(() => new Promise(resolve => {
    const video = window.__navigationResolutionVideo;
    if (!video) { resolve(null); return; }
    video.recorder.onstop = async () => {
      const blob = new Blob(video.chunks, { type: video.recorder.mimeType });
      const reader = new FileReader();
      reader.onload = () => resolve({ data: String(reader.result).split(',')[1], metadata: { ...video.metadata,
        stoppedAt: performance.now(), bytes: blob.size, finalSnapshot: window.__navigationResolutionQa.snapshot() } });
      reader.readAsDataURL(blob);
      video.stream.getTracks().forEach(track => track.stop());
      delete window.__navigationResolutionVideo;
    };
    video.recorder.stop();
  }));
  if (!result) return null;
  fs.writeFileSync(path.join(out, filename), Buffer.from(result.data, 'base64'));
  save(filename.replace(/\.webm$/, '-metadata.json'), result.metadata);
  return result.metadata;
}
async function drag(page, { duration = 5000, button = 'left', amplitude = 160, vertical = 24 } = {}) {
  const bounds = await page.locator('canvas').boundingBox();
  const x = Math.round(bounds.x + bounds.width * .5), y = Math.round(bounds.y + bounds.height * .55);
  await page.mouse.move(x, y);
  await page.mouse.down({ button });
  // Native down creates pointer capture. Temporal moves follow the same CSS trajectory
  // by elapsed wall time; sample count responds honestly to the machine's frame cadence.
  await page.evaluate(({ x, y, duration, amplitude, vertical, button }) => new Promise(resolve => {
    const qa = window.__navigationResolutionQa, canvas = document.querySelector('canvas');
    const started = performance.now(), buttons = button === 'right' ? 2 : 1;
    let inputSamples = 0;
    if (qa.state.recording) qa.state.events.push({ at: started, type: 'input-start', gesture: button === 'right' ? 'pan' : 'rotate', duration });
    const tick = now => {
      const t = Math.min(1, (now - started) / duration);
      canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: qa.state.pointerId,
        pointerType: qa.state.pointerType, isPrimary: true, buttons, button: -1,
        clientX: x + amplitude * t, clientY: y + vertical * Math.sin(t * Math.PI * 2) }));
      inputSamples++;
      if (t < 1) requestAnimationFrame(tick);
      else { if (qa.state.recording) qa.state.events.push({ at: now, type: 'input-end', inputSamples }); resolve(); }
    };
    requestAnimationFrame(tick);
  }), { x, y, duration, amplitude, vertical, button });
  await page.mouse.up({ button });
  await settled(page);
}
async function gesture(page, name, duration) {
  if (name === 'continuous') await drag(page, { duration: duration || 5000 });
  else if (name === 'short') {
    for (let i = 0; i < 3; i++) await drag(page, { duration: 350, amplitude: 28, vertical: 5 });
  } else {
    await page.evaluate(() => new Promise(resolve => {
      const c = document.querySelector('canvas'), started = performance.now(), qa = window.__navigationResolutionQa;
      if (qa.state.recording) qa.state.events.push({ at: started, type: 'input-start', gesture: 'zoom', duration: 900 });
      let lastStep = -1;
      const deltaSequence = [];
      const tick = now => {
        const t = Math.min(1, (now - started) / 900), step = Math.floor(t * 8);
        if (step !== lastStep) {
          const deltaY = step < 4 ? -35 : 35;
          c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY,
            clientX: c.clientWidth * .5, clientY: c.clientHeight * .55 }));
          deltaSequence.push(deltaY); lastStep = step;
        }
        if (t < 1) requestAnimationFrame(tick);
        else { if (qa.state.recording) qa.state.events.push({ at: now, type: 'input-end', wheelSteps: deltaSequence.length,
          deltaSequence, totalDeltaY: deltaSequence.reduce((sum, value) => sum + value, 0) }); resolve(); }
      }; requestAnimationFrame(tick);
    }));
    await settled(page);
    await drag(page, { duration: 1700, button: 'right', amplitude: 45, vertical: 20 });
  }
}
function summarize(run) {
  const transitions = run.events.filter(row => row.type === 'camera-navigation');
  const windows = [];
  let start = run.before.cameraNavigating ? run.before.at : null;
  for (const row of transitions) {
    if (row.value && start === null) start = row.at;
    else if (!row.value && start !== null) { windows.push({ start, end: row.at }); start = null; }
  }
  if (start !== null) windows.push({ start, end: run.after.at });
  // RuntimeFrameDiagnostics already omits the first delta after actual idle.
  // Retain every recorded interval in the active window, including real stalls.
  const frames = windows.flatMap(window => run.frames.filter(row => row.at >= window.start && row.at <= window.end));
  return { activeWindows: windows, frames: distribution(frames.map(row => Number(row.duration))),
    invalidFocus: run.events.some(row => row.type === 'invalid-focus'),
    dprValues: [...new Set([run.before.dpr, ...run.samples.map(row => row.dpr), run.after.dpr])],
    physicalSizes: [...new Set([run.before, ...run.samples, run.after].map(row => `${row.physical.width}x${row.physical.height}`))],
    effectiveResizes: run.effectiveResizes, setSizeCalls: run.setSizeCalls, setPixelRatioCalls: run.setPixelRatioCalls,
    targets: run.after.targets, qualityChanges: run.qualityChanges, longTasks: run.longTasks,
    renderTiming: run.after.renderTiming,
    resourcesBefore: run.before.renderer, resourcesAfter: run.after.renderer,
    pathValues: [...new Set([run.before, ...run.samples, run.after].map(row => row.health?.path))],
    identityBefore: run.before.identity, identityAfter: run.after.identity,
    cameraBefore: run.before.camera, cameraAfter: run.after.camera,
    targetBefore: run.before.target, targetAfter: run.after.target,
    selectionBefore: run.before.selection, selectionAfter: run.after.selection,
    invariants: { identityUnchanged: JSON.stringify(run.before.identity) === JSON.stringify(run.after.identity),
      selectionUnchanged: run.before.selection === run.after.selection,
      inventoryUnchanged: JSON.stringify(run.before.inventory) === JSON.stringify(run.after.inventory) },
    health: run.after.health };
}

async function waitMeasureGate(trialName) {
  if (!process.env.NAV_MEASURE_GATE) return null;
  const gate = path.resolve(process.env.NAV_MEASURE_GATE), startedAt = Date.now();
  if (!fs.existsSync(gate)) console.log(JSON.stringify({ trialName, type: 'measure-gate-wait', gate }));
  while (!fs.existsSync(gate)) await new Promise(resolve => setTimeout(resolve, 500));
  const result = { path: gate, waitedMs: Date.now() - startedAt };
  console.log(JSON.stringify({ trialName, type: 'measure-gate-open', ...result }));
  return result;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: false,
    args: ['--use-angle=d3d11', '--disable-background-timer-throttling'] });
  let session;
  const report = { phase, policy, renderTimingRequested: process.env.NAV_RENDER_TIMING === '1',
    generatedAt: new Date().toISOString(), browser: browser.version(), endpoints,
    baselineRevision: process.env.NAV_BASELINE_REVISION || null, candidateRevision: process.env.NAV_CANDIDATE_REVISION || null,
    evidence: 'Visible headful Chrome, local production fixture. Viewport/DPR emulation does not certify physical devices. Renderer counts are not GPU time or byte memory estimates.',
    cache: 'fresh context per trial; shared browser/driver cache; identical hydration wait plus 6s and unmeasured scenario warmup; no throttling',
    concurrency: { maxLoadedContexts: 1, rationale: 'One full map resident at a time to avoid artificial RAM/GPU pressure on this host.' },
    budget: { targetMs: 33.3, p95ToleranceMs: 50, stallThresholdMsExclusive: 50,
      reason: 'Local ANGLE adapter; 30 FPS reference for a limited device scenario; target is not a hardware certification.' },
    trajectories: { poses, continuous: '5s temporal pointer path, +160px horizontal, ±24px vertical; endpoint remains nonzero at low cadence',
      short: 'three 350ms drags +28px/±5px with actual damping settlement',
      zoomPan: '900ms with up to nine temporal wheel steps 0..8 (actual steps/deltas recorded), then 1.7s pan +45px/±20px' }, runs: [], environments: {}, errors: {}, trials: [] };
  try {
    const labels = phase === 'probe' ? ['baseline'] : phase === 'sustained' ? ['candidate']
      : (process.env.NAV_LABEL ? [process.env.NAV_LABEL] : ['baseline', 'candidate']);
    const repeats = Number(process.env.NAV_REPEATS || (phase === 'compare' && scenarios.includes('continuous') ? 3 : 1));
    const trials = [];
    for (let repeat = 1; repeat <= repeats; repeat++) {
      const order = repeat % 2 === 0 ? [...labels].reverse() : labels;
      for (const label of order) trials.push({ label, repeat });
    }
    report.trialOrder = trials.map(({ label, repeat }) => ({ label, repeat }));
    for (const { label, repeat } of trials) {
      const trialName = `${label}-${policy}-dpr${scale}-trial${repeat}`;
      session = await boot(browser, label, trialName);
      const { page } = session;
      report.environments[trialName] = session.environment;
      const trial = { name: trialName, label, repeat, startedAt: new Date().toISOString(),
        gate: await waitMeasureGate(trialName), errors: session.errors };
      report.trials.push(trial);
      await page.bringToFront();
      if (phase === 'visual') {
        for (const view of viewNames) {
          await pose(page, view); await gesture(page, 'continuous'); await pose(page, view);
          const stem = `${label}-${policy}-dpr${scale}-${view}`;
          const recording = process.env.NAV_VIDEO === '1' ? await startVideo(page) : { available: false, reason: 'NAV_VIDEO not enabled' };
          await visualImage(page, stem + '-rest.png');
          const motion = drag(page, { duration: 5000 });
          await page.waitForTimeout(1200);
          await visualImage(page, stem + '-moving.png');
          await motion;
          await visualImage(page, stem + '-settled.png');
          const video = recording.available ? await stopVideo(page, stem + '.webm') : recording;
          report.runs.push({ label, view, trial: trialName, type: 'separate visual only', video,
            snapshot: await page.evaluate(() => window.__navigationResolutionQa.snapshot()) });
        }
      } else {
        // Principal continuous navigation repeats every trial. Brief-gesture and
        // zoom/pan transition regressions run once per label, in the first trial.
        const trialScenarios = repeat === 1 ? scenarios : scenarios.filter(name => name === 'continuous');
        for (const view of viewNames) for (const scenario of trialScenarios) {
          await pose(page, view); await gesture(page, scenario); // excluded equal warmup
          await pose(page, view);
          await resetRenderTiming(page);
          await page.evaluate(() => { window.focus(); window.__navigationResolutionQa.begin(); });
          await gesture(page, scenario, phase === 'sustained' ? Number(process.env.NAV_SUSTAINED_MS || 120000) : undefined);
          const raw = await page.evaluate(() => window.__navigationResolutionQa.finish());
          const summary = summarize(raw), name = `${label}-${policy}-dpr${scale}-${view}-${scenario}-${repeat}`;
          save(name + '-raw.json', raw);
          await stopRenderTiming(page);
          report.runs.push({ name, label, view, scenario, repeat, trial: trialName, ...summary });
          save(`${phase}-${policy}-dpr${scale}-summary.json`, report);
          console.log(JSON.stringify({ name, dpr: summary.dprValues, sizes: summary.physicalSizes,
            resizes: summary.effectiveResizes, frames: summary.frames, invalidFocus: summary.invalidFocus }));
          if (summary.invalidFocus) throw Error('Tab hidden or unfocused: comparison invalid');
        }
      }
      if (process.env.NAV_SMOKE === '1') {
        if (label === 'candidate' && repeat === 1) report.smoke = await smoke(page, trialName);
        else if (!report.smoke) report.smoke = { skipped: true, reason: 'NAV_SMOKE runs only after the first candidate trial.' };
      }
      report.errors[trialName] = [...session.errors];
      trial.completedAt = new Date().toISOString();
      // Close the entire scene before booting the next revision. Reusing the
      // browser keeps driver warmup comparable without retaining two map graphs.
      await session.context.close(); session = undefined;
      save(`${phase}-${policy}-dpr${scale}-summary.json`, report);
      if (report.errors[trialName].length) throw Error('Page errors occurred; inspect report');
    }
    save(`${phase}-${policy}-dpr${scale}-summary.json`, report);
  } finally {
    if (session) await session.context.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
