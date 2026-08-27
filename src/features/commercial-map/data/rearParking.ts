import type { MapEntity } from '../types';
import type { ParkingCameraView } from '../utils/parkingViewport';
import {
  createParkingSpatialIndex, parkingBounds, parkingBoundsCenter, parkingBoundsPolygon,
  parkingContainsPoint, parkingConvexHull, parkingDistanceToPolygon, parkingCorridorPolygon, openParkingPolygon,
  type ParkingPoint, type ParkingPolygon,
} from '../utils/parkingGeometry';
import { officialPdfPointToLocal } from './officialReference2026';
import { EXPORURAL_MAP_UNITS_PER_METER } from './exporuralReference2026';
import {
  REAR_PARKING_PLAN_TRANSFORM, REAR_PARKING_SOURCE_ROWS, REAR_PARKING_SOURCE_SPECIAL_ZONES,
} from './rearParkingSource';
import {
  REAR_PARKING_SOURCE_SURFACES, REAR_PARKING_SOURCE_OPERATIONS, REAR_PARKING_SOURCE_CIRCULATION, rearParkingSatelliteToPlan,
} from './rearParkingFootprint';
import { buildRearParkingTrees } from './rearParkingVegetation';
import type { CommercialMapTree } from './commercialTrees';

/** A presentation registration, not a cadastral revision or a geographic survey. */
export const REAR_PARKING_REFERENCE = Object.freeze({
  revision: '2026.8-parking-annexes.1',
  source: 'IMG_9811 (1).jpeg',
  sourcePixels: [4967, 3509] as const,
  sourceOrigin: 'TOP_LEFT' as const,
  worldOrigin: 'EXISTING_OFFICIAL_2026_LOCAL_NORMALIZED' as const,
  localOrigin: officialPdfPointToLocal([1805, 2118]),
  localOriginLandmark: 'PAVILHAO-09',
  mapUnitsPerMeter: EXPORURAL_MAP_UNITS_PER_METER,
  verticalSurveyAvailable: false,
  printedCapacity: 2187,
  printedCapacityScope: 'NOT_VERIFIABLE_FROM_RASTER' as const,
  operationalGeometryValidated: false,
});

export const REAR_PARKING_ELEVATIONS = Object.freeze({ ground: 0.032, rows: 0.036, vegetation: 0.038, circulation: 0.04, markings: 0.048 });

export function rearParkingPlanToOfficial(point: ParkingPoint): ParkingPoint {
  // Keep an isotropic scale: no stretch/shear to force simplified landmark boxes to fit.
  const { scale, rotation, offset } = REAR_PARKING_PLAN_TRANSFORM;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return [offset[0] + scale * (c * point[0] - s * point[1]),
    offset[1] + scale * (s * point[0] + c * point[1])];
}

export function rearParkingPlanToWorld(point: ParkingPoint): ParkingPoint {
  return officialPdfPointToLocal(rearParkingPlanToOfficial(point) as [number, number]);
}

export const REAR_PARKING_REGISTRATION_CONTROLS = [
  { identifier: 'PAVILHAO-09', plan: [3647, 2363], official: [1805, 2118] },
  { identifier: 'D5', plan: [3859, 2280], official: [1545, 2241] },
  { identifier: 'PISTA-CAMPEIRA', plan: [3095, 2454], official: [2615, 1957.5] },
].map((control) => {
  const projected = rearParkingPlanToWorld([control.plan[0], control.plan[1]]);
  const anchor = officialPdfPointToLocal(control.official as [number, number]);
  return { ...control, residualMeters: Math.hypot(projected[0] - anchor[0], projected[1] - anchor[1]) / EXPORURAL_MAP_UNITS_PER_METER };
});

export interface RearParkingSpace {
  id: string;
  blockId: string;
  rowId: string;
  number: number;
  sourceCenter: ParkingPoint;
  center: ParkingPoint;
  polygon: ParkingPolygon;
  headingRadians: number;
  restriction: 'ELDERLY' | null;
  confidence: string;
  occupancy: null;
  operationalGeometryValidated: false;
}
export interface RearParkingRow {
  id: string;
  blockId: string;
  side: string;
  center: ParkingPoint;
  polygon: ParkingPolygon;
  spaces: readonly RearParkingSpace[];
  confidence: string;
}
export interface RearParkingBlock {
  id: string;
  code: string;
  label: string;
  group: 'A' | 'B' | 'C';
  rows: readonly RearParkingRow[];
  spaces: readonly RearParkingSpace[];
  center: ParkingPoint;
  polygon: ParkingPolygon;
  referenceAmbiguity: string | null;
}

