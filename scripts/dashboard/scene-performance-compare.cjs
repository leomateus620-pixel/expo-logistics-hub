const fs = require('node:fs');
const path = require('node:path');
const directory = process.env.SCENE_OUTPUT || 'docs/validation/dashboard-interaction-performance/scene';
const labels = [process.env.SCENE_BEFORE || 'before-integrated-retry', process.env.SCENE_AFTER || 'after-integrated'];
const read = (label, suffix) => JSON.parse(fs.readFileSync(path.join(directory, `${label}-${suffix}.json`), 'utf8'));
const percentile = (values, ratio) => [...values].sort((a,b) => a-b)[Math.min(values.length-1, Math.ceil(values.length*ratio)-1)] ?? null;
const distribution = values => ({ n: values.length, median: percentile(values,.5), p95: percentile(values,.95), worst: values.length ? Math.max(...values) : null });
function interactionSummary(records) {
  return Object.fromEntries([...new Set(records.map(row => row.name))].map(name => {
    const rows = records.filter(row => row.name === name);
    const profiles = [...new Set(rows.flatMap(row => row.renders.filter(sample => sample[4] >= row.start).map(sample => sample[0])))];
    return [name, {
      inputDelay: distribution(rows.map(row => row.inputDelay)),
      handlerToFeedback: distribution(rows.map(row => row.feedback)),
      eventToFeedback: distribution(rows.map(row => row.inputDelay + row.feedback)),
      handlerToConsistent: distribution(rows.map(row => row.consistent)),
      eventToConsistent: distribution(rows.map(row => row.inputDelay + row.consistent)),
      // Each nested Profiler is inclusive. Never sum different boundaries into
      // a fictitious total React duration; compare each boundary independently.
      reactByBoundary: Object.fromEntries(profiles.map(id => [id, distribution(rows.map(row => row.renders
        .filter(sample => sample[0] === id && sample[4] >= row.start).reduce((total,sample) => total + sample[2], 0)))])),
      geometry: distribution(rows.map(row => row.geometry.filter(sample => sample.start >= row.start).reduce((total,sample) => total + sample.duration, 0))),
    }];
  }));
}
const result = {
  labels,
  method: 'Three repetitions; matched fixture/qualityQa=HIGH/post gate and action order. Event-to-feedback adds event dispatch delay to handler-to-two-rAF. React and geometry costs exclude samples starting before the event.',
  boundaries: 'React Profiler actualDuration is inclusive per named boundary; geometry sum covers only separately instrumented builders, not all JS work.',
  interactions: labels.map(label => ({ label, summary: interactionSummary(read(label,'integrated-interactions').records) })),
  intervals: labels.map(label => ({ label, intervals: Object.fromEntries(['visible-dry','covered-dry','covered-rain','resumed-rain'].map(name => {
    const row = read(label,name);
    return [name, { durationMs: row.elapsedMs, frames: row.presentedFramesDelta, framesPerSecond: row.presentedFramesDelta / (row.elapsedMs/1000),
      longTaskCount: row.longTasks.length, longTaskDurationMs: row.longTasks.reduce((total,task) => total + task.duration,0), longTaskDistribution: distribution(row.longTasks.map(task => task.duration)),
      health: row.after.health, resources: row.after.renderer, ready: row.after.dataset.commercialMapReady, hydration: row.after.dataset.commercialMapHydration,
      dashboardOpen: row.after.dashboardOpen, loader: row.after.loader ?? null }];
  })) })),
};
fs.writeFileSync(path.join(directory,'comparison.json'), JSON.stringify(result,null,2));
console.log(JSON.stringify(result.interactions.map(({label,summary}) => ({label,summary:Object.fromEntries(Object.entries(summary).map(([name,row]) => [name,{eventToFeedback:row.eventToFeedback,eventToConsistent:row.eventToConsistent,geometry:row.geometry}]))})),null,2));
