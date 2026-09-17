const fs = require('node:fs');
const path = require('node:path');
const root = 'docs/validation/spatial-cleanup';
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const phases = {};
for (const phase of ['before','after']) {
  const runs = read(`${phase}-runtime.json`).runs;
  const inventory = read(`${phase}-inventory.json`);
  phases[phase] = {
    runs: runs.length,
    inventory: Object.fromEntries(['buildings','trees','patches','roads'].map(k=>[k,inventory[k].length])),
    ponds: inventory.patches.filter(p=>p.kind==='water').length,
    allocation: Object.fromEntries(['objects','meshes','instances','allocatedTriangles','geometries','materials','geometryBufferBytes'].map(k=>[k,median(runs.map(r=>r.complete[k]))])),
    renderer: Object.fromEntries(['textures','programs','heapBytes'].map(k=>[k,median(runs.map(r=>r.complete.renderer[k]))])),
    boot: {
      firstInteractiveMs: median(runs.map(r=>r.first.boot.marks['first-interactive'])),
      essentialPresentedMs: median(runs.map(r=>phase==='before'
        ? Math.max(...Object.entries(r.complete.boot.marks).filter(([k])=>k.startsWith('hydrate:')&&k.endsWith(':end')&&!/^hydrate:(rain|hydrology|interior-shaders|physics-module):/.test(k)).map(([,v])=>v))
        : r.first.boot.marks['commercial-map-ready'])),
      optionalQueueCompleteMs: median(runs.map(r=>r.complete.boot.marks['secondary-hydration-complete'])),
      // Diagnostics retains at most 500 events. Report censoring explicitly.
      recordedLongTasks: median(runs.map(r=>r.boot.longTasks?.length??0)),
      recordedLongTaskDurationMs: median(runs.map(r=>(r.boot.longTasks??[]).reduce((n,t)=>n+t.duration,0))),
      longTaskBufferSaturated: runs.some(r=>r.boot.longTasks?.length===500),
    },
    views: Object.fromEntries(runs[0].performance.map(p=>[p.id,{
      meanMs: median(runs.map(r=>r.performance.find(q=>q.id===p.id).meanMs)),
      fpsFromMean: 1000/median(runs.map(r=>r.performance.find(q=>q.id===p.id).meanMs)),
      p95Ms: median(runs.map(r=>r.performance.find(q=>q.id===p.id).p95Ms)),
      calls: median(runs.map(r=>r.performance.find(q=>q.id===p.id).renderer.calls)),
      triangles: median(runs.map(r=>r.performance.find(q=>q.id===p.id).renderer.triangles)),
      quality: runs.map(r=>{const q=r.performance.find(q=>q.id===p.id).renderer;return {tier:q.qualityTier,dpr:q.dpr};}),
    }])),
    errors: runs.flatMap(r=>r.errors),
    health: runs.flatMap(r=>r.performance.map(p=>p.health)),
  };
}
fs.writeFileSync(path.join(root,'comparison.json'),JSON.stringify(phases,null,2)+'\n');
console.log(JSON.stringify(phases,null,2));
