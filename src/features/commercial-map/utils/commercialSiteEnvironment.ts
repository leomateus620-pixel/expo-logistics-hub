import type { MapClassification, MapEntity } from '../types';
import {
  COMMERCIAL_SITE_ENVIRONMENT_RENDER_BUDGET,
  COMMERCIAL_SITE_ENVIRONMENT_MATERIALS,
  COMMERCIAL_SITE_ENVIRONMENT_TREATMENTS,
  COMMERCIAL_SITE_EXISTING_PAVILION_09_SERVICE_APRON,
  type CommercialSiteEnvironmentMaterialId,
  type CommercialSiteEnvironmentTreatmentDefinition,
  type CommercialSiteEnvironmentTreatmentId,
} from '../data/commercialSiteEnvironment';
import { OFFICIAL_REFERENCE_ENTITIES } from '../data/officialReference2026';
import { PARK_ACCESS_SPATIAL_PLAN } from '../data/parkAccessSpatialPlan';
import { REAR_PARKING_ROWS, REAR_PARKING_SURFACES } from '../data/rearParking';
import { buildRearRoadCorridorFootprints } from './rearRoadNetwork';
import { distanceToPolygon, distanceToSegment, pointInPolygon } from './spatialSurface';

export type CommercialSiteHardMaskRole =
  | 'OFFICIAL_ROAD'
  | 'OFFICIAL_PEDESTRIAN_PATH'
  | 'OFFICIAL_PARKING'
  | 'OFFICIAL_SOLID_FOOTPRINT'
  | 'OFFICIAL_LOT_OR_STAND'
  | 'PARK_ACCESS_ROAD'
  | 'PARK_ACCESS_SIDEWALK'
  | 'PARK_ACCESS_PARKING'
  | 'PARK_ACCESS_ROUNDABOUT'
  | 'REAR_ROAD_WITH_SHOULDERS'
  | 'REAR_PARKING_SURFACE'
  | 'REAR_PARKING_ROW'
  | 'EXISTING_SITE_APRON';

export type CommercialSitePoint = readonly [number, number];

export interface CommercialSiteBounds {
  minimumX: number;
  minimumZ: number;
  maximumX: number;
  maximumZ: number;
}

export interface CommercialSiteHardSurfaceMask {
  id: string;
  sourceIdentifier: string;
  role: CommercialSiteHardMaskRole;
  polygon: readonly CommercialSitePoint[];
  bounds: CommercialSiteBounds;
  clearance: number;
}

export interface CommercialSiteEnvironmentCell {
  id: string;
  treatmentId: CommercialSiteEnvironmentTreatmentId;
  officialOwnerIdentifiers: readonly string[];
  materialId: CommercialSiteEnvironmentMaterialId;
  polygon: readonly [CommercialSitePoint, CommercialSitePoint, CommercialSitePoint, CommercialSitePoint];
  center: CommercialSitePoint;
  elevation: number;
  colorVariation: number;
}

export interface CommercialSiteEnvironmentDiagnostics {
  treatmentCount: number;
  activeTreatmentCount: number;
  maskCount: number;
  maskCountByRole: Readonly<Record<CommercialSiteHardMaskRole, number>>;
  acceptedCellCount: number;
  rejectedOutsideEnvelope: number;
  rejectedBeyondTreatmentBand: number;
  rejectedByHardMask: number;
  materialDrawCalls: number;
  maximumDrawCalls: number;
  maximumCells: number;
  withinDrawCallBudget: boolean;
  withinCellBudget: boolean;
  missingOfficialOwnerIdentifiers: readonly string[];
  deterministicSignature: string;
}

export interface CommercialSiteEnvironmentPlan {
  cells: readonly CommercialSiteEnvironmentCell[];
  cellsByMaterial: Readonly<Record<CommercialSiteEnvironmentMaterialId, readonly CommercialSiteEnvironmentCell[]>>;
  hardSurfaceMasks: readonly CommercialSiteHardSurfaceMask[];
  diagnostics: CommercialSiteEnvironmentDiagnostics;
  semanticPolicy: {
    presentationOnly: true;
    mutatesInputEntities: false;
    createsMapEntities: false;
    createsSelectableObjects: false;
  };
}