function sourceRectangle(center: ParkingPoint, length: number, width: number, angle: number): ParkingPolygon {
  const along: ParkingPoint = [Math.cos(angle) * length / 2, Math.sin(angle) * length / 2];
  const across: ParkingPoint = [-Math.sin(angle) * width / 2, Math.cos(angle) * width / 2];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [
    center[0] + a * along[0] + b * across[0], center[1] + a * along[1] + b * across[1],
  ] as const);
}

export const REAR_PARKING_ROWS: readonly RearParkingRow[] = REAR_PARKING_SOURCE_ROWS.map((source) => {
  const blockId = `rear-parking:${source.block}`;
  const rowId = `${blockId}:${source.side}`;
  const spaces: RearParkingSpace[] = Array.from({ length: source.count }, (_, index) => {
    const t = source.count <= 1 ? 0 : index / (source.count - 1);
    const sourceCenter: ParkingPoint = source.centers?.[index] ?? [
      source.start[0] + (source.end[0] - source.start[0]) * t,
      source.start[1] + (source.end[1] - source.start[1]) * t,
    ];
    const heading = source.headings?.[index] ?? source.headingRadians;
    const restriction = REAR_PARKING_SOURCE_SPECIAL_ZONES.some((zone) => (
      sourceCenter[0] >= zone.bounds[0] && sourceCenter[0] <= zone.bounds[2]
      && sourceCenter[1] >= zone.bounds[1] && sourceCenter[1] <= zone.bounds[3]
    )) ? 'ELDERLY' : null;
    return {
      id: `${rowId}:${String(index + 1).padStart(3, '0')}`, blockId, rowId, number: index + 1,
      sourceCenter, center: rearParkingPlanToWorld(sourceCenter),
      polygon: sourceRectangle(sourceCenter, source.stallLengthPixels, source.stallWidthPixels, heading).map(rearParkingPlanToWorld),
      headingRadians: heading + REAR_PARKING_PLAN_TRANSFORM.rotation,
      restriction, confidence: source.confidence, occupancy: null, operationalGeometryValidated: false,
    };
  });
  const polygon = parkingConvexHull(spaces.flatMap((space) => space.polygon));
  return { id: rowId, blockId, side: source.side, polygon, center: parkingBoundsCenter(parkingBounds(polygon)), spaces, confidence: source.confidence };
});

export const REAR_PARKING_BLOCKS: readonly RearParkingBlock[] = [...new Set(REAR_PARKING_SOURCE_ROWS.map((row) => row.block))]
  .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
  .map((code) => {
    const id = `rear-parking:${code}`;
    const rows = REAR_PARKING_ROWS.filter((row) => row.blockId === id);
    const spaces = rows.flatMap((row) => row.spaces);
    const polygon = parkingConvexHull(rows.flatMap((row) => row.polygon));
    return { id, code, label: `Bloco ${code}`, group: code[0] as 'A' | 'B' | 'C', rows, spaces, polygon,
      center: parkingBoundsCenter(parkingBounds(polygon)),
      referenceAmbiguity: rows.some((row) => row.confidence === 'SYMBOL_SCALE_DIFFERS')
        ? 'Escala de símbolo diferente de A/B principal. Quadriláteros e centros preservados; dimensões operacionais exigem conferência no CAD.'
        : rows.some((row) => row.confidence === 'INTERPOLATED_LABEL_OCCLUSION')
          ? 'Raster sem cotas: repetição medida entre extremos visíveis; detalhes encobertos exigem conferência.' : null,
    };
  });

