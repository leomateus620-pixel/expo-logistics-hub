// Local production QA only. No commercial writes or driver polling.
// NAV_POST_DISABLE is an explicit in-memory QA ablation of one loaded renderer.
// PLAYWRIGHT_MODULE=<installed playwright path> NAV_PHASE=probe node this-file
// NAV_PHASE=compare uses one loaded scene, alternating A/B/B/A/A/B fresh-context trials.
// NAV_LABEL=baseline|candidate also applies to probe/profile; NAV_VIEWPORT_WIDTH/HEIGHT
// change only CSS viewport. NAV_LABEL_TIMING=1 and NAV_PHASE=profile are diagnostic
// executions with extra instrumentation, kept separate from clean comparisons.
// NAV_DRAW_TIMING=1 groups command submission by object during active navigation.
// NAV_RECEIVE_SHADOWS=off tests shadow sampling on the same retained scene/resources.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const phase = process.env.NAV_PHASE || 'probe';
const scale = Number(process.env.NAV_DEVICE_DPR || 2);
const policy = process.env.NAV_QUALITY || 'HIGH';
const viewport = { width: Number(process.env.NAV_VIEWPORT_WIDTH || 1280), height: Number(process.env.NAV_VIEWPORT_HEIGHT || 720) };
const disabledPost = (process.env.NAV_POST_DISABLE || '').split(',').filter(Boolean);
const receiveShadows = process.env.NAV_RECEIVE_SHADOWS || 'authored';
if (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height) || viewport.width < 1 || viewport.height < 1) throw Error('Invalid NAV_VIEWPORT_WIDTH/HEIGHT');
if (disabledPost.some(name => !['bloom', 'smaa', 'sharpen', 'all'].includes(name))) throw Error('Invalid NAV_POST_DISABLE');
if (!['authored', 'off'].includes(receiveShadows)) throw Error('Invalid NAV_RECEIVE_SHADOWS');
const out = path.resolve(process.env.NAV_OUTPUT || 'docs/validation/navigation-resolution/evidence');
const endpoints = {
  baseline: process.env.NAV_BASELINE_URL || 'http://127.0.0.1:4231',
  candidate: process.env.NAV_CANDIDATE_URL || 'http://127.0.0.1:4232',
};
for (const url of Object.values(endpoints)) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw Error('Loopback fixture URL required');
}
if (!['probe', 'compare', 'visual', 'sustained', 'profile'].includes(phase)) throw Error('Unknown NAV_PHASE');
const poses = {
  overview: { point: [3000, 2850], offset: [115, 120, 135] },
  close: { point: [2580, 3800], offset: [-11, 12, 5] },
};
const scenarios = process.env.NAV_SCENARIOS?.split(',') || (['probe', 'sustained', 'profile'].includes(phase) ? ['continuous'] : ['continuous', 'short', 'zoom-pan']);
const viewNames = process.env.NAV_VIEWS?.split(',') || (['probe', 'sustained', 'profile'].includes(phase) ? ['overview'] : Object.keys(poses));
const round = value => Number(value.toFixed(3));
function distribution(values) {
  const sorted = values.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  return { samples: sorted.length, medianMs: sorted.length ? round(sorted[Math.ceil(sorted.length * .5) - 1]) : null,
    p95Ms: sorted.length ? round(sorted[Math.ceil(sorted.length * .95) - 1]) : null,
    stallsOver50Ms: sorted.filter(v => v > 50).length,
    maxMs: sorted.length ? round(sorted.at(-1)) : null };
}
function save(name, value) { fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2)); }

