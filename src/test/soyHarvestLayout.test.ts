import { describe, expect, it } from 'vitest';
import polygonClipping, { type Polygon } from 'polygon-clipping';
import { SOY_HARVEST_LAYOUT as layout, soySwathForPoint } from '@/features/commercial-map/data/soyHarvestLayout';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { REAR_PARKING_ROWS, REAR_PARKING_CIRCULATION } from '@/features/commercial-map/data/rearParking';
import { TERRITORY_ROADS, territoryDistanceToRoad } from '@/features/commercial-map/data/territorialRoads';
import { TERRITORY_BUILDINGS, TERRITORY_TREES, TERRITORY_PATCHES } from '@/features/commercial-map/data/territorialEnvironment';
import { parkingContainsPoint, parkingCorridorPolygon, parkingDistanceToPolygon } from '@/features/commercial-map/utils/parkingGeometry';
import replay from '../../scripts/exporural/official-2026-10-20/replay-data.json';

const polygon=(points:readonly (readonly number[])[]):Polygon=>[points.map(p=>[p[0],p[1]])];
const intersects=(a:readonly (readonly number[])[],b:readonly (readonly number[])[])=>polygonClipping.intersection(polygon(a),polygon(b)).length>0;
const commercial=[...OFFICIAL_REFERENCE_DATA.entities,...replay.after.entities].filter(e=>['SELLABLE_LOT','ROAD','PAVILION','BUILDING'].includes(e.classification));
const parking=[...REAR_PARKING_ROWS,...REAR_PARKING_CIRCULATION];
describe('soy presentation registration and occupied envelopes',()=>{
  it('identifies the actual exterior patch and leaves persisted cadastral objects untouched',()=>{
    expect(TERRITORY_PATCHES.find(p=>p.id===layout.supportId)?.kind).toBe('field');
    expect(layout.cadastralRevision).toBe('2028-exporural-2026-10-20.1');
    expect(layout.groundY).toBeCloseTo(.024);
    expect(layout.confidence).toBe('SCENE_REGISTERED_PRESENTATION_ESTIMATE');
    for(const area of [layout.polygon,...layout.headlands]) {
      for(const entity of commercial)expect(intersects(area,entity.geometry.coordinates[0]),entity.publicIdentifier).toBe(false);
      for(const row of parking)expect(intersects(area,row.polygon),row.id).toBe(false);
      for(const road of TERRITORY_ROADS)expect(intersects(area,parkingCorridorPolygon(road.points,road.width+road.shoulder*2)),road.id).toBe(false);
    }
  });
  it('keeps complete header and open boom inside the reserved presentation corridor',()=>{
    for(const lane of layout.workLanes)for(let x=41.8;x<=62.2;x+=.2) {
      for(const dx of [-.85,.85])for(const dz of [-layout.workWidth/2,layout.workWidth/2]) {
        expect(parkingContainsPoint([x+dx,lane+dz],layout.envelope)).toBe(true);
      }
    }
    for(const z of [-54.5-layout.sprayerWidth/2,-54.5+layout.sprayerWidth/2])for(const x of [42,62]) {
      expect(parkingContainsPoint([x,z],layout.envelope)).toBe(true);
    }
  });
  it('connects a reserved unpaved truck corridor to the rendered BR-472 without traversing lots or parking',()=>{
    const corridor=parkingCorridorPolygon(layout.truckPath,layout.truckLaneWidth);
    for(const entity of commercial)expect(intersects(corridor,entity.geometry.coordinates[0]),entity.publicIdentifier).toBe(false);
    for(const row of parking)expect(intersects(corridor,row.polygon),row.id).toBe(false);
    for(const tree of TERRITORY_TREES)expect(parkingDistanceToPolygon(tree.center,corridor)).toBeGreaterThan(tree.radius);
    for(const building of TERRITORY_BUILDINGS)expect(parkingDistanceToPolygon(building.center,corridor)).toBeGreaterThan(Math.hypot(...building.size)/2);
    const highway=TERRITORY_ROADS.find(r=>r.id===layout.highwayId)!;
    expect(highway.ref).toContain('472');
    for(const point of layout.truckPath.slice(5))expect(territoryDistanceToRoad(point,highway)).toBeLessThan(highway.width/2-.2);
  });
  it('uses alternating work directions without confusing progress on neighboring strips',()=>{
    expect(soySwathForPoint(43,-56.3)).toEqual({lane:0,progress:0});
    expect(soySwathForPoint(61,-54.5)).toEqual({lane:1,progress:0});
    expect(soySwathForPoint(43,-54.5)).toEqual({lane:1,progress:1});
    expect(soySwathForPoint(61,-52.7)).toEqual({lane:2,progress:1});
  });
});
