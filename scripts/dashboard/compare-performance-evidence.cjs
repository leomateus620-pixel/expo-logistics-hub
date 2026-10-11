// Strict visual/DOM comparison plus matched browser performance summaries.
// Run after both phases have completed; no thresholds hide changed pixels.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const playwright = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { PNG } = require(process.env.PNGJS_MODULE || path.resolve(path.dirname(require.resolve(playwright)), '../pngjs'));
const directory = path.resolve(process.env.DASHBOARD_EVIDENCE_DIR || 'docs/validation/dashboard-interaction-performance');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
const stats = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const at = (fraction) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
  return { count: sorted.length, median: at(.5), p95: at(.95), worst: sorted.at(-1) ?? null };
};
const pipeline = (file) => Object.fromEntries(Object.entries(read(file)).map(([stage, values]) => [stage,
  values.n > 0 ? { available: true, ...values }
    : { available: false, n: 0, total: null, median: null, p95: null, worst: null,
      reason: 'The trace contains no complete duration entries for this stage; elapsed cost is unavailable.' },
]));
const images = [];
for (const view of ['overview', 'internal', 'pavilion-1', 'pavilion-3', 'pavilion-5', 'pavilion-7', 'pavilion-8', 'pavilion-12', 'pavilion-13', 'pavilion-14', 'sales', 'detail']) {
  const beforeFile = path.join(directory, 'visual', `before-${view}.png`);
  const afterFile = path.join(directory, 'visual', `after-${view}.png`);
  const beforeBytes = fs.readFileSync(beforeFile), afterBytes = fs.readFileSync(afterFile);
  const before = PNG.sync.read(beforeBytes), after = PNG.sync.read(afterBytes);
  const sameDimensions = before.width === after.width && before.height === after.height;
  let changedPixels = 0, maximumChannelDifference = 0;
  if (sameDimensions) for (let offset = 0; offset < before.data.length; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const difference = Math.abs(before.data[offset + channel] - after.data[offset + channel]);
      changed ||= difference !== 0;
      maximumChannelDifference = Math.max(maximumChannelDifference, difference);
    }
    if (changed) changedPixels += 1;
  }
  images.push({ view, beforeSha256: hash(beforeBytes), afterSha256: hash(afterBytes),
    beforeDimensions: [before.width, before.height], afterDimensions: [after.width, after.height],
    identicalPixels: sameDimensions && changedPixels === 0,
    changedPixels: sameDimensions ? changedPixels : null, maximumChannelDifference });
}
const runs = [], presentation = [];
for (const rate of [1, 4]) {
  const before = read(`before-${rate}x.json`), after = read(`after-${rate}x.json`);
  const beforeStart = before.records[0]?.start ?? Infinity, afterStart = after.records[0]?.start ?? Infinity;
  const timing = (run, started) => {
    const events = run.events.filter((event) => event.start >= started);
    return { eventTiming: { inputDelay: stats(events.map((event) => event.processingStart - event.start)),
      handler: stats(events.map((event) => event.processingEnd - event.processingStart)),
      duration: stats(events.map((event) => event.duration)), note: 'Event Timing entries have a 16ms duration threshold and may include several events per interaction.' },
    captureInputDelay: stats(run.records.map((record) => record.inputDelay)),
    warmedLongTasks: stats(run.longTasks.filter((task) => task.start >= started).map((task) => task.duration)),
    firstOpeningMs: run.firstOpening, memoryCycles: run.memoryCycles };
  };
  runs.push({ cpuRate: rate, before: timing(before, beforeStart), after: timing(after, afterStart),
    interactions: Object.keys(before.summary).map((name) => {
      const operation = (run) => {
        const records = run.records.filter((record) => record.name === name);
        const summary = run.summary[name];
        return { feedback: summary.feedback, consistent: summary.consistent,
          reactOperation: summary.react,
          reactAfterEventStart: stats(records.map((record) => record.renders
            .filter((sample) => sample[0] === 'CommercialDashboard' && sample[4] >= record.start)
            .reduce((total, sample) => total + sample[2], 0))),
          geometryOperation: summary.geometry,
          geometryAfterEventStart: stats(records.map((record) => record.geometry
            .filter((sample) => sample.start >= record.start)
            .reduce((total, sample) => total + sample.duration, 0))) };
      };
      return { name, before: operation(before), after: operation(after) };
    }),
    renderWindowNote: 'Operation starts before Playwright moves/focuses the target, so it can include hover/focus work before the captured click. AfterEventStart uses Profiler startTime/geometry start >= the captured event start; nested component durations are not summed.',
    pipeline: { before: pipeline(`before-${rate}x-pipeline.json`), after: pipeline(`after-${rate}x-pipeline.json`),
      note: 'Nested trace stages overlap; their totals must not be summed into end-to-end interaction time.' } });
  if (rate === 1) for (const baseline of before.presentations) {
    const candidate = after.presentations.find((entry) => entry.name === baseline.name);
    const beforeSerialized = JSON.stringify(baseline), afterSerialized = JSON.stringify(candidate);
    presentation.push({ name: baseline.name, identical: beforeSerialized === afterSerialized,
      beforeSha256: hash(beforeSerialized), afterSha256: candidate ? hash(afterSerialized) : null,
      differentFields: candidate ? Object.keys(baseline).filter((field) => JSON.stringify(baseline[field]) !== JSON.stringify(candidate[field])) : ['missing'],
      lots: baseline.lots.length, outlines: baseline.outlines.length, numbers: baseline.numbers.length });
  }
}
const result = { capturedAt: new Date().toISOString(), images, presentation, runs,
  limitations: ['Browser runs use Chrome, official local fixture and CPU emulation; no physical integrated GPU certification.',
    'Click feedback is a two-requestAnimationFrame presentation proxy; Event Timing and trace stages are reported separately.',
    'First opening includes module import/evaluation in the QA Vite server and is separate from warmed navigation.'] };
fs.writeFileSync(path.join(directory, 'comparison.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ imageMatches: images.filter((item) => item.identicalPixels).length, images: images.length,
  presentationMatches: presentation.filter((item) => item.identical).length, presentations: presentation.length,
  changedImages: images.filter((item) => !item.identicalPixels), changedPresentation: presentation.filter((item) => !item.identical) }, null, 2));
if (images.some((item) => !item.identicalPixels) || presentation.some((item) => !item.identical)) process.exitCode = 1;
