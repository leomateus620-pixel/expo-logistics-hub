const fs = require('node:fs'), path = require('node:path');
const dir = path.resolve(process.env.VISIT_OUTPUT || 'docs/validation/visit-mode/evidence');
const sources = {};
const expectedRegions = (process.env.VISIT_EXPECTED_REGIONS || 'entrance,brasilia,exporural,ics,pavilion,restaurant,headquarters,arena,exterior').split(',');
const expectedViewports = ['390x844', '844x390', '320x568', '1024x768'];
const expectedChecks = ['headquarters-focus', 'explicit-interior', 'interior-return', 'night-transition', 'night', 'focus-pause'];
const warmCycle = Number(process.env.VISIT_WARM_CYCLE || 5);
const finite = n => typeof n === 'number' && Number.isFinite(n);
const num = n => finite(n) ? n : null;
const round = n => finite(n) ? Math.round(n * 100) / 100 : null;
const rowsOf = d => Array.isArray(d?.rows) ? d.rows : [];
const range = values => {
  const known = values.filter(finite);
  return known.length ? { min: round(Math.min(...known)), max: round(Math.max(...known)), observed: known.length, missing: values.length - known.length } : null;
};
function read(name) {
  let file = path.join(dir, name);
  if (!fs.existsSync(file) && fs.existsSync(file + '.gz')) file += '.gz';
  if (!fs.existsSync(file)) { sources[name] = { status: 'missing' }; return null; }
  try {
    const before = fs.statSync(file), raw = fs.readFileSync(file), after = fs.statSync(file);
    const data = JSON.parse((file.endsWith('.gz') ? require('node:zlib').gunzipSync(raw) : raw).toString('utf8'));
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      sources[name] = { status: 'changing', bytes: after.size, modifiedAt: after.mtime.toISOString() };
      return null;
    }
    sources[name] = { status: 'read', bytes: after.size, modifiedAt: after.mtime.toISOString() };
    return data;
  } catch (error) {
    // A live harness can be halfway through writing JSON; never count it as success.
    sources[name] = { status: 'unreadable-or-partial', error: error.message };
    return null;
  }
}
function delta(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length || !a.every(finite) || !b.every(finite)) return null;
  return Math.max(...a.map((n, i) => Math.abs(n - b[i])));
}
const equalKnown = (a, b) => a == null || b == null ? null : a === b;
function restoration(before, after) {
  if (!before || !after) return null;
  const a = before.environment, b = after.environment;
  const identity = Object.fromEntries(['canvasMounts', 'rendererCreates', 'controlsCreates', 'activeCanvases', 'activeControls']
    .map(key => [key, equalKnown(before.identity?.[key], after.identity?.[key])]));
  const pose = Object.fromEntries(['position', 'quaternion', 'target', 'projection'].map(key => [key, delta(a?.[key], b?.[key])]));
  const sameScene = equalKnown(a?.sceneId, b?.sceneId), sameCamera = equalKnown(a?.cameraId, b?.cameraId);
  const complete = [...Object.values(pose), sameScene, sameCamera, ...Object.values(identity)].every(v => v !== null);
  return { complete, poseDelta: pose, sameScene, sameCamera, identityEqual: identity,
    beforeIdentity: before.identity ?? null, afterIdentity: after.identity ?? null,
    equalWithinTolerance: complete ? Object.values(pose).every(v => v <= 1e-9) && sameScene && sameCamera && Object.values(identity).every(Boolean) : null };
}
function health(snapshot) {
  if (!snapshot) return { complete: false, flags: ['missing-snapshot'], value: null };
  const value = snapshot.health ?? snapshot.visit?.health ?? null, flags = [];
  if (!value) flags.push('missing-renderer-health');
  else {
    if (value.status !== 'ready') flags.push('renderer-status:' + (value.status ?? 'missing'));
    if (finite(value.contextLosses) && value.contextLosses > 0) flags.push('context-losses:' + value.contextLosses);
    if (value.lastErrorCode) flags.push('renderer-error:' + value.lastErrorCode);
  }
  if (snapshot.visitError) flags.push('visit-error:' + snapshot.visitError);
  const renderer = snapshot.visit?.renderer ?? snapshot.renderer;
  if (!finite(renderer?.calls)) flags.push('missing-draw-calls');
  else if (renderer.calls <= 10) flags.push('insufficient-draw-calls:' + renderer.calls);
  for (const key of ['activeCanvases', 'activeControls']) if (snapshot.identity?.[key] != null && snapshot.identity[key] !== 1) flags.push(key + '-count');
  return { complete: Boolean(value && finite(value.contextLosses) && finite(value.presentedFrames) && 'lastErrorCode' in value && finite(renderer?.calls)),
    flags, value, visitHealth: snapshot.visit?.health ?? null };
}
function metric(snapshot) {
  const t = snapshot?.visit;
  if (!t) return null;
  return { fps: round(t.averageFps), p95: round(t.p95FrameTimeMs), p99: round(t.p99FrameTimeMs), longestGap: round(t.longestPresentationGapMs),
    entryMs: round(t.entryMs), elapsedMs: round(t.elapsedMs), sampledFrames: num(t.sampledFrames), totalSampledFrames: num(t.totalSampledFrames),
    stallsOver50Ms: num(t.stallsOver50Ms), unpresentedActiveFrames: num(t.unpresentedActiveFrames), presentedFrames: num(t.presentedFrames),
    renderer: t.renderer ?? null, quality: t.qualityPreset ?? null, health: health(snapshot),
    complete: [t.averageFps, t.p95FrameTimeMs, t.p99FrameTimeMs, t.longestPresentationGapMs, t.sampledFrames].every(finite) && t.sampledFrames > 0 };
}
function metricsSummary(rows) {
  const metrics = rows.map(row => row.metrics), gaps = metrics.map(t => t?.longestGap).filter(finite);
  return { fps: range(metrics.map(t => t?.fps)), p95: range(metrics.map(t => t?.p95)), p99: range(metrics.map(t => t?.p99)),
    worstGapMs: gaps.length ? round(Math.max(...gaps)) : null,
    drawCalls: range(metrics.map(t => t?.renderer?.calls)), triangles: range(metrics.map(t => t?.renderer?.triangles)),
    windowsBelow30Fps: metrics.length && metrics.every(t => finite(t?.fps)) ? metrics.filter(t => t.fps < 30).length : null,
    note: 'Ranges of recorded windows, not pooled percentiles or averaged FPS. Overlapping/cumulative windows must not be summed.' };
}
function hardware(data, emulation = false) {
  const first = data?.before ?? rowsOf(data)[0]?.start;
  return { fixture: data?.fixture ?? null, userAgent: first?.userAgent ?? null, gpuVendor: first?.renderer?.gpuVendor ?? null,
    gpuRenderer: first?.renderer?.gpuRenderer ?? null, initialCanvas: first?.canvas ?? null, initialDpr: num(first?.renderer?.dpr),
    emulationOnly: emulation ? true : data?.emulationOnly ?? false, physicalMobileValidated: false,
    limitation: emulation ? 'Chromium touch/viewport emulation on the reported host GPU; not physical iPhone/Safari or Android performance.'
      : 'Local fixture renderer measurement; not production network traffic or physical mobile validation.' };
}
function envelope(file, data, rows, missing, failures = []) {
  if (!data) missing.unshift('source:' + (sources[file]?.status ?? 'missing'));
  if (data && !Array.isArray(data.errors)) missing.push('browser-errors-field');
  const errors = Array.isArray(data?.errors) ? data.errors : null;
  if (errors?.length) failures.push('browser-errors');
  return { status: missing.length ? 'incomplete' : failures.length ? 'failed' : 'observations-complete',
    missing, failures, errors, rowCount: rows.length, rows, hardware: hardware(data),
    executionCompletion: data?.completed === true ? 'explicit-marker' : data?.after ? 'final-snapshot-recorded' : 'not-recorded',
    build: data?.commit ?? data?.buildSha ?? null, note: 'Coverage status is not acceptance or proof that the harness process exited successfully.' };
}
function validateMetrics(rows, missing, failures) {
  rows.forEach((row, i) => {
    if (!row.metrics?.complete) missing.push('row:' + i + ':metrics');
    if (!row.metrics?.health.complete) missing.push('row:' + i + ':health');
    row.metrics?.health.flags.forEach(flag => failures.push('row:' + i + ':' + flag));
  });
}
function routeSummary(data) {
  const rows = rowsOf(data).map(r => ({ region: r.region ?? null, metrics: metric(r.end), poi: r.start?.poi ?? null, poiCount: num(r.end?.poiCount),
    travelledMetres: finite(r.end?.character?.distanceMetres) && finite(r.start?.character?.distanceMetres) ? round(r.end.character.distanceMetres - r.start.character.distanceMetres) : null }));
  const missing = expectedRegions.filter(region => !rows.some(r => r.region === region)).map(region => 'region:' + region), failures = [];
  validateMetrics(rows, missing, failures);
  return { ...envelope('route.json', data, rows, missing, failures), expectedRegions, method: data?.method ?? null, summary: metricsSummary(rows) };
}
function trend(points) {
  const values = points.filter(p => finite(p.value) && finite(p.index));
  if (!values.length) return null;
  const x = values.reduce((s, p) => s + p.index, 0) / values.length, y = values.reduce((s, p) => s + p.value, 0) / values.length;
  const denominator = values.reduce((s, p) => s + (p.index - x) ** 2, 0);
  const diffs = values.slice(1).map((p, i) => p.value - values[i].value);
  return { samples: values.length, missing: points.length - values.length, first: round(values[0].value), last: round(values.at(-1).value),
    delta: round(values.at(-1).value - values[0].value), range: range(values.map(p => p.value)),
    slopePerObservationIndex: denominator ? round(values.reduce((s, p) => s + (p.index - x) * (p.value - y), 0) / denominator) : null,
    strictlyIncreasing: diffs.length >= 2 ? diffs.every(v => v > 0) : null,
    lastFiveRange: values.length >= 5 ? range(values.slice(-5).map(p => p.value)) : null };
}
function cyclesSummary(data) {
  const rows = rowsOf(data).map(r => ({ cycle: num(r.cycle), metrics: metric(r.active),
    geometries: num(r.returned?.environment?.geometries), textures: num(r.returned?.environment?.textures), programs: num(r.returned?.environment?.programs),
    threeListeners: num(r.returned?.environment?.threeListeners), dom: r.dom ?? null, heapAfterGc: num(r.heap?.usedSize),
    restoration: restoration(data?.before, r.returned), returnedHealth: health(r.returned) }));
  const missing = [], failures = [];
  for (let cycle = 1; cycle <= 20; cycle++) if (!rows.some(r => r.cycle === cycle)) missing.push('cycle:' + cycle);
  validateMetrics(rows, missing, failures);
  rows.forEach(r => {
    if (!r.restoration?.complete) missing.push('cycle:' + r.cycle + ':restoration');
    if (r.restoration?.equalWithinTolerance === false) failures.push('cycle:' + r.cycle + ':context-not-restored');
    if (!r.returnedHealth.complete) missing.push('cycle:' + r.cycle + ':returned-health');
    r.returnedHealth.flags.forEach(flag => failures.push('cycle:' + r.cycle + ':' + flag));
    if (![r.geometries, r.textures, r.programs, r.threeListeners, r.heapAfterGc, r.dom?.nodes, r.dom?.jsEventListeners].every(finite)) missing.push('cycle:' + r.cycle + ':resource-counters');
  });
  const warmed = rows.filter(r => r.cycle >= warmCycle);
  const counters = { geometries: r => r.geometries, textures: r => r.textures, programs: r => r.programs, threeListeners: r => r.threeListeners,
    domNodes: r => r.dom?.nodes, domListeners: r => r.dom?.jsEventListeners, domDocuments: r => r.dom?.documents, heapAfterGcBytes: r => r.heapAfterGc };
  return { ...envelope('cycles.json', data, rows, missing, failures), expectedCycles: 20, warmCycle,
    warmTrends: Object.fromEntries(Object.entries(counters).map(([name, getter]) => [name, trend(warmed.map(r => ({ index: r.cycle, value: getter(r) })))])),
    trendLimit: 'Explicit GC boundaries compare retained JavaScript heap, not OS RAM. Trends/plateaus are observations, not an automatic memory-leak verdict.' };
}
function characterDistance(a, b) {
  const x = a?.character?.position, y = b?.character?.position;
  return x && y && [x.x, x.z, y.x, y.z].every(finite) ? Math.hypot(y.x - x.x, y.z - x.z) / .15 : null;
}
function checksSummary(data) {
  const rows = rowsOf(data).map(r => {
    const moved = r.name === 'focus-pause' ? characterDistance(r.paused, r.stillPaused) : null;
    return { name: r.name ?? null, failed: r.failed ?? null, metrics: metric(r), health: r.name === 'focus-pause' ? health(r.resumed) : health(r),
      observationMs: num(r.observationMs), poi: r.poi ?? null, poiCount: num(r.poiCount),
      focusPause: r.name === 'focus-pause' ? { pausedFocused: r.paused?.focused ?? null, stillPausedFocused: r.stillPaused?.focused ?? null,
        movedMetres: round(moved), heldPosition: finite(moved) ? moved <= .03 : null, resumedFocused: r.resumed?.focused ?? null } : null };
  });
  const missing = expectedChecks.filter(name => !rows.some(r => r.name === name)).map(name => 'check:' + name), failures = [];
  if (!data?.after) missing.push('final-snapshot');
  rows.forEach(r => {
    if (r.failed) failures.push(r.name + ':' + r.failed);
    if (!r.health.complete) missing.push(r.name + ':health');
    r.health.flags.forEach(flag => failures.push(r.name + ':' + flag));
    if (r.focusPause) {
      if (Object.values(r.focusPause).some(v => v === null)) missing.push('focus-pause:observations');
      if (r.focusPause.pausedFocused === true || r.focusPause.stillPausedFocused === true || r.focusPause.heldPosition === false || r.focusPause.resumedFocused === false) failures.push('focus-pause:failed');
    }
  });
  const restored = restoration(data?.before, data?.after);
  if (!restored?.complete) missing.push('restoration');
  if (restored?.equalWithinTolerance === false) failures.push('context-not-restored');
  return { ...envelope('checks.json', data, rows, missing, failures), expectedChecks, restoration: restored };
}
function enduranceSummary(data) {
  const rows = rowsOf(data).map(r => ({ minute: num(r.minute), metrics: metric(r), identity: r.identity ?? null }));
  const missing = [], failures = [];
  for (let minute = 1; minute <= 5; minute++) if (!rows.some(r => r.minute === minute)) missing.push('minute:' + minute);
  if (!data?.after) missing.push('final-snapshot');
  validateMetrics(rows, missing, failures);
  const restored = restoration(data?.before, data?.after);
  if (!restored?.complete) missing.push('restoration');
  if (restored?.equalWithinTolerance === false) failures.push('context-not-restored');
  return { ...envelope('endurance.json', data, rows, missing, failures), expectedMinutes: 5, summary: metricsSummary(rows), restoration: restored,
    fpsTrend: trend(rows.map(r => ({ index: r.minute, value: r.metrics?.fps }))), heapTrend: trend(rows.map(r => ({ index: r.minute, value: r.metrics?.renderer?.heapBytes }))),
    limitation: 'Minute labels are harness checkpoints, not an independent stopwatch. Telemetry windows may overlap and heap samples have no explicit GC.' };
}
function mobileSummary(data) {
  const rows = rowsOf(data).map(r => ({ viewport: r.viewport ?? null, metrics: metric(r.end), travelledMetres: round(r.travelledMetres),
    yawDeltaRadians: num(r.yawDeltaRadians), layout: r.layout ?? null, inputChecks: r.inputChecks ?? null, expandedPOI: r.expandedPOI ?? null }));
  const missing = expectedViewports.filter(size => !rows.some(r => r.viewport?.width + 'x' + r.viewport?.height === size)).map(size => 'viewport:' + size), failures = [];
  if (!data?.after) missing.push('final-snapshot');
  if (typeof data?.passed !== 'boolean') missing.push('harness-final-input-result');
  if (data?.passed === false) failures.push('harness-input-failed');
  validateMetrics(rows, missing, failures);
  rows.forEach((r, i) => {
    for (const key of ['walkingAndLooking', 'stoppedAfterRelease', 'latchPreserved', 'latchResetOnNewVisit']) {
      if (typeof r.inputChecks?.[key] !== 'boolean') missing.push('row:' + i + ':' + key);
      if (r.inputChecks?.[key] === false) failures.push('row:' + i + ':' + key);
    }
    if (typeof r.expandedPOI?.passed !== 'boolean') missing.push('row:' + i + ':expanded-poi');
    if (r.expandedPOI?.passed === false) failures.push('row:' + i + ':expanded-poi');
    if (!finite(r.layout?.viewport) || !finite(r.layout?.scrollWidth)) missing.push('row:' + i + ':layout');
    else if (r.layout.scrollWidth > r.layout.viewport + 1) failures.push('row:' + i + ':horizontal-overflow');
  });
  return { ...envelope('mobile.json', data, rows, missing, failures), hardware: hardware(data, true), expectedViewports, summary: metricsSummary(rows),
    restoration: restoration(data?.before, data?.after), restorationNote: 'Orientation/viewport changes legitimately affect projection; inspect deltas without requiring projection equality across sizes.' };
}
function traditional(data) {
  if (!data) return null;
  return rowsOf(data).map(r => {
    const samples = Array.isArray(r.trace?.samples) ? r.trace.samples : [];
    const intervals = samples.map(s => s.deltaMs).filter(n => finite(n) && n > 0).sort((a, b) => a - b);
    const invalid = samples.filter(s => !finite(s.calls) || s.calls <= 10 || !s.visible || !s.focused).length;
    return { name: r.name ?? null, complete: intervals.length > 0 && invalid === 0 && Boolean(r.renderer), invalidSamples: samples.length ? invalid : null,
      sampledFrames: intervals.length || null, fps: intervals.length ? round(1000 * intervals.length / intervals.reduce((a, b) => a + b, 0)) : null,
      p95: round(intervals[Math.ceil(intervals.length * .95) - 1]), p99: round(intervals[Math.ceil(intervals.length * .99) - 1]),
      renderer: r.renderer ?? null, identity: r.identity ?? null, health: r.health ?? null };
  });
}
function testsSummary(before, after) {
  if (!before && !after) return null;
  const failures = d => Array.isArray(d?.testResults) ? d.testResults.flatMap(s => (s.assertionResults || []).filter(t => t.status === 'failed')
    .map(t => ({ file: s.name.replaceAll('\\', '/').split('/src/').at(-1), test: t.fullName }))) : null;
  const old = failures(before), current = failures(after), key = t => t.file + ':' + t.test;
  const stats = d => d ? { total: num(d.numTotalTests), passed: num(d.numPassedTests), failed: num(d.numFailedTests) } : null;
  return { baseline: stats(before), candidate: stats(after),
    addedFailures: old && current ? current.filter(t => !old.some(v => key(v) === key(t))) : null,
    resolvedFailures: old && current ? old.filter(t => !current.some(v => key(v) === key(t))) : null };
}
const summary = { schemaVersion: 2, generatedAt: new Date().toISOString(), directory: dir,
  route: routeSummary(read('route.json')), cycles: cyclesSummary(read('cycles.json')), checks: checksSummary(read('checks.json')),
  endurance: enduranceSummary(read('endurance.json')), mobile: mobileSummary(read('mobile.json')) };
