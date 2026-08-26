import { MAP_REFERENCE_HEIGHT, MAP_REFERENCE_WIDTH } from '../constants';
import type { Coordinate } from '../types';
import { EXPORURAL_MAP_UNITS_PER_METER } from './exporuralReference2026';
import {
  OFFICIAL_2026_SOURCE_MANIFEST,
  officialPdfPointToLocal,
} from './officialReference2026';

export type ParkAccessPoint = readonly [number, number];
export type ParkAccessSourcePoint = readonly [number, number];
export type ParkAccessPolygon = readonly ParkAccessPoint[];
export type ParkAccessSourcePolygon = readonly ParkAccessSourcePoint[];

export type ParkAccessConfidence =
  | 'OFFICIAL_ANCHOR'
  | 'ANNEX_REGISTERED_TRACE'
  | 'ANNEX_RELATIVE_TRACE'
  | 'DIMENSIONALLY_INFERRED'
  | 'FIELD_REVIEW_REQUIRED';

export type ParkAccessSourceId =
  | 'official-2026-park-map'
  | 'annex-1-implantation'
  | 'annex-2-satellite'
  | 'annex-3-street-context'
  | 'gate-composite-upper-gate-3'
  | 'gate-composite-lower-gate-2'
  | 'annex-5-woodland-path'
  | 'annex-6-costeiros'
  | 'annex-7-current-mobile'
  | 'annex-8-current-mobile'
  | 'annex-9-current-mobile';

export interface ParkAccessEvidence {
  sourceIds: readonly ParkAccessSourceId[];
  confidence: ParkAccessConfidence;
  notes: string;
}

export interface ParkAccessAnchor extends ParkAccessEvidence {
  id: string;
  name: string;
  sourcePdfPoint: ParkAccessSourcePoint;
  point: ParkAccessPoint;
  officialEntityIdentifier: string | null;
}

export type ParkAccessRoadKind =
  | 'ARTERIAL_FOUR_LANE'
  | 'VEHICLE_ACCESS'
  | 'GATE_APRON'
  | 'COMPACTED_SERVICE_ROAD';

export interface ParkAccessRoadSurface extends ParkAccessEvidence {
  id: string;
  kind: ParkAccessRoadKind;
  elevation: number;
  widthMeters: number;
  sourcePdfCenterline: readonly ParkAccessSourcePoint[];
  centerline: readonly ParkAccessPoint[];
  sourcePdfPolygon: ParkAccessSourcePolygon;
  polygon: ParkAccessPolygon;
  connects: readonly string[];
  mergedApronIds?: readonly string[];
}

export interface ParkAccessSidewalkSurface extends ParkAccessEvidence {
  id: string;
  elevation: number;
  widthMeters: number;
  surface: 'CONCRETE' | 'INTERLOCKING_PAVER' | 'NATURAL_EDGE';
  sourcePdfCenterline: readonly ParkAccessSourcePoint[];
  centerline: readonly ParkAccessPoint[];
  sourcePdfPolygon: ParkAccessSourcePolygon;
  polygon: ParkAccessPolygon;
  segmentOf?: 'benvenuto-north-sidewalk';
  adjacentOfficialIdentifiers?: readonly string[];
}

export type ParkAccessMarkingStyle =
  | 'LANE_DASH_WHITE'
  | 'CENTER_DOUBLE_YELLOW'
  | 'EDGE_WHITE'
  | 'CROSSWALK_WHITE';

export interface ParkAccessMarkingSegment extends ParkAccessEvidence {
  id: string;
  style: ParkAccessMarkingStyle;
  sourcePdfFrom: ParkAccessSourcePoint;
  sourcePdfTo: ParkAccessSourcePoint;
  from: ParkAccessPoint;
  to: ParkAccessPoint;
  width: number;
  dashMeters: readonly [number, number] | null;
}

export interface ParkAccessParkingBay extends ParkAccessEvidence {
  id: string;
  sourcePdfCenter: ParkAccessSourcePoint;
  center: ParkAccessPoint;
  sourcePdfPolygon: ParkAccessSourcePolygon;
  polygon: ParkAccessPolygon;
  size: readonly [number, number];
  sizeMeters: readonly [number, number];
  /** Three.js yaw around +Y; 0 aligns bay depth to local +z. */
  rotation: number;
  zoneId: 'benvenuto-woodland-edge' | 'benvenuto-pavilion-edge';
}

export interface ParkAccessGateDefinition extends ParkAccessEvidence {
  id: 'gate-1' | 'gate-2' | 'gate-3';
  officialEntityIdentifier: 'A1' | 'A2' | 'A3';
  anchor: ParkAccessPoint;
  sourcePdfAnchor: ParkAccessSourcePoint;
  /** Heading of the arrival flow: 0 is local +x and PI/2 is local +z. */
  approachHeadingRadians: number;
  width: number;
  depth: number;
  widthMeters: number;
  depthMeters: number;
  lanes: number;
  vehiclePortalCount: number;
  pedestrianPortalCount: number;
  architecture:
    | 'MIXED_ACCESS_GATEHOUSE'
    | 'PEDESTRIAN_GATEHOUSE'
    | 'VEHICLE_CHECKPOINT_CANOPY';
  approachRoadIds: readonly string[];
}

export interface ParkAccessSourceManifestEntry {
  id: ParkAccessSourceId;
  file: string;
  role: string;
  metricUse: 'REGISTERED_TO_OFFICIAL_MAP' | 'RELATIVE_ONLY' | 'VISUAL_ONLY';
  interpretation: string;
}

const SOURCE_TO_LOCAL_X = MAP_REFERENCE_WIDTH / OFFICIAL_2026_SOURCE_MANIFEST.parkCropPdf.width;
const SOURCE_TO_LOCAL_Z = MAP_REFERENCE_HEIGHT / OFFICIAL_2026_SOURCE_MANIFEST.parkCropPdf.height;

/**
 * Working dimensional scale inherited from the repeated cadastral modules of
 * the Exporural layer. It keeps proportions coherent with the current scene,
 * but is not a surveyed global calibration for the external park perimeter.
 */
export const PARK_ACCESS_WORKING_MAP_UNITS_PER_METER = EXPORURAL_MAP_UNITS_PER_METER;
export const PARK_ACCESS_SOURCE_POINTS_PER_METER =
  PARK_ACCESS_WORKING_MAP_UNITS_PER_METER / SOURCE_TO_LOCAL_X;

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function parkAccessSourcePointToLocal(point: ParkAccessSourcePoint): ParkAccessPoint {
  const [x, z] = officialPdfPointToLocal(point);
  return [round(x), round(z)];
}

export function parkAccessMetersToLocal(meters: number) {
  return round(meters * PARK_ACCESS_WORKING_MAP_UNITS_PER_METER);
}

export function parkAccessMetersToSourcePdf(meters: number) {
  return meters * PARK_ACCESS_SOURCE_POINTS_PER_METER;
}

