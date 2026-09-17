// Summarizes recorded observations; does not run a browser or fabricate samples.
const fs = require('node:fs');
const path = require('node:path');
const read = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
const distribution = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const rank = (p) => sorted[Math.ceil(sorted.length * p) - 1] ?? null;
  const middle = sorted.length / 2;
  return { n: sorted.length, median: sorted.length ? (sorted[Math.floor(middle)] + sorted[Math.ceil(middle) - 1]) / 2 : null,
    p95NearestRank: rank(.95), p99NearestRank: rank(.99), min: sorted[0] ?? null, max: sorted.at(-1) ?? null };
};
const reloads = read('reloads.json');
const report = {
  interpretation: 'Local fixture, warmed HTTP cache, sequential runs on one Intel UHD machine. Not production, cold cache, physical mobile, GPU headroom or input-to-photon.',
  reloads: Object.fromEntries([...new Set(reloads.map((s) => s.label))].map((label) => {
    const rows = reloads.filter((s) => s.label === label);
    return [label, {
      interactiveMs: distribution(rows.map((s) => s.boot.summary.interactiveMs)),
      sceneMs: distribution(rows.map((s) => s.boot.summary.sceneMs)),
      directWarmupMs: distribution(rows.map((s) => s.boot.summary.shaderDirectMs)),
      firstPresentationOpportunityMs: distribution(rows.map((s) => s.preview.events.presentationOpportunity)),
      longestStartupTaskMs: distribution(rows.map((s) => Math.max(0, ...s.preview.longTasks.map((task) => task[1])))),
      foregroundAtPresentation: rows.every((s) => s.preview.visible && s.preview.focused),
      buffers: [...new Set(rows.map((s) => `${s.canvas[0].width}x${s.canvas[0].height}`))],
    }];
  })),
  lighting: {},
};
for (const name of ['baseline-lighting.json', 'after-lighting-fixed.json', 'after-lighting-adaptive.json']) {
  if (!fs.existsSync(path.join(__dirname, name))) continue;
  const data = read(name);
  report.lighting[name] = {
    nTransitions: data.rows.length,
    modes: Object.fromEntries(['night', 'sunrise'].map((mode) => {
      const rows = data.rows.filter((row) => row.mode === mode);
      return [mode, {
        interpretation: 'Distributions of per-window percentiles; not pooled frame percentiles.',
        windowP50Ms: distribution(rows.map((r) => r.frameMs.p50)),
        windowP95Ms: distribution(rows.map((r) => r.frameMs.p95)),
        windowP99Ms: distribution(rows.map((r) => r.frameMs.p99)),
        buffers: [...new Set(rows.flatMap((r) => r.buffers))],
        programs: [...new Set(rows.flatMap((r) => r.programs))],
        geometriesAtWindowEnd: rows.map((r) => r.last?.geometries),
        texturesAtWindowEnd: rows.map((r) => r.last?.textures),
      }];
    })),
    allForeground: data.rows.every((r) => r.foreground),
    allReady: data.rows.every((r) => r.health.status === 'ready'),
    contextLosses: Math.max(...data.rows.map((r) => r.health.contextLosses)),
    errors: data.rows.map((r) => r.health.lastErrorCode).filter(Boolean),
    maxCameraDeltaWithinWindow: Math.max(...data.rows.map((r) => r.cameraDelta)),
    maxTargetDeltaWithinWindow: Math.max(...data.rows.map((r) => r.targetDelta)),
    lifecycle: data.lifecycle,
  };
}
fs.writeFileSync(path.join(__dirname, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.reloads, null, 2));