export const REAR_PARKING_SPACES = REAR_PARKING_BLOCKS.flatMap((block) => block.spaces);
export const REAR_PARKING_BLOCK_BY_ID = new Map(REAR_PARKING_BLOCKS.map((block) => [block.id, block]));
export const REAR_PARKING_SPACE_BY_ID = new Map(REAR_PARKING_SPACES.map((space) => [space.id, space]));
export const REAR_PARKING_CIRCULATION = REAR_PARKING_SOURCE_CIRCULATION.map((path) => ({
  ...path, points: path.points.map(rearParkingPlanToWorld),
  polygon: parkingCorridorPolygon(path.points, path.widthPixels).map(rearParkingPlanToWorld),
}));
export const REAR_PARKING_SURFACES = [...REAR_PARKING_SOURCE_SURFACES.map((surface) => ({
  ...surface, polygon: surface.polygon.map(rearParkingPlanToWorld),
})), ...REAR_PARKING_CIRCULATION.map((path) => ({
  id: path.id, group: path.group, kind: 'soil' as const, polygon: path.polygon, provenance: path.provenance,
}))];
export const REAR_PARKING_OPERATIONS = REAR_PARKING_SOURCE_OPERATIONS.map((operation) => ({
  ...operation, position: rearParkingPlanToWorld(operation.position),
  curve: operation.curvePixels?.map(rearParkingPlanToWorld) ?? null,
  span: operation.spanPixels ? Math.hypot(...rearParkingPlanToWorld([operation.spanPixels, 0]).map((value, i) => value - rearParkingPlanToWorld([0, 0])[i])) : null,
  // Rotation of a -Z arrow toward the transformed source direction in X/Z.
  rotationY: -operation.headingRadians - REAR_PARKING_PLAN_TRANSFORM.rotation - Math.PI / 2,
}));
export const REAR_PARKING_RENDER_BUDGET = Object.freeze({
  independentStallMeshes: 0,
  sectorMarkingBatches: 3,
  specialZoneBatches: 1,
  maximumBlockLabels: 6,
  mobileBlockLabels: 3,
  proceduralTextureSize: 256,
  geometryDisplacement: false,
});
export const REAR_PARKING_GROUPS = (['A', 'B', 'C'] as const).map((code) => {
  const blocks = REAR_PARKING_BLOCKS.filter((block) => block.group === code);
  const points = blocks.flatMap((block) => block.polygon);
  return { code, id: `rear-parking:${code}`, label: `Estacionamento ${code}`, blocks,
    bounds: parkingBounds(points), center: parkingBoundsCenter(parkingBounds(points)) };
});
export const REAR_PARKING_BOUNDS = parkingBounds(REAR_PARKING_SURFACES.flatMap((surface) => surface.polygon), 0.6);
export const REAR_PARKING_SCENE_SUPPORT_POINTS = parkingBoundsPolygon(REAR_PARKING_BOUNDS).map((position) => ({ position }));

export function rearParkingVisibleInArea(area?: string | null) {
  return !area || area === 'park' || area === 'exporural';
}

export function rearParkingLayerPresentation(entities: readonly MapEntity[], visibility: Record<string, boolean>, opacity: Record<string, number>) {
  const layerIds = [...new Set(entities.filter((entity) => entity.classification === 'PARKING').map((entity) => entity.layerId))];
  const strength = Math.min(1, ...layerIds.map((id) => opacity[id] ?? 1));
  return { visible: layerIds.every((id) => visibility[id] !== false) && strength > 0.015, opacity: strength };
}

/**
 * J was a coarse rectangular fill (already NEEDS_REVIEW), not a ride/building
 * model. Its western strip intersects 36 drawn stall polygons (19 A3:E and
 * 17 A2:W; only the A3 centres are inside). Trim ONLY that fill along the drawn
 * A inner boundary. Never change the canonical entity or custom polygons.
 */
export function rearParkingEntityForPresentation(entity: MapEntity): MapEntity {
  if (entity.publicIdentifier !== 'J' || entity.classification !== 'ATTRACTION') return entity;
  const ring = openParkingPolygon(entity.geometry.coordinates[0] ?? []);
  const bounds = parkingBounds(ring);
  if (ring.length !== 4 || entity.geometry.coordinates.length !== 1
    || !ring.every(([x, z]) => (Math.abs(x - bounds.minX) < 1e-5 || Math.abs(x - bounds.maxX) < 1e-5)
      && (Math.abs(z - bounds.minZ) < 1e-5 || Math.abs(z - bounds.maxZ) < 1e-5))) return entity;
  const upper = rearParkingPlanToWorld([4247, 1810]);
  const lower = rearParkingPlanToWorld([4244, 2237]);
  if (bounds.minZ <= lower[1] || bounds.minZ >= upper[1] || bounds.maxZ <= upper[1]
    || bounds.minX >= upper[0] || bounds.maxX <= lower[0]) return entity;
  const cutX = upper[0] + (lower[0] - upper[0]) * (bounds.minZ - upper[1]) / (lower[1] - upper[1]);
  const coordinates: [number, number][] = [
    [cutX, bounds.minZ], [bounds.maxX, bounds.minZ], [bounds.maxX, bounds.maxZ],
    [bounds.minX, bounds.maxZ], [bounds.minX, upper[1]], [upper[0], upper[1]], [cutX, bounds.minZ],
  ];
  return { ...entity, geometry: { ...entity.geometry, coordinates: [coordinates] },
    metadata: { ...entity.metadata, parkingPresentationCut: 'ANNEX_5_A_INNER_EDGE_CANONICAL_UNCHANGED' } };
}

