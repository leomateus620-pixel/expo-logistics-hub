import type { Coordinate, MapEntity } from '../types';
import { OPEN_GROUND_PRESENTATION_HEIGHT } from '../constants';
import { officialPdfPointToLocal } from './officialReference2026';

export type GateFourDistrictPoint = readonly [number, number];
export type GateFourDistrictSourcePoint = readonly [number, number];
export type GateFourDistrictPolygon = readonly GateFourDistrictPoint[];
export type GateFourDistrictSourcePolygon = readonly GateFourDistrictSourcePoint[];

export type GateFourDistrictConfidence =
  | 'OFFICIAL_2026_REFERENCE'
  | 'PHOTOGRAPHIC_REFERENCE'
  | 'SATELLITE_AND_OFFICIAL_ALIGNMENT'
  | 'VISUALLY_INTERPRETED'
  | 'FIELD_REVIEW_REQUIRED'
  | 'NOT_SURVEYED';

export interface GateFourDistrictSource {
  id: string;
  fileName: string;
  role: 'current-map' | 'architecture-photo' | 'satellite';
  metricUse: 'OFFICIAL_ALIGNMENT_ONLY' | 'RELATIVE_ONLY' | 'VISUAL_ONLY';
  notes: string;
}

interface GateFourTree {
  id: string;
  sourcePosition: GateFourDistrictSourcePoint;
  position: GateFourDistrictPoint;
  scale: number;
  rotation: number;
  confidence: Extract<GateFourDistrictConfidence, 'VISUALLY_INTERPRETED' | 'FIELD_REVIEW_REQUIRED'>;
}

const toMapPoint = (source: GateFourDistrictSourcePoint): GateFourDistrictPoint => (
  officialPdfPointToLocal(source) as GateFourDistrictPoint
);

const toMapPolygon = (
  source: GateFourDistrictSourcePolygon,
): GateFourDistrictPolygon => source.map(toMapPoint);

const closeSourcePolygon = (
  points: readonly GateFourDistrictSourcePoint[],
): GateFourDistrictSourcePolygon => {
  if (points.length === 0) return [];
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1]
    ? [...points]
    : [...points, first];
};

const sourceRectangle = (
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): GateFourDistrictSourcePolygon => closeSourcePolygon([
  [minX, minZ],
  [maxX, minZ],
  [maxX, maxZ],
  [minX, maxZ],
]);

const mapLengthX = (sourceLength: number) => {
  const start = toMapPoint([600, 900]);
  const end = toMapPoint([600 + sourceLength, 900]);
  return Math.abs(end[0] - start[0]);
};

const mapLengthZ = (sourceLength: number) => {
  const start = toMapPoint([600, 900]);
  const end = toMapPoint([600, 900 + sourceLength]);
  return Math.abs(end[1] - start[1]);
};

const mapOffset = (
  sourceAnchor: GateFourDistrictSourcePoint,
  sourceVisualCenter: GateFourDistrictSourcePoint,
): GateFourDistrictPoint => {
  const anchor = toMapPoint(sourceAnchor);
  const visualCenter = toMapPoint(sourceVisualCenter);
  return [visualCenter[0] - anchor[0], visualCenter[1] - anchor[1]];
};

const roadSourcePolygon = sourceRectangle(1600, 1744, 1648, 3145);
const crioulosFootprintSource = sourceRectangle(1484, 2192, 1596, 2288);
const crioulosAccessSource = closeSourcePolygon([
  [1600, 2278],
  [1584, 2278],
  [1568, 2289],
]);
const crioulosFlagpoleSourcePositions = [
  [1496, 2305],
  [1525, 2306],
  [1554, 2306],
  [1583, 2305],
] as const satisfies readonly GateFourDistrictSourcePoint[];
const crioulosFenceSourceSegments = [
  [[1050, 2332], [1486, 2332]],
  [[1486, 2332], [1562, 2300]],
  [[1588, 2274], [1592, 1848]],
  [[1592, 1848], [1090, 1848]],
] as const satisfies readonly (
  readonly [GateFourDistrictSourcePoint, GateFourDistrictSourcePoint]
)[];