async function applyPostAblation(page) {
  if (!disabledPost.length) return { requested: [], applied: false };
  if (policy === 'adaptive') throw Error('Post ablation requires a fixed NAV_QUALITY so adaptation cannot restore a pass');
  return page.evaluate(disabled => {
    const { gl, scene, camera, invalidate } = window.__benvenutoQa.root.getState();
    const visited = new Set(), pipelines = new Set();
    function visit(fiber) {
      if (!fiber || visited.has(fiber)) return;
      visited.add(fiber);
      for (let hook = fiber.memoizedState; hook && typeof hook === 'object'; hook = hook.next) {
        const value = hook.memoizedState?.current;
        if (value?.composer?.getRenderer?.() === gl && Array.isArray(value.composer.passes)) pipelines.add(value);
      }
      visit(fiber.child); visit(fiber.sibling);
    }
    for (const root of window.__navigationReactRoots || []) visit(root.current);
    if (pipelines.size !== 1) throw Error(`Post ablation needs exactly one live composer ref; found ${pipelines.size}`);
    const pipeline = [...pipelines][0], composer = pipeline.composer;
    const describe = () => composer.passes.map(pass => ({ name: pass.name, enabled: pass.enabled,
      screen: pass.renderToScreen, effects: pass.effects?.map(effect => effect.name) || [] }));
    const before = describe();
    let executedPath = 'composer';
    if (disabled.includes('all')) {
      // Bypass every HDR/effect pass on the SAME scene/camera/renderer. Three's
      // installed ACESFilmicToneMapping enum is 4, preserving the direct path.
      composer.render = () => {
        const previousToneMapping = gl.toneMapping;
        gl.setRenderTarget(null); gl.toneMapping = 4;
        try { gl.render(scene, camera); } finally { gl.toneMapping = previousToneMapping; }
      };
      executedPath = 'direct-scene-ACES';
    } else {
      for (const name of disabled) {
        const effectName = name === 'bloom' ? 'BloomEffect' : name === 'smaa' ? 'SMAAEffect' : 'CommercialMapSharpenEffect';
        const pass = composer.passes.find(value => value.effects?.some(effect => effect.name === effectName));
        if (!pass) throw Error(`Post ablation could not find ${effectName}`);
        if (name === 'bloom') {
          // Removing this effect stops its blur/luminance update, unlike setting
          // intensity to zero. Keep its allocated resources and the tone mapper.
          pass.setEffects(pass.effects.filter(effect => effect.name !== effectName));
          pass.recompile();
        } else pass.enabled = false;
      }
      const enabled = composer.passes.filter(pass => pass.enabled);
      composer.passes.forEach(pass => { pass.renderToScreen = pass === enabled.at(-1); });
      if (!pipeline.hasScreenOutput()) throw Error('Ablation lost the composer screen output');
    }
    invalidate();
    const result = { requested: disabled, applied: true, executedPath, before, after: describe(),
      dpr: gl.getPixelRatio(), physical: { width: gl.domElement.width, height: gl.domElement.height },
      caveat: 'QA mutation before equal unmeasured warmup; original resources retained; app render-health path still reports its frame owner.' };
    window.__navigationResolutionQa.readAblation = () => ({ ...result, after: describe(),
      dpr: gl.getPixelRatio(), physical: { width: gl.domElement.width, height: gl.domElement.height } });
    return result;
  }, disabledPost);
}

