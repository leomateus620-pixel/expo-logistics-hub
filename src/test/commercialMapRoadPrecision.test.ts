import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import polygonClipping from 'polygon-clipping';
import * as THREE from 'three';
import { OFFICIAL_REFERENCE_DATA, officialPdfPointToLocal } from '../features/commercial-map/data/officialReference2026';
import { ARENA_ROAD_CORRECTION } from '../features/commercial-map/data/arenaRoadCorrection';
import { REAR_PARK_ROAD_NETWORK, GENERATED_REAR_ROAD_SEGMENTS } from '../features/commercial-map/data/rearParkRoadNetwork';
import { PARK_ACCESS_SPATIAL_PLAN } from '../features/commercial-map/data/parkAccessSpatialPlan';
import { UNIFIED_TERRITORY_ROADS, corridorPolygon, sampleTerritoryRoad, buildTerritoryRoadGeometry } from '../features/commercial-map/utils/territorialRoadGeometry';
import { arenaParkingPolygons, createArenaParkingGeometry, ARENA_PARKING_ROAD_CUT } from '../features/commercial-map/utils/arenaParkingGeometry';
import { resolveRearRoadOwnerAtLocalPoint } from '../features/commercial-map/utils/rearRoadNetwork';
import { buildRoadBoundaryRuns } from '../features/commercial-map/utils/roadInfrastructure';
import { rearParkingEntityForPresentation } from '../features/commercial-map/data/rearParking';
import { GATE5_ACCESS_NODES } from '../features/commercial-map/data/territorialRoads';

