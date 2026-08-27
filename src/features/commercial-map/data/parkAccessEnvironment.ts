import {
  PARK_ACCESS_SPATIAL_PLAN,
  parkAccessMetersToLocal,
  type ParkAccessConfidence,
  type ParkAccessPoint,
  type ParkAccessPolygon,
  type ParkAccessSourceId,
} from './parkAccessSpatialPlan';
import { OFFICIAL_REFERENCE_DATA } from './officialReference2026';
import {
  createParkAccessPolylineRibbon,
  parkAccessEnvironmentBudget,
  sampleParkAccessPolygonPlacements,
  sampleParkAccessPolylinePlacements,
  type ParkAccessEnvironmentPlacement,
} from '../utils/parkAccessEnvironment';
import { distanceToPolygon, pointInPolygon } from '../utils/spatialSurface';

export type ParkAccessEnvironmentSurfaceKind =
  | 'WOODLAND_FLOOR'
  | 'NATURAL_GRASS_EDGE'
  | 'LIGHT_GRASS'
  | 'EXPOSED_SOIL'
  | 'COMPACTED_SOIL_PAVER_MIX'
  | 'FIELD_TRANSITION'
  | 'WOODLAND_TRAIL'
  | 'WOODLAND_TRAIL_WEAR';

export interface ParkAccessEnvironmentSurface {
  id: string;
  kind: ParkAccessEnvironmentSurfaceKind;
  polygon: ParkAccessPolygon;
  holes: readonly ParkAccessPolygon[];
  elevation: number;
  sourceIds: readonly ParkAccessSourceId[];
  confidence: ParkAccessConfidence;
  notes: string;
}

export interface ParkAccessEnvironmentPresentation {
  revision: string;
  environmentalSurfaces: readonly ParkAccessEnvironmentSurface[];
  trailSurfaces: readonly ParkAccessEnvironmentSurface[];
  ambientTrees: readonly ParkAccessEnvironmentPlacement[];
  understory: readonly ParkAccessEnvironmentPlacement[];
  diagnostics: ReturnType<typeof parkAccessEnvironmentBudget> & {
    environmentalSurfaceCount: number;
    trailSurfaceCount: number;
    sourceSpatialRevision: string;
  };
}

export const PARK_ACCESS_ENVIRONMENT_REVISION = '2026.8-park-access-environment.r3';
export const PARK_ACCESS_AMBIENT_TREE_FOOTPRINT_CLEARANCE = {
  annexRelative: 0.3,
  narrowFieldReview: 0.08,
} as const;

export const PARK_ACCESS_ENVIRONMENT_PALETTE: Readonly<Record<ParkAccessEnvironmentSurfaceKind, string>> = {
  WOODLAND_FLOOR: '#52674c',
  NATURAL_GRASS_EDGE: '#789064',
  LIGHT_GRASS: '#8ba56f',
  EXPOSED_SOIL: '#8a7355',
  COMPACTED_SOIL_PAVER_MIX: '#81796a',
  FIELD_TRANSITION: '#777c5f',
  WOODLAND_TRAIL: '#8a785d',
  WOODLAND_TRAIL_WEAR: '#75644f',
};

export const PARK_ACCESS_AMBIENT_VEGETATION_PALETTE = {
  trunk: '#6b5038',
  trunkHighlight: '#826348',
  canopy: '#315f3a',
  canopyHighlight: '#46784b',
  understory: '#557747',
  understoryHighlight: '#708d58',
} as const;

const TRAIL_SOURCE_IDS = PARK_ACCESS_SPATIAL_PLAN.woodlandPath.sourceIds;
const WOODLAND_SOURCE_IDS = PARK_ACCESS_SPATIAL_PLAN.woodlandMass.sourceIds;
const COSTEIROS_SOURCE_IDS = PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.sourceIds;
const BENVENUTO_SOURCE_IDS = PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.sourceIds;
const THIRD_AGE_SETTING = PARK_ACCESS_SPATIAL_PLAN.thirdAgePavilionSetting;
const MOTORHOME_SETTING = PARK_ACCESS_SPATIAL_PLAN.motorhomeSetting;
// This plan contains only the purpose-built access network. Keeping the whole
// collection here covers vehicle corridors and gate aprons without leaking the
// presentation clearance into distant official roads rendered by the generic
// road layer.
const PARK_ACCESS_DRIVABLE_ROADS = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces;
const PARK_ACCESS_DRIVABLE_POLYGONS = PARK_ACCESS_DRIVABLE_ROADS.map((surface) => surface.polygon);

