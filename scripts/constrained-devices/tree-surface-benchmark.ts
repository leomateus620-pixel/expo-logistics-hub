import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { COMMERCIAL_MAP_TREES } from '../../src/features/commercial-map/data/commercialTrees';
import { OFFICIAL_REFERENCE_DATA } from '../../src/features/commercial-map/data/officialReference2026';
import { REAR_PARKING_GROUND_SUPPORTS } from '../../src/features/commercial-map/data/rearParking';
import { withPavilion12TreeGroundSupport } from '../../src/features/commercial-map/data/pavilion12FrontTrees';
import { projectedCommercialMapShadowDirection } from '../../src/features/commercial-map/data/commercialMapEnvironment';
import { commercialTreeGroundElevationAtPosition, commercialTreeShadowElevationAtPosition, createCommercialTreeSurfaceResolver } from '../../src/features/commercial-map/utils/treeLayer';
import { presentCommercialMapData } from '../../src/features/commercial-map/utils/presentCommercialMapData';
import { SPATIAL_EPSILON } from '../../src/features/commercial-map/utils/spatialSurface';

const data = presentCommercialMapData(OFFICIAL_REFERENCE_DATA);
const entities = withPavilion12TreeGroundSupport([...data.entities,...REAR_PARKING_GROUND_SUPPORTS],true);
const trees = COMMERCIAL_MAP_TREES.filter(tree=>tree.isVisible);
const direction = projectedCommercialMapShadowDirection();
const queries = trees.flatMap(tree => [
  {tree,point:tree.position,shadow:false},
  {tree,point:[tree.position[0]+direction[0]*tree.canopyRadius*.55,tree.position[1]+direction[1]*tree.canopyRadius*.55] as const,shadow:true},
]);
const resolver = createCommercialTreeSurfaceResolver(entities);
const expected = ({tree,point,shadow}: typeof queries[number]) => shadow ? commercialTreeShadowElevationAtPosition(tree,point,entities) : commercialTreeGroundElevationAtPosition(tree,point,entities);
let equivalenceChecks=0;
for (const query of queries) { if (expected(query)!==(query.shadow ? resolver.shadowElevationAtPosition(query.tree,query.point) : resolver.groundElevationAtPosition(query.tree,query.point))) throw new Error(`Mismatch tree ${query.tree.id}`); equivalenceChecks++; }
// Generated boundary/near-boundary queries share each canonical placement's
// priority rules; they refute AABB rejection at the resolver epsilon.
for(let i=0;i<entities.length;i+=11) {
  const entity=entities[i];
  for(const point of (entity.geometry.coordinates[0] ?? []).slice(0,4)) {
    for(const shift of [-SPATIAL_EPSILON*.8,0,SPATIAL_EPSILON*.8]) {
      const tree=trees[(i*7+equivalenceChecks)%trees.length];
      const query={tree,point:[point[0]+shift,point[1]+shift] as const,shadow:equivalenceChecks%2===0};
      if (expected(query)!==(query.shadow ? resolver.shadowElevationAtPosition(query.tree,query.point) : resolver.groundElevationAtPosition(query.tree,query.point))) throw new Error(`Boundary mismatch ${entity.publicIdentifier}/${tree.id}`);
      equivalenceChecks++;
    }
  }
}
// All non-containing fallback classes; inputs are unmodified canonical trees.
for(const tree of trees.slice(0,30)) for(const point of [[-1000,-1000],[1000,1000],[0,0]] as const) {
  const query={tree,point,shadow:true};
  if(expected(query)!==resolver.shadowElevationAtPosition(tree,point)) throw new Error(`Fallback mismatch ${tree.id}`);
  equivalenceChecks++;
}
const rows: {label:string;round:number;durationMs:number;checksum:number}[]=[];
for(let round=-2;round<20;round++) {
  const order=round%2===0?['baseline','candidate']:['candidate','baseline'];
  for(const label of order) {
    const started=performance.now();let checksum=0;
    // Include preparation each candidate pass; no reused scene index advantage.
    const candidate=label==='candidate'?createCommercialTreeSurfaceResolver(entities):null;
    for(const query of queries) checksum+=candidate?(query.shadow ? candidate.shadowElevationAtPosition(query.tree,query.point) : candidate.groundElevationAtPosition(query.tree,query.point)):expected(query);
    const row={label,round,durationMs:performance.now()-started,checksum};
    if(round>=0) rows.push(row);
  }
}
function stats(label:string) { const values=rows.filter(row=>row.label===label).map(row=>row.durationMs).sort((a,b)=>a-b);return {n:values.length,p50Ms:values[Math.ceil(values.length*.5)-1],p95Ms:values[Math.ceil(values.length*.95)-1],minMs:values[0],maxMs:values.at(-1)}; }
const result={generatedAt:new Date().toISOString(),processVersion:process.version,platform:process.platform,baseSha:process.env.TREE_SURFACE_BASE_SHA || 'unknown', candidateSha:process.env.TREE_SURFACE_CANDIDATE_SHA || 'uncommitted',fixture:'presentCommercialMapData(OFFICIAL_REFERENCE_DATA) + rear parking supports + P12 concrete; canonical visible trees',entities:entities.length,trees:trees.length,queries:queries.length,equivalenceChecks,rows,summary:{baseline:stats('baseline'),candidate:stats('candidate')},limits:['Node CPU microbenchmark of surface resolution only; no renderer, physical device, React mount, frame latency, production data, or end-to-end boot claim.','20 alternating measured repetitions; two warmup rounds; candidate rebuilds numeric index every measured pass.']};
writeFileSync(process.env.TREE_SURFACE_OUTPUT || '/tmp/map-tree-surface-benchmark.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,rows:undefined}));