async function applyShadowReceivingAblation(page) {
  if (receiveShadows !== 'off') return { requested: receiveShadows, applied: false };
  if (policy === 'adaptive') throw Error('Shadow receiving ablation requires a fixed NAV_QUALITY');
  return page.evaluate(() => {
    const { scene, gl, invalidate } = window.__benvenutoQa.root.getState();
    const receivers = [], geometryIds = new Set(), materialIds = new Set();
    let meshCount = 0, vertexCount = 0, castShadowMeshCount = 0;
    scene.traverse(object => {
      if (!object.isMesh) return;
      meshCount++;
      if (object.castShadow) castShadowMeshCount++;
      if (object.geometry && !geometryIds.has(object.geometry.uuid)) {
        geometryIds.add(object.geometry.uuid);
        vertexCount += object.geometry.getAttribute('position')?.count || 0;
      }
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material) materialIds.add(material.uuid);
      }
      if (object.receiveShadow) { receivers.push(object); object.receiveShadow = false; }
    });
    const describe = () => ({ requested: 'off', applied: true, affectedMeshes: receivers.length,
      remainingAffectedReceivers: receivers.reduce((count, mesh) => count + Number(mesh.receiveShadow), 0),
      meshCount, castShadowMeshCount, geometryCount: geometryIds.size, vertexCount, materialCount: materialIds.size,
      dpr: gl.getPixelRatio(), physical: { width: gl.domElement.width, height: gl.domElement.height },
      caveat: 'QA receiveShadow boolean changes only. Authored casts, materials, geometry, targets and renderer retained; same unmeasured warmup.' });
    const qa = window.__navigationResolutionQa, dispose = qa.dispose.bind(qa);
    qa.readShadowAblation = describe;
    qa.dispose = () => { for (const mesh of receivers) mesh.receiveShadow = true; dispose(); };
    invalidate();
    return describe();
  });
}

async function instrumentLabels(page) {
  return page.evaluate(() => {
    const qa = window.__navigationResolutionQa, state = window.__benvenutoQa.root.getState();
    // Match the live territorial callback by its browser API use, which survives
    // minification. Do not wrap other labels, hover, selection or React frames.
    const owners = state.internal.subscribers.filter(subscriber => String(subscriber.ref.current).includes('getComputedTextLength'));
    if (!owners.length) return { enabled: true, callbacks: 0, reason: 'No SVG territorial callback in this revision' };
    let active = null;
    const restores = [];
    for (const [prototype, method] of [[Element.prototype, 'getBoundingClientRect'], [Element.prototype, 'getClientRects'],
      [SVGTextContentElement.prototype, 'getComputedTextLength'], [window, 'getComputedStyle']]) {
      const original = prototype[method];
      prototype[method] = function(...args) {
        if (!active) return original.apply(this, args);
        const start = performance.now();
        try { return original.apply(this, args); }
        finally { const row = active.layout[method] ||= { calls: 0, durationMs: 0 }; row.calls++; row.durationMs += performance.now() - start; }
      };
      restores.push(() => { prototype[method] = original; });
    }
    for (const subscriber of owners) {
      const original = subscriber.ref.current;
      subscriber.ref.current = function(...args) {
        if (!qa.state.recording) return original.apply(this, args);
        const row = { at: performance.now(), durationMs: 0, layout: {} };
        active = row;
        try { return original.apply(this, args); }
        finally { row.durationMs = performance.now() - row.at; active = null; qa.state.labels.push(row); }
      };
      restores.push(() => { subscriber.ref.current = original; });
    }
    const dispose = qa.dispose;
    qa.dispose = () => { restores.reverse().forEach(restore => restore()); dispose(); };
    return { enabled: true, callbacks: owners.length, caveat: 'Diagnostic wrapper overhead; compare clean trials separately' };
  });
}

async function startCpuProfile(page) {
  if (phase !== 'profile') return null;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: Number(process.env.NAV_PROFILE_INTERVAL_US || 1000) });
  await cdp.send('Profiler.start');
  return cdp;
}