const SOLID_FOOTPRINT_CLASSIFICATIONS: ReadonlySet<MapClassification> = new Set([
  'PAVILION',
  'BUILDING',
  'RESTAURANT',
  'FOOD_AREA',
  'RESTROOM',
  'CHEMICAL_RESTROOM',
  'GATE',
  'ADMINISTRATION',
  'SECURITY',
  'EMERGENCY',
  'SERVICE',
  'ATTRACTION',
  'EVENT_VENUE',
  'LIVESTOCK_AREA',
  'RESTRICTED_AREA',
  'LANDMARK',
]);

const MASK_ROLES = [
  'OFFICIAL_ROAD',
  'OFFICIAL_PEDESTRIAN_PATH',
  'OFFICIAL_PARKING',
  'OFFICIAL_SOLID_FOOTPRINT',
  'OFFICIAL_LOT_OR_STAND',
  'PARK_ACCESS_ROAD',
  'PARK_ACCESS_SIDEWALK',
  'PARK_ACCESS_PARKING',
  'PARK_ACCESS_ROUNDABOUT',
  'REAR_ROAD_WITH_SHOULDERS',
  'REAR_PARKING_SURFACE',
  'REAR_PARKING_ROW',
  'EXISTING_SITE_APRON',
] as const satisfies readonly CommercialSiteHardMaskRole[];

const EPSILON = 1e-7;

function withoutClosingPoint(polygon: readonly CommercialSitePoint[]) {
  if (polygon.length <= 1) return [...polygon];
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  return Math.hypot(first[0] - last[0], first[1] - last[1]) <= EPSILON
    ? polygon.slice(0, -1)
    : [...polygon];
}

export function commercialSitePolygonBounds(polygon: readonly CommercialSitePoint[]): CommercialSiteBounds {
  if (polygon.length === 0) return { minimumX: 0, minimumZ: 0, maximumX: 0, maximumZ: 0 };
  return polygon.reduce<CommercialSiteBounds>((bounds, [x, z]) => ({
    minimumX: Math.min(bounds.minimumX, x),
    minimumZ: Math.min(bounds.minimumZ, z),
    maximumX: Math.max(bounds.maximumX, x),
    maximumZ: Math.max(bounds.maximumZ, z),
  }), {
    minimumX: Number.POSITIVE_INFINITY,
    minimumZ: Number.POSITIVE_INFINITY,
    maximumX: Number.NEGATIVE_INFINITY,
    maximumZ: Number.NEGATIVE_INFINITY,
  });
}

function boundsOverlap(first: CommercialSiteBounds, second: CommercialSiteBounds, clearance = 0) {
  return first.minimumX <= second.maximumX + clearance
    && first.maximumX + clearance >= second.minimumX
    && first.minimumZ <= second.maximumZ + clearance
    && first.maximumZ + clearance >= second.minimumZ;
}

function cross(origin: CommercialSitePoint, first: CommercialSitePoint, second: CommercialSitePoint) {
  return (first[0] - origin[0]) * (second[1] - origin[1])
    - (first[1] - origin[1]) * (second[0] - origin[0]);
}

function properSegmentsIntersect(a: CommercialSitePoint, b: CommercialSitePoint, c: CommercialSitePoint, d: CommercialSitePoint) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON));
}

function pointOnPolygonBoundary(point: CommercialSitePoint, polygon: readonly CommercialSitePoint[]) {
  const ring = withoutClosingPoint(polygon);
  return ring.some((start, index) => (
    distanceToSegment(point, start, ring[(index + 1) % ring.length]) <= EPSILON
  ));
}

function pointStrictlyInsidePolygon(point: CommercialSitePoint, polygon: readonly CommercialSitePoint[]) {
  return !pointOnPolygonBoundary(point, polygon) && pointInPolygon(point, polygon);
}

/** Shared-boundary contact is accepted; only actual occupied interiors conflict. */
export function commercialSitePolygonInteriorsOverlap(
  firstPolygon: readonly CommercialSitePoint[],
  secondPolygon: readonly CommercialSitePoint[],
) {
  const first = withoutClosingPoint(firstPolygon);
  const second = withoutClosingPoint(secondPolygon);
  if (first.length < 3 || second.length < 3) return false;
  const firstBounds = commercialSitePolygonBounds(first);
  const secondBounds = commercialSitePolygonBounds(second);
  if (!boundsOverlap(firstBounds, secondBounds)) return false;

  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const firstStart = first[firstIndex];
    const firstEnd = first[(firstIndex + 1) % first.length];
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      const secondStart = second[secondIndex];
      const secondEnd = second[(secondIndex + 1) % second.length];
      if (properSegmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) return true;
    }
  }

  return first.some((point) => pointStrictlyInsidePolygon(point, second))
    || second.some((point) => pointStrictlyInsidePolygon(point, first));
}