export const GATE_FOUR_DISTRICT_REVISION = '2026.8-gate-four.1';

export const GATE_FOUR_DISTRICT_REQUIRED_IDENTIFIERS = [
  'A4',
  'D5',
  'PAVILHAO-09',
  'RUA-BUENOS-AIRES',
  'AREA-MOTORHOME',
] as const;

export const GATE_FOUR_DISTRICT_PROVENANCE = {
  sources: [
    {
      id: 'annex-1',
      fileName: 'IMG_9791.jpeg',
      role: 'current-map',
      metricUse: 'VISUAL_ONLY',
      notes: 'Vista oblíqua anterior; evidencia o D5 genérico e a ausência de leitura arquitetônica do conjunto.',
    },
    {
      id: 'annex-2',
      fileName: 'IMG_9792.jpeg',
      role: 'current-map',
      metricUse: 'VISUAL_ONLY',
      notes: 'Vista superior anterior; confirma a relação leste/oeste entre Pavilhão 9, via e núcleo.',
    },
    {
      id: 'annex-3',
      fileName: 'IMG_9793.png',
      role: 'current-map',
      metricUse: 'VISUAL_ONLY',
      notes: 'Vista mobile anterior; usada para auditar legibilidade de A4, D5 e Pavilhão 9 em zoom aberto.',
    },
    {
      id: 'annex-4',
      fileName: 'IMG_9794.jpeg',
      role: 'current-map',
      metricUse: 'VISUAL_ONLY',
      notes: 'Vista geral anterior; registra o vazio paisagístico e a ligação viária truncada ao norte.',
    },
    {
      id: 'annex-5',
      fileName: 'IMG_9723.jpeg',
      role: 'architecture-photo',
      metricUse: 'RELATIVE_ONLY',
      notes: 'Referência principal da fachada cívica: tijolo, pilares, varanda, telha cerâmica e mastros.',
    },
    {
      id: 'annex-6',
      fileName: 'IMG_9722.jpeg',
      role: 'architecture-photo',
      metricUse: 'RELATIVE_ONLY',
      notes: 'Referência principal do volume longitudinal, telhado de quatro águas, chaminé, gramado e acesso em degraus.',
    },
    {
      id: 'annex-7',
      fileName: 'IMG_9795.jpeg',
      role: 'satellite',
      metricUse: 'OFFICIAL_ALIGNMENT_ONLY',
      notes: 'Apoia orientação relativa do núcleo, arena, via e Pavilhão 9; não constitui levantamento topográfico.',
    },
  ] satisfies readonly GateFourDistrictSource[],
  officialPlan: {
    title: 'Mapa do Parque 300x200',
    edition: 'Fenasoja 2026',
    role: 'canonical-entity-ownership-and-coordinate-frame',
  },
} as const;

export const GATE_FOUR_DISTRICT_CONFIDENCE = {
  entityOwnershipAndIdentifiers: 'OFFICIAL_2026_REFERENCE',
  gateAndRoadAxis: 'OFFICIAL_2026_REFERENCE',
  eastWestTopology: 'SATELLITE_AND_OFFICIAL_ALIGNMENT',
  crioulosArchitecture: 'PHOTOGRAPHIC_REFERENCE',
  pavilion9Architecture: 'VISUALLY_INTERPRETED',
  roadNorthExtension: 'SATELLITE_AND_OFFICIAL_ALIGNMENT',
  arenaFenceAccessAndVegetation: 'FIELD_REVIEW_REQUIRED',
  exactBuildingFootprints: 'NOT_SURVEYED',
  altimetry: 'NOT_SURVEYED',
} as const satisfies Record<string, GateFourDistrictConfidence>;