/** Heading in the local x/z plane, measured from +x toward +z. */
export function parkAccessHeadingBetween(
  from: ParkAccessSourcePoint,
  to: ParkAccessSourcePoint,
) {
  const deltaX = (to[0] - from[0]) * SOURCE_TO_LOCAL_X;
  const deltaZ = (to[1] - from[1]) * SOURCE_TO_LOCAL_Z;
  return Math.atan2(deltaZ, deltaX);
}

function pathToLocal(points: readonly ParkAccessSourcePoint[]): readonly ParkAccessPoint[] {
  return points.map(parkAccessSourcePointToLocal);
}

function closeSourcePolygon(points: readonly ParkAccessSourcePoint[]): ParkAccessSourcePolygon {
  if (points.length === 0) return [];
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1]
    ? [...points]
    : [...points, first];
}

function polygonToLocal(points: readonly ParkAccessSourcePoint[]): ParkAccessPolygon {
  return closeSourcePolygon(points).map(parkAccessSourcePointToLocal);
}

function sourceRectangle(
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): ParkAccessSourcePolygon {
  return closeSourcePolygon([
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ]);
}

function rotatedSourceRectangle(
  center: ParkAccessSourcePoint,
  widthMeters: number,
  depthMeters: number,
  rotation: number,
): ParkAccessSourcePolygon {
  const halfWidth = parkAccessMetersToSourcePdf(widthMeters) / 2;
  const halfDepth = parkAccessMetersToSourcePdf(depthMeters) / 2;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const corners = [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ] as const;
  return closeSourcePolygon(corners.map(([localX, localZ]) => [
    round(center[0] + cosine * localX + sine * localZ, 3),
    round(center[1] - sine * localX + cosine * localZ, 3),
  ] as const));
}

/**
 * Produces a conservative mitered envelope around an annex-traced centerline.
 * It is intentionally deterministic and contains no smoothing that could move
 * an official endpoint such as A1, A2 or A3.
 */
function strokeSourcePath(
  points: readonly ParkAccessSourcePoint[],
  widthMeters: number,
): ParkAccessSourcePolygon {
  if (points.length < 2) return closeSourcePolygon(points);
  const halfWidth = parkAccessMetersToSourcePdf(widthMeters) / 2;
  const left: ParkAccessSourcePoint[] = [];
  const right: ParkAccessSourcePoint[] = [];

  points.forEach((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next[0] - previous[0];
    const dz = next[1] - previous[1];
    const length = Math.hypot(dx, dz) || 1;
    const offsetX = (-dz / length) * halfWidth;
    const offsetZ = (dx / length) * halfWidth;
    left.push([round(point[0] + offsetX, 3), round(point[1] + offsetZ, 3)]);
    right.push([round(point[0] - offsetX, 3), round(point[1] - offsetZ, 3)]);
  });

  return closeSourcePolygon([...left, ...right.reverse()]);
}

const A1_SOURCE = [684, 3306] as const;
const A2_SOURCE = [1274, 4040] as const;
const A3_SOURCE = [3935, 4219] as const;
const ROUNDABOUT_SOURCE = [1110, 4185] as const;
const COSTEIROS_CENTER_SOURCE = [917.5, 2972.5] as const;

const GATE_1_APPROACH_SOURCE = [
  [696, 3890],
  [662, 3790],
  [642, 3620],
  [651, 3450],
  A1_SOURCE,
] as const satisfies readonly ParkAccessSourcePoint[];

const BENVENUTO_FOUR_LANE_SOURCE = [
  [1234, 4200],
  [1600, 4199],
  [2300, 4198],
  [3000, 4200],
  [3600, 4205],
  A3_SOURCE,
] as const satisfies readonly ParkAccessSourcePoint[];

const COSTEIROS_SERVICE_ROAD_SOURCE = [
  A1_SOURCE,
  [735, 3175],
  [775, 3040],
  [792, 2850],
  [810, 2600],
  [838, 2300],
  [878, 1980],
  [925, 1710],
  [1030, 1585],
  [1310, 1578],
  [1650, 1600],
] as const satisfies readonly ParkAccessSourcePoint[];

const COSTEIROS_FIELD_SPUR_SOURCE = [
  [775, 3068],
  [1030, 3096],
  [1320, 3098],
  [1650, 3120],
] as const satisfies readonly ParkAccessSourcePoint[];

const WOODLAND_PATH_SOURCE = [
  A2_SOURCE,
  [1325, 3972],
  [1530, 3940],
  [1780, 3932],
  [2050, 3922],
  [2265, 3900],
  [2360, 3860],
  [2398, 3796],
] as const satisfies readonly ParkAccessSourcePoint[];

const BENVENUTO_PARKING_APRON_WEST_SOURCE = sourceRectangle(1385, 4100, 2650, 4148);
const BENVENUTO_PARKING_APRON_EAST_SOURCE = sourceRectangle(2790, 4103, 3722, 4148);
/**
 * Two usable parking bands joined only by a narrow asphalt seam south of B23.
 * The eastern band stops before B11; neither protected footprint is paved over.
 */
const BENVENUTO_PARKING_CUTOUT_SOURCE = closeSourcePolygon([
  [1385, 4100],
  [2650, 4100],
  [2650, 4142],
  [2790, 4142],
  [2790, 4103],
  [3722, 4103],
  [3722, 4148],
  [1385, 4148],
]);

const BENVENUTO_TRAVEL_SURFACE_SOURCE = strokeSourcePath(BENVENUTO_FOUR_LANE_SOURCE, 14);
const BENVENUTO_CENTERLINE_POINT_COUNT = BENVENUTO_FOUR_LANE_SOURCE.length;
const BENVENUTO_SOUTH_EDGE_SOURCE = BENVENUTO_TRAVEL_SURFACE_SOURCE
  .slice(0, BENVENUTO_CENTERLINE_POINT_COUNT);
const BENVENUTO_NORTH_EDGE_SOURCE = BENVENUTO_TRAVEL_SURFACE_SOURCE
  .slice(BENVENUTO_CENTERLINE_POINT_COUNT, BENVENUTO_CENTERLINE_POINT_COUNT * 2);
/** Single merged asphalt polygon: four travel lanes plus the notched lateral apron. */
const BENVENUTO_ASPHALT_WITH_PARKING_SOURCE = closeSourcePolygon([
  ...BENVENUTO_SOUTH_EDGE_SOURCE,
  BENVENUTO_NORTH_EDGE_SOURCE[0],
  [3722, 4158],
  [3722, 4103],
  [2790, 4103],
  [2790, 4142],
  [2650, 4142],
  [2650, 4100],
  [1385, 4100],
  [1385, 4149],
  BENVENUTO_NORTH_EDGE_SOURCE[BENVENUTO_NORTH_EDGE_SOURCE.length - 1],
]);

const GATE_1_APRON_SOURCE = sourceRectangle(640, 3260, 728, 3352);
const GATE_2_APRON_SOURCE = closeSourcePolygon([
  [1206, 3984],
  [1328, 3978],
  [1350, 4088],
  [1205, 4100],
]);
const GATE_3_APRON_SOURCE = closeSourcePolygon([
  [3863, 4158],
  [3958, 4158],
  [4010, 4170],
  [4030, 4290],
  [3848, 4280],
]);

