const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const head=path.resolve('dist'),baseline=path.resolve(process.argv[2]||process.env.SOY_BASELINE_DIST||'');
if(!fs.existsSync(path.join(baseline,'assets')))throw new Error('Pass the baseline production dist directory');
function chunks(root){return fs.readdirSync(path.join(root,'assets')).filter(n=>/^(maps-three|CommissionPortalPage|FenasojaPortalHero|SoySummit|VenueScene|hall-|auditorium-|stage-reveal|soy-summit-|index-).*\.(js|css)$/.test(n)).map(name=>{const data=fs.readFileSync(path.join(root,'assets',name));return {name,bytes:data.length,gzipBytes:zlib.gzipSync(data).length}})}
function graph(root,start){
 const visited=new Set(),queue=[start];
 while(queue.length){const file=queue.shift();if(visited.has(file)||!fs.existsSync(file))continue;visited.add(file);
  const source=fs.readFileSync(file,'utf8');const pattern=/(?:import|export)[^;]*?from["'](\.[^"']+\.js)["']|import["'](\.[^"']+\.js)["']/g;
  for(const match of source.matchAll(pattern))queue.push(path.resolve(path.dirname(file),match[1]||match[2]));
 }
 return [...visited].map(f=>path.basename(f));
}
const portal=fs.readdirSync(path.join(head,'assets')).find(n=>/^CommissionPortalPage-.*\.js$/.test(n));
const imports=graph(head,path.join(head,'assets',portal));
const unexpected=imports.filter(n=>/VenueScene|SoySummitVisitPage|auditorium-|hall-|stage-reveal/.test(n));
if(unexpected.length)throw new Error('Portal statically imports venue: '+unexpected.join(','));
fs.writeFileSync('docs/soy-summit/evidence/bundles.json',JSON.stringify({baseline:chunks(baseline),head:chunks(head),portalStaticGraph:imports,venueInPortalGraph:unexpected,note:'Static bundle sizes are not traffic measurements. The pre-existing Alvorada intro can dynamically load maps-three.'},null,2));
console.log({portal,venueInPortalGraph:unexpected});
