const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { installSampledGpuSceneProbe } = require('./gpu-scene-probe.cjs');

function fakeHost(options = {}) {
  let now = 0, nextTimer = 0, lost = false, disjoint = false, available = true;
  const timers = new Map();
  const events = () => {
    const listeners = new Map();
    return {
      addEventListener(name, listener) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); },
      removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
      dispatch(name) { for (const listener of [...listeners.get(name) ?? []]) listener(); },
      listenerCount() { return [...listeners.values()].reduce((sum, values) => sum + values.size, 0); },
    };
  };
  const canvas = { ...events(), dataset: { commercialMapReady: 'true', commercialMapEssentialReady: 'true', commercialMapHydration: 'complete' } };
  const checkbox = { ...events(), checked: options.existingTiming || false };
  const scene = {}, camera = {};
  const calls = { render: 0, extension: 0, currentQuery: 0, disjoint: 0, available: 0, result: 0, begin: 0, end: 0, create: 0, deleted: [] };
  const context = {
    CURRENT_QUERY: 1, QUERY_RESULT_AVAILABLE: 2, QUERY_RESULT: 3,
    isContextLost: () => lost,
    getExtension: () => { calls.extension++; return options.unavailable ? null : { TIME_ELAPSED_EXT: 4, GPU_DISJOINT_EXT: 5 }; },
    getQuery: () => { calls.currentQuery++; return options.externalQuery ? {} : null; },
    getParameter: () => { calls.disjoint++; return disjoint; },
    createQuery: () => { calls.create++; return { id: calls.create }; },
    beginQuery: () => { calls.begin++; },
    endQuery: () => { calls.end++; },
    getQueryParameter(query, parameter) {
      if (parameter === 2) { calls.available++; return available; }
      calls.result++; return 2_000_000;
    },
    deleteQuery(query) { calls.deleted.push(query.id); },
  };
  const renderer = { domElement: canvas, getContext: () => context, render() {
    calls.render++; now += 0.25;
    if (options.renderThrows) throw Error('draw-failed');
  } };
  const originalRender = renderer.render;
  const document = { ...events(), visibilityState: 'visible', hasFocus: () => true,
    querySelectorAll: () => [{ textContent: 'Medir CPU/GPU (DEV)', querySelector: () => checkbox }] };
  const window = { ...events(), location: { pathname: '/__dev/commercial-map-rendering' },
    __benvenutoQa: { root: { getState: () => ({ gl: renderer, scene, camera }) }, map: { getState: () => ({ cameraNavigating: true }) } } };
  const install = vm.runInNewContext(`(${installSampledGpuSceneProbe.toString()})`, { window, document,
    performance: { now: () => now }, setTimeout: (callback, delay) => { timers.set(++nextTimer, { callback, due: now + delay }); return nextTimer; },
    clearTimeout: timer => timers.delete(timer) });
  const draw = count => { for (let i = 0; i < count; i++) renderer.render(scene, camera); };
  const advance = milliseconds => {
    const end = now + milliseconds;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > end) break;
      now = next[1].due; timers.delete(next[0]); next[1].callback();
    }
    now = end;
  };
  return { install, renderer, originalRender, canvas, checkbox, calls, window, draw, advance, timers,
    setDisjoint: () => { disjoint = true; }, setUnavailable: () => { available = false; },
    lose: () => { lost = true; canvas.dispatch('webglcontextlost'); } };
}

test('samples one of 20 existing draws, caps at 40 and never reads GPU state per frame', async () => {
  const host = fakeHost();
  assert.equal(host.install().installed, true);
  const api = host.window.__constrainedGpuSceneProbe; api.start();
  for (let index = 0; index < 40; index++) { host.draw(20); host.advance(100); }
  host.draw(200);
  const result = await api.finish();
  assert.equal(host.calls.render, 1000);
  assert.equal(result.sampledDraws, 40);
  assert.equal(result.gpuMainScene.samples, 40);
  assert.equal(result.gpuMainScene.medianMs, 2);
  assert.equal(result.cpuSubmission.medianMs, 0.25);
  assert.equal(host.calls.currentQuery, 1);
  assert.equal(host.calls.extension, 1);
  assert.equal(host.calls.disjoint, 40);
  assert.equal(host.renderer.render, host.originalRender);
  assert.equal(host.timers.size, 0);
  assert.equal(host.canvas.listenerCount() + host.checkbox.listenerCount(), 0);
});