function makeRoadSurface(
  id: string,
  kind: ParkAccessRoadKind,
  centerline: readonly ParkAccessSourcePoint[],
  widthMeters: number,
  connects: readonly string[],
  evidence: ParkAccessEvidence,
  sourcePdfPolygon = strokeSourcePath(centerline, widthMeters),
): ParkAccessRoadSurface {
  const baseElevationByKind: Record<ParkAccessRoadKind, number> = {
    ARTERIAL_FOUR_LANE: 0.044,
    VEHICLE_ACCESS: 0.047,
    GATE_APRON: 0.056,
    COMPACTED_SERVICE_ROAD: 0.038,
  };
  const overlapSafeElevationById: Readonly<Record<string, number>> = {
    'gate-1-apron': 0.056,
    'gate-2-apron': 0.057,
    'gate-3-arrival': 0.058,
    'costeiros-field-spur': 0.039,
  };
  return {
    id,
    kind,
    elevation: overlapSafeElevationById[id] ?? baseElevationByKind[kind],
    widthMeters,
    sourcePdfCenterline: centerline,
    centerline: pathToLocal(centerline),
    sourcePdfPolygon,
    polygon: polygonToLocal(sourcePdfPolygon),
    connects,
    ...evidence,
  };
}

const ROAD_SURFACES = [
  makeRoadSurface(
    'gate-1-approach',
    'VEHICLE_ACCESS',
    GATE_1_APPROACH_SOURCE,
    8,
    ['AV-TUPARENDI', 'A1', 'costeiros-service-road'],
    {
      sourceIds: ['official-2026-park-map', 'annex-1-implantation', 'annex-2-satellite'],
      confidence: 'ANNEX_REGISTERED_TRACE',
      notes: 'Eixo preserva A1 e encontra a faixa oficial da Avenida Tuparendi; curvas intermediárias seguem a leitura conjunta de implantação e satélite, sem alegação de levantamento viário.',
    },
  ),
  {
    ...makeRoadSurface(
      'benvenuto-four-lane-axis',
      'ARTERIAL_FOUR_LANE',
      BENVENUTO_FOUR_LANE_SOURCE,
      14,
      ['roundabout-tupareendi', 'A2', 'A3', 'AV-BENVENUTO-CONTI'],
      {
        sourceIds: ['official-2026-park-map', 'annex-1-implantation', 'annex-3-street-context', 'annex-5-woodland-path'],
        confidence: 'DIMENSIONALLY_INFERRED',
        notes: 'Quatro faixas de 3,5 m mantêm o eixo oficial da Benvenuto; o mesmo polígono asfaltado incorpora dois aprons laterais recortados para B23 e B11.',
      },
      BENVENUTO_ASPHALT_WITH_PARKING_SOURCE,
    ),
    mergedApronIds: ['benvenuto-parking-apron-west', 'benvenuto-parking-apron-east'],
  },
  makeRoadSurface(
    'gate-1-apron',
    'GATE_APRON',
    [[684, 3306], [684, 3332]],
    10,
    ['gate-1-approach', 'A1', 'costeiros-service-road'],
    {
      sourceIds: ['official-2026-park-map', 'annex-1-implantation', 'annex-6-costeiros'],
      confidence: 'ANNEX_REGISTERED_TRACE',
      notes: 'Envelope do encontro do pórtico com os dois segmentos viários; a posição A1 é oficial e a largura do apron permanece interpretativa.',
    },
    GATE_1_APRON_SOURCE,
  ),
  makeRoadSurface(
    'gate-2-apron',
    'GATE_APRON',
    [[1274, 4040], [1325, 3972]],
    12,
    ['A2', 'gate-2-woodland-connector', 'benvenuto-four-lane-axis'],
    {
      sourceIds: ['official-2026-park-map', 'annex-1-implantation', 'gate-composite-lower-gate-2', 'annex-5-woodland-path'],
      confidence: 'ANNEX_REGISTERED_TRACE',
      notes: 'A2 é o Portão 2. O painel inferior da composição fotográfica é a sua referência arquitetônica e não pode ser usado para o Portão 3.',
    },
    GATE_2_APRON_SOURCE,
  ),
  makeRoadSurface(
    'gate-3-arrival',
    'GATE_APRON',
    [[3860, 4214], A3_SOURCE],
    18,
    ['benvenuto-four-lane-axis', 'A3'],
    {
      sourceIds: ['official-2026-park-map', 'gate-composite-upper-gate-3'],
      confidence: 'ANNEX_REGISTERED_TRACE',
      notes: 'A3 é o Portão 3. O apron começa ao sul dos footprints oficiais B11 e B42-02; o painel superior da composição fotográfica orienta cobertura, guaritas e vãos.',
    },
    GATE_3_APRON_SOURCE,
  ),
  makeRoadSurface(
    'costeiros-service-road',
    'COMPACTED_SERVICE_ROAD',
    COSTEIROS_SERVICE_ROAD_SOURCE,
    7,
    ['A1', 'sede-costeiros', 'costeiros-field-spur'],
    {
      sourceIds: ['annex-1-implantation', 'annex-6-costeiros'],
      confidence: 'ANNEX_REGISTERED_TRACE',
      notes: 'Via de serviço acompanha o limite oeste do bosque, passa a oeste da Sede Costeiros e curva para o campo; posição intermediária é traçada sobre o anexo, não levantada em campo.',
    },
  ),
  makeRoadSurface(
    'costeiros-field-spur',
    'COMPACTED_SERVICE_ROAD',
    COSTEIROS_FIELD_SPUR_SOURCE,
    5.5,
    ['costeiros-service-road', 'sede-costeiros', 'costeiros-field-edge'],
    {
      sourceIds: ['annex-1-implantation', 'annex-6-costeiros'],
      confidence: 'ANNEX_REGISTERED_TRACE',
      notes: 'Ramal leste passa ao sul da sede e acompanha a transição campo/bosque indicada no Anexo 6.',
    },
  ),
] as const satisfies readonly ParkAccessRoadSurface[];

function makeSidewalk(
  id: string,
  centerline: readonly ParkAccessSourcePoint[],
  widthMeters: number,
  surface: ParkAccessSidewalkSurface['surface'],
  evidence: ParkAccessEvidence,
  metadata: Pick<ParkAccessSidewalkSurface, 'segmentOf' | 'adjacentOfficialIdentifiers'> = {},
): ParkAccessSidewalkSurface {
  const sourcePdfPolygon = strokeSourcePath(centerline, widthMeters);
  return {
    id,
    elevation: 0.068,
    widthMeters,
    surface,
    sourcePdfCenterline: centerline,
    centerline: pathToLocal(centerline),
    sourcePdfPolygon,
    polygon: polygonToLocal(sourcePdfPolygon),
    ...metadata,
    ...evidence,
  };
}