function officialFootprints(identifiers: readonly string[]) {
  return identifiers
    .map((identifier) => OFFICIAL_REFERENCE_DATA.entities.find(
      (entity) => entity.publicIdentifier === identifier,
    )?.geometry.coordinates[0])
    .filter(Boolean) as ParkAccessPolygon[];
}

const PROTECTED_COMMERCIAL_FOOTPRINTS = officialFootprints(
  PARK_ACCESS_SPATIAL_PLAN.protectedCommercialGeometry.identifiers,
);
const PARK_ACCESS_REGION_FOOTPRINTS = [
  MOTORHOME_SETTING.footprint,
  THIRD_AGE_SETTING.footprint,
  ...officialFootprints(['TEST-DRIVE']),
];

function circularClearancePolygon(
  center: ParkAccessPoint,
  radius: number,
  segmentCount = 24,
): ParkAccessPolygon {
  return Array.from({ length: segmentCount + 1 }, (_, index) => {
    const angle = index / segmentCount * Math.PI * 2;
    return [
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
    ] as const;
  });
}

const GATE_1_ROUNDABOUT_TREE_CLEARANCE = circularClearancePolygon(
  PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout.center,
  PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout.outerRadius
    + parkAccessMetersToLocal(Math.max(
      THIRD_AGE_SETTING.clearances.roadTreeTrunkMeters
        + THIRD_AGE_SETTING.clearances.canopyMeters,
      MOTORHOME_SETTING.clearances.roadTreeTrunkMeters
        + MOTORHOME_SETTING.clearances.canopyMeters,
    )),
);

function openPolygon(polygon: ParkAccessPolygon) {
  if (polygon.length < 2) return [...polygon];
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  return Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6
    ? polygon.slice(0, -1)
    : [...polygon];
}

function orientation(
  start: ParkAccessPoint,
  end: ParkAccessPoint,
  point: ParkAccessPoint,
) {
  return (end[0] - start[0]) * (point[1] - start[1])
    - (end[1] - start[1]) * (point[0] - start[0]);
}

function segmentsProperlyIntersect(
  firstStart: ParkAccessPoint,
  firstEnd: ParkAccessPoint,
  secondStart: ParkAccessPoint,
  secondEnd: ParkAccessPoint,
) {
  const firstA = orientation(firstStart, firstEnd, secondStart);
  const firstB = orientation(firstStart, firstEnd, secondEnd);
  const secondA = orientation(secondStart, secondEnd, firstStart);
  const secondB = orientation(secondStart, secondEnd, firstEnd);
  return ((firstA > 1e-6 && firstB < -1e-6) || (firstA < -1e-6 && firstB > 1e-6))
    && ((secondA > 1e-6 && secondB < -1e-6) || (secondA < -1e-6 && secondB > 1e-6));
}

/**
 * Earcut/ShapeGeometry accepts holes only when their complete ring is inside
 * the parent shape. Annex-derived footprints can merely touch or cross the
 * woodland envelope, so they must not be forwarded as invalid holes.
 */
export function isParkAccessPolygonFullyContained(
  candidate: ParkAccessPolygon,
  parent: ParkAccessPolygon,
) {
  const candidateRing = openPolygon(candidate);
  const parentRing = openPolygon(parent);
  if (candidateRing.length < 3 || parentRing.length < 3) return false;
  if (!candidateRing.every((point) => pointInPolygon(point, parentRing))) return false;

  return candidateRing.every((start, index) => {
    const end = candidateRing[(index + 1) % candidateRing.length];
    const samples = [0.25, 0.5, 0.75].map((amount) => [
      start[0] + (end[0] - start[0]) * amount,
      start[1] + (end[1] - start[1]) * amount,
    ] as const);
    if (!samples.every((point) => pointInPolygon(point, parentRing))) return false;
    return !parentRing.some((parentStart, parentIndex) => segmentsProperlyIntersect(
      start,
      end,
      parentStart,
      parentRing[(parentIndex + 1) % parentRing.length],
    ));
  });
}

