import * as THREE from 'three';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import { GENERATED_REAR_ROAD_SEGMENTS, rearRoadLocalPath } from '../data/rearParkRoadNetwork';
import { officialPdfPointToLocal } from '../data/officialReference2026';
import type { Coordinate, MapEntity } from '../types';
import type { TerritoryRoad } from '../data/territorialRoads';
import { corridorPolygon, sampleTerritoryRoad } from './territoryRoadSampling';
import type { PlanarSurfaceCut } from './planarSurfaceGeometry';

export const UBIRETAMA_PRESENTATION_SEGMENT_IDS = ['ubiretama-registered-north', 'portao5-north-approach'] as const;
export const UBIRETAMA_PRESENTATION_HANDOFF = officialPdfPointToLocal([5660, 2790]);
const handoffZ = UBIRETAMA_PRESENTATION_HANDOFF[1];
/** Only the north side of this boundary may differ from the existing pavement. */
export const UBIRETAMA_PRESENTATION_MASK: MultiPolygon = [[[
  [-10000, -10000], [10000, -10000], [10000, handoffZ], [-10000, handoffZ], [-10000, -10000],
]]];

export interface UbiretamaRoadPresentation {
  entityId: string;
  /** Snapshot geometry is copied, never edited or replaced in the commercial model. */
  cadastralFootprint: MultiPolygon;
  footprint: MultiPolygon;
  groundFootprint: MultiPolygon;
  retainedSouthernFootprint: MultiPolygon;
  /** Existing transverse entities retain their own top surface and selection. */
  transverseMouths: readonly MultiPolygon[];
  groundCuts: readonly PlanarSurfaceCut[];
  supportCuts: readonly PlanarSurfaceCut[];
}

export function isUbiretamaPresentationSegment(id: string) {
  return UBIRETAMA_PRESENTATION_SEGMENT_IDS.some(candidate => candidate === id);
}

const asPolygon = (entity: MapEntity): MultiPolygon => [entity.geometry.coordinates.map(ring => ring.map(p => [p[0], p[1]]))];
const legacyRoads: TerritoryRoad[] = GENERATED_REAR_ROAD_SEGMENTS.filter(r => isUbiretamaPresentationSegment(r.id)).map(r => ({
  id: r.id, name: r.name, kind: 'access', evidence: 'project-continuation',
  points: rearRoadLocalPath(r), width: r.width, shoulder: r.shoulderWidth,
}));
export const UBIRETAMA_LEGACY_FOOTPRINT = polygonClipping.union(
  ...legacyRoads.map(r => corridorPolygon(sampleTerritoryRoad(r), r.width)) as [MultiPolygon, ...MultiPolygon[]],
);
const LEGACY_SHOULDER_FOOTPRINT = polygonClipping.union(
  ...legacyRoads.map(r => corridorPolygon(sampleTerritoryRoad(r), r.width + r.shoulder * 2)) as [MultiPolygon, ...MultiPolygon[]],
);

function polygonCuts(polygons: MultiPolygon): PlanarSurfaceCut[] {
  return polygons.flatMap(rings => {
    const outer = rings[0].slice(0, -1).map(p => new THREE.Vector2(p[0], p[1]));
    const holes = rings.slice(1).map(r => r.slice(0, -1).map(p => new THREE.Vector2(p[0], p[1])));
    const points = [...outer, ...holes.flat()];
    return THREE.ShapeUtils.triangulateShape(outer, holes).map(indices => {
      const polygon = indices.map(i => [points[i].x, points[i].y] as Coordinate);
      return { polygon, minX: Math.min(...polygon.map(p => p[0])), maxX: Math.max(...polygon.map(p => p[0])),
        minZ: Math.min(...polygon.map(p => p[1])), maxZ: Math.max(...polygon.map(p => p[1])) };
    });
  });
}

