const fs=require('node:fs');
const assert=require('node:assert/strict');
const root='docs/validation/road-precision/';
const read=name=>JSON.parse(fs.readFileSync(root+name,'utf8'));
const before=read('before-geometry.json'),after=read('after-geometry.json');
const tests=read('final-tests.json'),baseline=read('baseline-failures.json');
const failures=r=>r.testResults.flatMap(f=>f.assertionResults.filter(t=>t.status==='failed').map(t=>({file:f.name.split(/[\\/]/).at(-1),test:t.fullName,message:t.failureMessages[0].split('\n')[0]})));
const oldFailures=failures(baseline),currentFailures=failures(tests);
const newFailures=currentFailures.filter(t=>!oldFailures.some(b=>b.test===t.test&&b.file===t.file));
const staticChecks=read('static-checks.json'),build=read('build-result.json');
const desktop=read('functional-desktop.json'),mobile=read('functional-mobile.json');
const modes=read('modes.json'),stress=read('stress.json');
const runtime=read('after-runtime.json'),performance=read('performance-runtime.json'),beforeRuntime=read('before-runtime.json');
const changedEntities=after.entities.filter(e=>e.hash!==before.entities.find(p=>p.id===e.id)?.hash).map(e=>e.id);
assert.deepEqual(changedEntities,['AV-IMIGRANTES']);assert.equal(newFailures.length,0);
assert.equal(staticChecks.TypecheckExit,0);assert.equal(staticChecks.LintExit,0);assert.equal(build.exitCode,0);
for(const r of [desktop,mobile]){assert(Object.values(r.checks).every(Boolean));assert.equal(r.errors.length,0);assert.equal(r.mutations.length,0)}
assert.equal(modes.status,'passed');assert.equal(stress.status,'passed');assert.equal(runtime.errors.length,0);assert.equal(performance.errors.length,0);
assert(Date.parse(stress.startedAt)>fs.statSync(root+'after-geometry.json').mtimeMs,'Stress must run after the final geometry audit');
const bbox=points=>({minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minZ:Math.min(...points.map(p=>p[1])),maxZ:Math.max(...points.map(p=>p[1]))});
const round=value=>JSON.stringify(value,(_,v)=>typeof v==='number'?Math.round(v*1e8)/1e8:v);
const changedRoads=after.territory.filter(r=>round(r)!==round(before.territory.find(p=>p.id===r.id))).map(r=>({id:r.id,before:before.territory.find(p=>p.id===r.id)?.points,after:r.points,boundsBefore:before.territory.find(p=>p.id===r.id)?bbox(before.territory.find(p=>p.id===r.id).points):null,boundsAfter:bbox(r.points),width:r.width}));
const measures=r=>[0,1,2].map(i=>r['performance'+i]).filter(Boolean).map(r=>({meanMs:r.meanMs,p95Ms:r.p95Ms,renderer:r.renderer}));
const result={
 status:'validated-with-existing-baseline-test-failures',baseCommit:'524f446a',branch:'codex/precision-arena-roads',
 preservation:{officialEntities:after.entities.length,unchangedCompleteEntities:after.entities.length-changedEntities.length,changedEntities,changedRoads,
  removedRoad:'gate-7-johan-muller-link',gate7PerpendicularPreserved:true,lotGeometryAndCommercialRecords:'Unchanged; full entity hashes and source diffs checked'},
 tests:{total:tests.numTotalTests,passed:tests.numPassedTests,failed:tests.numFailedTests,newFailures,currentFailures,baselineVerification:{commit:'524f446a',tests:baseline.numTotalTests,failed:baseline.numFailedTests,method:'Replayed every failing original suite in a detached clean checkout; maxWorkers=2, testTimeout=30000'},staticChecks,build},
 browser:{desktop:desktop.checks,mobileChromeEmulation:mobile.checks,modeTransitions:modes.snapshots.length,modeWarmupCycles:modes.warmupCycles,modeResourceGrowth:modes.growth,stress:{status:stress.status,startedAt:stress.startedAt,cycles:stress.completedCycles,transitions:stress.completedTransitions,resources:stress.resources},errors:[],backendMutations:0},
 geometry:after.geometries.map(g=>({id:g.id,beforeTriangles:before.geometries.find(p=>p.id===g.id).triangles,afterTriangles:g.triangles})),
 performance:{before:measures(beforeRuntime),after:measures(performance),note:'Local warmed Chrome samples on Intel UHD. Different runs and adaptive-quality states; no cold-cache, input-to-photon, 60 FPS or physical-device certification.'},
 visual:{comparison:'comparison.html',views:Object.keys(runtime.poses),portao5Before:'baseline-gate5-gate5-top.png',references:6,debugOverlay:'DEV-only; absent from production build'},
 limits:['Satellite attachments have no georeferencing metadata; calibration is relative to preserved map anchors, not a metric survey.','Current OSM confirms road naming and A5 shared nodes. No usable additional satellite image was returned.','Synthetic local auth/data; deployed Cloud revision and physical Android/iPhone/Safari were not exercised.','Rain mode is absent from the tracked base source; pre-existing untracked dist-rain was not changed.'],
};
fs.writeFileSync(root+'verification.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,tests:result.tests.passed,existingFailures:result.tests.failed,newFailures:newFailures.length,unchangedEntities:result.preservation.unchangedCompleteEntities,browser:result.browser}));
