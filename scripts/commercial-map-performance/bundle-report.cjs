const fs = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const root = path.resolve(process.argv[2]);
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.vite/manifest.json'), 'utf8'));
const entry = 'src/pages/CommercialMapPage.tsx';
const visited = new Set();
function visit(key) {
  if (visited.has(key)) return;
  visited.add(key);
  for (const imported of manifest[key]?.imports || []) visit(imported);
}
visit(entry);
const chunks = [...visited].map(key => {
  const file = manifest[key].file;
  const content = fs.readFileSync(path.join(root, file));
  return { key, file, bytes: content.length, gzipBytes: gzipSync(content).length };
});
const report = { entry, chunks, staticBytes: chunks.reduce((n,c)=>n+c.bytes,0), staticGzipBytes:chunks.reduce((n,c)=>n+c.gzipBytes,0),
  rendererRequiredBeforeQuery: chunks.some(c=>c.file.includes('maps-three')),
  physicsRequiredBeforeQuery: chunks.some(c=>c.file.includes('maps-physics')),
  pdfRequiredBeforeQuery: chunks.some(c=>c.file.includes('/pdf-')),
};
console.log(JSON.stringify(report,null,2));
if (process.argv.includes('--assert-independent') && (report.rendererRequiredBeforeQuery || report.physicsRequiredBeforeQuery || report.pdfRequiredBeforeQuery)) {
  process.exitCode = 1;
}
