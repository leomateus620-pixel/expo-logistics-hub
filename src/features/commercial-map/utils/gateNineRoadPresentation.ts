import { ShapeUtils, Vector2 } from 'three';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import type { Coordinate, MapEntity } from '../types';
import type { PlanarSurfaceCut } from './planarSurfaceGeometry';

export const GATE_NINE_NEIGHBOR_ROAD_IDENTIFIER = 'RUA-PASTOR-ALBERT-LEHENBAUER';
/** Presentation interpretation: keep the existing green seam beside the narrow road. */
export const GATE_NINE_VERGE_WIDTH = 0.075;
export const GATE_NINE_ACCESS_SOURCE = Object.freeze({
  file: 'Fenasoja_Parque_Ajustes_300dpi.png',
  registration: 'docs/exporural/2028-revisao-2026-09-25/calibracao.json',
  revision: '2028-exporural-2026-09-25.1',
  precision: 'registered-raster-presentation; not a cadastral survey',
  /** Left access, distinct from the x552–576 road beside lot S35. */
  inspectionGridRing: [[516, 320], [552, 320], [555, 625], [556, 650], [519, 644]] as readonly Coordinate[],
  affine: [
    [1.5056770501648136, 0.017094028627930902],
    [-0.00038893441509291193, 1.5053614459728695],
    [3151.3107458024915, 770.1650528245467],
  ] as const,
  historicalSourceToLocal: { crop: [600, 900, 5500, 4150], width: 120, height: 120 * 4150 / 5500 } as const,
});

export function gateNineRasterPointToLocal([x, y]: readonly [number, number]): Coordinate {
  const m = GATE_NINE_ACCESS_SOURCE.affine;
  const [cropX, cropY, cropWidth, cropHeight] = GATE_NINE_ACCESS_SOURCE.historicalSourceToLocal.crop;
  const { width, height } = GATE_NINE_ACCESS_SOURCE.historicalSourceToLocal;
  const sourceX = x * m[0][0] + y * m[1][0] + m[2][0];
  const sourceY = x * m[0][1] + y * m[1][1] + m[2][1];
  // Match the existing revision generator's full-precision frame and rounding.
  return [Number(((sourceX - cropX) / cropWidth * width - width / 2).toFixed(9)),
    Number(((sourceY - cropY) / cropHeight * height - height / 2).toFixed(9))];
}

const sourceRing = GATE_NINE_ACCESS_SOURCE.inspectionGridRing.map(gateNineRasterPointToLocal);
export const GATE_NINE_ACCESS_FOOTPRINT: MultiPolygon = [[[...sourceRing, [...sourceRing[0]]]]];
/** The green separation stops at the first junction with Rua Johan Muller. */
export const GATE_NINE_PARALLEL_HANDOFF_Z = gateNineRasterPointToLocal([555, 625])[1];
const accessBounds = {
  minX: Math.min(...sourceRing.map(point => point[0])), maxX: Math.max(...sourceRing.map(point => point[0])),
  minZ: Math.min(...sourceRing.map(point => point[1])), maxZ: Math.max(...sourceRing.map(point => point[1])),
};
const parallelMask: MultiPolygon = [[[
  [accessBounds.minX, accessBounds.minZ], [accessBounds.maxX, accessBounds.minZ],
  [accessBounds.maxX, GATE_NINE_PARALLEL_HANDOFF_Z], [accessBounds.minX, GATE_NINE_PARALLEL_HANDOFF_Z],
  [accessBounds.minX, accessBounds.minZ],
]]];

const asPolygon = (entity: MapEntity): MultiPolygon => [entity.geometry.coordinates.map(ring => ring.map(point => [point[0], point[1]]))];
const protectedClassifications = new Set([
  'SELLABLE_LOT', 'INTERNAL_STAND', 'PAVILION', 'BUILDING', 'RESTAURANT',
  'RESTROOM', 'CHEMICAL_RESTROOM', 'ADMINISTRATION', 'SECURITY', 'EMERGENCY',
  'SERVICE', 'EVENT_VENUE',
]);
const validPolygon = (entity: MapEntity) => entity.geometry.coordinates.length > 0
  && entity.geometry.coordinates.every(ring => ring.length >= 3 && ring.every(point => point.length === 2 && point.every(Number.isFinite)));