export function commercialSitePolygonDistance(
  firstPolygon: readonly CommercialSitePoint[],
  secondPolygon: readonly CommercialSitePoint[],
) {
  const first = withoutClosingPoint(firstPolygon);
  const second = withoutClosingPoint(secondPolygon);
  if (first.length === 0 || second.length === 0) return Number.POSITIVE_INFINITY;
  if (commercialSitePolygonInteriorsOverlap(first, second)) return 0;
  let minimum = Number.POSITIVE_INFINITY;
  first.forEach((point) => {
    second.forEach((start, index) => {
      minimum = Math.min(minimum, distanceToSegment(point, start, second[(index + 1) % second.length]));
    });
  });
  second.forEach((point) => {
    first.forEach((start, index) => {
      minimum = Math.min(minimum, distanceToSegment(point, start, first[(index + 1) % first.length]));
    });
  });
  return minimum;
}

function entityMaskRole(entity: MapEntity): CommercialSiteHardMaskRole | null {
  if (entity.classification === 'ROAD') return 'OFFICIAL_ROAD';
  if (entity.classification === 'PEDESTRIAN_PATH') return 'OFFICIAL_PEDESTRIAN_PATH';
  if (entity.classification === 'PARKING') return 'OFFICIAL_PARKING';
  if (entity.classification === 'SELLABLE_LOT' || entity.classification === 'INTERNAL_STAND') {
    return 'OFFICIAL_LOT_OR_STAND';
  }
  if (SOLID_FOOTPRINT_CLASSIFICATIONS.has(entity.classification)) return 'OFFICIAL_SOLID_FOOTPRINT';
  return null;
}

function maskClearance(role: CommercialSiteHardMaskRole) {
  if (role === 'OFFICIAL_ROAD' || role === 'PARK_ACCESS_ROAD' || role === 'REAR_ROAD_WITH_SHOULDERS') return 0.07;
  if (role === 'OFFICIAL_PARKING' || role === 'PARK_ACCESS_PARKING'
    || role === 'REAR_PARKING_SURFACE' || role === 'REAR_PARKING_ROW') return 0.045;
  if (role === 'OFFICIAL_PEDESTRIAN_PATH' || role === 'PARK_ACCESS_SIDEWALK') return 0.04;
  return 0.018;
}

function makeMask(
  id: string,
  sourceIdentifier: string,
  role: CommercialSiteHardMaskRole,
  polygon: readonly CommercialSitePoint[],
): CommercialSiteHardSurfaceMask | null {
  const ring = withoutClosingPoint(polygon);
  if (ring.length < 3) return null;
  return Object.freeze({
    id,
    sourceIdentifier,
    role,
    polygon: Object.freeze(ring.map(([x, z]) => [x, z] as CommercialSitePoint)),
    bounds: commercialSitePolygonBounds(ring),
    clearance: maskClearance(role),
  });
}

function roundaboutPolygon(center: readonly [number, number], radius: number, segments = 28) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * Math.PI * 2;
    return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius] as CommercialSitePoint;
  });
}

/**
 * Central no-environment mask. It composes canonical surfaces and the three
 * presentation systems that already add real circulation without mutating any
 * of their source arrays.
 */
