const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const files = process.argv.slice(2);
if (!files.length) throw Error('Provide startup-matrix JSON files explicitly; diagnostic runs are excluded.');
const groups = new Map(), excluded = [], failures = [];
const finite = value => typeof value === 'number' && Number.isFinite(value);
const round = value => Math.round(value * 100) / 100;
function stats(values) {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return { n: sorted.length, min: round(sorted[0]), median: round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2),
    max: round(sorted.at(-1)), p95NearestRank: round(sorted[Math.ceil(sorted.length * .95) - 1]) };
}
for (const file of files) {
  const raw = fs.readFileSync(file), rows = JSON.parse((file.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString('utf8'));
  for (const row of rows) {
    if (row.diagnosticCpuProfiling || row.diagnosticGlProbe) { excluded.push({ file, scenario: row.scenario, round: row.round }); continue; }
    const key = [path.basename(file).replace(/\.json(?:\.gz)?$/, ''), row.scenario, row.tierRequested, row.mobileEmulation ? 'emulated-mobile' : 'desktop'].join(' / ');
    const list = groups.get(key) || []; list.push(row); groups.set(key, list);
    if (row.errors?.length || row.presentation?.health?.status !== 'ready' || row.afterGesture?.health?.status !== 'ready'
      || row.presentation?.health?.contextLosses || row.afterGesture?.health?.contextLosses) failures.push({ file, scenario: row.scenario, round: row.round });
  }
}
const report = {
  method: 'Same local fixture renderer; fresh browser/context per case except SPA reopen. Route clock and click clock remain separate. No auth/network or physical mobile certification.',
  percentileLimit: 'Exploratory samples. With n=3, nearest-rank p95 equals the observed maximum; it is not a production-tail estimate.',
  completeLimit: 'Fully-presented time is the harness observation of hydration complete plus post ready, not an exact first-post timestamp. Null means not observed.',
  excluded, failures,
  groups: [...groups].map(([name, rows]) => ({ name, samples: rows.length,
    routeToInteractiveMs: stats(rows.map(r => r.presentation.boot.summary.interactiveMs)),
    clickToInteractiveMs: stats(rows.map(r => r.clickToInteractiveMs)),
    documentToInteractiveMs: stats(rows.map(r => r.presentation.boot.summary.documentToInteractiveMs)),
    completePresentationObservedMs: stats(rows.map(r => r.fullyPresentedObservedMs)),
    longestRouteTaskMs: stats(rows.map(r => Math.max(0, ...r.presentation.probe.longTasks
      .filter(t => t.at >= r.presentation.boot.summary.routeStartedAt).map(t => t.duration)))),
    sceneMs: stats(rows.map(r => r.presentation.boot.summary.sceneMs)), shaderDirectMs: stats(rows.map(r => r.presentation.boot.summary.shaderDirectMs)),
    firstDrawCalls: stats(rows.map(r => r.presentation.renderer.calls)), firstDrawTriangles: stats(rows.map(r => r.presentation.renderer.triangles)),
    firstDrawPrograms: stats(rows.map(r => r.presentation.renderer.programs)),
    freshPrewarmChecks: rows.filter(r => r.scenario !== 'reopen' && r.beforeClick).map(r => ({ round: r.round,
      contexts: r.beforeClick.probe.contexts, canvases: r.beforeClick.canvasCount, bootCreated: Boolean(r.beforeClick.boot), stages: r.beforeClick.state?.stages })),
  })),
};
const output = process.env.STARTUP_SUMMARY_OUTPUT || 'docs/validation/visit-mode/evidence/final/startup-summary.json';
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ groups: report.groups.map(g => ({ name: g.name, interactive: g.clickToInteractiveMs || g.routeToInteractiveMs, longestTask: g.longestRouteTaskMs })), failures, excluded }, null, 2));
if (failures.length) process.exitCode = 1;