function bufferedBoundary(footprint: MultiPolygon, distance: number): MultiPolygon {
  const bands: MultiPolygon[] = [];
  for (const rings of footprint) for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 1e-8) continue;
      const dx = -(b[1] - a[1]) / length * distance, dz = (b[0] - a[0]) / length * distance;
      bands.push([[[[a[0] + dx, a[1] + dz], [b[0] + dx, b[1] + dz],
        [b[0] - dx, b[1] - dz], [a[0] - dx, a[1] - dz], [a[0] + dx, a[1] + dz]]]]);
      bands.push([[[[a[0] - distance, a[1] - distance], [a[0] + distance, a[1] - distance],
        [a[0] + distance, a[1] + distance], [a[0] - distance, a[1] + distance], [a[0] - distance, a[1] - distance]]]]);
    }
  }
  return bands.length ? polygonClipping.union(...bands as [MultiPolygon, ...MultiPolygon[]]) : [];
}

function groundCuts(footprint: MultiPolygon): PlanarSurfaceCut[] {
  return footprint.flatMap(rings => {
    const outer = rings[0].slice(0, -1).map(point => new Vector2(...point));
    const holes = rings.slice(1).map(ring => ring.slice(0, -1).map(point => new Vector2(...point)));
    const points = [...outer, ...holes.flat()];
    return ShapeUtils.triangulateShape(outer, holes).map(indices => {
      const polygon = indices.map(index => [points[index].x, points[index].y] as Coordinate);
      return { polygon, minX: Math.min(...polygon.map(point => point[0])), maxX: Math.max(...polygon.map(point => point[0])),
        minZ: Math.min(...polygon.map(point => point[1])), maxZ: Math.max(...polygon.map(point => point[1])) };
    });
  });
}

export interface GateNineAccessPresentation {
  ownerEntityId: string;
  footprint: MultiPolygon;
  separation: MultiPolygon;
  groundCuts: readonly PlanarSurfaceCut[];
  /** Proxy only for road rendering/grounding. Never insert it into the map data store. */
  roadEntity: MapEntity;
}

export const isGateNineAccessPresentationEntity = (entity: MapEntity) => entity.classification === 'ROAD'
  && entity.publicIdentifier === 'A9' && entity.metadata.presentationOnly === true
  && entity.metadata.presentationOwnerIdentifier === 'A9';

/** Recover the separate A9 access; the current narrow road is never changed. */
export function buildGateNineAccessPresentation(entities: readonly MapEntity[]): GateNineAccessPresentation | null {
  const neighbor = entities.find(entity => !entity.isArchived && entity.classification === 'ROAD'
    && entity.publicIdentifier === GATE_NINE_NEIGHBOR_ROAD_IDENTIFIER);
  const gate = entities.find(entity => !entity.isArchived && entity.classification === 'GATE' && entity.publicIdentifier === 'A9');
  if (!neighbor || !gate || !validPolygon(neighbor)) return null;
  const neighborFootprint = asPolygon(neighbor);
  const separation = polygonClipping.intersection(
    polygonClipping.difference(bufferedBoundary(neighborFootprint, GATE_NINE_VERGE_WIDTH), neighborFootprint),
    GATE_NINE_ACCESS_FOOTPRINT, parallelMask,
  );
  const protectedEntities = entities.filter(entity => !entity.isArchived && entity !== neighbor
    && (entity.isSellable || protectedClassifications.has(entity.classification)) && validPolygon(entity));
  const footprint = polygonClipping.difference(GATE_NINE_ACCESS_FOOTPRINT, neighborFootprint, separation,
    ...protectedEntities.map(asPolygon));
  // A fragmented access cannot be represented by this Polygon proxy. Fail closed
  // rather than creating cadastral identities or a bridge through another owner.
  if (footprint.length !== 1) return null;
  const roadEntity: MapEntity = {
    ...gate, classification: 'ROAD', isSellable: false, layerId: neighbor.layerId,
    geometry: { ...neighbor.geometry, id: null, elevation: neighbor.geometry.elevation,
      coordinates: footprint[0].map(ring => ring.map(point => [point[0], point[1]])) },
    metadata: { ...gate.metadata, presentationOnly: true, presentationOwnerIdentifier: 'A9',
      presentationSource: GATE_NINE_ACCESS_SOURCE.file, presentationPrecision: GATE_NINE_ACCESS_SOURCE.precision },
  };
  return { ownerEntityId: gate.id, footprint, separation, groundCuts: groundCuts(footprint), roadEntity };
}