export const GATE_FOUR_DISTRICT_REFERENCE = {
  revision: GATE_FOUR_DISTRICT_REVISION,
  scope: 'PRESENTATION_ONLY',
  interpretation: 'official-plan-photography-and-satellite',
  provenance: GATE_FOUR_DISTRICT_PROVENANCE,
  confidence: GATE_FOUR_DISTRICT_CONFIDENCE,
  semanticPolicy: {
    preservesEntityIdsAndUuids: true,
    preservesClassification: true,
    preservesMetadata: true,
    persistsGeometry: false,
    mutatesCommercialMembership: false,
  },
} as const;

export const GATE_FOUR_DISTRICT_LAYOUT = {
  connectorRoad: {
    officialEntityIdentifier: 'RUA-BUENOS-AIRES',
    sourcePdfBounds: [1600, 1744, 1648, 3145] as const,
    originalOfficialSourcePdfBounds: [1600, 2410, 1648, 3145] as const,
    sourcePdfPolygon: roadSourcePolygon,
    polygon: toMapPolygon(roadSourcePolygon),
    sourcePdfAxis: [1624, 1744, 1624, 3145] as const,
    axisFrom: toMapPoint([1624, 1744]),
    axisTo: toMapPoint([1624, 3145]),
    width: mapLengthX(48),
    length: mapLengthZ(1401),
    surface: 'ASPHALT',
    surfaceElevationOffset: 0.006,
    edgeBandWidth: mapLengthX(5),
    shoulderWidth: mapLengthX(7),
    presentationOnly: true,
    connects: ['A4', 'D5', 'PAVILHAO-09', 'Q-V-06', 'AREA-MOTORHOME'] as const,
  },
  gate4: {
    officialEntityIdentifier: 'A4',
    sourcePdfAnchor: [1656, 1744] as const,
    sourcePdfRoadAxisCenter: [1624, 1744] as const,
    anchor: toMapPoint([1656, 1744]),
    center: toMapPoint([1624, 1744]),
    roadAxisCenter: toMapPoint([1624, 1744]),
    visualOffset: mapOffset([1656, 1744], [1624, 1744]),
    sourcePdfVisualOffset: [-32, 0] as const,
    facingRadians: 0,
    approachHeadingRadians: Math.PI / 2,
    width: mapLengthX(126),
    depth: mapLengthZ(42),
    portalClearHeight: 2.08,
    canopyHeight: 2.42,
    vehiclePortalCount: 2,
    pedestrianPortalCount: 1,
  },
  pavilion9: {
    officialEntityIdentifier: 'PAVILHAO-09',
    sourcePdfBounds: [1697, 1862, 1913, 2374] as const,
    sourcePdfCenter: [1805, 2118] as const,
    center: toMapPoint([1805, 2118]),
    visualOffset: [0, 0] as const,
    width: mapLengthX(216),
    depth: mapLengthZ(512),
    facingRadians: 0,
    bodyScale: [mapLengthX(200), 2.22, mapLengthZ(486)] as const,
    plinthHeight: 0.12,
    roof: {
      kind: 'LOW_PITCH_GABLE',
      pitchDegrees: 11,
      ridgeHeight: 0.72,
      eaveOverhang: 0.2,
      panelSpacing: 0.42,
      clerestoryHeight: 0.28,
    },
    facade: {
      longSideBayCount: 10,
      gableDoorCount: 2,
      serviceDoorCount: 2,
      baseCourseHeight: 0.22,
    },
    serviceApron: {
      sourcePdfPolygon: sourceRectangle(1682, 1848, 1928, 2390),
      polygon: toMapPolygon(sourceRectangle(1682, 1848, 1928, 2390)),
      surfaceElevationOffset: 0.012,
    },
  },
  crioulos: {
    officialEntityIdentifier: 'D5',
    sourcePdfAnchor: [1545, 2241] as const,
    sourcePdfCenter: [1540, 2240] as const,
    center: toMapPoint([1540, 2240]),
    visualOffset: mapOffset([1545, 2241], [1540, 2240]),
    sourcePdfFootprint: crioulosFootprintSource,
    footprint: toMapPolygon(crioulosFootprintSource),
    width: mapLengthX(112),
    depth: mapLengthZ(96),
    facingRadians: 0,
    bodyScale: [mapLengthX(100), 0.55, mapLengthZ(58)] as const,
    groundElevation: OPEN_GROUND_PRESENTATION_HEIGHT,
    roof: {
      kind: 'TERRACOTTA_HIP',
      pitchDegrees: 23,
      ridgeHeight: 0.4,
      eaveOverhang: 0.12,
      soffitThickness: 0.025,
      fasciaHeight: 0.055,
      tileCourseSpacing: 0.1,
    },
    veranda: {
      // Interpretação das fotos/satélite, não levantamento: frente sul e
      // lateral oeste sobre o gramado; a face leste mantém livre a rua.
      kind: 'WRAPAROUND_SOUTH_AND_WEST',
      depth: 0.43,
      slabHeight: 0.084,
      frontBayCount: 5,
      sideBayCount: 3,
      pillarWidth: 0.1,
      beamHeight: 0.055,
    },
    chimney: {
      sourcePdfPosition: [1518, 2208] as const,
      position: toMapPoint([1518, 2208]),
      width: 0.18,
      depth: 0.1,
      heightAboveRoof: 0.3,
      capHeight: 0.025,
    },
    flagpoles: crioulosFlagpoleSourcePositions.map((sourcePosition, index) => ({
      id: `crioulos-flagpole-${index + 1}`,
      sourcePosition,
      position: toMapPoint(sourcePosition),
      height: 1.65,
      flagIdentity: 'NOT_DOCUMENTED',
    })),
    arena: {
      // Satellite-relative interpretation: the ring is immediately north-
      // northwest of the house, about 1.5 facade widths, not a second district.
      sourcePdfCenter: [1500, 2110] as const,
      center: toMapPoint([1500, 2110]),
      radiusX: mapLengthX(75),
      radiusZ: mapLengthZ(60),
      surface: 'COMPACTED_EARTH',
      surfaceElevationOffset: 0.014,
      fence: {
        postSpacing: 0.56,
        postHeight: 0.32,
        railCount: 2,
        railHeight: 0.25,
      },
    },
    fence: {
      material: 'DARK_TIMBER',
      postSpacing: 0.62,
      postHeight: 0.3,
      railCount: 2,
      sourcePdfSegments: crioulosFenceSourceSegments,
      segments: crioulosFenceSourceSegments.map((segment) => segment.map(toMapPoint)),
    },
    access: {
      sourcePdfCenterline: crioulosAccessSource,
      centerline: crioulosAccessSource.map(toMapPoint),
      sourcePdfThreshold: [1568, 2289] as const,
      threshold: toMapPoint([1568, 2289]),
      width: mapLengthX(22),
      surface: 'BRICK_AND_CONCRETE',
      roadEntityIdentifier: 'RUA-BUENOS-AIRES',
    },
  },
  landscape: {
    sourcePdfGrassBoundary: sourceRectangle(930, 1785, 1595, 2395),
    grassBoundary: toMapPolygon(sourceRectangle(930, 1785, 1595, 2395)),
    grassElevationOffset: 0.008,
    trees: [
      [1350, 2030],
      [1410, 2030],
      [1465, 1940],
      [1350, 2160],
      [1425, 2200],
      [1375, 2285],
      [1450, 2370],
      [1570, 2380],
      [1260, 2175],
      [1265, 2315],
    ].map(([x, z], index) => ({
      id: `gate-four-tree-${String(index + 1).padStart(2, '0')}`,
      sourcePosition: [x, z] as const,
      position: toMapPoint([x, z]),
      scale: 0.82 + ((index * 19) % 31) / 100,
      rotation: (index * 2.399963229728653) % (Math.PI * 2),
      confidence: 'FIELD_REVIEW_REQUIRED',
    })) satisfies readonly GateFourTree[],
  },
  automotiveAdjacency: {
    officialEntityIdentifier: 'Q-V-06',
    relation: 'ADJACENT_TO_CONNECTOR_DESTINATION',
    presentationRole: 'WAYFINDING_ENDPOINT_ONLY',
    membershipPolicy: 'PRESERVE_EXISTING_AUTOMOTIVE_MEMBERSHIP',
    mutatesMembership: false,
  },
} as const;

