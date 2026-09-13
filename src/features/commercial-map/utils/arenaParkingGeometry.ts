import * as THREE from 'three';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapEntity } from '../types';
import { corridorPolygon, precisionSeamPolygons, sampleTerritoryRoad, territoryPolygonGeometry, territorySurfaceSkirt, UNIFIED_TERRITORY_ROADS } from './territorialRoadGeometry';

/** The parking/grass edge is derived from the SAME road samples as the asphalt.
 * The former nine-point parking outline did not cut the connector or Rua Brasil;
 * its 0.06 slab hid the road at 0.034, and its folded closing edge made a sliver.
 * Canonical parking records remain intact. All pieces and holes retain ownership.
 */
const roads = UNIFIED_TERRITORY_ROADS.filter(r => r.evidence === 'project-continuation');
const cuts = roads.map(r => corridorPolygon(sampleTerritoryRoad(r), r.width + 2 * r.shoulder));
export const ARENA_PARKING_ROAD_CUT = polygonClipping.union(cuts[0], ...cuts.slice(1), ...precisionSeamPolygons(true));

export function isArenaParking(entity: Pick<MapEntity, 'publicIdentifier'>) {
  return entity.publicIdentifier === 'EST-EXP-VIS' || entity.publicIdentifier === 'EST-VIS';
}

export function arenaParkingPolygons(entity: MapEntity): MultiPolygon {
  const source: MultiPolygon = [entity.geometry.coordinates.map(r => r.map(p => [p[0], p[1]]))];
  return polygonClipping.difference(source, ARENA_PARKING_ROAD_CUT);
}

export function createArenaParkingGeometry(entity: MapEntity, height: number) {
  const polygons = arenaParkingPolygons(entity);
  const top = territoryPolygonGeometry(polygons, height);
  const flat = top.toNonIndexed();
  const skirt = territorySurfaceSkirt(polygons, height, 0);
  const geometry = mergeGeometries([flat, skirt])!;
  top.dispose(); flat.dispose(); skirt.dispose();
  // Shared world-space UVs prevent a new origin/scale on each cut piece.
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