export function buildCommercialSiteHardSurfaceMasks(
  entities: readonly MapEntity[] = OFFICIAL_REFERENCE_ENTITIES,
) {
  const masks: CommercialSiteHardSurfaceMask[] = [];
  entities.forEach((entity) => {
    const role = entityMaskRole(entity);
    if (!role) return;
    const mask = makeMask(
      `official:${entity.id}`,
      entity.publicIdentifier,
      role,
      entity.geometry.coordinates[0] ?? [],
    );
    if (mask) masks.push(mask);
  });

  PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.forEach((surface) => {
    const mask = makeMask(`park-access:road:${surface.id}`, surface.id, 'PARK_ACCESS_ROAD', surface.polygon);
    if (mask) masks.push(mask);
  });
  PARK_ACCESS_SPATIAL_PLAN.sidewalkSurfaces.forEach((surface) => {
    const mask = makeMask(`park-access:sidewalk:${surface.id}`, surface.id, 'PARK_ACCESS_SIDEWALK', surface.polygon);
    if (mask) masks.push(mask);
  });
  PARK_ACCESS_SPATIAL_PLAN.parkingBays.forEach((surface) => {
    const mask = makeMask(`park-access:parking:${surface.id}`, surface.id, 'PARK_ACCESS_PARKING', surface.polygon);
    if (mask) masks.push(mask);
  });
  PARK_ACCESS_SPATIAL_PLAN.roundabouts.forEach((roundabout) => {
    const mask = makeMask(
      `park-access:roundabout:${roundabout.id}`,
      roundabout.id,
      'PARK_ACCESS_ROUNDABOUT',
      roundaboutPolygon(roundabout.center, roundabout.outerRadius),
    );
    if (mask) masks.push(mask);
  });

  buildRearRoadCorridorFootprints(undefined, { includeShoulders: true }).forEach((footprint) => {
    const mask = makeMask(
      `rear-road:${footprint.segmentId}`,
      footprint.roadId,
      'REAR_ROAD_WITH_SHOULDERS',
      footprint.polygon,
    );
    if (mask) masks.push(mask);
  });
  REAR_PARKING_SURFACES.forEach((surface) => {
    const mask = makeMask(`rear-parking:surface:${surface.id}`, surface.id, 'REAR_PARKING_SURFACE', surface.polygon);
    if (mask) masks.push(mask);
  });
  REAR_PARKING_ROWS.forEach((row) => {
    const mask = makeMask(`rear-parking:row:${row.id}`, row.id, 'REAR_PARKING_ROW', row.polygon);
    if (mask) masks.push(mask);
  });

  const existingApronMask = makeMask(
    COMMERCIAL_SITE_EXISTING_PAVILION_09_SERVICE_APRON.id,
    COMMERCIAL_SITE_EXISTING_PAVILION_09_SERVICE_APRON.officialOwnerIdentifier,
    'EXISTING_SITE_APRON',
    COMMERCIAL_SITE_EXISTING_PAVILION_09_SERVICE_APRON.polygon,
  );
  if (existingApronMask) masks.push(existingApronMask);

  return Object.freeze([...masks].sort((first, second) => first.id.localeCompare(second.id)));
}

export function commercialSiteCellIntersectsHardMask(
  polygon: readonly CommercialSitePoint[],
  mask: CommercialSiteHardSurfaceMask,
) {
  const bounds = commercialSitePolygonBounds(polygon);
  if (!boundsOverlap(bounds, mask.bounds, mask.clearance)) return false;
  return commercialSitePolygonInteriorsOverlap(polygon, mask.polygon)
    || commercialSitePolygonDistance(polygon, mask.polygon) <= mask.clearance + EPSILON;
}

function cellInsideEnvelope(polygon: readonly CommercialSitePoint[], envelope: readonly CommercialSitePoint[]) {
  const center: CommercialSitePoint = [
    polygon.reduce((sum, point) => sum + point[0], 0) / polygon.length,
    polygon.reduce((sum, point) => sum + point[1], 0) / polygon.length,
  ];
  return polygon.every((point) => pointInPolygon(point, envelope)) && pointInPolygon(center, envelope);
}

function deterministicUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function selectMaterial(
  definition: CommercialSiteEnvironmentTreatmentDefinition,
  distance: number,
) {
  return definition.materialBands.find((band) => distance <= band.maximumDistance + EPSILON)?.materialId ?? null;
}

function treatmentHostPolygons(
  definition: CommercialSiteEnvironmentTreatmentDefinition,
  entitiesByIdentifier: ReadonlyMap<string, readonly MapEntity[]>,
) {
  if (definition.hostGeometry === 'EXISTING_PAVILION_09_SERVICE_APRON') {
    return [COMMERCIAL_SITE_EXISTING_PAVILION_09_SERVICE_APRON.polygon];
  }
  return definition.officialOwnerIdentifiers.flatMap((identifier) => (
    entitiesByIdentifier.get(identifier)?.map((entity) => entity.geometry.coordinates[0] ?? []) ?? []
  ));
}

