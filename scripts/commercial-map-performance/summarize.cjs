const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('docs/validation/systemic-performance');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
};
const loads = prefix => {
  const rows = [1, 2, 3].map(n => {
    const r = read(`${prefix}-${n}.json`);
    return { run: n, viewport: r.viewport, visible: r.visible, focused: r.focused, ...r.events, longTasks: r.longTasks };
  });
  const times = rows.map(r => r.presentationOpportunity);
  return { n: rows.length, p50: percentile(times, .5), p95NearestRank: percentile(times, .95), rows };
};
const lighting = name => {
  const r = read(name);
  return { file: name, userAgent: r.userAgent, viewport: r.viewport, lifecycle: r.lifecycle,
    rows: r.rows.length, foreground: r.rows.every(t => t.foreground),
    cameraMax: Math.max(...r.rows.map(t => t.cameraDelta)), quaternionMax: Math.max(...r.rows.map(t => t.quaternionDelta)),
    targetMax: Math.max(...r.rows.map(t => t.targetDelta)), projectionMax: Math.max(...r.rows.map(t => t.projectionDelta)),
    buffers: [...new Set(r.rows.flatMap(t => t.buffers))], programs: [...new Set(r.rows.flatMap(t => t.programs))],
    errors: r.rows.filter(t => t.health.lastErrorCode || t.health.contextLosses),
    resources: [...new Set(r.rows.map(t => `${t.last.geometries}/${t.last.textures}`))],
    perTransitionMedians: Object.fromEntries(['night', 'sunrise'].map(mode => {
      const rows = r.rows.filter(t => t.mode === mode && t.cycle > 0);
      return [mode, { n: rows.length, p50: percentile(rows.map(t => t.frameMs.p50), .5),
        p95: percentile(rows.map(t => t.frameMs.p95), .5), p99: percentile(rows.map(t => t.frameMs.p99), .5),
        allComplete: mode !== 'sunrise' || rows.every(t => t.last.sunrise === 'complete') }];
    })),
    first: r.rows[0], last: r.rows.at(-1),
  };
};
const result = {
  warning: 'Local reference fixture, n=3 reloads, uncontrolled HTTP/driver cache. Nearest-rank p95 is the maximum and does not estimate production p95. Lighting summaries are medians of per-transition percentiles, excluding cycle 0, not pooled frame percentiles.',
  baselineLoad: loads('baseline-iab-load'), afterLoad: loads('after-final-load'),
  baselineLighting: lighting('baseline-iab-lighting.json'), afterLighting: lighting('after-final-lighting.json'),
};
fs.writeFileSync(path.join(root, 'comparison.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