const SIDEWALK_SURFACES = [
  makeSidewalk(
    'benvenuto-north-sidewalk',
    [[1355, 4085], [2655, 4085]],
    1.6,
    'CONCRETE',
    {
      sourceIds: ['annex-1-implantation', 'annex-3-street-context', 'annex-5-woodland-path'],
      confidence: 'ANNEX_RELATIVE_TRACE',
      notes: 'Trecho oeste/B2 termina antes de B23, começa depois do apron A2 e permanece ao norte do estacionamento lateral.',
    },
    { segmentOf: 'benvenuto-north-sidewalk', adjacentOfficialIdentifiers: ['B2', 'B23'] },
  ),
  makeSidewalk(
    'benvenuto-north-sidewalk-b3',
    [[2792, 4097], [3147, 4097]],
    1.6,
    'CONCRETE',
    {
      sourceIds: ['official-2026-park-map', 'annex-3-street-context'],
      confidence: 'ANNEX_RELATIVE_TRACE',
      notes: 'Trecho recortado diante de B3; cabe entre o footprint e o apron leste sem invadir B23 ou B4.',
    },
    { segmentOf: 'benvenuto-north-sidewalk', adjacentOfficialIdentifiers: ['B3', 'B4'] },
  ),
  makeSidewalk(
    'benvenuto-north-sidewalk-b5',
    [[3307, 4070], [3445, 4070]],
    1.6,
    'CONCRETE',
    {
      sourceIds: ['official-2026-park-map', 'annex-3-street-context'],
      confidence: 'ANNEX_RELATIVE_TRACE',
      notes: 'Trecho recortado diante de B5; B4, B6 e B11 são omitidos por falta de corredor livre defensável.',
    },
    { segmentOf: 'benvenuto-north-sidewalk', adjacentOfficialIdentifiers: ['B4', 'B5', 'B6'] },
  ),
  makeSidewalk(
    'benvenuto-south-sidewalk',
    [[1240, 4270], [2300, 4270], [3000, 4272], [3915, 4280]],
    1.8,
    'INTERLOCKING_PAVER',
    {
      sourceIds: ['annex-1-implantation', 'annex-3-street-context'],
      confidence: 'ANNEX_RELATIVE_TRACE',
      notes: 'Borda urbana sul da avenida; acabamento deve permanecer leve e contínuo, sem avançar sobre a pista de quatro faixas.',
    },
  ),
  makeSidewalk(
    'gate-1-west-sidewalk',
    GATE_1_APPROACH_SOURCE.map(([x, z]) => [x - 40, z] as const),
    1.6,
    'CONCRETE',
    {
      sourceIds: ['annex-1-implantation', 'annex-2-satellite'],
      confidence: 'FIELD_REVIEW_REQUIRED',
      notes: 'Faixa pedonal lateral garante leitura de chegada, mas posição exata de meio-fio e drenagem requer conferência local.',
    },
  ),
] as const satisfies readonly ParkAccessSidewalkSurface[];

function localSegment(
  id: string,
  style: ParkAccessMarkingStyle,
  sourcePdfFrom: ParkAccessSourcePoint,
  sourcePdfTo: ParkAccessSourcePoint,
  widthMeters: number,
  dashMeters: readonly [number, number] | null,
): ParkAccessMarkingSegment {
  return {
    id,
    style,
    sourcePdfFrom,
    sourcePdfTo,
    from: parkAccessSourcePointToLocal(sourcePdfFrom),
    to: parkAccessSourcePointToLocal(sourcePdfTo),
    width: parkAccessMetersToLocal(widthMeters),
    dashMeters,
    sourceIds: ['annex-1-implantation', 'annex-3-street-context'],
    confidence: 'DIMENSIONALLY_INFERRED',
    notes: 'Marcação parametrizada pela seção de quatro faixas; padrão e fase dos segmentos devem ser revisados caso surja projeto viário executivo.',
  };
}

const MARKING_SEGMENTS = [
  localSegment('benvenuto-centerline', 'CENTER_DOUBLE_YELLOW', [1280, 4200], [3890, 4216], 0.2, null),
  localSegment('benvenuto-north-lane-divider', 'LANE_DASH_WHITE', [1280, 4176], [3890, 4192], 0.12, [3, 5]),
  localSegment('benvenuto-south-lane-divider', 'LANE_DASH_WHITE', [1280, 4224], [3890, 4240], 0.12, [3, 5]),
  localSegment('benvenuto-north-edge', 'EDGE_WHITE', [1280, 4152], [3890, 4168], 0.12, null),
  localSegment('benvenuto-south-edge', 'EDGE_WHITE', [1280, 4248], [3890, 4264], 0.12, null),
] as const satisfies readonly ParkAccessMarkingSegment[];

const PARKING_BAY_SOURCE_X = [
  ...Array.from({ length: 22 }, (_, index) => 1410 + index * 58),
  ...Array.from({ length: 21 }, (_, index) => round(2812 + index * 44.4, 3)),
];

const PARKING_BAYS: readonly ParkAccessParkingBay[] = PARKING_BAY_SOURCE_X.map((sourceX, index) => {
  const sourcePdfCenter = [sourceX, 4124] as const;
  const sourcePdfPolygon = rotatedSourceRectangle(sourcePdfCenter, 2.7, 5.2, -Math.PI / 3);
  return {
    id: `benvenuto-bay-${String(index + 1).padStart(2, '0')}`,
    sourcePdfCenter,
    center: parkAccessSourcePointToLocal(sourcePdfCenter),
    sourcePdfPolygon,
    polygon: polygonToLocal(sourcePdfPolygon),
    size: [parkAccessMetersToLocal(2.7), parkAccessMetersToLocal(5.2)],
    sizeMeters: [2.7, 5.2],
    rotation: -Math.PI / 3,
    zoneId: sourceX < 2300 ? 'benvenuto-woodland-edge' : 'benvenuto-pavilion-edge',
    sourceIds: ['annex-1-implantation', 'annex-5-woodland-path'],
    confidence: 'DIMENSIONALLY_INFERRED',
    notes: 'Vaga inclinada no recorte lateral asfaltado; o anexo confirma a lógica e orientação, mas não individualiza cada medida ou numeração.',
  } satisfies ParkAccessParkingBay;
});

const WOODLAND_OUTER_SOURCE = closeSourcePolygon([
  [930, 3160],
  [2020, 3160],
  [2260, 3200],
  [2390, 3340],
  [2380, 3520],
  [2290, 3590],
  [2290, 3820],
  [2385, 3870],
  [2380, 4055],
  [2200, 4130],
  [1320, 4115],
  [1080, 3990],
  [950, 3820],
]);

const WOODLAND_PATH_SURFACE_SOURCE = strokeSourcePath(WOODLAND_PATH_SOURCE, 3);
const WOODLAND_PATH_CLEARANCE_SOURCE = strokeSourcePath(WOODLAND_PATH_SOURCE, 6.4);