async function instrumentDraws(page) {
  return page.evaluate(() => {
    const qa = window.__navigationResolutionQa, { gl } = window.__benvenutoQa.root.getState();
    if (typeof gl.renderBufferDirect !== 'function') throw Error('Draw timing needs WebGLRenderer.renderBufferDirect');
    const totals = new Map();
    const hints = object => {
      const keys = ['presentationOnly', 'projection', 'labelCount', 'layerId', 'sourceRevision', 'renderMode',
        'classification', 'qualityTier', 'canonicalOwner', 'surfaceOwner'];
      const userData = Object.fromEntries(keys.filter(key => ['string', 'number', 'boolean'].includes(typeof object.userData?.[key]))
        .map(key => [key, object.userData[key]]));
      return { name: object.name || null, type: object.type, userData };
    };
    const original = gl.renderBufferDirect;
    gl.renderBufferDirect = function(...args) {
      if (!qa.state.recording || !window.__benvenutoQa.map.getState().cameraNavigating) return original.apply(this, args);
      const object = args[4];
      if (!object?.uuid) return original.apply(this, args);
      let row = totals.get(object.uuid);
      if (!row) {
        const ancestors = [];
        for (let parent = object.parent; parent && ancestors.length < 6; parent = parent.parent) ancestors.push(hints(parent));
        row = { uuid: object.uuid, ...hints(object), isBatchedMesh: Boolean(object.isBatchedMesh),
          isInstancedMesh: Boolean(object.isInstancedMesh), instanceCount: object.isInstancedMesh ? object.count : null,
          ancestors, logicalCalls: 0, drawCalls: 0, commandSubmissionMs: 0 };
        totals.set(object.uuid, row);
      }
      const before = gl.info.render.calls, started = performance.now();
      try { return original.apply(this, args); }
      finally {
        row.commandSubmissionMs += performance.now() - started;
        row.logicalCalls++; row.drawCalls += Math.max(0, gl.info.render.calls - before);
      }
    };
    const begin = qa.begin, finish = qa.finish, dispose = qa.dispose;
    qa.begin = () => { totals.clear(); begin(); };
    qa.finish = () => {
      const run = finish();
      const rows = [...totals.values()];
      run.drawTiming = { enabled: true, objects: rows.length,
        logicalCalls: rows.reduce((sum, row) => sum + row.logicalCalls, 0),
        drawCalls: rows.reduce((sum, row) => sum + row.drawCalls, 0),
        commandSubmissionMs: rows.reduce((sum, row) => sum + row.commandSubmissionMs, 0),
        topObjects: rows.sort((a, b) => b.commandSubmissionMs - a.commandSubmissionMs).slice(0, 20),
        caveat: 'Active camera-navigation only. CPU command submission includes driver calls, not GPU elapsed time. Wrapper overhead excludes this trial from clean comparison.' };
      return run;
    };
    qa.dispose = () => { gl.renderBufferDirect = original; dispose(); };
    return { enabled: true, activeNavigationOnly: true, maxReportedObjects: 20 };
  });
}
async function stopCpuProfile(cdp, name) {
  if (!cdp) return null;
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.detach();
  save(name + '.cpuprofile', profile);
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const parents = new Map(profile.nodes.flatMap(node => (node.children || []).map(id => [id, node.id])));
  const timing = new Map();
  for (let index = 0; index < (profile.samples || []).length; index++) {
    let id = profile.samples[index];
    const ms = (profile.timeDeltas?.[index] || 0) / 1000;
    const self = timing.get(id) || { selfMs: 0, inclusiveMs: 0 }; self.selfMs += ms; timing.set(id, self);
    while (id !== undefined) {
      const row = timing.get(id) || { selfMs: 0, inclusiveMs: 0 }; row.inclusiveMs += ms; timing.set(id, row); id = parents.get(id);
    }
  }
  return { file: name + '.cpuprofile', durationMs: (profile.endTime - profile.startTime) / 1000,
    samples: profile.samples?.length || 0, caveat: 'Separate CPU sampling execution; these frame times are not the clean before/after comparison.',
    functions: [...timing].map(([id, value]) => ({ ...nodes.get(id).callFrame, ...value })).sort((a, b) => b.selfMs - a.selfMs).slice(0, 40) };
}