const baseline = JSON.parse(readFileSync('docs/validation/road-precision/before-geometry.json', 'utf8'));
const entity = (id: string) => OFFICIAL_REFERENCE_DATA.entities.find(e => e.publicIdentifier === id)!;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe('September 13 precision road correction', () => {
  it('preserves every complete official record except the explicitly shortened road', () => {
    expect(OFFICIAL_REFERENCE_DATA.entities).toHaveLength(baseline.entities.length);
    for (const e of OFFICIAL_REFERENCE_DATA.entities) {
      if (e.publicIdentifier === 'AV-IMIGRANTES') continue;
      expect(hash(e), e.publicIdentifier).toBe(baseline.entities.find((v: {id:string}) => v.id === e.publicIdentifier).hash);
    }
  });

  it('keeps all external road definitions and every carriageway width unchanged', () => {
    const repaired = ['osm-569781512-0', 'osm-951983188-0', 'arena-br472-access'];
    expect(UNIFIED_TERRITORY_ROADS.filter(r => r.evidence !== 'project-continuation' && !repaired.includes(r.id)))
      .toEqual(baseline.territory.filter((r: {evidence:string;id:string}) => r.evidence !== 'project-continuation' && !repaired.includes(r.id)));
    for (const road of UNIFIED_TERRITORY_ROADS) {
      const previous = baseline.territory.find((r: {id:string})=>r.id===road.id);
      if (previous) {expect(road.width,road.id).toBe(previous.width);expect(road.shoulder,road.id).toBe(previous.shoulder);}
    }
    const allowed = ['etnias-official-west-parking','etnias-official-terminus-1','etnias-parking-connection',
      'portao5-street-curve','portao5-curve-etnias','portao5-etnias-ubiretama','portao5-north-approach','gate5-internal-approach'];
    for (const r of REAR_PARK_ROAD_NETWORK) {
      const previous = baseline.roads.find((v: {id:string}) => v.id === r.id);
      expect(r.width, r.id).toBe(previous.width);
      expect(r.shoulderWidth, r.id).toBe(previous.shoulderWidth);
      if (!allowed.includes(r.id)) {
        const canonical = (value: unknown) => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'number' ? Math.round(v * 1e8) / 1e8 : v));
        expect(canonical(r), r.id).toEqual(canonical(previous));
      }
    }
  });

  it('keeps a terminated frontage and independent staggered approaches near the Arena', () => {
    const c = ARENA_ROAD_CORRECTION;
    expect(c.frontageTerminus[0]).toBeLessThan(5350);
    expect(c.frontageEntry[0]).toBeGreaterThan(5000);
    expect(c.frontageEntry[0]).toBeLessThan(c.frontageTerminus[0]);
    expect(c.ubiretamaJunction[1]).toBeLessThan(3633 - 100);
    expect(Math.hypot(c.etniasJunction[0]-c.ubiretamaJunction[0], c.etniasJunction[1]-c.ubiretamaJunction[1]))
      .toBeLessThan(80);
    expect(c.ubiretamaApproach.filter(p => p[1] >= 2790 && p[1] <= 3130).every(p => p[0] < 5680 && p[0] > 5405)).toBe(true);
    const current = entity('AV-IMIGRANTES');
    const old = baseline.entities.find((e: {id:string}) => e.id === current.publicIdentifier);
    expect(rearParkingEntityForPresentation({...current,geometry:old.geometry}).geometry).toEqual(current.geometry);
    const retired = officialPdfPointToLocal([5440,4200]);
    expect(resolveRearRoadOwnerAtLocalPoint(retired,'park')).toBeNull();
  });

  it('removes A7 asphalt, curbs and navigation source without changing the perpendicular road', () => {
    expect(JSON.stringify(PARK_ACCESS_SPATIAL_PLAN)).not.toContain('gate-7-johan-muller');
    const road = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.find(r => r.id === 'gate-7-gustavo-bessel-link')!;
    expect(road.sourcePdfCenterline).toEqual([[3267,1703],[3267,1720],[3265,1805],[3263.5,1935],[3263.5,2040],[3263.5,2069]]);
    const removed = corridorPolygon([[3400,1740],[3880,1740]].map(p => officialPdfPointToLocal(p as [number,number])),0.1);
    for (const surface of PARK_ACCESS_SPATIAL_PLAN.roadSurfaces) {
      expect(polygonClipping.intersection([[surface.polygon.map(p => [p[0], p[1]] as [number, number])]],removed), surface.id).toEqual([]);
    }
  });

  it('cuts both parking tops at the canonical road edge, retaining UVs and empty raycasts over asphalt', () => {
    for (const id of ['EST-EXP-VIS','EST-VIS']) {
      const e=entity(id), polygons=arenaParkingPolygons(e), g=createArenaParkingGeometry(e,0.06);
      const overlap = polygonClipping.intersection(polygons,ARENA_PARKING_ROAD_CUT);
      const area = overlap.flatMap(p=>p).reduce((sum,r)=>sum+Math.abs(r.reduce((a,p,i)=> {
        const q=r[(i+1)%r.length]; return a+p[0]*q[1]-q[0]*p[1];
      },0))/2,0);
      expect(area,id).toBeLessThan(1e-10);
      const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial());
      mesh.updateMatrixWorld();
      for(const road of GENERATED_REAR_ROAD_SEGMENTS) for(const p of sampleTerritoryRoad(UNIFIED_TERRITORY_ROADS.find(r=>r.id===road.id)!)) {
        expect(new THREE.Raycaster(new THREE.Vector3(p[0],1,p[1]),new THREE.Vector3(0,-1,0)).intersectObject(mesh),id).toEqual([]);
      }
      const positions=g.getAttribute('position'),uv=g.getAttribute('uv');
      for(let i=0;i<positions.count;i++) {expect(uv.getX(i)).toBeCloseTo(positions.getX(i),5);expect(uv.getY(i)).toBeCloseTo(positions.getZ(i),5);}
      g.dispose();mesh.material.dispose();
    }
  });

  it('opens the frontage curb at the connector and excludes duplicate official asphalt', () => {
    const entry=officialPdfPointToLocal(ARENA_ROAD_CORRECTION.frontageEntry);
    const curb=buildRoadBoundaryRuns([entity('AV-IMIGRANTES')]);
    expect(curb.some(r=>r.from[0]<entry[0] && r.to[0]>entry[0])).toBe(false);
    const network=buildTerritoryRoadGeometry();
    for(const id of ['AV-IMIGRANTES','RUA-BRASIL']) {
      expect(polygonClipping.intersection(network.footprint,[entity(id).geometry.coordinates.map(r=>r.map(p=>[p[0],p[1]] as [number,number]))])).toEqual([]);
    }
    Object.values(network).forEach(g=>{if(g instanceof THREE.BufferGeometry)g.dispose()});
  });

  it('restores the verified shared A5 nodes and a continuous full-width access surface', () => {
    const road=(id:string)=>UNIFIED_TERRITORY_ROADS.find(r=>r.id===id)!;
    expect(road('osm-569781512-0').points[0]).toEqual(GATE5_ACCESS_NODES.lower);
    expect(road('osm-569781511-0').points[0]).toEqual(GATE5_ACCESS_NODES.lower);
    expect(road('osm-951983188-0').points).toEqual([GATE5_ACCESS_NODES.upper,GATE5_ACCESS_NODES.parkMouth,GATE5_ACCESS_NODES.lower]);
    expect(road('arena-br472-access').points.at(-1)).toEqual(GATE5_ACCESS_NODES.parkMouth);
    const network=buildTerritoryRoadGeometry();
    const mesh=new THREE.Mesh(network.pavement,new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld();
    for (const id of ['osm-569781511-0','osm-569781512-0','osm-951983188-0','arena-br472-access']) {
      const r=road(id), samples=sampleTerritoryRoad({...r,evidence:'annex-7'});
      // Check the actual polygon's linear samples for OSM roads, including the old missing seam.
      const points=r.evidence==='osm-aligned'?r.points:samples;
      for(let i=1;i<points.length;i++) {
        const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
        for(let t=0;t<=1.001;t+=0.05) for(const edge of [-0.35,0,0.35]) {
          const x=a[0]+(b[0]-a[0])*t-(b[1]-a[1])/length*r.width*edge;
          const z=a[1]+(b[1]-a[1])*t+(b[0]-a[0])/length*r.width*edge;
          expect(new THREE.Raycaster(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh).length,id).toBe(1);
        }
      }
    }
    mesh.material.dispose();
    Object.values(network).forEach(g=>{if(g instanceof THREE.BufferGeometry)g.dispose()});
  });
});
