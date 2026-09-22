const fs = require('node:fs'), path = require('node:path');
const dir = path.resolve(process.env.VISIT_OUTPUT || 'docs/validation/visit-mode/evidence');
const read = name => fs.existsSync(path.join(dir, name)) ? JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) : null;
const round = n => typeof n === 'number' ? Math.round(n * 100) / 100 : n;
const delta = (a, b) => a && b ? Math.max(...a.map((n, i) => Math.abs(n - b[i]))) : null;
function traditional(d) {
  return d?.rows.map(r => {
    const samples = r.trace.samples;
    const intervals = samples.map(s => s.deltaMs).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
    const invalid = samples.filter(s => s.calls <= 10 || !s.visible || !s.focused).length;
    return { name: r.name, valid: !invalid && !!r.renderer, invalidSamples: invalid, frames: intervals.length,
      fps: round(1000 * intervals.length / intervals.reduce((a, b) => a + b, 0)),
      p95: round(intervals[Math.ceil(intervals.length * .95) - 1]), p99: round(intervals[Math.ceil(intervals.length * .99) - 1]),
      renderer: r.renderer, identity: r.identity, position: r.environment.position, health: r.health };
  });
}
function metric(r) {
  const t = r?.visit;
  return t ? { fps: round(t.averageFps), p95: round(t.p95FrameTimeMs), p99: round(t.p99FrameTimeMs),
    longestGap: round(t.longestPresentationGapMs), entryMs: round(t.entryMs), sampledFrames: t.sampledFrames,
    totalSampledFrames: t.totalSampledFrames, renderer: t.renderer, quality: t.qualityPreset, health: t.health } : null;
}
function failures(d) {
  return d?.testResults.flatMap(s => (s.assertionResults || []).filter(a => a.status === 'failed')
    .map(a => ({ file: s.name.replaceAll('\\', '/').split('/src/').at(-1), test: a.fullName }))) || [];
}
const beforeTests = read('baseline-tests.json'), afterTests = read('candidate-tests.json');
const oldFailures = failures(beforeTests), newFailures = failures(afterTests);
const keys = list => new Set(list.map(f => `${f.file}:${f.test}`));
const oldKeys = keys(oldFailures), newKeys = keys(newFailures);
const smoke = read('smoke.json'), cycles = read('cycles.json');
const summary = {
  baseline: traditional(read('baseline-traditional.json')), candidate: traditional(read('candidate-traditional.json')),
  smoke: smoke && { first: metric(smoke.first), third: metric(smoke.third), errors: smoke.errors,
    restoration: { position: delta(smoke.before.environment.position, smoke.after.environment.position),
      quaternion: delta(smoke.before.environment.quaternion, smoke.after.environment.quaternion),
      projection: delta(smoke.before.environment.projection, smoke.after.environment.projection),
      sameScene: smoke.before.environment.sceneId === smoke.after.environment.sceneId,
      sameCamera: smoke.before.environment.cameraId === smoke.after.environment.cameraId, identity: smoke.after.identity } },
  route: read('route.json')?.rows.map(r => ({ region: r.region, ...metric(r.end), poi: r.start.poi, poiCount: r.end.poiCount,
    travelledMetres: r.end.character?.distanceMetres - r.start.character?.distanceMetres })),
  mobile: read('mobile.json')?.rows.map(r => ({ viewport: r.viewport, emulationOnly: true, ...metric(r.end),
    travelledMetres: r.travelledMetres, layout: r.layout })),
  endurance: read('endurance.json')?.rows.map(r => ({ minute: r.minute, ...metric(r) })),
  cycles: cycles?.rows.map(r => ({ cycle: r.cycle, geometries: r.returned.environment.geometries,
    textures: r.returned.environment.textures, programs: r.returned.environment.programs, threeListeners: r.returned.environment.threeListeners,
    dom: r.dom, heapAfterGc: r.heap.usedSize, identity: r.returned.identity,
    positionDelta: delta(cycles.before.environment.position, r.returned.environment.position),
    projectionDelta: delta(cycles.before.environment.projection, r.returned.environment.projection), health: r.returned.health })),
  tests: { baseline: beforeTests && { total: beforeTests.numTotalTests, passed: beforeTests.numPassedTests, failed: beforeTests.numFailedTests },
    candidate: afterTests && { total: afterTests.numTotalTests, passed: afterTests.numPassedTests, failed: afterTests.numFailedTests },
    addedFailures: newFailures.filter(f => !oldKeys.has(`${f.file}:${f.test}`)),
    resolvedFailures: oldFailures.filter(f => !newKeys.has(`${f.file}:${f.test}`)) },
};
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