export function getRearParkingFocusBounds(blockId: string | null, spaceId: string | null, view: ParkingCameraView = 'overview') {
  const space = view === 'detail' && spaceId ? REAR_PARKING_SPACE_BY_ID.get(spaceId) : null;
  if (space) return parkingBounds(space.polygon, 0.6);
  const block = view !== 'overview' && blockId ? REAR_PARKING_BLOCK_BY_ID.get(blockId) : null;
  if (block) return parkingBounds(block.polygon, 0.9);
  // Include real rear landmarks as context; do not expand to unrelated front parking.
  const context = [[1805, 2118], [1545, 2241], [2615, 1957.5]].map((p) => officialPdfPointToLocal(p as [number, number]));
  return parkingBounds([...parkingBoundsPolygon(REAR_PARKING_BOUNDS), ...context], 1.5);
}

const spaceIndex = createParkingSpatialIndex(REAR_PARKING_SPACES);
export function pickRearParkingSpace(point: ParkingPoint) {
  // Raster stroke tolerance can produce touching edges. Nearest center keeps both
  // sides inspectable without treating a symbol as a surveyed operational boundary.
  return spaceIndex.candidates(point).sort((a, b) => (
    Math.hypot(a.center[0] - point[0], a.center[1] - point[1])
      - Math.hypot(b.center[0] - point[0], b.center[1] - point[1])
    || a.id.localeCompare(b.id)
  ))[0] ?? null;
}
export function pickRearParkingBlock(point: ParkingPoint) {
  return REAR_PARKING_BLOCKS.find((block) => parkingContainsPoint(point, block.polygon)) ?? null;
}

export const REAR_PARKING_TREE_CANDIDATES = buildRearParkingTrees((point) => rearParkingPlanToWorld(rearParkingSatelliteToPlan(point)));

/** Reconcile, do not relocate, source canopy observations against protected geometry. */
export function reconcileRearParkingTrees(existing: readonly CommercialMapTree[], entities: readonly MapEntity[]) {
  const blockers = entities.filter((entity) => entity.isSellable || ['PAVILION', 'BUILDING', 'LIVESTOCK_AREA', 'ATTRACTION'].includes(entity.classification));
  return REAR_PARKING_TREE_CANDIDATES.filter((tree) => (
    !existing.some((other) => Math.hypot(tree.position[0] - other.position[0], tree.position[1] - other.position[1])
      < (tree.canopyRadius + other.canopyRadius) * 0.55)
    && !blockers.some((entity) => parkingDistanceToPolygon(tree.position, entity.geometry.coordinates[0] ?? []) < tree.trunkRadius + 0.1)
    && !REAR_PARKING_ROWS.some((row) => parkingDistanceToPolygon(tree.position, row.polygon) < tree.canopyRadius * 0.7)
    && !REAR_PARKING_SURFACES.some((surface) => surface.kind !== 'grass' && parkingContainsPoint(tree.position, surface.polygon))
  ));
}

/** Support proxies stay inside the renderer. They are never appended to persisted map entities. */
export const REAR_PARKING_GROUND_SUPPORTS: readonly MapEntity[] = REAR_PARKING_SURFACES.map((surface) => ({
  id: `rear-parking:surface:${surface.id}`, projectId: 'presentation-only', layerId: 'presentation-only',
  parentEntityId: null, publicIdentifier: `REAR-PARKING-${surface.id}`, name: 'Solo do estacionamento posterior',
  description: null, classification: 'PARKING', verificationStatus: 'NEEDS_REVIEW', isSellable: false, isArchived: false,
  geometry: { id: null, type: 'Polygon', coordinates: [surface.polygon.map((p) => [p[0], p[1]])],
    elevation: 0, extrusionHeight: REAR_PARKING_ELEVATIONS.ground, rotation: 0, geometryVersion: 1, calibrationVersion: null },
  metadata: { presentationOnly: true, parkingReferenceRevision: REAR_PARKING_REFERENCE.revision },
}));