/**
 * Visual-only clearance for the Caminho do Bosque. The canonical tree records
 * remain untouched and can still be used by inventories and other consumers.
 */
export function selectParkAccessCompatibleTreesForPresentation<
  Tree extends { position: ParkAccessPoint; canopyRadius: number },
>(trees: readonly Tree[]) {
  return trees.filter((tree) => {
    const canopyRadius = Math.max(0, tree.canopyRadius);
    const gate1RoundaboutDistance = Math.hypot(
      tree.position[0] - PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout.center[0],
      tree.position[1] - PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout.center[1],
    );
    return !pointInPolygon(tree.position, PARK_ACCESS_SPATIAL_PLAN.woodlandPath.clearancePolygon)
      && !pointInPolygon(tree.position, THIRD_AGE_SETTING.accessClearancePolygon)
      && gate1RoundaboutDistance
        >= PARK_ACCESS_SPATIAL_PLAN.gate1Roundabout.outerRadius + canopyRadius
      && PARK_ACCESS_DRIVABLE_ROADS.every((surface) => (
        !pointInPolygon(tree.position, surface.polygon)
        && distanceToPolygon(tree.position, surface.polygon) >= canopyRadius
      ));
  });
}

function polylineLength(points: readonly ParkAccessPoint[]) {
  return points.slice(0, -1).reduce((sum, point, index) => {
    const next = points[index + 1];
    return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
  }, 0);
}

function offsetPolyline(
  points: readonly ParkAccessPoint[],
  lateralOffset: number,
): readonly ParkAccessPoint[] {
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)] ?? point;
    const next = points[Math.min(points.length - 1, index + 1)] ?? point;
    const deltaX = next[0] - previous[0];
    const deltaZ = next[1] - previous[1];
    const length = Math.hypot(deltaX, deltaZ);
    if (length <= 1e-6) return point;
    return [
      point[0] - deltaZ / length * lateralOffset,
      point[1] + deltaX / length * lateralOffset,
    ] as const;
  });
}

function transitionSurfaceKind(surface: string): ParkAccessEnvironmentSurfaceKind {
  return surface === 'LIGHT_GRASS' ? 'LIGHT_GRASS' : 'COMPACTED_SOIL_PAVER_MIX';
}