test('keeps eight pending queries bounded, waits for availability and cancels only owned queries', async () => {
  const host = fakeHost(); host.setUnavailable(); host.install();
  const api = host.window.__constrainedGpuSceneProbe; api.start(); host.draw(400);
  assert.equal(api.snapshot().pendingQueries, 8);
  assert.equal(host.calls.disjoint, 0);
  assert.equal(host.calls.available, 0);
  host.advance(100);
  assert.equal(host.calls.result, 0);
  assert.equal(host.calls.disjoint, 1);
  const result = api.cancel();
  assert.equal(result.pendingQueries, 0);
  assert.equal(result.droppedQueries, 8);
  assert.deepEqual(host.calls.deleted.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(host.renderer.render, host.originalRender);
  assert.equal(host.timers.size, 0);
});

test('discards disjoint queries and timed-out queries before requesting their results', async () => {
  const disjoint = fakeHost(); disjoint.install(); disjoint.window.__constrainedGpuSceneProbe.start(); disjoint.draw(20); disjoint.setDisjoint();
  const disjointResult = disjoint.window.__constrainedGpuSceneProbe.finish(); disjoint.advance(100);
  assert.equal((await disjointResult).disjointDrops, 1);
  assert.equal(disjoint.calls.result, 0);
  const timeout = fakeHost(); timeout.setUnavailable(); timeout.install(); timeout.window.__constrainedGpuSceneProbe.start(); timeout.draw(20);
  const timeoutResult = timeout.window.__constrainedGpuSceneProbe.finish(); timeout.advance(5100);
  assert.equal((await timeoutResult).samples[0].outcome, 'query-timeout');
  assert.equal(timeout.calls.result, 0);
  assert.equal(timeout.timers.size, 0);
});

test('refuses existing and externally active timing without changing render ownership', () => {
  for (const options of [{ existingTiming: true }, { externalQuery: true }]) {
    const host = fakeHost(options);
    assert.equal(host.install().status, 'refused');
    assert.equal(host.renderer.render, host.originalRender);
    assert.equal(host.calls.begin, 0);
  }
});

test('handles context loss while finish drains without deleting invalid context handles', async () => {
  const host = fakeHost(); host.setUnavailable(); host.install();
  const api = host.window.__constrainedGpuSceneProbe; api.start(); host.draw(20);
  const result = api.finish(); host.lose();
  assert.equal((await result).status, 'context-lost');
  assert.equal(host.calls.deleted.length, 0);
  assert.equal(host.timers.size, 0);
  assert.equal(host.renderer.render, host.originalRender);
});

test('restores ownership if existing timing is enabled and preserves an original render exception', async () => {
  const existing = fakeHost(); existing.install(); existing.window.__constrainedGpuSceneProbe.start(); existing.draw(20);
  existing.checkbox.checked = true; existing.checkbox.dispatch('change');
  assert.equal(existing.renderer.render, existing.originalRender);
  assert.equal(existing.timers.size, 0);
  const throws = fakeHost({ renderThrows: true }); throws.install(); throws.window.__constrainedGpuSceneProbe.start();
  // Advance eligible count without needing successful rendering on earlier draws.
  for (let index = 0; index < 20; index++) assert.throws(() => throws.draw(1), /draw-failed/);
  const result = await throws.window.__constrainedGpuSceneProbe.finish();
  assert.equal(result.samples[0].outcome, 'render-failed');
  assert.equal(throws.calls.end, 1);
  assert.equal(throws.calls.deleted.length, 1);
  assert.equal(result.gpuMainScene.samples, 0);
  assert.equal(result.cpuSubmission.samples, 0);
});

test('excludes other passes/preparation and records hidden activity even when no draw occurs', async () => {
  const host = fakeHost(); host.install();
  const api = host.window.__constrainedGpuSceneProbe; api.start();
  host.renderer.render({}, {});
  host.canvas.dataset.commercialMapPreparing = 'true'; host.draw(20);
  delete host.canvas.dataset.commercialMapPreparing; host.draw(20); host.advance(100);
  host.window.dispatch('blur');
  const result = await api.finish();
  assert.equal(host.calls.render, 41);
  assert.equal(result.eligibleDraws, 20);
  assert.equal(result.sampledDraws, 1);
  assert.equal(result.skippedPreparing, 20);
  assert.equal(result.invalidVisibility, true);
});