const COSTEIROS_BUILDING_SOURCE = sourceRectangle(875, 2880, 960, 3065);
const COSTEIROS_YARD_SOURCE = closeSourcePolygon([
  [842, 2835],
  [1015, 2835],
  [1040, 3118],
  [824, 3115],
]);

/**
 * Street-side bands supported by Annex 3. B1-B4 and B6 have no defensible free strip
 * after subtracting footprints, segmented sidewalks and parking aprons, so no
 * trunk is invented there. B6 has less than 0.75 m between footprint and apron,
 * which cannot contain the parametrized 1.2 m band even at field-review confidence.
 */
const BENVENUTO_TREE_BAND_WIDTH_METERS = 1.2;
const BENVENUTO_TREE_BAND_SEGMENTS_SOURCE = [
  {
    id: 'benvenuto-tree-band-b5',
    protectedIdentifier: 'B5',
    sourcePdfCenterline: [[3320, 4088], [3432, 4088]],
    placementCountBudget: 3,
    canopyScale: 0.84,
    confidence: 'ANNEX_RELATIVE_TRACE',
    notes: 'Faixa sul/street-side de B5, entre o passeio recortado e o apron asfaltado, conforme a fileira percebida no Anexo 3.',
  },
] as const satisfies readonly {
  id: string;
  protectedIdentifier: 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6';
  sourcePdfCenterline: readonly ParkAccessSourcePoint[];
  placementCountBudget: number;
  canopyScale: number;
  confidence: ParkAccessConfidence;
  notes: string;
}[];

const SPLITTER_ISLAND_SOURCES = [
  {
    id: 'roundabout-east-splitter',
    sourcePdfPolygon: closeSourcePolygon([[1205, 4168], [1315, 4200], [1205, 4218]]),
  },
  {
    id: 'roundabout-southwest-splitter',
    sourcePdfPolygon: closeSourcePolygon([[1040, 4275], [1100, 4370], [1114, 4260]]),
  },
] as const;

export const PARK_ACCESS_SOURCE_MANIFEST: readonly ParkAccessSourceManifestEntry[] = [
  {
    id: 'official-2026-park-map',
    file: '/maps/fenasoja-oficial-2026-park.webp',
    role: 'Sistema cartesiano local, footprints protegidos e âncoras A1/A2/A3/B2.',
    metricUse: 'REGISTERED_TO_OFFICIAL_MAP',
    interpretation: 'Única fonte com transformação reproduzível para o crop oficial; continua sem calibração topográfica global.',
  },
  {
    id: 'annex-1-implantation',
    file: 'attachment:IMG_9741.jpeg',
    role: 'Implantação aérea anotada para bosque, rotatória, vias, Portão 1 e Sede Costeiros.',
    metricUse: 'REGISTERED_TO_OFFICIAL_MAP',
    interpretation: 'Registrado por footprints B1, B2, B22 e A1; traços vermelhos são instruções de leitura, não levantamento cadastral.',
  },
  {
    id: 'annex-2-satellite',
    file: 'attachment:IMG_9742.jpeg',
    role: 'Continuidade urbana entre Av. Tupareendi, Alameda Santa Rosa, rotatória e massa do parque.',
    metricUse: 'RELATIVE_ONLY',
    interpretation: 'Screenshot inclinado e com interface; usado somente para conectividade e orientação relativa.',
  },
  {
    id: 'annex-3-street-context',
    file: 'attachment:IMG_9745.jpeg',
    role: 'Seção visual da Av. Benvenuto de Conti, arborização linear, cercamento e presença dos pavilhões.',
    metricUse: 'VISUAL_ONLY',
    interpretation: 'Perspectiva de rua confirma quatro faixas e hierarquia vertical, sem fornecer medidas cartográficas.',
  },
  {
    id: 'gate-composite-upper-gate-3',
    file: 'attachment:7733F20C-2A81-42B9-A06D-8CD22F124835.jpeg#upper',
    role: 'Arquitetura do Portão 3.',
    metricUse: 'VISUAL_ONLY',
    interpretation: 'Identidade explícita dada pelo usuário: imagem superior = Portão 3; cobertura longa, guaritas e vãos veiculares.',
  },
  {
    id: 'gate-composite-lower-gate-2',
    file: 'attachment:7733F20C-2A81-42B9-A06D-8CD22F124835.jpeg#lower',
    role: 'Arquitetura do Portão 2.',
    metricUse: 'VISUAL_ONLY',
    interpretation: 'Identidade explícita dada pelo usuário: imagem inferior = Portão 2; fachada inclinada, passagem coberta e acesso pedonal.',
  },
  {
    id: 'annex-5-woodland-path',
    file: 'attachment:IMG_9754.jpeg',
    role: 'Traçado Portão 2 → Caminho do Bosque → lateral superior do Pavilhão 14 e vagas na avenida.',
    metricUse: 'REGISTERED_TO_OFFICIAL_MAP',
    interpretation: 'Traço é ancorado em A2 e B2; largura e suavização são parametrizadas, não medidas.',
  },
  {
    id: 'annex-6-costeiros',
    file: 'attachment:IMG_9755.jpeg',
    role: 'Footprint da Sede Costeiros, via de serviço, ramal do campo e transições bosque/campo.',
    metricUse: 'REGISTERED_TO_OFFICIAL_MAP',
    interpretation: 'Registro cruzado por A1 e pela própria sede visível também no Anexo 1; extrema norte requer vistoria.',
  },
  ...([
    ['annex-7-current-mobile', 'attachment:IMG_9756.png'],
    ['annex-8-current-mobile', 'attachment:IMG_9757.png'],
    ['annex-9-current-mobile', 'attachment:IMG_9758.png'],
  ] as const).map(([id, file]) => ({
    id,
    file,
    role: 'Diagnóstico do estado atual e do vazio visual em viewport móvel.',
    metricUse: 'VISUAL_ONLY' as const,
    interpretation: 'Não altera geometria oficial; serve para comparação de legibilidade, enquadramento e densidade.',
  })),
];