function createEnvironmentalSurfaces(): readonly ParkAccessEnvironmentSurface[] {
  const fieldEdgePolygon = createParkAccessPolylineRibbon(
    PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.fieldEdge,
    parkAccessMetersToLocal(5.4),
  );
  const forestEdgePolygon = createParkAccessPolylineRibbon(
    PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.forestEdge,
    parkAccessMetersToLocal(4.8),
  );
  const naturalPathEdge = PARK_ACCESS_SPATIAL_PLAN.woodlandPath.edgeBands[0];
  const protectedWoodlandFootprints = officialFootprints(
    PARK_ACCESS_SPATIAL_PLAN.woodlandMass.protectedFootprintIdentifiers,
  );
  const woodlandFloorHoles = [
    PARK_ACCESS_SPATIAL_PLAN.woodlandMass.pathClearancePolygon,
    ...protectedWoodlandFootprints,
  ].filter((polygon) => isParkAccessPolygonFullyContained(
    polygon,
    PARK_ACCESS_SPATIAL_PLAN.woodlandMass.polygon,
  ));

  return [
    {
      id: 'park-access-woodland-floor',
      kind: 'WOODLAND_FLOOR',
      polygon: PARK_ACCESS_SPATIAL_PLAN.woodlandMass.polygon,
      holes: woodlandFloorHoles,
      elevation: 0.025,
      sourceIds: WOODLAND_SOURCE_IDS,
      confidence: PARK_ACCESS_SPATIAL_PLAN.woodlandMass.confidence,
      notes: 'Piso de sub-bosque recortado pela clareira GIS e por todos os protectedFootprintIdentifiers; não cria, move ou substitui árvores do inventário oficial.',
    },
    {
      id: naturalPathEdge.id,
      kind: 'NATURAL_GRASS_EDGE',
      polygon: naturalPathEdge.polygon,
      holes: [PARK_ACCESS_SPATIAL_PLAN.woodlandPath.surfacePolygon],
      elevation: 0.032,
      sourceIds: TRAIL_SOURCE_IDS,
      confidence: PARK_ACCESS_SPATIAL_PLAN.woodlandPath.confidence,
      notes: 'Ombros naturais seguem a faixa de segurança do Caminho do Bosque e preservam o piso central livre.',
    },
    {
      id: 'costeiros-yard-exposed-soil',
      kind: 'EXPOSED_SOIL',
      polygon: PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.yardPolygon,
      holes: [PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.buildingPolygon],
      elevation: 0.029,
      sourceIds: COSTEIROS_SOURCE_IDS,
      confidence: PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.confidence,
      notes: 'Pátio de solo compactado da Sede Costeiros, sempre abaixo da edificação e das vias de serviço.',
    },
    {
      id: 'costeiros-field-transition',
      kind: 'FIELD_TRANSITION',
      polygon: fieldEdgePolygon,
      holes: [],
      elevation: 0.026,
      sourceIds: COSTEIROS_SOURCE_IDS,
      confidence: PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.confidence,
      notes: 'Faixa visual derivada simetricamente do fieldEdge do GIS; não desloca o limite interpretado do campo.',
    },
    {
      id: 'costeiros-forest-transition',
      kind: 'WOODLAND_FLOOR',
      polygon: forestEdgePolygon,
      holes: [],
      elevation: 0.027,
      sourceIds: COSTEIROS_SOURCE_IDS,
      confidence: PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.confidence,
      notes: 'Transição leve bosque/via derivada do forestEdge registrado no Anexo 6.',
    },
    ...PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.transitionBands.map((band) => ({
      id: band.id,
      kind: transitionSurfaceKind(band.surface),
      polygon: band.polygon,
      holes: [] as readonly ParkAccessPolygon[],
      elevation: band.surface === 'LIGHT_GRASS' ? 0.031 : 0.034,
      sourceIds: BENVENUTO_SOURCE_IDS,
      confidence: PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.confidence,
      notes: band.surface === 'LIGHT_GRASS'
        ? 'Verge gramado entre bosque, passeio e recorte lateral da avenida.'
        : 'Transição permeável sob a leitura das vagas e do apron dos pavilhões; o hardscape permanece em camada própria.',
    })),
  ];
}

function createTrailSurfaces(): readonly ParkAccessEnvironmentSurface[] {
  return [
    {
      id: PARK_ACCESS_SPATIAL_PLAN.woodlandPath.id,
      kind: 'WOODLAND_TRAIL',
      polygon: PARK_ACCESS_SPATIAL_PLAN.woodlandPath.surfacePolygon,
      holes: [],
      elevation: 0.039,
      sourceIds: TRAIL_SOURCE_IDS,
      confidence: PARK_ACCESS_SPATIAL_PLAN.woodlandPath.confidence,
      notes: PARK_ACCESS_SPATIAL_PLAN.woodlandPath.notes,
    },
    {
      id: 'gate-2-woodland-connector-wear',
      kind: 'WOODLAND_TRAIL_WEAR',
      polygon: createParkAccessPolylineRibbon(
        PARK_ACCESS_SPATIAL_PLAN.woodlandPath.centerline,
        parkAccessMetersToLocal(1.05),
      ),
      holes: [],
      elevation: 0.041,
      sourceIds: TRAIL_SOURCE_IDS,
      confidence: PARK_ACCESS_SPATIAL_PLAN.woodlandPath.confidence,
      notes: 'Desgaste central derivado do mesmo eixo GIS, apenas para dar profundidade visual sem criar uma rota paralela.',
    },
  ];
}