/** Current persisted road owns the Expo Rural lateral; old Arena/A5 geometry stays intact. */
export function buildUbiretamaRoadPresentation(entities: readonly MapEntity[]): UbiretamaRoadPresentation | null {
  const road = entities.find(e => !e.isArchived && e.classification === 'ROAD' && e.publicIdentifier === 'RUA-UBIRETAMA');
  const ring = road?.geometry.coordinates[0];
  if (!road || !ring || road.geometry.coordinates.some(candidate => candidate.length < 4
    || candidate.some(p => p.length !== 2 || !p.every(Number.isFinite)))) return null;
  const cadastralFootprint = polygonClipping.intersection(asPolygon(road), UBIRETAMA_PRESENTATION_MASK);
  if (!cadastralFootprint.length) return null;
  const last = ring[ring.length - 1];
  const vertices = ring.slice(0, ring[0][0] === last[0] && ring[0][1] === last[1] ? -1 : undefined);
  // The southern cap has both endpoints farther south than either longitudinal side.
  const cap = vertices.map((a, i) => [a, vertices[(i + 1) % vertices.length]] as const)
    .sort((a, b) => Math.min(b[0][1], b[1][1]) - Math.min(a[0][1], a[1][1]))[0];
  const start: Coordinate = [(cap[0][0] + cap[1][0]) / 2, (cap[0][1] + cap[1][1]) / 2];
  const original = legacyRoads.find(r => r.id === 'portao5-north-approach')!;
  const axis = sampleTerritoryRoad(original);
  const crossingIndex = axis.findIndex(p => p[1] >= handoffZ);
  const before = axis[Math.max(0, crossingIndex - 1)], after = axis[crossingIndex];
  const t = (handoffZ - before[1]) / (after[1] - before[1]);
  const end: Coordinate = [before[0] + (after[0] - before[0]) * t, handoffZ];
  const direction = new THREE.Vector2(after[0] - before[0], after[1] - before[1]).normalize();
  const join: Coordinate = [end[0] - direction.x * original.width, end[1] - direction.y * original.width];
  const beyond: Coordinate = [end[0] + direction.x * original.width, end[1] + direction.y * original.width];
  let bridge = polygonClipping.intersection(corridorPolygon([start, join, beyond], original.width), UBIRETAMA_PRESENTATION_MASK);
  const bridgeBounds = { minX: Math.min(...bridge.flat(2).map(p => p[0])), maxX: Math.max(...bridge.flat(2).map(p => p[0])),
    minZ: Math.min(...bridge.flat(2).map(p => p[1])), maxZ: Math.max(...bridge.flat(2).map(p => p[1])) };
  const protectedEntities = entities.filter(e => !e.isArchived && (
    ['SELLABLE_LOT', 'INTERNAL_STAND', 'PAVILION', 'BUILDING', 'RESTAURANT', 'RESTROOM', 'EVENT_VENUE'].includes(e.classification)
  ) && e.geometry.coordinates[0]?.length >= 4 && e.geometry.coordinates[0].some(p => p[0] <= bridgeBounds.maxX)
    && e.geometry.coordinates[0].some(p => p[0] >= bridgeBounds.minX)
    && e.geometry.coordinates[0].some(p => p[1] <= bridgeBounds.maxZ)
    && e.geometry.coordinates[0].some(p => p[1] >= bridgeBounds.minZ));
  if (protectedEntities.length) bridge = polygonClipping.difference(bridge, ...protectedEntities.map(asPolygon));
  const retainedSouthernFootprint = polygonClipping.difference(UBIRETAMA_LEGACY_FOOTPRINT, UBIRETAMA_PRESENTATION_MASK);
  const footprint = polygonClipping.union(cadastralFootprint, bridge, retainedSouthernFootprint);
  const northernFootprint = polygonClipping.intersection(footprint, UBIRETAMA_PRESENTATION_MASK);
  const groundFootprint = polygonClipping.union(northernFootprint, polygonClipping.difference(LEGACY_SHOULDER_FOOTPRINT, UBIRETAMA_PRESENTATION_MASK));
  const transverseMouths = entities.filter(e => !e.isArchived && e.classification === 'ROAD'
    && ['RUA-BRUNO-SCHWARTZ', 'RUA-JOHAN-MULLER', 'RUA-GUSTAVO-BESSEL', 'RUA-EMANUEL-BRACHMANN'].includes(e.publicIdentifier))
    .map(e => polygonClipping.intersection(asPolygon(e), UBIRETAMA_PRESENTATION_MASK));
  return { entityId: road.id, cadastralFootprint, footprint, groundFootprint, retainedSouthernFootprint, transverseMouths,
    groundCuts: polygonCuts(northernFootprint), supportCuts: polygonCuts(polygonClipping.difference(footprint, ...transverseMouths)) };
}

/** Metadata/status refreshes must not reconstruct the regional geometry resources. */
export function createUbiretamaRoadPresentationResolver() {
  let previousKey: string | undefined;
  let previousPlan: UbiretamaRoadPresentation | null = null;
  return (entities: readonly MapEntity[]) => {
    const participants = entities.filter(e => !e.isArchived && (
      ['SELLABLE_LOT', 'INTERNAL_STAND', 'PAVILION', 'BUILDING', 'RESTAURANT', 'RESTROOM', 'EVENT_VENUE'].includes(e.classification)
      || ['RUA-UBIRETAMA', 'RUA-BRUNO-SCHWARTZ', 'RUA-JOHAN-MULLER', 'RUA-GUSTAVO-BESSEL', 'RUA-EMANUEL-BRACHMANN'].includes(e.publicIdentifier)
    )).map(e => [e.id, e.publicIdentifier, e.classification, e.geometry.coordinates] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
    const key = JSON.stringify(participants);
    if (key !== previousKey) {
      previousPlan = buildUbiretamaRoadPresentation(entities);
      previousKey = key;
    }
    return previousPlan;
  };
}

export function ubiretamaPresentationDistance(point: readonly [number, number], presentation: UbiretamaRoadPresentation) {
  let distance = Infinity;
  for (const rings of presentation.footprint) {
    let inside = false;
    for (const ring of rings) {
      let contained = false;
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i], dx = b[0] - a[0], dz = b[1] - a[1];
        const t = THREE.MathUtils.clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        distance = Math.min(distance, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz));
        if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < a[0] + (point[1] - a[1]) * dx / dz) contained = !contained;
      }
      if (contained) inside = !inside;
    }
    if (inside) return -distance;
  }
  return distance;
}
