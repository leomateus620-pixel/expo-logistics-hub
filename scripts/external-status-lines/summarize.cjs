const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve('docs/validation/external-status-lines');
const read=p=>JSON.parse(fs.existsSync(p)?fs.readFileSync(p):zlib.gunzipSync(fs.readFileSync(p+'.gz')));
const write=(p,d)=>fs.writeFileSync(path.join(root,p),JSON.stringify(d,null,2));
const dist=v=>{v=v.filter(Number.isFinite).sort((a,b)=>a-b);return{n:v.length,median:v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2,p95:v[Math.ceil(v.length*.95)-1],min:v[0],max:v.at(-1)};};
const a=read(path.join(root,'baseline-medium/report.json')),b=read(path.join(root,'candidate-medium/report.json'));
assert.equal(a.dataHash,b.dataHash);assert.equal(a.entityGeometryHash,b.entityGeometryHash);assert.equal(a.lotsHash,b.lotsHash);assert(a.passed&&b.passed);assert.equal(a.manifest.fixtureHash,b.manifest.fixtureHash);assert.equal(a.manifest.inventoryHash,b.manifest.inventoryHash);
const pairs=a.stages.map(s=>{const t=b.stages.find(t=>t.name===s.name);assert(t);assert.deepEqual(s.viewport,t.viewport);assert.deepEqual(s.buffer,t.buffer);assert.deepEqual(s.weather,t.weather);assert(s.camera.every((n,i)=>Math.abs(n-t.camera[i])<1e-8));assert(s.target.every((n,i)=>Math.abs(n-t.target[i])<1e-8));return{name:s.name,viewport:s.viewport,buffer:s.buffer,camera:s.camera,target:s.target,healthBefore:s.health,healthAfter:t.health};});
const coverage=b.stages[0].decisionDiagnostics;
assert.deepEqual(coverage.expectedExternalLotIds,coverage.recognizedExternalLotIds);assert.deepEqual(coverage.expectedExternalLotIds,coverage.renderedExternalLotIds);
const functional=read(path.join(root,'functional/report.json'));assert(functional.passed);
const controls=read(path.join(root,'pavilion-controls/report.json'));assert(controls.passed);
const geometry=read(path.join(root,'geometry/report.json'));assert(geometry.passed);
const summary={dataHash:a.dataHash,geometryHash:a.entityGeometryHash,lotsHash:a.lotsHash,baselineManifest:a.manifest,candidateManifest:b.manifest,visualPairs:pairs,coverage:{externalCounts:coverage.externalCounts,expectedLotIds:coverage.expectedExternalLotIds,renderedLotIds:coverage.renderedExternalLotIds,renderedHatchLotIds:coverage.renderedHatchLotIds},functional:{passed:functional.passed,checks:functional.checks},pavilionControls:{passed:controls.passed,rows:controls.rows.map(r=>({label:r.label,mode:r.mode,groups:r.modules.length,internalRows:r.internalRows.length,soldInternal:r.internalRows.filter(r=>r.status==='SOLD').length,openInternal:r.internalRows.filter(r=>r.status==='SALE_OPEN').length}))},geometry:{passed:geometry.passed,views:geometry.rows.map(r=>({label:r.label,name:r.name,count:r.rows.length}))}};
const perfPath=path.join(root,'performance/report.json');
if(fs.existsSync(perfPath)||fs.existsSync(perfPath+'.gz')){
 const perf=read(perfPath);assert(perf.rows.every(r=>r.valid));summary.performance={order:perf.order,method:perf.method,environment:perf.environment,browser:perf.browser,groups:[]};
 for(const mode of['private','public'])for(const label of['baseline','candidate']){
  const rows=perf.rows.filter(r=>r.label===label&&r.mode===mode),mounts=rows.filter(r=>r.repeat===0);
  summary.performance.groups.push({label,mode,mounts:mounts.length,gestures:rows.length,frameMs:dist(rows.flatMap(r=>r.frames.map(f=>f.duration))),drawCalls:dist(rows.flatMap(r=>r.snapshots.map(s=>s.calls))),triangles:dist(rows.flatMap(r=>r.snapshots.map(s=>s.triangles))),openingMarkerMs:dist(mounts.map(r=>r.boot?.documentToInteractiveMs)),eventToTwoFramesMs:dist(rows.map(r=>r.interactionMs)),shadowPassesPerGesture:dist(rows.map(r=>r.after.shadowPasses.totalShadowPasses-r.before.shadowPasses.totalShadowPasses)),shadowDrawCallsPerGesture:dist(rows.map(r=>r.after.shadowPasses.totalShadowDrawCalls-r.before.shadowPasses.totalShadowDrawCalls)),resources:rows.map(r=>({trial:r.trial,repeat:r.repeat,geometries:r.after.stats.geometries,textures:r.after.stats.textures,programs:r.after.stats.programs,materials:r.after.materialCount,shadows:r.after.shadowPasses,networkResources:r.after.network.length,buffer:r.after.buffer,dpr:r.after.dpr})),errors:rows.flatMap(r=>r.errors)});
 }
}
write('comparison.json',summary);
const index=[];
for(const dir of['baseline-medium','candidate-medium','geometry','pavilion-controls'])for(const name of fs.readdirSync(path.join(root,dir)).filter(n=>n.endsWith('.png'))){const file=path.join(root,dir,name),buffer=fs.readFileSync(file);index.push({file:dir+'/'+name,bytes:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex')});}
write('evidence-index.json',index);
// Reports preserve full samples and render-layer metadata without bloating Git.
for(const dir of['baseline-medium','candidate-medium','geometry','pavilion-controls','functional','performance']){
 const folder=path.join(root,dir);if(!fs.existsSync(folder))continue;
 for(const name of fs.readdirSync(folder).filter(n=>n.endsWith('.json')&&n!=='report.json'&&dir==='performance')){const file=path.join(folder,name);fs.writeFileSync(file+'.gz',zlib.gzipSync(fs.readFileSync(file),{level:9}));fs.unlinkSync(file);}
 const file=path.join(folder,'report.json');if(fs.existsSync(file)){fs.writeFileSync(file+'.gz',zlib.gzipSync(fs.readFileSync(file),{level:9}));fs.unlinkSync(file);}
}
console.log(JSON.stringify({pairs:pairs.length,coverage:summary.coverage.externalCounts,performance:summary.performance?.groups.map(g=>({label:g.label,mode:g.mode,mounts:g.mounts,gestures:g.gestures,frameMs:g.frameMs,opening:g.openingMarkerMs,calls:g.drawCalls}))},null,2));