function createAmbientTrees(reducedGraphics: boolean) {
  const treeBand = PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.treeBand;
  const motorhomeForestBudget = reducedGraphics ? 7 : 12;
  const motorhomeFieldBudget = reducedGraphics ? 4 : 7;
  const motorhomeRoad = PARK_ACCESS_DRIVABLE_ROADS.find(
    (surface) => surface.id === MOTORHOME_SETTING.accessRoadId,
  )!;
  const motorhomeCorridorLength = polylineLength(MOTORHOME_SETTING.accessCenterline);
  const motorhomeCanopyClearance = parkAccessMetersToLocal(
    MOTORHOME_SETTING.clearances.roadTreeTrunkMeters
      + MOTORHOME_SETTING.clearances.canopyMeters,
  );
  const motorhomeRoadHalfWidth = parkAccessMetersToLocal(motorhomeRoad.widthMeters) * 0.5;
  const motorhomeForestAxis = offsetPolyline(
    MOTORHOME_SETTING.accessCenterline,
    -(motorhomeRoadHalfWidth + motorhomeCanopyClearance + parkAccessMetersToLocal(1.1)),
  );
  const motorhomeFieldAxis = offsetPolyline(
    MOTORHOME_SETTING.accessCenterline,
    motorhomeRoadHalfWidth + motorhomeCanopyClearance + parkAccessMetersToLocal(1.8),
  );
  const commonExclusions = [
    PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.buildingPolygon,
    PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.yardPolygon,
    PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.serviceRoadPolygon,
    THIRD_AGE_SETTING.accessClearancePolygon,
    GATE_1_ROUNDABOUT_TREE_CLEARANCE,
    ...PARK_ACCESS_DRIVABLE_POLYGONS,
    ...PARK_ACCESS_REGION_FOOTPRINTS,
    ...PROTECTED_COMMERCIAL_FOOTPRINTS,
  ];
  const thirdAgeAccessLength = polylineLength(THIRD_AGE_SETTING.accessCenterline);
  const thirdAgeCanopyClearance = parkAccessMetersToLocal(
    THIRD_AGE_SETTING.clearances.canopyMeters,
  );
  const thirdAgeBandOffset = THIRD_AGE_SETTING.width * 0.5
    + parkAccessMetersToLocal(THIRD_AGE_SETTING.clearances.pavilionAccessTreeTrunkMeters)
    + thirdAgeCanopyClearance
    + 0.03;
  const thirdAgeTreeExclusions = [
    THIRD_AGE_SETTING.accessClearancePolygon,
    GATE_1_ROUNDABOUT_TREE_CLEARANCE,
    ...PARK_ACCESS_DRIVABLE_POLYGONS,
    ...PARK_ACCESS_REGION_FOOTPRINTS,
    ...PROTECTED_COMMERCIAL_FOOTPRINTS,
  ];
  const thirdAgeDenseBudget = reducedGraphics ? 2 : 4;
  const thirdAgeSparseBudget = reducedGraphics ? 1 : 2;
  const thirdAgeDenseTrees = sampleParkAccessPolylinePlacements(
    offsetPolyline(THIRD_AGE_SETTING.accessCenterline, thirdAgeBandOffset),
    {
      sourceZoneId: 'third-age-access-dense-tree-band',
      spacing: thirdAgeAccessLength / (thirdAgeDenseBudget + 1),
      endpointInset: thirdAgeAccessLength / (thirdAgeDenseBudget + 1),
      seed: 127,
      maximumCount: thirdAgeDenseBudget,
      minimumScale: 0.7,
      maximumScale: 0.94,
      verticalScale: 1.02,
      exclusions: thirdAgeTreeExclusions,
      exclusionClearance: thirdAgeCanopyClearance,
    },
  );
  const thirdAgeSparseTrees = sampleParkAccessPolylinePlacements(
    offsetPolyline(THIRD_AGE_SETTING.accessCenterline, -thirdAgeBandOffset),
    {
      sourceZoneId: 'third-age-access-sparse-tree-band',
      spacing: thirdAgeAccessLength / (thirdAgeSparseBudget + 1),
      endpointInset: thirdAgeAccessLength / (thirdAgeSparseBudget + 1),
      seed: 139,
      maximumCount: thirdAgeSparseBudget,
      minimumScale: 0.64,
      maximumScale: 0.84,
      verticalScale: 0.96,
      exclusions: thirdAgeTreeExclusions,
      exclusionClearance: thirdAgeCanopyClearance,
    },
  );

  const northSidewalk = PARK_ACCESS_SPATIAL_PLAN.sidewalkSurfaces.find(
    (surface) => surface.id === 'benvenuto-north-sidewalk',
  )!.polygon;
  const pavilionTrees = treeBand.segments.flatMap((segment, segmentIndex) => {
    const segmentBudget = reducedGraphics
      ? Math.max(1, Math.ceil(segment.placementCountBudget * 0.5))
      : segment.placementCountBudget;
    const segmentLength = polylineLength(segment.centerline);
    const segmentSpacing = segmentLength / (segmentBudget + 1);
    const footprintClearance = PARK_ACCESS_AMBIENT_TREE_FOOTPRINT_CLEARANCE.annexRelative;
    const protectedFootprint = OFFICIAL_REFERENCE_DATA.entities.find(
      (entity) => entity.publicIdentifier === segment.protectedIdentifier,
    )!.geometry.coordinates[0];
    const placements = sampleParkAccessPolylinePlacements(segment.centerline, {
      sourceZoneId: segment.id,
      spacing: segmentSpacing,
      endpointInset: segmentSpacing,
      lateralOffset: segment.width * 0.08,
      seed: 31 + segmentIndex * 17,
      maximumCount: segmentBudget,
      minimumScale: segment.canopyScale * 0.78,
      maximumScale: segment.canopyScale * 1.04,
      verticalScale: 1.16,
      exclusions: [
        PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.parkingCutout,
        northSidewalk,
      ],
      exclusionClearance: 0.04,
    });
    return placements.map((placement) => {
      const requiresSafetyOffset = pointInPolygon(placement.position, protectedFootprint)
        || distanceToPolygon(placement.position, protectedFootprint) < footprintClearance;
      if (!requiresSafetyOffset) return placement;
      const northernEdge = Math.min(...protectedFootprint.map(([, z]) => z));
      return {
        ...placement,
        sourceZoneId: `${placement.sourceZoneId}:protected-footprint-background`,
        position: [placement.position[0], northernEdge - footprintClearance] as const,
      };
    }).filter((placement) => (
      PROTECTED_COMMERCIAL_FOOTPRINTS.every((polygon) => (
        !pointInPolygon(placement.position, polygon)
        && distanceToPolygon(placement.position, polygon) >= footprintClearance - 1e-6
      ))
      && !pointInPolygon(
        placement.position,
        PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.parkingCutout,
      )
      && !pointInPolygon(placement.position, northSidewalk)
      && PARK_ACCESS_DRIVABLE_ROADS.every((surface) => (
        !pointInPolygon(placement.position, surface.polygon)
        && distanceToPolygon(placement.position, surface.polygon)
          >= PARK_ACCESS_AMBIENT_TREE_FOOTPRINT_CLEARANCE.narrowFieldReview - 1e-6
      ))
    ));
  });

  return [
    ...pavilionTrees,
    ...thirdAgeDenseTrees,
    ...thirdAgeSparseTrees,
    ...sampleParkAccessPolylinePlacements(motorhomeForestAxis, {
      sourceZoneId: 'motorhome-road-forest-side-trees',
      spacing: motorhomeCorridorLength / (motorhomeForestBudget + 1),
      endpointInset: motorhomeCorridorLength / (motorhomeForestBudget + 1) * 0.72,
      seed: 181,
      maximumCount: motorhomeForestBudget,
      minimumScale: 0.82,
      maximumScale: 1.2,
      verticalScale: 1.1,
      lateralOffset: parkAccessMetersToLocal(0.55),
      exclusions: commonExclusions,
      exclusionClearance: motorhomeCanopyClearance,
    }),
    ...sampleParkAccessPolylinePlacements(motorhomeFieldAxis, {
      sourceZoneId: 'motorhome-road-field-side-trees',
      spacing: motorhomeCorridorLength / (motorhomeFieldBudget + 1),
      endpointInset: motorhomeCorridorLength / (motorhomeFieldBudget + 1) * 0.88,
      seed: 223,
      maximumCount: motorhomeFieldBudget,
      minimumScale: 0.66,
      maximumScale: 0.96,
      verticalScale: 0.94,
      lateralOffset: parkAccessMetersToLocal(0.42),
      exclusions: commonExclusions,
      exclusionClearance: motorhomeCanopyClearance,
    }),
  ];
}