/** Shared numeric presentation contract; never changes the official D5 geometry. */
export function resolveCrioulosArchitectureEnvelope() {
  const plan = GATE_FOUR_DISTRICT_LAYOUT.crioulos;
  const [bodyWidth, wallHeight, bodyDepth] = plan.bodyScale;
  const floor = {
    minX: -bodyWidth / 2 - plan.veranda.depth,
    maxX: bodyWidth / 2,
    minZ: -bodyDepth / 2,
    maxZ: bodyDepth / 2 + plan.veranda.depth,
    baseY: plan.groundElevation,
    topY: plan.groundElevation + plan.veranda.slabHeight,
  };
  const eave = plan.roof.eaveOverhang;
  const roofWidth = floor.maxX - floor.minX + eave * 2;
  const roofDepth = floor.maxZ - floor.minZ + eave * 2;
  const roofCenter: GateFourDistrictPoint = [
    (floor.minX + floor.maxX) / 2,
    (floor.minZ + floor.maxZ) / 2,
  ];
  const soffitBottomY = floor.topY + wallHeight;
  const eaveY = soffitBottomY + plan.roof.soffitThickness;
  const ridgeHalfLength = Math.max(0, (roofWidth - roofDepth) / 2);
  const roof = {
    minX: floor.minX - eave,
    maxX: floor.maxX + eave,
    minZ: floor.minZ - eave,
    maxZ: floor.maxZ + eave,
    center: roofCenter,
    width: roofWidth,
    depth: roofDepth,
    eaveY,
    soffitBottomY,
    ridgeY: eaveY + plan.roof.ridgeHeight,
    ridgeHalfLength,
  };
  const halfPillar = plan.veranda.pillarWidth / 2;
  const westColumnX = floor.minX + halfPillar;
  const eastColumnX = floor.maxX - halfPillar;
  const frontColumnZ = floor.maxZ - halfPillar;
  const backColumnZ = floor.minZ + halfPillar;
  const interpolate = (from: number, to: number, t: number) => from + (to - from) * t;
  const frontColumns = Array.from({ length: plan.veranda.frontBayCount }, (_, index) => [
    interpolate(westColumnX, eastColumnX, index / (plan.veranda.frontBayCount - 1)),
    frontColumnZ,
  ] as const);
  // The southwest corner belongs to the front row, so it is not duplicated.
  const westColumns = Array.from({ length: plan.veranda.sideBayCount }, (_, index) => [
    westColumnX,
    interpolate(backColumnZ, frontColumnZ, index / plan.veranda.sideBayCount),
  ] as const);
  const beamBottomY = soffitBottomY - plan.veranda.beamHeight;
  const chimneyPoint: GateFourDistrictPoint = [
    plan.chimney.position[0] - plan.center[0],
    plan.chimney.position[1] - plan.center[1],
  ];
  const hipHeightAt = ([x, z]: GateFourDistrictPoint) => eaveY + plan.roof.ridgeHeight * Math.max(
    0,
    Math.min(
      1,
      (roofDepth / 2 - Math.abs(z - roofCenter[1])) / (roofDepth / 2),
      (roofWidth / 2 - Math.abs(x - roofCenter[0])) / (roofWidth / 2 - ridgeHalfLength),
    ),
  );
  const chimneyTopY = hipHeightAt(chimneyPoint) + plan.chimney.heightAboveRoof;
  const mastTopY = plan.groundElevation + Math.max(...plan.flagpoles.map((pole) => pole.height));
  return {
    floor,
    roof,
    wallHeight,
    columns: {
      front: frontColumns,
      west: westColumns,
      width: plan.veranda.pillarWidth,
      baseY: floor.topY,
      topY: beamBottomY,
      height: beamBottomY - floor.topY,
      centerY: (beamBottomY + floor.topY) / 2,
    },
    beams: { bottomY: beamBottomY, topY: soffitBottomY },
    chimney: {
      position: chimneyPoint,
      baseY: soffitBottomY - 0.06,
      topY: chimneyTopY,
      capTopY: chimneyTopY + plan.chimney.capHeight,
    },
    stairs: { count: 4, riserHeight: plan.veranda.slabHeight / 4, treadDepth: 0.07 },
    mastTopY,
    // Include the mast tips and a small framing margin for labels/selection.
    visualHeight: Math.max(mastTopY, roof.ridgeY, chimneyTopY + plan.chimney.capHeight) + 0.17,
  };
}

