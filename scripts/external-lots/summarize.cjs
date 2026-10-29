const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(process.argv[2]||'docs/validation/external-lots');
const read=file=>JSON.parse(fs.existsSync(file)?fs.readFileSync(file,'utf8'):zlib.gunzipSync(fs.readFileSync(file+'.gz')).toString('utf8'));
const reports=['performance','performance-low'].map(dir=>path.join(root,dir,'report.json'))
  .filter(file=>fs.existsSync(file)||fs.existsSync(file+'.gz')).map(read);
function distribution(values){const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return {samples:v.length,min:v[0],median:v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2,p95:v[Math.ceil(v.length*.95)-1],max:v.at(-1)};}
const groups=[];
for(const report of reports)for(const mode of ['private','public'])for(const label of ['baseline','candidate']){
  const rows=report.rows.filter(r=>r.label===label&&r.mode===mode),boots=[...new Map(rows.map(r=>[r.trial,r.boot])).values()];
  const captureManifest=read(path.join(root,`${label}-${report.quality.toLowerCase()}/report.json`)).manifest;
  groups.push({quality:report.quality,mode,label,runs:rows.length,allValid:rows.every(r=>r.valid),
    sourceMatchesCapture:rows.every(r=>JSON.stringify(r.manifest.hashes)===JSON.stringify(captureManifest.hashes)&&r.manifest.fixtureHash===captureManifest.fixtureHash),
    repetitions:rows.map(r=>({trial:r.trial,repeat:r.repeat,frames:r.framesMs,drawCalls:r.drawCalls,triangles:r.triangles})),
    framesMs:distribution(rows.flatMap(r=>r.frames.map(f=>f.duration))),
    framesOver50Ms:rows.flatMap(r=>r.frames).filter(f=>f.duration>50).length,
    draws:distribution(rows.flatMap(r=>r.snapshots.map(s=>s.calls))),
    triangles:distribution(rows.flatMap(r=>r.snapshots.map(s=>s.triangles))),
    readinessMs:distribution(boots.map(b=>b.documentToInteractiveMs)),
    startupMounts:rows.filter(r=>r.repeat===0).map(r=>({trial:r.trial,documentToInteractiveMs:r.boot.documentToInteractiveMs,sceneMs:r.boot.sceneMs,shaderDirectMs:r.boot.shaderDirectMs,textureUploadMs:r.boot.textureUploadMs})),
    geometries:distribution(rows.map(r=>r.after.stats.geometries)),textures:distribution(rows.map(r=>r.after.stats.textures)),programs:distribution(rows.map(r=>r.after.stats.programs)),
    buffers:[...new Set(rows.flatMap(r=>[JSON.stringify(r.before.buffer),JSON.stringify(r.after.buffer)]))],
    paths:[...new Set(rows.flatMap(r=>[r.before.health.path,r.after.health.path]))],
    errors:rows.flatMap(r=>r.errors),resourceStability:rows.map(r=>({trial:r.trial,repeat:r.repeat,
      geometries:[r.before.stats.geometries,r.after.stats.geometries],textures:[r.before.stats.textures,r.after.stats.textures],
      programs:[r.before.stats.programs,r.after.stats.programs]})),
  });
}
const visuals={};for(const quality of ['medium','low']){
  const before=read(path.join(root,`baseline-${quality}/report.json`));
  const after=read(path.join(root,`candidate-${quality}/report.json`));
  const anchors=new Map(),movedLabels=[];let duplicateLabels=false;
  for(const stage of after.stages.filter(s=>s.name!=='public-industry')){
    const labels=stage.layers.find(l=>l.name==='territorial-world-labels')?.data.labels||[];
    if(new Set(labels.map(l=>l.id)).size!==labels.length)duplicateLabels=true;
    for(const label of labels){const previous=anchors.get(label.id);if(previous&&label.anchor.some((v,i)=>Math.abs(v-previous[i])>1e-6))movedLabels.push({id:label.id,stage:stage.name});anchors.set(label.id,label.anchor);}
  }
  visuals[quality]={beforePassed:before.passed,afterPassed:after.passed,
    sameGeometry:before.entityGeometryHash===after.entityGeometryHash,sameLots:before.lotsHash===after.lotsHash,
    sameData:before.dataHash===after.dataHash,sameFixture:before.manifest.fixtureHash===after.manifest.fixtureHash,
    labelStability:{identities:anchors.size,duplicateLabels,movedLabels},
    stages:before.stages.map(a=>{const b=after.stages.find(b=>b.name===a.name);return {name:a.name,
      sameCamera:!!b&&a.camera.every((v,i)=>Math.abs(v-b.camera[i])<1e-6)&&a.target.every((v,i)=>Math.abs(v-b.target[i])<1e-6),
      sameViewport:JSON.stringify(a.viewport)===JSON.stringify(b?.viewport),sameBuffer:JSON.stringify(a.buffer)===JSON.stringify(b?.buffer),
      sameWeather:JSON.stringify(a.weather)===JSON.stringify(b?.weather),beforeWeather:a.weather,afterWeather:b?.weather};}),
  };
}
const result={environment:reports[0].environment,browser:reports[0].browser,qualities:reports.map(r=>r.quality),method:reports[0].method,orders:reports.map(r=>({quality:r.quality,order:r.order})),groups,visuals};
const timingPath=path.join(root,'render-timing/report.json');
if(fs.existsSync(timingPath)||fs.existsSync(timingPath+'.gz')){const timing=read(timingPath);result.renderTiming={quality:timing.quality,method:timing.method,order:timing.order,rows:timing.rows.map(r=>({label:r.label,mode:r.mode,trial:r.trial,valid:r.valid,multiDrawExtension:r.multiDrawExtension,timerExtension:r.timerExtension,buffer:r.buffer,health:r.health,timing:r.timing}))};}
fs.writeFileSync(path.join(root,'comparison.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
