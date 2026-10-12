// QA-only browser function. Pass the exported function to page.evaluate after
// real readiness + secondary hydration. No application import, route or draw.
function installSampledGpuSceneProbe(options = {}) {
  const qa = window.__benvenutoQa;
  const root = qa?.root?.getState();
  if (!root) return { status: 'refused', reason: 'fixture-root-unavailable' };
  const { gl: renderer, scene, camera } = root;
  const canvas = renderer.domElement;
  if (!window.location.pathname.startsWith('/__dev/')) return { status: 'refused', reason: 'qa-route-required' };
  if (window.__constrainedGpuSceneProbe) return { status: 'refused', reason: 'probe-already-installed' };
  if (canvas.dataset.commercialMapReady !== 'true' || canvas.dataset.commercialMapHydration !== 'complete'
    || canvas.dataset.commercialMapPreparing || canvas.dataset.commercialMapEssentialReady === 'false'
    || canvas.dataset.commercialMapPreparationError) return { status: 'refused', reason: 'prepared-hydrated-scene-required' };
  if (document.visibilityState !== 'visible' || !document.hasFocus()) return { status: 'refused', reason: 'visible-focused-page-required' };
  const timingCheckbox = [...document.querySelectorAll('label')]
    .find(label => label.textContent.includes('Medir CPU/GPU (DEV)'))?.querySelector('input[type="checkbox"]');
  if (!timingCheckbox) return { status: 'refused', reason: 'existing-timing-state-unknown' };
  let timing;
  try { timing = JSON.parse(canvas.dataset.commercialMapRenderTiming || 'null'); }
  catch { return { status: 'refused', reason: 'existing-timing-state-unknown' }; }
  if (timingCheckbox.checked || timing?.enabled) return { status: 'refused', reason: 'existing-timing-enabled' };

  const context = renderer.getContext();
  if (context.isContextLost()) return { status: 'refused', reason: 'context-lost' };
  let extension;
  try {
    // Exactly once at installation, after hydration; no CURRENT_QUERY polling.
    extension = context.getExtension('EXT_disjoint_timer_query_webgl2');
    if (extension && context.getQuery(extension.TIME_ELAPSED_EXT, context.CURRENT_QUERY)) {
      return { status: 'refused', reason: 'external-current-query' };
    }
  } catch { return { status: 'refused', reason: 'query-capability-unknown' }; }

  const requestedEvery = options.sampleEvery ?? 20;
  const requestedLimit = options.sampleLimit ?? 40;
  if (!Number.isFinite(requestedEvery) || requestedEvery < 20 || !Number.isFinite(requestedLimit) || requestedLimit < 1) {
    return { status: 'refused', reason: 'invalid-sampling-options' };
  }
  const sampleEvery = Math.max(20, Math.floor(requestedEvery));
  const sampleLimit = Math.min(40, Math.floor(requestedLimit));
  const pendingLimit = 8;
  const queryTimeoutMs = 5000;
  const pollIntervalMs = 100;
  const originalRender = renderer.render;
  const samples = [];
  const pending = [];
  let timer;
  let recording = false;
  let disposed = false;
  let contextLost = false;
  let status = extension ? 'supported' : 'unavailable';
  let eligibleDraws = 0;
  let sampledDraws = 0;
  let skippedPreparing = 0;
  let skippedPendingCapacity = 0;
  let disjointDrops = 0;
  let droppedQueries = 0;
  let invalidVisibility = false;
  let reason = null;
  let finishResolve;
  let finishPromise;
  const median = values => {
    const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
    return sorted.length ? sorted[Math.ceil(sorted.length * 0.5) - 1] : null;
  };
  const snapshot = () => ({ status, reason, recording, disposed, eligibleDraws, sampledDraws,
    sampleEvery, sampleLimit, pendingLimit, queryTimeoutMs, pollIntervalMs,
    pendingQueries: pending.length, skippedPreparing, skippedPendingCapacity,
    disjointDrops, droppedQueries, invalidVisibility,
    cpuSubmission: { samples: samples.filter(row => row.outcome !== 'render-failed').length,
      medianMs: median(samples.filter(row => row.outcome !== 'render-failed').map(row => row.cpuMs)) },
    gpuMainScene: { samples: samples.filter(row => row.gpuMs !== null).length,
      medianMs: median(samples.map(row => row.gpuMs)) },
    samples: samples.map(row => ({ ...row })),
    scope: 'One existing renderer.render(mainScene, mainCamera), including its internal shadow work; excludes subsequent composer/effect passes.',
    limitations: [
      'CPU is JavaScript command submission around sampled main render only; GPU is asynchronous elapsed query, not whole frame or input-to-photon.',
      'CPU/GPU durations overlap and must not be added. At most 40 sampled existing draws, one per 20 eligible draws, no extra draw/invalidate.',
      'Diagnostic wrapper/query overhead; compare clean navigation separately. Another profiler must stay disabled for this isolated session.',
      'Timer extension absence is unavailable; failed ownership/capability lookup is unknown. Disjoint and timed-out GPU samples are discarded.',
    ],
  });
  const deleteOwnQuery = query => {
    if (contextLost) return;
    try { context.deleteQuery(query); }
    catch { status = 'error'; reason = 'query-disposal-failed'; }
  };
  const dropPending = outcome => {
    for (const item of pending) {
      item.sample.outcome = outcome;
      deleteOwnQuery(item.query);
    }
    if (outcome === 'disjoint') disjointDrops += pending.length;
    else droppedQueries += pending.length;
    pending.length = 0;
  };
  const restoreRender = () => {
    if (renderer.render === wrappedRender) renderer.render = originalRender;
  };
  const cleanup = () => {
    restoreRender();
    timingCheckbox.removeEventListener('change', timingChanged, true);
    canvas.removeEventListener('webglcontextlost', lost);
    document.removeEventListener('visibilitychange', visibilityChanged);
    window.removeEventListener('blur', blurred);
  };
  const settle = () => {
    if (!recording && !pending.length) {
      disposed = true;
      cleanup();
      if (finishResolve) {
        const resolve = finishResolve;
        finishResolve = undefined;
        resolve(snapshot());
      }
    }
  };
  const poll = () => {
    timer = undefined;
    if (contextLost) { settle(); return; }
    if (context.isContextLost()) { contextLost = true; status = 'context-lost'; cancel('context-lost'); return; }
    try {
      // A bounded 100ms task owns all readiness/disjoint reads, never a frame.
      if (context.getParameter(extension.GPU_DISJOINT_EXT)) dropPending('disjoint');
      else {
        const now = performance.now();
        for (let index = pending.length - 1; index >= 0; index -= 1) {
          const item = pending[index];
          if (now - item.submittedAt >= queryTimeoutMs) { item.sample.outcome = 'query-timeout'; droppedQueries++; }
          else if (context.getQueryParameter(item.query, context.QUERY_RESULT_AVAILABLE)) {
            const ns = context.getQueryParameter(item.query, context.QUERY_RESULT);
            if (Number.isFinite(ns) && ns >= 0) { item.sample.gpuMs = ns / 1e6; item.sample.outcome = 'complete'; }
            else { item.sample.outcome = 'invalid-query-result'; droppedQueries++; }
          } else continue;
          deleteOwnQuery(item.query);
          pending.splice(index, 1);
        }
      }
    } catch {
      status = 'error'; reason = 'query-poll-failed'; recording = false;
      dropPending('query-error'); cleanup();
    }
    settle();
    if (pending.length) timer = setTimeout(poll, pollIntervalMs);
  };
  const cancel = (outcome = 'cancelled') => {
    recording = false; disposed = true;
    reason = outcome;
    clearTimeout(timer); timer = undefined;
    dropPending(outcome);
    cleanup(); settle();
    return snapshot();
  };
  const lost = () => {
    contextLost = true; status = 'context-lost';
    cancel('context-lost');
  };
  const timingChanged = () => { if (timingCheckbox.checked) cancel('existing-timing-enabled'); };
  const visibilityChanged = () => { if (document.visibilityState !== 'visible') invalidVisibility = true; };
  const blurred = () => { invalidVisibility = true; };
  function wrappedRender(renderScene, renderCamera, ...args) {
    if (!recording || disposed || renderScene !== scene || renderCamera !== camera) {
      return originalRender.call(this, renderScene, renderCamera, ...args);
    }
    if (document.visibilityState !== 'visible' || !document.hasFocus()) {
      invalidVisibility = true;
      return originalRender.call(this, renderScene, renderCamera, ...args);
    }
    if (canvas.dataset.commercialMapPreparing || canvas.dataset.commercialMapEssentialReady === 'false'
      || canvas.dataset.commercialMapPreparationError || canvas.dataset.commercialMapHydration !== 'complete') {
      skippedPreparing++;
      return originalRender.call(this, renderScene, renderCamera, ...args);
    }
    if (!qa.map.getState().cameraNavigating) return originalRender.call(this, renderScene, renderCamera, ...args);
    eligibleDraws++;
    if (eligibleDraws % sampleEvery || sampledDraws >= sampleLimit || (extension && pending.length >= pendingLimit)) {
      if (extension && pending.length >= pendingLimit) skippedPendingCapacity++;
      return originalRender.call(this, renderScene, renderCamera, ...args);
    }
    sampledDraws++;
    let query = null;
    let began = false;
    try {
      if (extension && status === 'supported') {
        query = context.createQuery();
        if (query) { context.beginQuery(extension.TIME_ELAPSED_EXT, query); began = true; }
        else droppedQueries++;
      }
    } catch {
      status = 'error'; reason = 'query-submission-failed'; droppedQueries++;
      if (query) deleteOwnQuery(query);
      query = null;
    }
    const sample = { ordinal: eligibleDraws, at: performance.now(), cpuMs: 0, gpuMs: null,
      outcome: query ? 'pending' : extension ? 'query-unavailable' : 'extension-unavailable' };
    const start = performance.now();
    let failed = false;
    try { return originalRender.call(this, renderScene, renderCamera, ...args); }
    catch (error) { failed = true; sample.outcome = 'render-failed'; throw error; }
    finally {
      sample.cpuMs = performance.now() - start;
      samples.push(sample);
      if (contextLost) { sample.outcome = 'context-lost'; query = null; }
      if (query && began) {
        try {
          context.endQuery(extension.TIME_ELAPSED_EXT);
          if (failed || disposed) { droppedQueries++; deleteOwnQuery(query); }
          else pending.push({ query, sample, submittedAt: performance.now() });
        } catch {
          status = 'error'; reason = 'query-completion-failed'; sample.outcome = 'query-error';
          droppedQueries++; deleteOwnQuery(query);
        }
      }
      if (sampledDraws >= sampleLimit || status === 'error') { recording = false; restoreRender(); }
      if (pending.length && timer === undefined) timer = setTimeout(poll, pollIntervalMs);
      else if (!recording) settle();
    }
  }
  renderer.render = wrappedRender;
  canvas.addEventListener('webglcontextlost', lost);
  timingCheckbox.addEventListener('change', timingChanged, true);
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('blur', blurred);
  const api = {
    start() {
      if (disposed || recording || sampledDraws || pending.length) throw Error('Probe admits one bounded measurement only');
      recording = true;
      return snapshot();
    },
    snapshot,
    finish() {
      if (finishPromise) return finishPromise;
      recording = false;
      restoreRender();
      finishPromise = new Promise(resolve => { finishResolve = resolve; settle(); });
      return finishPromise;
    },
    cancel,
  };
  window.__constrainedGpuSceneProbe = api;
  return { ...snapshot(), installed: true };
}

module.exports = { installSampledGpuSceneProbe };
