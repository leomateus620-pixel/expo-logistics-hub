import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Inventory comes from the browser's observed pageAssets resource sources.
// File sizes describe payloads; they do not claim cold-cache transfer bytes.
const evidence='docs/memorial/evidence/browser-observations.json';
const observations=JSON.parse(fs.readFileSync(evidence,'utf8'));
function measure(assets) {
  const unique=new Map(assets.filter(asset=>asset.sources.some(source=>source.kind==='resource')).map(asset=>[asset.url,asset]));
  return [...unique.values()].map(asset=> {
    const relative=decodeURIComponent(new URL(asset.url).pathname).replace(/^\//,'');
    if (relative.split('/').includes('..') || !/^(assets|memorial-voluntariado)\//.test(relative)) throw new Error('Unexpected asset scope');
    const file=path.join(relative.startsWith('assets/')?'dist':'public',relative);
    const bytes=fs.readFileSync(file);
    return {url:asset.url,kind:asset.kind,bytes:bytes.length,compressedBytes:/\.(js|css)$/.test(relative)?zlib.gzipSync(bytes).length:bytes.length};
  });
}
const gallery=measure(observations.desktopGallery.assets);
const detail=measure(observations.desktop2004.assets.filter(asset=>/MemorialViewer|PlateRenderer|maps-three|\/art\/fenasoja-2004|\/fenasoja-2004-[\w-]+\.js/.test(asset.url)));
function sum(files){return{fileCount:files.length,fileBytes:files.reduce((sum,file)=>sum+file.bytes,0),compressedPayloadBytes:files.reduce((sum,file)=>sum+file.compressedBytes,0)};}
const report={
  note:'Recursos proprios observados do Memorial, excluindo a base preexistente do portal. Pesos nominais dos arquivos; gzip calculado para JS/CSS. Nao sao bytes transferidos nem um teste de cache frio. O incremento do detalhe exclui miniaturas adicionais solicitadas pela rolagem da galeria.',
  gallery:{...sum(gallery),files:gallery},
  opened2004Increment:{...sum(detail),files:detail},
};
fs.writeFileSync('docs/memorial/runtime-weights.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({gallery:sum(gallery),opened2004Increment:sum(detail)},null,2));