function createUnderstory(reducedGraphics: boolean) {
  const naturalEdge = PARK_ACCESS_SPATIAL_PLAN.woodlandPath.edgeBands[0].polygon;
  const benvenutoGrass = PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.transitionBands
    .find((band) => band.surface === 'LIGHT_GRASS')!.polygon;
  const motorhomeRoad = PARK_ACCESS_DRIVABLE_ROADS.find(
    (surface) => surface.id === MOTORHOME_SETTING.accessRoadId,
  )!;
  const motorhomeCorridorLength = polylineLength(MOTORHOME_SETTING.accessCenterline);
  const motorhomeRoadHalfWidth = parkAccessMetersToLocal(motorhomeRoad.widthMeters) * 0.5;
  const motorhomeUnderstoryClearance = parkAccessMetersToLocal(
    MOTORHOME_SETTING.clearances.roadTreeTrunkMeters,
  );
  const motorhomeForestUnderstoryAxis = offsetPolyline(
    MOTORHOME_SETTING.accessCenterline,
    -(motorhomeRoadHalfWidth + motorhomeUnderstoryClearance + parkAccessMetersToLocal(0.55)),
  );
  const motorhomeFieldUnderstoryAxis = offsetPolyline(
    MOTORHOME_SETTING.accessCenterline,
    motorhomeRoadHalfWidth + motorhomeUnderstoryClearance + parkAccessMetersToLocal(1.1),
  );
  const exclusions = [
    PARK_ACCESS_SPATIAL_PLAN.woodlandPath.surfacePolygon,
    PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.buildingPolygon,
    PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.serviceRoadPolygon,
    PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.parkingCutout,
    THIRD_AGE_SETTING.accessClearancePolygon,
    GATE_1_ROUNDABOUT_TREE_CLEARANCE,
    ...PARK_ACCESS_DRIVABLE_POLYGONS,
    ...PARK_ACCESS_REGION_FOOTPRINTS,
    ...PROTECTED_COMMERCIAL_FOOTPRINTS,
  ];
  const thirdAgeAccessLength = polylineLength(THIRD_AGE_SETTING.accessCenterline);
  const thirdAgeUnderstoryOffset = THIRD_AGE_SETTING.width * 0.5
    + parkAccessMetersToLocal(THIRD_AGE_SETTING.clearances.pavilionAccessTreeTrunkMeters)
    + 0.08;
  const thirdAgeUnderstoryExclusions = [
    THIRD_AGE_SETTING.accessClearancePolygon,
    GATE_1_ROUNDABOUT_TREE_CLEARANCE,
    ...PARK_ACCESS_DRIVABLE_POLYGONS,
    ...PARK_ACCESS_REGION_FOOTPRINTS,
    ...PROTECTED_COMMERCIAL_FOOTPRINTS,
  ];
  const thirdAgeDenseUnderstoryBudget = reducedGraphics ? 4 : 8;
  const thirdAgeSparseUnderstoryBudget = reducedGraphics ? 2 : 4;

  return [
    ...sampleParkAccessPolylinePlacements(
      offsetPolyline(THIRD_AGE_SETTING.accessCenterline, thirdAgeUnderstoryOffset),
      {
        sourceZoneId: 'third-age-access-dense-understory',
        spacing: thirdAgeAccessLength / (thirdAgeDenseUnderstoryBudget + 1),
        endpointInset: thirdAgeAccessLength / (thirdAgeDenseUnderstoryBudget + 1),
        seed: 151,
        maximumCount: thirdAgeDenseUnderstoryBudget,
        minimumScale: 0.52,
        maximumScale: 0.78,
        verticalScale: 0.58,
        exclusions: thirdAgeUnderstoryExclusions,
        exclusionClearance: 0.03,
      },
    ),
    ...sampleParkAccessPolylinePlacements(
      offsetPolyline(THIRD_AGE_SETTING.accessCenterline, -thirdAgeUnderstoryOffset),
      {
        sourceZoneId: 'third-age-access-sparse-understory',
        spacing: thirdAgeAccessLength / (thirdAgeSparseUnderstoryBudget + 1),
        endpointInset: thirdAgeAccessLength / (thirdAgeSparseUnderstoryBudget + 1),
        seed: 163,
        maximumCount: thirdAgeSparseUnderstoryBudget,
        minimumScale: 0.48,
        maximumScale: 0.7,
        verticalScale: 0.54,
        exclusions: thirdAgeUnderstoryExclusions,
        exclusionClearance: 0.03,
      },
    ),
    ...sampleParkAccessPolygonPlacements(naturalEdge, {
      sourceZoneId: 'woodland-path-understory',
      spacing: reducedGraphics ? 2.05 : 1.45,
      jitter: reducedGraphics ? 0.3 : 0.48,
      seed: 71,
      maximumCount: reducedGraphics ? 22 : 40,
      minimumScale: 0.68,
      maximumScale: 1.05,
      verticalScale: 0.76,
      exclusions,
      exclusionClearance: 0.16,
    }),
    ...sampleParkAccessPolylinePlacements(motorhomeForestUnderstoryAxis, {
      sourceZoneId: 'motorhome-road-forest-side-understory',
      spacing: motorhomeCorridorLength / ((reducedGraphics ? 10 : 18) + 1),
      endpointInset: parkAccessMetersToLocal(2.4),
      seed: 239,
      maximumCount: reducedGraphics ? 10 : 18,
      minimumScale: 0.7,
      maximumScale: 1,
      verticalScale: 0.7,
      lateralOffset: parkAccessMetersToLocal(0.42),
      exclusions,
      exclusionClearance: parkAccessMetersToLocal(0.35),
    }),
    ...sampleParkAccessPolylinePlacements(motorhomeFieldUnderstoryAxis, {
      sourceZoneId: 'motorhome-road-field-side-understory',
      spacing: motorhomeCorridorLength / ((reducedGraphics ? 5 : 10) + 1),
      endpointInset: parkAccessMetersToLocal(3.1),
      seed: 251,
      maximumCount: reducedGraphics ? 5 : 10,
      minimumScale: 0.62,
      maximumScale: 0.9,
      verticalScale: 0.62,
      lateralOffset: parkAccessMetersToLocal(0.32),
      exclusions,
      exclusionClearance: parkAccessMetersToLocal(0.3),
    }),
    ...sampleParkAccessPolygonPlacements(benvenutoGrass, {
      sourceZoneId: 'benvenuto-verge-understory',
      spacing: reducedGraphics ? 2.5 : 1.85,
      jitter: 0.34,
      seed: 109,
      maximumCount: reducedGraphics ? 10 : 18,
      minimumScale: 0.58,
      maximumScale: 0.84,
      verticalScale: 0.58,
      exclusions,
      exclusionClearance: 0.15,
    }),
  ];
}