export const GATE_FOUR_DISTRICT_RENDER_BUDGET = {
  district: {
    baseDrawCalls: 28,
    detailedDrawCalls: 52,
    animatedDrawCalls: 0,
    textureMaxResolution: 512,
  },
  pavilion9: {
    baseDrawCalls: 9,
    detailedDrawCalls: 17,
  },
  crioulos: {
    baseDrawCalls: 13,
    detailedDrawCalls: 24,
    flagpoleInstances: GATE_FOUR_DISTRICT_LAYOUT.crioulos.flagpoles.length,
  },
  gate4: {
    baseDrawCalls: 6,
    detailedDrawCalls: 9,
  },
  landscape: {
    treeInstances: GATE_FOUR_DISTRICT_LAYOUT.landscape.trees.length,
    animatedDrawCalls: 0,
  },
} as const;

const normalizeIdentifier = (identifier: string) => (
  identifier.trim().toLocaleUpperCase('pt-BR')
);

/** Local interaction envelope for the portal and guardhouse, not a cadastral edit. */
export function resolveGateFourInteractionFootprint(
  bounds: { width: number; depth: number },
): Coordinate[] {
  const plan = GATE_FOUR_DISTRICT_LAYOUT.gate4;
  const width = Math.max(bounds.width, plan.width);
  const depth = Math.max(bounds.depth, plan.depth);
  const pierWidth = Math.max(0.18, plan.width * 0.13);
  const clearHalf = plan.width * 0.31;
  const guardWidth = Math.max(width * 0.25, 0.48);
  const guardDepth = Math.max(depth * 0.42, 0.5);
  const guardX = clearHalf + pierWidth + guardWidth * 0.52;
  const margin = 0.05;
  const minX = -plan.width / 2 - margin;
  const maxX = Math.max(plan.width / 2, guardX + guardWidth * 0.61) + margin;
  const halfDepth = Math.max(
    plan.depth * 0.42 + pierWidth / 2,
    depth * 0.46,
    plan.depth * 0.05 + guardDepth * 0.59,
  ) + margin;

  return [
    [minX, -halfDepth],
    [maxX, -halfDepth],
    [maxX, halfDepth],
    [minX, halfDepth],
    [minX, -halfDepth],
  ];
}

export function shouldRenderGateFourDistrict(
  entities: readonly Pick<MapEntity, 'publicIdentifier'>[],
): boolean {
  const identifiers = new Set(entities.map((entity) => normalizeIdentifier(entity.publicIdentifier)));
  return GATE_FOUR_DISTRICT_REQUIRED_IDENTIFIERS.every((identifier) => identifiers.has(identifier));
}

/**
 * Applies the annex-supported road continuity only to the transient render list.
 * Entity identity, ownership, classification and metadata remain untouched.
 */
export function withGateFourDistrictPresentationEntities(
  entities: readonly MapEntity[],
): MapEntity[] {
  if (!shouldRenderGateFourDistrict(entities)) return [...entities];

  const roadIdentifier = GATE_FOUR_DISTRICT_LAYOUT.connectorRoad.officialEntityIdentifier;
  return entities.map((entity) => {
    if (normalizeIdentifier(entity.publicIdentifier) !== roadIdentifier) return entity;

    const roadRing = GATE_FOUR_DISTRICT_LAYOUT.connectorRoad.polygon.map(
      ([x, z]) => [x, z] as Coordinate,
    );
    return {
      ...entity,
      geometry: {
        ...entity.geometry,
        coordinates: [roadRing],
      },
    };
  });
}