async function boot(browser, label, trialName) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale });
  if (disabledPost.length) await context.addInitScript(() => {
    // QA only: retain React roots once so the persistent useRef-owned composer
    // can be reached without adding a production API or rebuilding resources.
    const roots = new Set();
    window.__navigationReactRoots = roots;
    const previous = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (previous) {
      const oldCommit = previous.onCommitFiberRoot;
      previous.onCommitFiberRoot = function(id, root, ...args) { roots.add(root); return oldCommit?.call(this, id, root, ...args); };
    } else {
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, inject: () => 1,
        onCommitFiberRoot: (_id, root) => roots.add(root), onCommitFiberUnmount() {} };
    }
  });
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
  let adaptiveWarmupHold = null;
  if (process.env.NAV_ADAPTIVE_WARMUP_HOLD === '1') {
    if (policy !== 'adaptive' || phase !== 'sustained') throw Error('Adaptive warmup hold requires NAV_PHASE=sustained and NAV_QUALITY=adaptive');
    adaptiveWarmupHold = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const original = JSON.parse(canvas.dataset.commercialMapQuality || 'null');
      if (!original || original.logicalTier === 'LOW') throw Error('Automatic budget already LOW; no pending downgrade can be observed');
      canvas.dispatchEvent(new CustomEvent('commercial-map-quality-test', { detail: { tier: original.logicalTier } }));
      return { original, frozenAt: performance.now(), purpose: 'Hold the original automatic tier for equal real warmup, then restore its saved automatic state before the measured gesture. Frame times are untouched.' };
    });
  }
  await page.addStyleTag({ content: '.commercial-map-rendering-diagnostics__toolbar,.commercial-map-rendering-diagnostics__stress,.commercial-map-rendering-diagnostics__metrics,.commercial-map-district-qa{display:none!important}.commercial-map-rendering-diagnostics__viewport{position:fixed!important;inset:0!important;height:100vh!important;width:100vw!important}' });
  await page.waitForTimeout(6000);
  await page.evaluate(() => {
    const q = window.__benvenutoQa, { gl } = q.root.getState(), c = gl.domElement;
    const d = window.__commercialMapRuntimeDiagnostics;
    if (!d) throw Error('Production diagnostics opt-in missing');
    const readJson = key => JSON.parse(c.dataset[key] || 'null');
    const serialTarget = target => target && ({ id: target.uuid || target.texture?.uuid, width: target.width,
      height: target.height, samples: target.samples, name: target.texture?.name || null });
    const state = { recording: false, events: [], frames: [], samples: [], labels: [], targets: new Map(), lastSignature: '',
      setSizeCalls: 0, effectiveResizes: 0, setPixelRatioCalls: 0, pointerId: 1, pointerType: 'mouse' };
    function snapshot() {
      const { camera, controls, viewport, size } = q.root.getState();
      const map = q.map.getState();
      return { at: performance.now(), visible: document.visibilityState, focused: document.hasFocus(),
        css: { width: size.width, height: size.height, clientWidth: c.clientWidth, clientHeight: c.clientHeight },
        physical: { width: c.width, height: c.height }, dpr: gl.getPixelRatio(), storeDpr: viewport.dpr,
        quality: readJson('commercialMapQuality'), health: readJson('commercialMapRenderHealth'),
        renderTiming: readJson('commercialMapRenderTiming'), effectBudget: readJson('commercialMapPostBudget'), cameraId: camera.uuid,
        cameraNavigating: map.cameraNavigating, camera: camera.position.toArray(), target: controls.target.toArray(),
        targets: [...state.targets.values()],
        renderer: { calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures, programs: gl.info.programs?.length || 0 },
        identity: { canvasMounts: d.canvasMounts, rendererCreates: d.rendererCreates, controlsCreates: d.controlsCreates,
          activeCanvases: d.activeCanvases, activeControls: d.activeControls },
        selection: map.selectedEntityId, interior: map.interiorEntityId,
        inventory: readJson('commercialMapInventoryCounts'),
        ablation: window.__navigationResolutionQa?.readAblation?.() || null,
        shadowReceivingAblation: window.__navigationResolutionQa?.readShadowAblation?.() || null };
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
        state.events.length = state.frames.length = state.samples.length = state.labels.length = 0;
        state.setSizeCalls = state.effectiveResizes = state.setPixelRatioCalls = 0;
        d.resetSamples(); state.recording = true;
        state.before = snapshot(); event('run-start');
      },
      finish() {
        const after = snapshot(); event('run-end'); state.recording = false;
        const start = state.before.at;
        return { before: state.before, after, events: state.events, frames: state.frames, samples: state.samples, labels: state.labels,
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
  const ablationApplied = await applyPostAblation(page);
  const shadowReceivingAblation = await applyShadowReceivingAblation(page);
  const labelTiming = process.env.NAV_LABEL_TIMING === '1' ? await instrumentLabels(page) : { enabled: false };
  const drawTiming = process.env.NAV_DRAW_TIMING === '1' ? await instrumentDraws(page) : { enabled: false };
  const executedBuildManifest = await page.evaluate(async () => {
    const response = await fetch('/qa-build-manifest.json', { cache: 'no-store' });
    if (!response.ok || !(response.headers.get('content-type') || '').includes('json')) return null;
    return response.json();
  });
  const expectedRevision = process.env[label === 'baseline' ? 'NAV_BASELINE_REVISION' : 'NAV_CANDIDATE_REVISION'];
  if (expectedRevision && (!executedBuildManifest || executedBuildManifest.baseRevision !== expectedRevision)) {
    throw Error(`Executed build manifest does not match expected ${label} revision ${expectedRevision}`);
  }
  const environment = await page.evaluate(() => ({ userAgent: navigator.userAgent, platform: navigator.platform,
    viewport: { width: innerWidth, height: innerHeight }, devicePixelRatio, visualViewportScale: visualViewport?.scale,
    hardwareConcurrency: navigator.hardwareConcurrency, memoryHintGiB: navigator.deviceMemory || null,
    attributes: window.__navigationResolutionQa.attributes, renderer: window.__commercialMapRuntimeDiagnostics.capture(),
    gpuTimerExtension: window.__navigationResolutionQa.gpuTimerExtension,
    multiDrawExtension: window.__benvenutoQa.root.getState().gl.getContext().getExtension('WEBGL_multi_draw') ? 'WEBGL_multi_draw' : null,
    boot: window.__commercialMapPerformance?.summary,
    displayCadence: JSON.parse(document.querySelector('canvas').dataset.commercialMapExecutionPolicy || 'null') }));
  Object.assign(environment, { executedBuildManifest, expectedRevision: expectedRevision || null, ablationApplied, shadowReceivingAblation, labelTiming, drawTiming, adaptiveWarmupHold });
  save(`${trialName}-environment.json`, environment);
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
async function assertExpectedRenderPath(page, trialName) {
  const facts = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return { health: JSON.parse(canvas.dataset.commercialMapRenderHealth || 'null'),
      budget: JSON.parse(canvas.dataset.commercialMapPostBudget || 'null'),
      failedCriticalPost: window.__commercialMapPerformance?.events?.some(row => row.name === 'critical-post:end' && row.failed) || false };
  });
  const expectedPath = facts.budget?.requestedPath === 'direct' && facts.budget.directBudgetAvailable ? 'direct' : 'post';
  if (facts.failedCriticalPost || facts.health?.status !== 'ready' || facts.health.path !== expectedPath) {
    save(`${trialName}-invalid-render-path.json`, { expectedPath, ...facts,
      reason: 'Fallback or failed shader preparation is not the requested workload; do not include this trial in a performance comparison.' });
    throw Error(`Invalid render path for ${trialName}: expected ready/${expectedPath}`);
  }
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
  const labels = windows.flatMap(window => run.labels.filter(row => row.at >= window.start && row.at <= window.end));
  const layout = {};
  for (const row of labels) for (const [method, timing] of Object.entries(row.layout)) {
    const total = layout[method] ||= { calls: 0, durationMs: 0 };
    total.calls += timing.calls; total.durationMs += timing.durationMs;
  }
  return { activeWindows: windows, frames: distribution(frames.map(row => Number(row.duration))),
    labelCallbacks: distribution(labels.map(row => row.durationMs)), labelLayout: layout,
    drawTiming: run.drawTiming || { enabled: false },
    invalidFocus: run.events.some(row => row.type === 'invalid-focus'),
    dprValues: [...new Set([run.before.dpr, ...run.samples.map(row => row.dpr), run.after.dpr])],
    physicalSizes: [...new Set([run.before, ...run.samples, run.after].map(row => `${row.physical.width}x${row.physical.height}`))],
    effectiveResizes: run.effectiveResizes, setSizeCalls: run.setSizeCalls, setPixelRatioCalls: run.setPixelRatioCalls,
    targets: run.after.targets, qualityChanges: run.qualityChanges, longTasks: run.longTasks,
    renderTiming: run.after.renderTiming, effectBudget: run.after.effectBudget, ablationApplied: run.after.ablation,
    shadowReceivingAblation: run.after.shadowReceivingAblation,
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
    requestedViewport: viewport, postDisableRequested: disabledPost, receiveShadowsRequested: receiveShadows, labelTimingRequested: process.env.NAV_LABEL_TIMING === '1',
    drawTimingRequested: process.env.NAV_DRAW_TIMING === '1',
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
    const labels = process.env.NAV_LABEL ? [process.env.NAV_LABEL]
      : ['probe', 'profile'].includes(phase) ? ['baseline'] : phase === 'sustained' ? ['candidate'] : ['baseline', 'candidate'];
    if (labels.some(label => !['baseline', 'candidate'].includes(label))) throw Error('Invalid NAV_LABEL');
    const repeats = Number(process.env.NAV_REPEATS || (phase === 'compare' && scenarios.includes('continuous') ? 3 : 1));
    const trials = [];
    for (let repeat = 1; repeat <= repeats; repeat++) {
      const order = repeat % 2 === 0 ? [...labels].reverse() : labels;
      for (const label of order) trials.push({ label, repeat });
    }
    report.trialOrder = trials.map(({ label, repeat }) => ({ label, repeat }));
    for (const { label, repeat } of trials) {
      const variant = disabledPost.length ? '-without-' + disabledPost.join('-') : '';
      const trialName = `${label}-${policy}-dpr${scale}${variant}-trial${repeat}`;
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
          await assertExpectedRenderPath(page, trialName);
          await resetRenderTiming(page);
          const profiler = await startCpuProfile(page);
          await page.evaluate(() => { window.focus(); window.__navigationResolutionQa.begin(); });
          if (session.environment.adaptiveWarmupHold) {
            await page.evaluate(() => {
              const c = document.querySelector('canvas');
              c.dispatchEvent(new CustomEvent('commercial-map-quality-test', { detail: { tier: null } }));
              window.__navigationResolutionQa.state.events.push({ at: performance.now(), type: 'adaptive-warmup-release', quality: JSON.parse(c.dataset.commercialMapQuality) });
            });
          }
          await gesture(page, scenario, phase === 'sustained' ? Number(process.env.NAV_SUSTAINED_MS || 120000) : undefined);
          const raw = await page.evaluate(() => window.__navigationResolutionQa.finish());
          const summary = summarize(raw), name = `${label}-${policy}-dpr${scale}${variant}-${view}-${scenario}-${repeat}`;
          const cpuProfile = await stopCpuProfile(profiler, name);
          save(name + '-raw.json', raw);
          await stopRenderTiming(page);
          report.runs.push({ name, label, view, scenario, repeat, trial: trialName, cpuProfile, ...summary });
          save(`${phase}-${policy}-dpr${scale}${variant}-summary.json`, report);
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
      save(`${phase}-${policy}-dpr${scale}${variant}-summary.json`, report);
      if (report.errors[trialName].length) throw Error('Page errors occurred; inspect report');
    }
    const variant = disabledPost.length ? '-without-' + disabledPost.join('-') : '';
    save(`${phase}-${policy}-dpr${scale}${variant}-summary.json`, report);
  } finally {
    if (session) await session.context.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