export function resolveParkAccessEnvironmentPresentation(
  reducedGraphics: boolean,
): ParkAccessEnvironmentPresentation {
  const environmentalSurfaces = createEnvironmentalSurfaces();
  const trailSurfaces = createTrailSurfaces();
  const ambientTrees = createAmbientTrees(reducedGraphics);
  const understory = createUnderstory(reducedGraphics);
  return {
    revision: PARK_ACCESS_ENVIRONMENT_REVISION,
    environmentalSurfaces,
    trailSurfaces,
    ambientTrees,
    understory,
    diagnostics: {
      ...parkAccessEnvironmentBudget({
        environmentalSurfaceCount: environmentalSurfaces.length,
        trailSurfaceCount: trailSurfaces.length,
        ambientTreeCount: ambientTrees.length,
        understoryCount: understory.length,
      }),
      environmentalSurfaceCount: environmentalSurfaces.length,
      trailSurfaceCount: trailSurfaces.length,
      sourceSpatialRevision: PARK_ACCESS_SPATIAL_PLAN.revision,
    },
  };
}

export const PARK_ACCESS_ENVIRONMENT_SOURCE_REFERENCES = [
  'Anexo 1 — implantação registrada do bosque, vias e Sede Costeiros',
  'Anexo 3 — arborização linear e seção visual da Av. Benvenuto de Conti',
  'Anexo 5 — Caminho do Bosque entre Portão 2 e lateral superior/oeste do Pavilhão 14',
  'Anexo 6 — via, pátio, campo e borda florestal da Sede Costeiros',
  'Anexo 20 — leitura relativa da mini-rotatória independente e do acesso local do Portão 1',
  'Anexo 21 — implantação registrada dos eixos A1/A10 e da via até a Área Motor Home',
  'Anexo 22 — leitura aérea complementar das bordas arborizadas da via de pedra/saibro',
] as const;
