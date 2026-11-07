import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root=path.resolve('dist/assets');
const files=fs.readdirSync(root);
function find(prefix){const result=files.find(file=>file.startsWith(prefix+'-')&&file.endsWith('.js'));if(!result)throw new Error(`Missing ${prefix} production chunk`);return result;}
function graph(start){
  const visited=new Set(),queue=[start];
  while(queue.length){
    const file=queue.shift();if(visited.has(file))continue;visited.add(file);
    const source=fs.readFileSync(path.join(root,file),'utf8');
    const pattern=/(?:import|export)[^;]*?from["'](\.[^"']+\.js)["']|import["'](\.[^"']+\.js)["']/g;
    for(const match of source.matchAll(pattern))queue.push(path.basename(match[1]||match[2]));
  }
  return [...visited];
}
const portal=find('CommissionPortalPage'),gallery=find('MemorialExperience'),viewer=find('MemorialViewer'),renderer=find('PlateRenderer');
const portalGraph=graph(portal),galleryGraph=graph(gallery);
const forbiddenPortal=portalGraph.filter(file=>/MemorialExperience|MemorialViewer|PlateRenderer/.test(file));
const forbiddenGallery=galleryGraph.filter(file=>/maps-three|maps-physics|MemorialViewer|PlateRenderer|VenueScene|CommercialMapCanvas/.test(file));
if(forbiddenPortal.length||forbiddenGallery.length)throw new Error('Lazy boundary regression: '+[...forbiddenPortal,...forbiddenGallery].join(', '));
const sizes=[portal,gallery,viewer,renderer,find('maps-three')].map(file=>{const bytes=fs.readFileSync(path.join(root,file));return{file,bytes:bytes.length,gzipBytes:zlib.gzipSync(bytes).length};});
const report={portalStaticGraph:portalGraph,galleryStaticGraph:galleryGraph,forbiddenPortal,forbiddenGallery,chunks:sizes,note:'Static compressed sizes are not observed network traffic. Browser requests are recorded separately; pre-existing portal resources belong to their own baseline.'};
fs.writeFileSync('docs/memorial/bundle-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({lazyBoundaries:'passed',chunks:sizes},null,2));
