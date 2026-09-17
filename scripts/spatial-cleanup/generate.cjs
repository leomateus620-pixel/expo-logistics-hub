// Offline preparation: no OSM download, full-territory procedural placement or
// rejected records belong in the browser graph. The audited inventory pins the
// accepted pre-cleanup anchors to main 42e89d1b (including A5 road corrections).
const fs = require('node:fs');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const bundled = buildSync({ entryPoints: ['src/features/commercial-map/data/commercialMapSpatialBounds.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const policy = { exports: {} };
vm.runInNewContext(bundled.outputFiles[0].text, { module: policy, exports: policy.exports, require });
const { retainCommercialMapContext, clipContextRoad, clipContextPolygon, COMMERCIAL_MAP_SPATIAL_BOUNDS } = policy.exports;
const source = JSON.parse(fs.readFileSync('docs/validation/spatial-cleanup/before-inventory.json', 'utf8'));
const { roads: _roads, ...provenance } = JSON.parse(fs.readFileSync('src/features/commercial-map/data/territoryRoadSource.json', 'utf8'));
const output = {
  sourceCommit: '42e89d1b', spatialBounds: COMMERCIAL_MAP_SPATIAL_BOUNDS, provenance,
  buildings: source.buildings.filter(b => retainCommercialMapContext(b.center, Math.hypot(...b.size) / 2)),
  trees: source.trees.filter(t => retainCommercialMapContext(t.center, t.radius)),
  patches: source.patches.flatMap(p => { const ring = clipContextPolygon(p.ring); return ring.length >= 3 ? [{ ...p, ring }] : []; }),
  roads: source.roads.flatMap(clipContextRoad),
};
const target = 'src/features/commercial-map/data/territoryContext.generated.json';
const content = JSON.stringify(output) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== content) throw new Error('Stale spatial catalog: run node scripts/spatial-cleanup/generate.cjs');
} else fs.writeFileSync(target, content);
console.log(JSON.stringify({ buildings: output.buildings.length, trees: output.trees.length, patches: output.patches.length, roads: output.roads.length, bytes: Buffer.byteLength(content) }));
