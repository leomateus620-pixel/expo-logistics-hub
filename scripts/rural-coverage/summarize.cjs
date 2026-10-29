const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]||'docs/validation/rural-coverage');
const read=file=>JSON.parse(fs.existsSync(file)?fs.readFileSync(file,'utf8'):zlib.gunzipSync(fs.readFileSync(file+'.gz')).toString('utf8'));
const distribution=values=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return {samples:v.length,min:v[0],median:v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2,p95:v[Math.ceil(v.length*.95)-1],max:v.at(-1)};};
const before=read(path.join(root,'baseline-medium/report.json')),after=read(path.join(root,'candidate-medium/report.json'));
const originalPngSha=relative=>{
 const file=path.join(root,relative);if(fs.existsSync(file))return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const index=read(path.join(root,'evidence-index.json')),entry=index.entries.find(entry=>entry.path===relative);
 if(!entry)throw Error('Missing original image hash '+relative);return entry.sha256;
};
const result={environment:after.environment,browser:after.browser,visual:{beforePassed:before.passed,afterPassed:after.passed,
 sameData:before.dataHash===after.dataHash,sameLots:before.lotsHash===after.lotsHash,sameGeometry:before.entityGeometryHash===after.entityGeometryHash,
 sameFixture:before.manifest.fixtureHash===after.manifest.fixtureHash,sameInventory:before.manifest.inventoryHash===after.manifest.inventoryHash,
 stages:before.stages.map(a=>{const b=after.stages.find(b=>b.name===a.name);return {name:a.name,
  sameCamera:a.camera.every((v,i)=>Math.abs(v-b.camera[i])<1e-6)&&a.target.every((v,i)=>Math.abs(v-b.target[i])<1e-6),
  sameViewport:JSON.stringify(a.viewport)===JSON.stringify(b.viewport),sameBuffer:JSON.stringify(a.buffer)===JSON.stringify(b.buffer),
  sameWeather:JSON.stringify(a.weather)===JSON.stringify(b.weather)};}),
 controls:['automotive-top','industry-roads-top','industry-close'].map(name=>({name,
  pngBytesIdentical:originalPngSha('baseline-medium/'+name+'.png')===originalPngSha('candidate-medium/'+name+'.png')})),
 coverage:['exporural-top','public-exporural'].map(name=>{
  const a=before.stages.find(s=>s.name===name),b=after.stages.find(s=>s.name===name),d=b.decisionDiagnostics;
  const rural=d.rows.filter(r=>r.expectedRural);
  return {name,before:{inventory:a.rural.length,frameGeometry:a.rural.filter(r=>r.frameInstance!==null).length,
   visibleFrames:a.rural.filter(r=>r.frameVisible).length,checks:a.rural.filter(r=>r.confirmation).length,locks:a.rural.filter(r=>r.lock).length},
   after:{...d.counts,grass:rural.filter(r=>r.rendered?.surface?.turf===1).length,frames:rural.filter(r=>r.rendered?.frame?.visible).length,
    frameColors:rural.filter(r=>r.rendered?.frame?.visible).reduce((counts,r)=>{const c=r.rendered.frame.color;counts[c]=(counts[c]||0)+1;return counts;},{}),
    checks:rural.filter(r=>r.rendered?.marker?.type==='sold-lot-confirmations').length,locks:rural.filter(r=>r.rendered?.marker?.type==='sold-lot-locks').length},
   expectedLotIds:d.expectedRuralLotIds,recognizedLotIds:d.recognizedRuralLotIds};
 }),
},performance:[]};
for(const dir of ['performance','performance-low']){
 const file=path.join(root,dir,'report.json');if(!fs.existsSync(file)&&!fs.existsSync(file+'.gz'))continue;
 const report=read(file);
 for(const label of ['baseline','candidate'])for(const mode of ['private','public']){
  const rows=report.rows.filter(r=>r.label===label&&r.mode===mode),mounts=rows.filter(r=>r.repeat===0);
  result.performance.push({quality:report.quality,label,mode,runs:rows.length,allValid:rows.every(r=>r.valid),
   sourceMatchesCapture:rows.every(r=>JSON.stringify(r.manifest.hashes)===JSON.stringify((label==='baseline'?before:after).manifest.hashes)&&r.manifest.fixtureHash===after.manifest.fixtureHash),
   framesMs:distribution(rows.flatMap(r=>r.frames.map(s=>s.duration))),framesOver50:rows.flatMap(r=>r.frames).filter(s=>s.duration>50).length,
   draws:distribution(rows.flatMap(r=>r.snapshots.map(s=>s.calls))),triangles:distribution(rows.flatMap(r=>r.snapshots.map(s=>s.triangles))),
   startup:mounts.map(r=>({trial:r.trial,interactiveMs:r.boot.documentToInteractiveMs,sceneMs:r.boot.sceneMs,shaderDirectMs:r.boot.shaderDirectMs})),
   geometries:distribution(rows.map(r=>r.after.stats.geometries)),textures:distribution(rows.map(r=>r.after.stats.textures)),programs:distribution(rows.map(r=>r.after.stats.programs)),
   buffers:[...new Set(rows.flatMap(r=>[JSON.stringify(r.before.buffer),JSON.stringify(r.after.buffer)]))],
   resourceRows:rows.map(r=>({trial:r.trial,repeat:r.repeat,before:r.before.stats,after:r.after.stats})),
   method:report.method,order:report.order});
 }
}
const functionalPath=path.join(root,'functional/report.json');if(fs.existsSync(functionalPath))result.functional=read(functionalPath);
const valid=result.visual.beforePassed&&result.visual.afterPassed&&result.visual.sameData&&result.visual.sameGeometry&&result.visual.sameLots&&result.visual.sameFixture&&result.visual.sameInventory
 &&result.visual.stages.every(s=>s.sameCamera&&s.sameViewport&&s.sameBuffer&&s.sameWeather)
 &&result.visual.coverage.every(c=>c.after.expected===108&&c.after.recognized===108&&c.after.grass===108&&c.after.frameFailures===0&&c.after.locks===0)
 &&result.performance.every(g=>g.allValid&&g.sourceMatchesCapture)&&result.functional?.passed;
result.passed=valid;
fs.writeFileSync(path.join(root,'comparison.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({passed:valid,visual:result.visual,performance:result.performance.map(({resourceRows,method,...r})=>r),functionalPassed:result.functional?.passed},null,2));
if(!valid)process.exitCode=1;
