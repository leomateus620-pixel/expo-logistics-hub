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

export const PARK_ACCESS_ENVIRONMENT_REVISION = '2026.8-park-access-environment.r1';
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
  Tree extends { position: ParkAccessPoint },
>(trees: readonly Tree[]) {
  return trees.filter((tree) => !pointInPolygon(
    tree.position,
    PARK_ACCESS_SPATIAL_PLAN.woodlandPath.clearancePolygon,
  ));
}

function polylineLength(points: readonly ParkAccessPoint[]) {
  return points.slice(0, -1).reduce((sum, point, index) => {
    const next = points[index + 1];
    return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
  }, 0);
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
  const costeirosForestBudget = reducedGraphics ? 4 : 7;
  const costeirosFieldBudget = reducedGraphics ? 2 : 4;
  const commonExclusions = [
    PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.buildingPolygon,
    PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.yardPolygon,
    PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.serviceRoadPolygon,
  ];

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
    ));
  });

  return [
    ...pavilionTrees,
    ...sampleParkAccessPolylinePlacements(PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.forestEdge, {
      sourceZoneId: 'costeiros-forest-edge-screening',
      spacing: polylineLength(PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.forestEdge) / (costeirosForestBudget + 1),
      seed: 43,
      maximumCount: costeirosForestBudget,
      minimumScale: 0.84,
      maximumScale: 1.12,
      verticalScale: 1.08,
      lateralOffset: parkAccessMetersToLocal(1.1),
      exclusions: commonExclusions,
      exclusionClearance: 0.35,
    }),
    ...sampleParkAccessPolylinePlacements(PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.fieldEdge, {
      sourceZoneId: 'costeiros-field-edge-screening',
      spacing: polylineLength(PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.fieldEdge) / (costeirosFieldBudget + 1),
      seed: 59,
      maximumCount: costeirosFieldBudget,
      minimumScale: 0.72,
      maximumScale: 0.94,
      verticalScale: 0.96,
      lateralOffset: parkAccessMetersToLocal(0.8),
      exclusions: commonExclusions,
      exclusionClearance: 0.35,
    }),
  ];
}

function createUnderstory(reducedGraphics: boolean) {
  const naturalEdge = PARK_ACCESS_SPATIAL_PLAN.woodlandPath.edgeBands[0].polygon;
  const forestEdgePolygon = createParkAccessPolylineRibbon(
    PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.forestEdge,
    parkAccessMetersToLocal(4.8),
  );
  const fieldEdgePolygon = createParkAccessPolylineRibbon(
    PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.fieldEdge,
    parkAccessMetersToLocal(5.4),
  );
  const benvenutoGrass = PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.transitionBands
    .find((band) => band.surface === 'LIGHT_GRASS')!.polygon;
  const exclusions = [
    PARK_ACCESS_SPATIAL_PLAN.woodlandPath.surfacePolygon,
    PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.buildingPolygon,
    PARK_ACCESS_SPATIAL_PLAN.costeirosSetting.serviceRoadPolygon,
    PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.parkingCutout,
  ];

  return [
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
    ...sampleParkAccessPolygonPlacements(forestEdgePolygon, {
      sourceZoneId: 'costeiros-forest-understory',
      spacing: reducedGraphics ? 2.4 : 1.72,
      jitter: 0.42,
      seed: 83,
      maximumCount: reducedGraphics ? 10 : 18,
      minimumScale: 0.7,
      maximumScale: 1,
      verticalScale: 0.7,
      exclusions,
      exclusionClearance: 0.18,
    }),
    ...sampleParkAccessPolygonPlacements(fieldEdgePolygon, {
      sourceZoneId: 'costeiros-field-understory',
      spacing: reducedGraphics ? 2.6 : 1.9,
      jitter: 0.4,
      seed: 97,
      maximumCount: reducedGraphics ? 7 : 12,
      minimumScale: 0.62,
      maximumScale: 0.9,
      verticalScale: 0.62,
      exclusions,
      exclusionClearance: 0.18,
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
] as const;