export const PARK_ACCESS_SPATIAL_PLAN = {
  revision: '2026.8-park-access-annexes.2',
  coordinateFrame: {
    id: 'official-2026-pdf-crop-local-xz',
    sourceCropPdf: OFFICIAL_2026_SOURCE_MANIFEST.parkCropPdf,
    localReferenceSize: [MAP_REFERENCE_WIDTH, MAP_REFERENCE_HEIGHT] as const,
    sourceToLocalScale: [SOURCE_TO_LOCAL_X, SOURCE_TO_LOCAL_Z] as const,
    axes: 'local [x,z] follows official PDF [x,y]; no true-north bearing is asserted' as const,
    workingMapUnitsPerMeter: PARK_ACCESS_WORKING_MAP_UNITS_PER_METER,
    sourcePdfPointsPerMeter: PARK_ACCESS_SOURCE_POINTS_PER_METER,
    calibrationScope: 'dimensionally coherent with current Exporural calibration; external works remain field-reviewable' as const,
  },
  dimensions: {
    vehicleLaneMeters: 3.5,
    benvenutoLaneCount: 4,
    benvenutoCarriagewayMeters: 14,
    sidewalkMeters: 1.8,
    curbMeters: 0.15,
    woodlandPathMeters: 3,
    woodlandPathClearanceMeters: 6.4,
    serviceRoadMeters: 7,
    parkingBayMeters: [2.7, 5.2] as const,
  },
  anchors: {
    gate1: {
      id: 'anchor-gate-1',
      name: 'Portão 1',
      sourcePdfPoint: A1_SOURCE,
      point: parkAccessSourcePointToLocal(A1_SOURCE),
      officialEntityIdentifier: 'A1',
      sourceIds: ['official-2026-park-map', 'annex-1-implantation', 'annex-6-costeiros'],
      confidence: 'OFFICIAL_ANCHOR',
      notes: 'Centro oficial A1 preservado; anexos determinam apenas continuidade e implantação do entorno.',
    },
    gate2: {
      id: 'anchor-gate-2',
      name: 'Portão 2',
      sourcePdfPoint: A2_SOURCE,
      point: parkAccessSourcePointToLocal(A2_SOURCE),
      officialEntityIdentifier: 'A2',
      sourceIds: ['official-2026-park-map', 'gate-composite-lower-gate-2', 'annex-5-woodland-path'],
      confidence: 'OFFICIAL_ANCHOR',
      notes: 'A2 inicia o Caminho do Bosque. O painel inferior da composição fotográfica é exclusivamente Portão 2.',
    },
    gate3: {
      id: 'anchor-gate-3',
      name: 'Portão 3',
      sourcePdfPoint: A3_SOURCE,
      point: parkAccessSourcePointToLocal(A3_SOURCE),
      officialEntityIdentifier: 'A3',
      sourceIds: ['official-2026-park-map', 'gate-composite-upper-gate-3'],
      confidence: 'OFFICIAL_ANCHOR',
      notes: 'A3 encerra o eixo Benvenuto de quatro faixas. O painel superior da composição fotográfica é exclusivamente Portão 3.',
    },
    roundabout: {
      id: 'anchor-roundabout-tupareendi',
      name: 'Rotatória Av. Tupareendi / chegada ao parque',
      sourcePdfPoint: ROUNDABOUT_SOURCE,
      point: parkAccessSourcePointToLocal(ROUNDABOUT_SOURCE),
      officialEntityIdentifier: null,
      sourceIds: ['annex-1-implantation', 'annex-2-satellite'],
      confidence: 'ANNEX_REGISTERED_TRACE',
      notes: 'Centro registrado pela ilha circular visível; raios e ilhas separadoras não são dados de engenharia.',
    },
    pavilion14NorthWest: {
      id: 'anchor-pavilion-14-north-west',
      name: 'Quina superior oeste do Pavilhão 14',
      sourcePdfPoint: [2418, 3833],
      point: parkAccessSourcePointToLocal([2418, 3833]),
      officialEntityIdentifier: 'B2',
      sourceIds: ['official-2026-park-map', 'annex-5-woodland-path'],
      confidence: 'OFFICIAL_ANCHOR',
      notes: 'O caminho termina no corredor ao norte/oeste deste footprint, sem atravessar B2.',
    },
    costeiros: {
      id: 'anchor-sede-costeiros',
      name: 'Sede Costeiros',
      sourcePdfPoint: COSTEIROS_CENTER_SOURCE,
      point: parkAccessSourcePointToLocal(COSTEIROS_CENTER_SOURCE),
      officialEntityIdentifier: null,
      sourceIds: ['annex-1-implantation', 'annex-6-costeiros'],
      confidence: 'ANNEX_REGISTERED_TRACE',
      notes: 'Centro de footprint obtido por registro dos dois anexos; estrutura não existe no inventário oficial atual.',
    },
    tupareendiJoin: {
      id: 'anchor-tupareendi-gate-1-join',
      name: 'Encaixe Av. Tupareendi → acesso do Portão 1',
      sourcePdfPoint: GATE_1_APPROACH_SOURCE[0],
      point: parkAccessSourcePointToLocal(GATE_1_APPROACH_SOURCE[0]),
      officialEntityIdentifier: 'AV-TUPARENDI',
      sourceIds: ['official-2026-park-map', 'annex-1-implantation', 'annex-2-satellite'],
      confidence: 'ANNEX_REGISTERED_TRACE',
      notes: 'Ponto de tangência conservador dentro do corredor oficial da Tupareendi; meio-fio exato requer conferência em campo.',
    },
  } satisfies Record<string, ParkAccessAnchor>,
  roadSurfaces: ROAD_SURFACES,
  sidewalkSurfaces: SIDEWALK_SURFACES,
  markingSegments: MARKING_SEGMENTS,
  parkingBays: PARKING_BAYS,
  roundabout: {
    id: 'roundabout-tupareendi',
    center: parkAccessSourcePointToLocal(ROUNDABOUT_SOURCE),
    sourcePdfCenter: ROUNDABOUT_SOURCE,
    outerRadius: parkAccessMetersToLocal(18),
    outerRadiusMeters: 18,
    islandRadius: parkAccessMetersToLocal(10.5),
    islandRadiusMeters: 10.5,
    circulatingWidth: parkAccessMetersToLocal(7.5),
    circulatingWidthMeters: 7.5,
    elevation: 0.05,
    splitterIslands: SPLITTER_ISLAND_SOURCES.map((island) => ({
      id: island.id,
      sourcePdfPolygon: island.sourcePdfPolygon,
      polygon: polygonToLocal(island.sourcePdfPolygon),
    })),
    approachRoadIds: ['benvenuto-four-lane-axis', 'gate-1-approach'] as const,
    sourceIds: ['annex-1-implantation', 'annex-2-satellite'] as const,
    confidence: 'DIMENSIONALLY_INFERRED' as const,
    notes: 'Ilha circular e conexão são visíveis; raios foram arredondados a parâmetros urbanos plausíveis e não devem ser publicados como as-built.',
  },
  gates: {
    gate1: {
      id: 'gate-1',
      officialEntityIdentifier: 'A1',
      anchor: parkAccessSourcePointToLocal(A1_SOURCE),
      sourcePdfAnchor: A1_SOURCE,
      approachHeadingRadians: parkAccessHeadingBetween(
        GATE_1_APPROACH_SOURCE[GATE_1_APPROACH_SOURCE.length - 2],
        A1_SOURCE,
      ),
      width: parkAccessMetersToLocal(16),
      depth: parkAccessMetersToLocal(5.5),
      widthMeters: 16,
      depthMeters: 5.5,
      lanes: 2,
      vehiclePortalCount: 2,
      pedestrianPortalCount: 1,
      architecture: 'MIXED_ACCESS_GATEHOUSE',
      approachRoadIds: ['gate-1-approach', 'costeiros-service-road'],
      sourceIds: ['official-2026-park-map', 'annex-1-implantation', 'annex-6-costeiros'],
      confidence: 'DIMENSIONALLY_INFERRED',
      notes: 'Footprint é pequeno e legível nos anexos aéreos; elevação e número de vãos não possuem fotografia frontal dedicada.',
    },
    gate2: {
      id: 'gate-2',
      officialEntityIdentifier: 'A2',
      anchor: parkAccessSourcePointToLocal(A2_SOURCE),
      sourcePdfAnchor: A2_SOURCE,
      approachHeadingRadians: parkAccessHeadingBetween(
        WOODLAND_PATH_SOURCE[0],
        WOODLAND_PATH_SOURCE[1],
      ),
      width: parkAccessMetersToLocal(22),
      depth: parkAccessMetersToLocal(5.5),
      widthMeters: 22,
      depthMeters: 5.5,
      lanes: 1,
      vehiclePortalCount: 1,
      pedestrianPortalCount: 3,
      architecture: 'PEDESTRIAN_GATEHOUSE',
      approachRoadIds: ['gate-2-apron', 'gate-2-woodland-connector'],
      sourceIds: ['official-2026-park-map', 'gate-composite-lower-gate-2', 'annex-5-woodland-path'],
      confidence: 'DIMENSIONALLY_INFERRED',
      notes: 'Painel inferior confirma fachada inclinada e passagem coberta; contagem de vãos é leitura arquitetônica e requer vistoria antes de documentação executiva.',
    },
    gate3: {
      id: 'gate-3',
      officialEntityIdentifier: 'A3',
      anchor: parkAccessSourcePointToLocal(A3_SOURCE),
      sourcePdfAnchor: A3_SOURCE,
      approachHeadingRadians: parkAccessHeadingBetween(
        BENVENUTO_FOUR_LANE_SOURCE[BENVENUTO_FOUR_LANE_SOURCE.length - 2],
        A3_SOURCE,
      ),
      width: parkAccessMetersToLocal(30),
      depth: parkAccessMetersToLocal(6.5),
      widthMeters: 30,
      depthMeters: 6.5,
      lanes: 4,
      vehiclePortalCount: 3,
      pedestrianPortalCount: 1,
      architecture: 'VEHICLE_CHECKPOINT_CANOPY',
      approachRoadIds: ['benvenuto-four-lane-axis', 'gate-3-arrival'],
      sourceIds: ['official-2026-park-map', 'gate-composite-upper-gate-3'],
      confidence: 'DIMENSIONALLY_INFERRED',
      notes: 'Painel superior confirma cobertura horizontal contínua, duas guaritas e múltiplos vãos; largura é envelope visual, não medição de fachada.',
    },
  } satisfies Record<'gate1' | 'gate2' | 'gate3', ParkAccessGateDefinition>,
  woodlandPath: {
    id: 'gate-2-woodland-connector',
    name: 'Caminho do Bosque / Alameda Santa Rosa',
    widthMeters: 3,
    sourcePdfCenterline: WOODLAND_PATH_SOURCE,
    centerline: pathToLocal(WOODLAND_PATH_SOURCE),
    sourcePdfSurfacePolygon: WOODLAND_PATH_SURFACE_SOURCE,
    surfacePolygon: polygonToLocal(WOODLAND_PATH_SURFACE_SOURCE),
    sourcePdfClearancePolygon: WOODLAND_PATH_CLEARANCE_SOURCE,
    clearancePolygon: polygonToLocal(WOODLAND_PATH_CLEARANCE_SOURCE),
    edgeBands: [
      {
        id: 'woodland-path-natural-edge',
        width: parkAccessMetersToLocal(1.7),
        widthMeters: 1.7,
        sourcePdfPolygon: WOODLAND_PATH_CLEARANCE_SOURCE,
        polygon: polygonToLocal(WOODLAND_PATH_CLEARANCE_SOURCE),
      },
    ],
    connects: ['A2', 'B2'],
    sourceIds: ['official-2026-park-map', 'annex-1-implantation', 'annex-5-woodland-path'],
    confidence: 'ANNEX_REGISTERED_TRACE' as const,
    notes: 'Eixo parte exatamente de A2, atravessa uma clareira longitudinal e termina no corredor superior/oeste de B2; o caminho não cruza o footprint do Pavilhão 14.',
  },
  woodlandMass: {
    id: 'lunar-tree-woodland-mass',
    sourcePdfPolygon: WOODLAND_OUTER_SOURCE,
    polygon: polygonToLocal(WOODLAND_OUTER_SOURCE),
    sourcePdfPathClearancePolygon: WOODLAND_PATH_CLEARANCE_SOURCE,
    pathClearancePolygon: polygonToLocal(WOODLAND_PATH_CLEARANCE_SOURCE),
    protectedFootprintIdentifiers: ['B1', 'B2', 'B22', 'C2', 'C3', 'G'] as const,
    densityZones: [
      { id: 'woodland-core', density: 1, canopyScale: 1.12 },
      { id: 'woodland-path-edge', density: 0.42, canopyScale: 0.88 },
      { id: 'woodland-road-edge', density: 0.58, canopyScale: 0.94 },
    ] as const,
    sourceIds: ['annex-1-implantation', 'annex-2-satellite', 'annex-5-woodland-path'],
    confidence: 'ANNEX_REGISTERED_TRACE' as const,
    notes: 'Polígono é envelope de ambientação; footprints oficiais e a clareira do caminho são exclusões obrigatórias, não áreas para povoamento cego.',
  },
  costeirosSetting: {
    id: 'sede-costeiros-setting',
    buildingId: 'sede-costeiros',
    sourcePdfBuildingPolygon: COSTEIROS_BUILDING_SOURCE,
    buildingPolygon: polygonToLocal(COSTEIROS_BUILDING_SOURCE),
    buildingAnchor: parkAccessSourcePointToLocal(COSTEIROS_CENTER_SOURCE),
    sourcePdfYardPolygon: COSTEIROS_YARD_SOURCE,
    yardPolygon: polygonToLocal(COSTEIROS_YARD_SOURCE),
    serviceRoadIds: ['costeiros-service-road', 'costeiros-field-spur'] as const,
    sourcePdfServiceRoadCenterline: COSTEIROS_SERVICE_ROAD_SOURCE,
    serviceRoadCenterline: pathToLocal(COSTEIROS_SERVICE_ROAD_SOURCE),
    serviceRoadPolygon: ROAD_SURFACES.find((road) => road.id === 'costeiros-service-road')!.polygon,
    sourcePdfFieldEdge: [[960, 2840], [1180, 2835], [1430, 2850], [1700, 2880]] as const,
    fieldEdge: pathToLocal([[960, 2840], [1180, 2835], [1430, 2850], [1700, 2880]]),
    sourcePdfForestEdge: [[720, 3150], [770, 3030], [790, 2820], [810, 2520], [850, 2180]] as const,
    forestEdge: pathToLocal([[720, 3150], [770, 3030], [790, 2820], [810, 2520], [850, 2180]]),
    sourceIds: ['annex-1-implantation', 'annex-6-costeiros'],
    confidence: 'ANNEX_REGISTERED_TRACE' as const,
    notes: 'Sede fica a leste da via principal e ao norte do bosque; o ramal passa ao sul e segue para o campo. Nenhum vínculo cadastral ou comercial é criado.',
  },
  benvenutoPavilionEdge: {
    id: 'benvenuto-pavilion-edge',
    treeBand: {
      id: 'benvenuto-pavilion-tree-band',
      /** Safe fallback for consumers not yet aware of segmented bands. */
      sourcePdfCenterline: BENVENUTO_TREE_BAND_SEGMENTS_SOURCE[0].sourcePdfCenterline,
      centerline: pathToLocal(BENVENUTO_TREE_BAND_SEGMENTS_SOURCE[0].sourcePdfCenterline),
      sourcePdfPolygon: strokeSourcePath(
        BENVENUTO_TREE_BAND_SEGMENTS_SOURCE[0].sourcePdfCenterline,
        BENVENUTO_TREE_BAND_WIDTH_METERS,
      ),
      polygon: polygonToLocal(strokeSourcePath(
        BENVENUTO_TREE_BAND_SEGMENTS_SOURCE[0].sourcePdfCenterline,
        BENVENUTO_TREE_BAND_WIDTH_METERS,
      )),
      width: parkAccessMetersToLocal(BENVENUTO_TREE_BAND_WIDTH_METERS),
      widthMeters: BENVENUTO_TREE_BAND_WIDTH_METERS,
      placementCountBudget: BENVENUTO_TREE_BAND_SEGMENTS_SOURCE[0].placementCountBudget,
      segments: BENVENUTO_TREE_BAND_SEGMENTS_SOURCE.map((segment) => {
        const sourcePdfPolygon = strokeSourcePath(
          segment.sourcePdfCenterline,
          BENVENUTO_TREE_BAND_WIDTH_METERS,
        );
        return {
          ...segment,
          centerline: pathToLocal(segment.sourcePdfCenterline),
          sourcePdfPolygon,
          polygon: polygonToLocal(sourcePdfPolygon),
          width: parkAccessMetersToLocal(BENVENUTO_TREE_BAND_WIDTH_METERS),
          widthMeters: BENVENUTO_TREE_BAND_WIDTH_METERS,
        };
      }),
      omittedOfficialIdentifiers: ['B1', 'B2', 'B3', 'B4', 'B6'] as const,
      omissionReason: 'Não existe corredor sul livre simultaneamente de footprint, passeio e apron; B6 dispõe de menos de 0,75 m, e nenhuma árvore é deslocada artificialmente para o norte.',
    },
    parkingAprons: [
      {
        id: 'benvenuto-parking-apron-west',
        sourcePdfPolygon: BENVENUTO_PARKING_APRON_WEST_SOURCE,
        polygon: polygonToLocal(BENVENUTO_PARKING_APRON_WEST_SOURCE),
        roadSurfaceId: 'benvenuto-four-lane-axis',
      },
      {
        id: 'benvenuto-parking-apron-east',
        sourcePdfPolygon: BENVENUTO_PARKING_APRON_EAST_SOURCE,
        polygon: polygonToLocal(BENVENUTO_PARKING_APRON_EAST_SOURCE),
        roadSurfaceId: 'benvenuto-four-lane-axis',
      },
    ] as const,
    parkingProtectedFootprintIdentifiers: ['B2', 'B3', 'B4', 'B5', 'B6', 'B11', 'B23'] as const,
    sidewalkOmissions: [
      { officialIdentifier: 'B4', reason: 'Corredor entre footprint e apron menor que a largura pedonal parametrizada.' },
      { officialIdentifier: 'B6', reason: 'Corredor residual insuficiente tanto para a banda arbórea quanto para o passeio sem invadir footprint ou apron.' },
      { officialIdentifier: 'B11', reason: 'Recorte obrigatório para preservar Portão 3 e o footprint administrativo.' },
    ] as const,
    transitionBands: [
      {
        id: 'woodland-to-benvenuto-verge',
        surface: 'LIGHT_GRASS',
        sourcePdfPolygon: closeSourcePolygon([[1290, 4045], [2280, 4040], [2320, 4102], [1290, 4100]]),
      },
      {
        id: 'pavilion-apron-transition',
        surface: 'COMPACTED_SOIL_PAVER_MIX',
        sourcePdfPolygon: closeSourcePolygon([[2280, 4076], [3915, 4090], [3915, 4112], [2280, 4100]]),
      },
    ].map((band) => ({ ...band, polygon: polygonToLocal(band.sourcePdfPolygon) })),
    sourcePdfParkingCutout: BENVENUTO_PARKING_CUTOUT_SOURCE,
    parkingCutout: polygonToLocal(BENVENUTO_PARKING_CUTOUT_SOURCE),
    sourceIds: ['annex-1-implantation', 'annex-3-street-context', 'annex-5-woodland-path'],
    confidence: 'ANNEX_REGISTERED_TRACE' as const,
    notes: 'Aprons, passeios recortados e árvores street-side usam corredores distintos; B23 e B11 são notches obrigatórios e nenhuma árvore substitui o inventário oficial.',
  },
  provenance: PARK_ACCESS_SOURCE_MANIFEST,
  protectedCommercialGeometry: {
    identifiers: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'] as const,
    policy: 'read-only anchors; no lot, pavilion, commercial module, segment, route, persistence or business-rule mutation' as const,
  },
  openQuestions: [
    'Confirmar em vistoria o raio externo, o raio da ilha e as ilhas separadoras da rotatória.',
    'Confirmar larguras as-built, drenagem e cotas de meio-fio do acesso A1 e da Avenida Benvenuto de Conti.',
    'Confirmar dimensões, elevação e materiais da Sede Costeiros e a continuidade extrema norte da via de serviço.',
    'Confirmar quantidade útil de vãos/portais dos Portões 1, 2 e 3; os anexos fotográficos não são elevações ortográficas.',
    'Confirmar ângulo, quantidade e acessibilidade das vagas laterais antes de tratá-las como sinalização executiva.',
    'Não há bearing de norte verdadeiro nem altimetria nos anexos; orientação permanece no frame local do mapa oficial.',
  ] as const,
} as const;

/** Stable convenience aliases for renderers that should not duplicate coordinates. */
export const PARK_ACCESS_ROAD_SURFACES = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces;
export const PARK_ACCESS_SIDEWALK_SURFACES = PARK_ACCESS_SPATIAL_PLAN.sidewalkSurfaces;
export const PARK_ACCESS_MARKING_SEGMENTS = PARK_ACCESS_SPATIAL_PLAN.markingSegments;
export const PARK_ACCESS_PARKING_BAYS = PARK_ACCESS_SPATIAL_PLAN.parkingBays;
export const PARK_ACCESS_GATES = PARK_ACCESS_SPATIAL_PLAN.gates;

/** Coordinate-compatible alias for code that consumes the established mutable tuple type. */
export function parkAccessPointAsCoordinate(point: ParkAccessPoint): Coordinate {
  return [point[0], point[1]];
}