function centerOfPolygon(polygon: readonly CommercialSitePoint[]) {
  return polygon.reduce<CommercialSitePoint>((sum, point) => [
    sum[0] + point[0] / polygon.length,
    sum[1] + point[1] / polygon.length,
  ], [0, 0]);
}

function planSignature(cells: readonly CommercialSiteEnvironmentCell[]) {
  let hash = 2166136261;
  cells.forEach((cell) => {
    const token = `${cell.id}|${cell.materialId}|${cell.center[0].toFixed(4)}|${cell.center[1].toFixed(4)}`;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  });
  return `site-env-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function buildCommercialSiteEnvironmentPlan({
  entities = OFFICIAL_REFERENCE_ENTITIES,
  reducedGraphics = false,
}: {
  entities?: readonly MapEntity[];
  reducedGraphics?: boolean;
} = {}): CommercialSiteEnvironmentPlan {
  const hardSurfaceMasks = buildCommercialSiteHardSurfaceMasks(entities);
  const entitiesByIdentifier = new Map<string, MapEntity[]>();
  entities.forEach((entity) => {
    const existing = entitiesByIdentifier.get(entity.publicIdentifier) ?? [];
    existing.push(entity);
    entitiesByIdentifier.set(entity.publicIdentifier, existing);
  });
  const missingOwnerIdentifiers = new Set<string>();
  const cells: CommercialSiteEnvironmentCell[] = [];
  let rejectedOutsideEnvelope = 0;
  let rejectedBeyondTreatmentBand = 0;
  let rejectedByHardMask = 0;
  let activeTreatmentCount = 0;

  COMMERCIAL_SITE_ENVIRONMENT_TREATMENTS.forEach((definition) => {
    definition.officialOwnerIdentifiers.forEach((identifier) => {
      if (!entitiesByIdentifier.has(identifier)) missingOwnerIdentifiers.add(identifier);
    });
    const hostPolygons = treatmentHostPolygons(definition, entitiesByIdentifier);
    if (hostPolygons.length === 0) return;
    activeTreatmentCount += 1;
    const envelopeBounds = commercialSitePolygonBounds(definition.envelope);
    const maximumBand = Math.max(...definition.materialBands.map((band) => band.maximumDistance));
    const candidateMasks = hardSurfaceMasks.filter((mask) => (
      boundsOverlap(envelopeBounds, mask.bounds, maximumBand)
    ));
    const cellSize = reducedGraphics ? definition.reducedCellSize : definition.fullCellSize;
    const startX = Math.floor(envelopeBounds.minimumX / cellSize) * cellSize;
    const startZ = Math.floor(envelopeBounds.minimumZ / cellSize) * cellSize;
    const columnCount = Math.ceil((envelopeBounds.maximumX - startX) / cellSize);
    const rowCount = Math.ceil((envelopeBounds.maximumZ - startZ) / cellSize);

    for (let row = 0; row < rowCount; row += 1) {
      for (let column = 0; column < columnCount; column += 1) {
        const minimumX = startX + column * cellSize;
        const minimumZ = startZ + row * cellSize;
        const polygon = [
          [minimumX, minimumZ],
          [minimumX + cellSize, minimumZ],
          [minimumX + cellSize, minimumZ + cellSize],
          [minimumX, minimumZ + cellSize],
        ] as const satisfies readonly [CommercialSitePoint, CommercialSitePoint, CommercialSitePoint, CommercialSitePoint];
        if (!cellInsideEnvelope(polygon, definition.envelope)) {
          rejectedOutsideEnvelope += 1;
          continue;
        }
        const center = centerOfPolygon(polygon);
        const distance = Math.min(...hostPolygons.map((host) => distanceToPolygon(center, host)));
        const materialId = selectMaterial(definition, distance);
        if (!materialId) {
          rejectedBeyondTreatmentBand += 1;
          continue;
        }
        if (candidateMasks.some((mask) => commercialSiteCellIntersectsHardMask(polygon, mask))) {
          rejectedByHardMask += 1;
          continue;
        }
        const id = `${definition.id}:r${String(row).padStart(3, '0')}:c${String(column).padStart(3, '0')}`;
        cells.push(Object.freeze({
          id,
          treatmentId: definition.id,
          officialOwnerIdentifiers: definition.officialOwnerIdentifiers,
          materialId,
          polygon: Object.freeze(polygon.map(([x, z]) => [x, z] as CommercialSitePoint)) as unknown as readonly [CommercialSitePoint, CommercialSitePoint, CommercialSitePoint, CommercialSitePoint],
          center,
          elevation: COMMERCIAL_SITE_ENVIRONMENT_MATERIALS[materialId].elevation,
          colorVariation: deterministicUnit(id) * 2 - 1,
        }));
      }
    }
  });

  const orderedCells = Object.freeze([...cells].sort((first, second) => first.id.localeCompare(second.id)));
  const materialIds = Object.keys({
    'foundation-contact': true,
    'concrete-apron': true,
    'compacted-ground': true,
    'grass-dry-mix': true,
  }) as CommercialSiteEnvironmentMaterialId[];
  const cellsByMaterial = Object.freeze(Object.fromEntries(materialIds.map((materialId) => [
    materialId,
    Object.freeze(orderedCells.filter((cell) => cell.materialId === materialId)),
  ])) as Record<CommercialSiteEnvironmentMaterialId, readonly CommercialSiteEnvironmentCell[]>);
  const materialDrawCalls = materialIds.filter((materialId) => cellsByMaterial[materialId].length > 0).length;
  const maximumDrawCalls = reducedGraphics
    ? COMMERCIAL_SITE_ENVIRONMENT_RENDER_BUDGET.maximumReducedDrawCalls
    : COMMERCIAL_SITE_ENVIRONMENT_RENDER_BUDGET.maximumFullDrawCalls;
  const maximumCells = reducedGraphics
    ? COMMERCIAL_SITE_ENVIRONMENT_RENDER_BUDGET.maximumReducedCells
    : COMMERCIAL_SITE_ENVIRONMENT_RENDER_BUDGET.maximumFullCells;
  const maskCountByRole = Object.freeze(Object.fromEntries(MASK_ROLES.map((role) => [
    role,
    hardSurfaceMasks.filter((mask) => mask.role === role).length,
  ])) as Record<CommercialSiteHardMaskRole, number>);
  const diagnostics = Object.freeze({
    treatmentCount: COMMERCIAL_SITE_ENVIRONMENT_TREATMENTS.length,
    activeTreatmentCount,
    maskCount: hardSurfaceMasks.length,
    maskCountByRole,
    acceptedCellCount: orderedCells.length,
    rejectedOutsideEnvelope,
    rejectedBeyondTreatmentBand,
    rejectedByHardMask,
    materialDrawCalls,
    maximumDrawCalls,
    maximumCells,
    withinDrawCallBudget: materialDrawCalls <= maximumDrawCalls,
    withinCellBudget: orderedCells.length <= maximumCells,
    missingOfficialOwnerIdentifiers: Object.freeze([...missingOwnerIdentifiers].sort()),
    deterministicSignature: planSignature(orderedCells),
  });

  return Object.freeze({
    cells: orderedCells,
    cellsByMaterial,
    hardSurfaceMasks,
    diagnostics,
    semanticPolicy: Object.freeze({
      presentationOnly: true,
      mutatesInputEntities: false,
      createsMapEntities: false,
      createsSelectableObjects: false,
    }),
  });
}

export function commercialSiteCellsForOwner(
  plan: CommercialSiteEnvironmentPlan,
  officialOwnerIdentifier: string,
) {
  return plan.cells.filter((cell) => cell.officialOwnerIdentifiers.includes(officialOwnerIdentifier));
}

/**
 * Keeps one shared environmental plan while limiting an isolated segment to
 * treatments whose complete official owner set is present in that segment.
 */
export function selectCommercialSiteEnvironmentCells(
  plan: CommercialSiteEnvironmentPlan,
  activeOwnerIdentifiers?: ReadonlySet<string> | null,
) {
  if (!activeOwnerIdentifiers) return plan.cells;
  return plan.cells.filter((cell) => cell.officialOwnerIdentifiers.every((identifier) => (
    activeOwnerIdentifiers.has(identifier)
  )));
}