const scenarios = ['route', 'cycles', 'checks', 'endurance', 'mobile'];
summary.status = scenarios.some(name => summary[name].status === 'incomplete') ? 'incomplete'
  : scenarios.some(name => summary[name].status === 'failed') ? 'failed' : 'observations-complete';
summary.acceptance = 'manual-review-required';
summary.incompleteScenarios = scenarios.filter(name => summary[name].status === 'incomplete');
summary.failedScenarios = scenarios.filter(name => summary[name].failures.length > 0);
summary.sameBuildVerified = scenarios.every(name => summary[name].build !== null) && new Set(scenarios.map(name => summary[name].build)).size === 1;
summary.provenanceNote = 'Timestamps do not prove a common commit; same-build evidence requires build metadata on every scenario.';
summary.baselineTraditional = traditional(read('baseline-traditional.json'));
summary.candidateTraditional = traditional(read('candidate-traditional.json'));
summary.tests = testsSummary(read('baseline-tests.json'), read('candidate-tests.json'));
const smoke = read('smoke.json');
summary.smoke = smoke ? { first: metric(smoke.first), third: metric(smoke.third), errors: smoke.errors ?? null, restoration: restoration(smoke.before, smoke.after) } : null;
summary.sources = sources;
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ status: summary.status, acceptance: summary.acceptance, incompleteScenarios: summary.incompleteScenarios,
  failedScenarios: summary.failedScenarios, output: path.join(dir, 'summary.json') }, null, 2));
