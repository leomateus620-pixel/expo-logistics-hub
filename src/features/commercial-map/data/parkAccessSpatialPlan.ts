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
  | 'annex-9-current-mobile'
  | 'annex-10-current-map-overview-east'
  | 'annex-11-current-map-overview-west'
  | 'annex-12-current-map-a10-context'
  | 'annex-13-a1-a10-blue-trace'
  | 'annex-14-satellite-a1-a10-b22'
  | 'annex-15-current-map-upper-connection'
  | 'annex-16-site-plan-a1-a10'
  | 'annex-17-current-map-overview'
  | 'annex-18-current-map-gate-1'
  | 'annex-19-current-map-gate-10'
  | 'annex-20-satellite-gate-1-roundabout'
  | 'annex-21-site-plan-gate-1-motorhome'
  | 'annex-22-aerial-motorhome-road';

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
  | 'COMPACTED_SERVICE_ROAD'
  | 'COBBLESTONE_ACCESS_ROAD'
  | 'ASPHALT_ACCESS_ROAD'
  | 'STONE_GRAVEL_ACCESS_ROAD';

export interface ParkAccessRoadSurface extends ParkAccessEvidence {
  id: string;
  kind: ParkAccessRoadKind;
  elevation: number;
  widthMeters: number;
  widthReviewRangeMeters?: readonly [number, number];
  sourcePdfCenterline: readonly ParkAccessSourcePoint[];
  centerline: readonly ParkAccessPoint[];
  sourcePdfPolygon: ParkAccessSourcePolygon;
  polygon: ParkAccessPolygon;
  connects: readonly string[];
  mergedApronIds?: readonly string[];
  /** Raise the rendered ribbon above intersecting official support surfaces. */
  supportAware?: boolean;
}

export interface ThirdAgePavilionSetting extends ParkAccessEvidence {
  id: 'third-age-pavilion-setting';
  officialEntityIdentifier: 'B22';
  sourcePdfFootprint: ParkAccessSourcePolygon;
  footprint: ParkAccessPolygon;
  sourcePdfCenter: ParkAccessSourcePoint;
  center: ParkAccessPoint;
  accessRoadId: 'third-age-pavilion-access';
  sourcePdfAccessCenterline: readonly ParkAccessSourcePoint[];
  accessCenterline: readonly ParkAccessPoint[];
  sourcePdfAccessPolygon: ParkAccessSourcePolygon;
  accessPolygon: ParkAccessPolygon;
  accessClearanceId: 'third-age-pavilion-access-clearance';
  sourcePdfAccessClearancePolygon: ParkAccessSourcePolygon;
  accessClearancePolygon: ParkAccessPolygon;
  sourcePdfThreshold: ParkAccessSourcePoint;
  threshold: ParkAccessPoint;
  widthMeters: number;
  width: number;
  protectedFootprintIdentifiers: readonly ['B22'];
  clearances: {
    footprintMeters: number;
    roadTreeTrunkMeters: number;
    pavilionAccessTreeTrunkMeters: number;
    canopyMeters: number;
  };
}

export interface MotorhomeSetting extends ParkAccessEvidence {
  id: 'motorhome-setting';
  officialEntityIdentifier: 'AREA-MOTORHOME';
  sourcePdfFootprint: ParkAccessSourcePolygon;
  footprint: ParkAccessPolygon;
  accessRoadId: 'costeiros-service-road';
  sourcePdfAccessCenterline: readonly ParkAccessSourcePoint[];
  accessCenterline: readonly ParkAccessPoint[];
  sourcePdfAccessPolygon: ParkAccessSourcePolygon;
  accessPolygon: ParkAccessPolygon;
  protectedFootprintIdentifiers: readonly ['AREA-MOTORHOME'];
  clearances: {
    footprintMeters: number;
    roadTreeTrunkMeters: number;
    canopyMeters: number;
  };
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

/**
 * Clips a source-space polygon against a vertical boundary. The third-age
 * pavilion access uses this to terminate flush with B22 instead of allowing
 * the buffered road cap to extend below the protected official footprint.
 */
function clipSourcePolygonAtMaximumX(
  polygon: ParkAccessSourcePolygon,
  maximumX: number,
): ParkAccessSourcePolygon {
  const input = polygon.length > 1
    && polygon[0][0] === polygon[polygon.length - 1][0]
    && polygon[0][1] === polygon[polygon.length - 1][1]
    ? polygon.slice(0, -1)
    : [...polygon];
  if (input.length < 3) return closeSourcePolygon(input);
  const output: ParkAccessSourcePoint[] = [];

  input.forEach((current, index) => {
    const previous = input[(index + input.length - 1) % input.length];
    const currentInside = current[0] <= maximumX;
    const previousInside = previous[0] <= maximumX;
    if (currentInside !== previousInside) {
      const deltaX = current[0] - previous[0];
      const progress = Math.abs(deltaX) <= Number.EPSILON
        ? 0
        : (maximumX - previous[0]) / deltaX;
      output.push([
        maximumX,
        round(previous[1] + (current[1] - previous[1]) * progress, 3),
      ]);
    }
    if (currentInside) output.push(current);
  });

  return closeSourcePolygon(output);
}

const A1_SOURCE = [684, 3306] as const;
const A2_SOURCE = [1274, 4040] as const;
const A3_SOURCE = [3935, 4219] as const;
const A10_SOURCE = [1214, 3137] as const;
const RUA_BRASIL_SEAM_SOURCE = [1640, 3143.5] as const;
const ROUNDABOUT_SOURCE = [1110, 4185] as const;
const GATE_1_MINI_ROUNDABOUT_SOURCE = [341, 3718] as const;
const COSTEIROS_CENTER_SOURCE = [917.5, 2972.5] as const;
const B22_SOURCE_BOUNDS = [742, 3538, 931, 3834] as const;
const B22_CENTER_SOURCE = [836.5, 3686] as const;
const B22_FOOTPRINT_SOURCE = sourceRectangle(...B22_SOURCE_BOUNDS);
const MOTORHOME_SOURCE_BOUNDS = [760, 1780, 1630, 2400] as const;
const MOTORHOME_FOOTPRINT_SOURCE = sourceRectangle(...MOTORHOME_SOURCE_BOUNDS);

const GATE_1_LOCAL_ACCESS_SOURCE = [
  [350, 3690],
  [393, 3620],
  [471, 3512],
  [562, 3404],
  [629, 3332],
  A1_SOURCE,
] as const satisfies readonly ParkAccessSourcePoint[];

const GATE_1_ROUNDABOUT_TUPARENDI_LINK_SOURCE = [
  GATE_1_MINI_ROUNDABOUT_SOURCE,
  [390, 3760],
  [470, 3815],
  [540, 3865],
  [600, 3890],
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

const GATE_1_GATE_10_RUA_BRASIL_SOURCE = [
  A1_SOURCE,
  [760, 3260],
  [910, 3198],
  [1060, 3154],
  A10_SOURCE,
  [1395, 3138],
  [1545, 3141],
  RUA_BRASIL_SEAM_SOURCE,
  [1650, 3143.5],
] as const satisfies readonly ParkAccessSourcePoint[];

const THIRD_AGE_PAVILION_ACCESS_SOURCE = [
  [629, 3332],
  [651, 3450],
  [700, 3485],
  [735, 3530],
  [742, 3568],
] as const satisfies readonly ParkAccessSourcePoint[];
const THIRD_AGE_PAVILION_THRESHOLD_SOURCE = THIRD_AGE_PAVILION_ACCESS_SOURCE[
  THIRD_AGE_PAVILION_ACCESS_SOURCE.length - 1
];
const THIRD_AGE_PAVILION_ACCESS_TREE_CLEARANCE_METERS = 1.5;
const MAIN_ACCESS_ROAD_TREE_CLEARANCE_METERS = 2;
const THIRD_AGE_PAVILION_ACCESS_SURFACE_SOURCE = clipSourcePolygonAtMaximumX(
  strokeSourcePath(THIRD_AGE_PAVILION_ACCESS_SOURCE, 4),
  B22_SOURCE_BOUNDS[0],
);
const THIRD_AGE_PAVILION_ACCESS_CLEARANCE_SOURCE = clipSourcePolygonAtMaximumX(
  strokeSourcePath(
    THIRD_AGE_PAVILION_ACCESS_SOURCE,
    4 + 2 * THIRD_AGE_PAVILION_ACCESS_TREE_CLEARANCE_METERS,
  ),
  B22_SOURCE_BOUNDS[0],
);

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
    COBBLESTONE_ACCESS_ROAD: 0.039,
    ASPHALT_ACCESS_ROAD: 0.044,
    STONE_GRAVEL_ACCESS_ROAD: 0.041,
  };
  const overlapSafeElevationById: Readonly<Record<string, number>> = {
    'gate-1-local-access': 0.046,
    'gate-1-apron': 0.056,
    'gate-2-apron': 0.057,
    'gate-3-arrival': 0.058,
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
    'gate-1-local-access',
    'ASPHALT_ACCESS_ROAD',
    GATE_1_LOCAL_ACCESS_SOURCE,
    7,
    ['gate-1-mini-roundabout', 'A1', 'third-age-pavilion-access'],
    {
      sourceIds: [
        'official-2026-park-map',
        'annex-18-current-map-gate-1',
        'annex-20-satellite-gate-1-roundabout',
        'annex-21-site-plan-gate-1-motorhome',
      ],
      confidence: 'FIELD_REVIEW_REQUIRED',
      notes: 'Acesso asfaltado independente termina exatamente em A1 e tangencia a mini-rotatória; os controles intermediários vêm do registro do Anexo 21 e não constituem levantamento as-built.',
    },
  ),
  makeRoadSurface(
    'gate-1-roundabout-tupareendi-link',
    'ASPHALT_ACCESS_ROAD',
    GATE_1_ROUNDABOUT_TUPARENDI_LINK_SOURCE,
    7,
    ['gate-1-mini-roundabout', 'AV-TUPARENDI'],
    {
      sourceIds: [
        'official-2026-park-map',
        'annex-20-satellite-gate-1-roundabout',
        'annex-21-site-plan-gate-1-motorhome',
      ],
      confidence: 'FIELD_REVIEW_REQUIRED',
      notes: 'Ligação asfaltada curta conecta somente a mini-rotatória do Portão 1 ao corredor oficial da Avenida Tupareendi; a curva é registrada nos anexos e permanece sujeita à conferência de campo.',
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
    ['gate-1-local-access', 'A1', 'costeiros-service-road', 'gate-1-gate-10-rua-brasil-asphalt'],
    {
      sourceIds: [
        'official-2026-park-map',
        'annex-1-implantation',
        'annex-6-costeiros',
        'annex-18-current-map-gate-1',
        'annex-21-site-plan-gate-1-motorhome',
      ],
      confidence: 'ANNEX_REGISTERED_TRACE',
      notes: 'Envelope do encontro do pórtico com o acesso local asfaltado, o eixo A1/A10 e a via de saibro; a posição A1 é oficial e a largura do apron permanece interpretativa.',
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
  {
    ...makeRoadSurface(
      'costeiros-service-road',
      'STONE_GRAVEL_ACCESS_ROAD',
      COSTEIROS_SERVICE_ROAD_SOURCE,
      7,
      ['A1', 'AREA-MOTORHOME', 'sede-costeiros', 'costeiros-field-edge'],
      {
        sourceIds: [
          'annex-1-implantation',
          'annex-6-costeiros',
          'annex-17-current-map-overview',
          'annex-21-site-plan-gate-1-motorhome',
          'annex-22-aerial-motorhome-road',
        ],
        confidence: 'ANNEX_REGISTERED_TRACE',
        notes: 'Via de pedra e saibro preserva o eixo registrado entre A1, a borda oeste da Área Motor Home e a curva superior; sua posição intermediária não é um levantamento as-built.',
      },
    ),
    supportAware: true,
  },
  {
    ...makeRoadSurface(
      'gate-1-gate-10-rua-brasil-asphalt',
      'ASPHALT_ACCESS_ROAD',
      GATE_1_GATE_10_RUA_BRASIL_SOURCE,
      6,
      ['A1', 'A10', 'RUA-BRASIL'],
      {
        sourceIds: [
          'official-2026-park-map',
          'annex-10-current-map-overview-east',
          'annex-11-current-map-overview-west',
          'annex-12-current-map-a10-context',
          'annex-13-a1-a10-blue-trace',
          'annex-14-satellite-a1-a10-b22',
          'annex-15-current-map-upper-connection',
          'annex-16-site-plan-a1-a10',
          'annex-17-current-map-overview',
          'annex-18-current-map-gate-1',
          'annex-19-current-map-gate-10',
          'annex-20-satellite-gate-1-roundabout',
          'annex-21-site-plan-gate-1-motorhome',
        ],
        confidence: 'ANNEX_REGISTERED_TRACE',
        notes: 'Eixo asfaltado começa exatamente em A1, atravessa exatamente A10 e termina com sobreposição curta dentro da borda oeste oficial da Rua Brasil; controles intermediários permanecem interpretativos e não são as-built.',
      },
    ),
    elevation: 0.044,
    widthReviewRangeMeters: [5.5, 7] as const,
    supportAware: true,
  },
  {
    ...makeRoadSurface(
      'third-age-pavilion-access',
      'COBBLESTONE_ACCESS_ROAD',
      THIRD_AGE_PAVILION_ACCESS_SOURCE,
      4,
      ['gate-1-local-access', 'B22'],
      {
        sourceIds: [
          'official-2026-park-map',
          'annex-10-current-map-overview-east',
          'annex-13-a1-a10-blue-trace',
          'annex-14-satellite-a1-a10-b22',
          'annex-16-site-plan-a1-a10',
          'annex-18-current-map-gate-1',
          'annex-20-satellite-gate-1-roundabout',
          'annex-21-site-plan-gate-1-motorhome',
        ],
        confidence: 'FIELD_REVIEW_REQUIRED',
        notes: 'Acesso de quatro metros parte do controle [629,3332] compartilhado com o acesso local do Portão 1 e termina no threshold interpretado da fachada oeste de B22; o recorte preserva integralmente o footprint oficial.',
      },
      THIRD_AGE_PAVILION_ACCESS_SURFACE_SOURCE,
    ),
    supportAware: true,
  },
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
    GATE_1_LOCAL_ACCESS_SOURCE.map(([x, z]) => [x - 40, z] as const),
    1.6,
    'CONCRETE',
    {
      sourceIds: [
        'annex-20-satellite-gate-1-roundabout',
        'annex-21-site-plan-gate-1-motorhome',
      ],
      confidence: 'FIELD_REVIEW_REQUIRED',
      notes: 'Faixa pedonal acompanha somente o acesso local entre a mini-rotatória e A1; posição exata de meio-fio, continuidade e drenagem requerem conferência local.',
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

const ROUNDABOUTS = [
  {
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
    approachRoadIds: ['benvenuto-four-lane-axis'] as const,
    connects: ['benvenuto-four-lane-axis', 'AV-TUPARENDI'] as const,
    sourceIds: ['annex-1-implantation', 'annex-2-satellite', 'annex-14-satellite-a1-a10-b22'] as const,
    confidence: 'DIMENSIONALLY_INFERRED' as const,
    notes: 'Rotatória principal permanece restrita à Avenida Benvenuto de Conti e ao corredor oficial da Avenida Tupareendi; os raios não são dados as-built.',
  },
  {
    id: 'gate-1-mini-roundabout',
    center: parkAccessSourcePointToLocal(GATE_1_MINI_ROUNDABOUT_SOURCE),
    sourcePdfCenter: GATE_1_MINI_ROUNDABOUT_SOURCE,
    outerRadius: parkAccessMetersToLocal(14),
    outerRadiusMeters: 14,
    islandRadius: parkAccessMetersToLocal(7.5),
    islandRadiusMeters: 7.5,
    circulatingWidth: parkAccessMetersToLocal(6.5),
    circulatingWidthMeters: 6.5,
    elevation: 0.048,
    splitterIslands: [] as const,
    approachRoadIds: [
      'gate-1-local-access',
      'gate-1-roundabout-tupareendi-link',
    ] as const,
    connects: [
      'gate-1-local-access',
      'gate-1-roundabout-tupareendi-link',
    ] as const,
    sourceIds: [
      'official-2026-park-map',
      'annex-20-satellite-gate-1-roundabout',
      'annex-21-site-plan-gate-1-motorhome',
    ] as const,
    confidence: 'FIELD_REVIEW_REQUIRED' as const,
    notes: 'Mini-rotatória independente registrada como candidato cartográfico, com centro [341,3718] e dimensões de trabalho; centro, raios, meio-fios e altimetria exigem vistoria antes de uso executivo.',
  },
] as const;

export const PARK_ACCESS_SOURCE_MANIFEST: readonly ParkAccessSourceManifestEntry[] = [
  {
    id: 'official-2026-park-map',
    file: '/maps/fenasoja-oficial-2026-park.webp',
    role: 'Sistema cartesiano local, footprints protegidos e âncoras A1/A2/A3/A10/B2/B22/RUA-BRASIL.',
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
  {
    id: 'annex-10-current-map-overview-east',
    file: 'attachment:codex-clipboard-e8a1f7f4-8ab3-4af8-bd06-926536633f67.png',
    role: 'Estado atual do acesso A1, rotatória, bosque e volume genérico de B22 no Mapa Comercial.',
    metricUse: 'VISUAL_ONLY',
    interpretation: 'Diagnostica descontinuidade, material incorreto e baixa fidelidade do pavilhão; não fornece medidas cadastrais.',
  },
  {
    id: 'annex-11-current-map-overview-west',
    file: 'attachment:codex-clipboard-b8f3c11e-b9a0-4156-9b42-a0e793005993.png',
    role: 'Visão ampla do corredor entre o estacionamento, o bosque e A1 no estado atual.',
    metricUse: 'VISUAL_ONLY',
    interpretation: 'Confirma a leitura compartilhada do vazio viário, sem substituir as âncoras do mapa oficial.',
  },
  {
    id: 'annex-12-current-map-a10-context',
    file: 'attachment:codex-clipboard-5b6aeb03-d358-4c3a-a9e7-7a12e5d7c3c9.png',
    role: 'Contexto atual de A10, Rua Brasil, estacionamento e borda arborizada.',
    metricUse: 'VISUAL_ONLY',
    interpretation: 'Evidencia que o marcador A10 está separado da superfície existente e que a nova via precisa permanecer acima da cartografia.',
  },
  {
    id: 'annex-13-a1-a10-blue-trace',
    file: 'attachment:WhatsApp Image 2026-08-26 at 17.26.55 (1).jpeg',
    role: 'Traço anotado do eixo A1 → A10 → conexão superior com o asfalto.',
    metricUse: 'REGISTERED_TO_OFFICIAL_MAP',
    interpretation: 'A anotação é registrada pelas posições A1/A10 e pela borda do estacionamento; controla continuidade, não largura as-built.',
  },
  {
    id: 'annex-14-satellite-a1-a10-b22',
    file: 'attachment:WhatsApp Image 2026-08-26 at 17.31.05 (2).jpeg',
    role: 'Satélite anotado para conectividade da rotatória, A1, A10, acesso e implantação de B22.',
    metricUse: 'RELATIVE_ONLY',
    interpretation: 'Confirma relações topológicas, cobertura e vegetação; rotação, perspectiva e interface impedem medição direta.',
  },
  {
    id: 'annex-15-current-map-upper-connection',
    file: 'attachment:codex-clipboard-747519b1-9d95-4261-ac92-f1beac7d0f8b.png',
    role: 'Visão atual do acesso, estacionamento e continuidade superior até Rua Brasil.',
    metricUse: 'VISUAL_ONLY',
    interpretation: 'Serve para conferir sobreposição visual e legibilidade do corredor no Mapa Comercial.',
  },
  {
    id: 'annex-16-site-plan-a1-a10',
    file: 'attachment:codex-clipboard-3978d263-ef26-4765-a73b-dd95f4559c33.png',
    role: 'Planta de implantação com o corredor A1/A10, a rua superior, B22 e a vegetação envolvente.',
    metricUse: 'REGISTERED_TO_OFFICIAL_MAP',
    interpretation: 'A planta ancora a continuidade e os lados do corredor; o mapa oficial 2026 continua soberano para IDs e coordenadas.',
  },
  {
    id: 'annex-17-current-map-overview',
    file: 'attachment:1351704b-b70f-45ae-ac54-064b870b8ad0.png',
    role: 'Diagnóstico geral do estado atual entre A1, A10, B22, Área Motor Home e a rotatória de chegada.',
    metricUse: 'VISUAL_ONLY',
    interpretation: 'Evidencia material, continuidade e oclusões incorretas; não fornece coordenadas nem dimensões executivas.',
  },
  {
    id: 'annex-18-current-map-gate-1',
    file: 'attachment:454bebad-04cc-4e38-a60c-01191a4b69f2.png',
    role: 'Diagnóstico aproximado do Portão 1, do acesso atual e da relação visual com B22 e a rotatória grande.',
    metricUse: 'VISUAL_ONLY',
    interpretation: 'Comprova a ligação visual equivocada e orienta a comparação posterior, sem uso métrico.',
  },
  {
    id: 'annex-19-current-map-gate-10',
    file: 'attachment:c5c5f3ad-8d14-4090-8270-f07b9ccbde30.png',
    role: 'Diagnóstico do eixo atual junto a A10, Rua Brasil, estacionamento e borda arborizada.',
    metricUse: 'VISUAL_ONLY',
    interpretation: 'Expõe material incorreto e trechos ocultos; A10 e Rua Brasil continuam ancorados somente no mapa oficial.',
  },
  {
    id: 'annex-20-satellite-gate-1-roundabout',
    file: 'attachment:WhatsApp Image 2026-08-26 at 17.31.03 (1).jpeg',
    role: 'Satélite anotado para a separação entre A1, A10, B22 e a mini-rotatória própria do Portão 1.',
    metricUse: 'RELATIVE_ONLY',
    interpretation: 'Confirma a topologia independente da mini-rotatória; traços manuais, interface e rotação não permitem leitura as-built.',
  },
  {
    id: 'annex-21-site-plan-gate-1-motorhome',
    file: 'attachment:Imagem do Codex 26 de ago. de 2026, 19_41_35 (1).png',
    role: 'Planta de implantação para A1, A10, mini-rotatória e via longitudinal até a Área Motor Home.',
    metricUse: 'REGISTERED_TO_OFFICIAL_MAP',
    interpretation: 'Registro cruzado por A1, A10 e referências oficiais; os controles novos são candidatos cartográficos sujeitos à vistoria.',
  },
  {
    id: 'annex-22-aerial-motorhome-road',
    file: 'attachment:WhatsApp Image 2026-08-26 at 19.41.21 (1).jpeg',
    role: 'Leitura aérea complementar da estrada de pedra/saibro, da Área Motor Home, da Sede Costeiros e das bordas vegetadas.',
    metricUse: 'RELATIVE_ONLY',
    interpretation: 'Confirma continuidade, material e gradiente de vegetação; não individualiza árvores, cotas ou limites topográficos.',
  },
];

export const PARK_ACCESS_SPATIAL_PLAN = {
  revision: '2026.8-park-access-annexes.4',
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
    gate1LocalAccessMeters: 7,
    gate1MiniRoundaboutOuterRadiusMeters: 14,
    gate1MiniRoundaboutIslandRadiusMeters: 7.5,
    gate1Gate10RoadMeters: 6,
    gate1Gate10RoadReviewRangeMeters: [5.5, 7] as const,
    thirdAgePavilionAccessMeters: 4,
    parkingBayMeters: [2.7, 5.2] as const,
  },
  anchors: {
    gate1: {
      id: 'anchor-gate-1',
      name: 'Portão 1',
      sourcePdfPoint: A1_SOURCE,
      point: parkAccessSourcePointToLocal(A1_SOURCE),
      officialEntityIdentifier: 'A1',
      sourceIds: [
        'official-2026-park-map',
        'annex-1-implantation',
        'annex-6-costeiros',
        'annex-18-current-map-gate-1',
        'annex-20-satellite-gate-1-roundabout',
        'annex-21-site-plan-gate-1-motorhome',
      ],
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
    gate10: {
      id: 'anchor-gate-10',
      name: 'Portão 10',
      sourcePdfPoint: A10_SOURCE,
      point: parkAccessSourcePointToLocal(A10_SOURCE),
      officialEntityIdentifier: 'A10',
      sourceIds: [
        'official-2026-park-map',
        'annex-12-current-map-a10-context',
        'annex-13-a1-a10-blue-trace',
        'annex-14-satellite-a1-a10-b22',
        'annex-16-site-plan-a1-a10',
        'annex-19-current-map-gate-10',
        'annex-20-satellite-gate-1-roundabout',
        'annex-21-site-plan-gate-1-motorhome',
      ],
      confidence: 'OFFICIAL_ANCHOR',
      notes: 'Centro oficial A10 preservado como ponto obrigatório do eixo asfaltado que parte de A1 e alcança Rua Brasil.',
    },
    roundabout: {
      id: 'anchor-roundabout-tupareendi',
      name: 'Rotatória Av. Tupareendi / chegada ao parque',
      sourcePdfPoint: ROUNDABOUT_SOURCE,
      point: parkAccessSourcePointToLocal(ROUNDABOUT_SOURCE),
      officialEntityIdentifier: null,
      sourceIds: ['annex-1-implantation', 'annex-2-satellite', 'annex-14-satellite-a1-a10-b22'],
      confidence: 'ANNEX_REGISTERED_TRACE',
      notes: 'Centro da rotatória principal registrado pela ilha circular visível; ela permanece distinta da mini-rotatória do Portão 1 e seus raios não são dados de engenharia.',
    },
    gate1Roundabout: {
      id: 'anchor-gate-1-mini-roundabout',
      name: 'Mini-rotatória própria do Portão 1',
      sourcePdfPoint: GATE_1_MINI_ROUNDABOUT_SOURCE,
      point: parkAccessSourcePointToLocal(GATE_1_MINI_ROUNDABOUT_SOURCE),
      officialEntityIdentifier: null,
      sourceIds: [
        'official-2026-park-map',
        'annex-20-satellite-gate-1-roundabout',
        'annex-21-site-plan-gate-1-motorhome',
      ],
      confidence: 'FIELD_REVIEW_REQUIRED',
      notes: 'Centro candidato derivado do registro cruzado dos anexos; não equivale a coordenada topográfica ou as-built.',
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
    thirdAgePavilion: {
      id: 'anchor-third-age-pavilion',
      name: 'Pavilhão Terceira Idade',
      sourcePdfPoint: B22_CENTER_SOURCE,
      point: parkAccessSourcePointToLocal(B22_CENTER_SOURCE),
      officialEntityIdentifier: 'B22',
      sourceIds: ['official-2026-park-map', 'annex-14-satellite-a1-a10-b22', 'annex-16-site-plan-a1-a10'],
      confidence: 'OFFICIAL_ANCHOR',
      notes: 'Centro derivado do footprint oficial B22; o satélite orienta somente cobertura, acesso relativo e ambientação.',
    },
    ruaBrasilSeam: {
      id: 'anchor-rua-brasil-west-seam',
      name: 'Conexão oeste da Rua Brasil',
      sourcePdfPoint: RUA_BRASIL_SEAM_SOURCE,
      point: parkAccessSourcePointToLocal(RUA_BRASIL_SEAM_SOURCE),
      officialEntityIdentifier: 'RUA-BRASIL',
      sourceIds: [
        'official-2026-park-map',
        'annex-12-current-map-a10-context',
        'annex-13-a1-a10-blue-trace',
        'annex-15-current-map-upper-connection',
        'annex-16-site-plan-a1-a10',
      ],
      confidence: 'OFFICIAL_ANCHOR',
      notes: 'Ponto médio da borda oeste oficial de Rua Brasil; o último controle da via avança apenas o suficiente para eliminar fresta visual.',
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
      name: 'Encaixe Av. Tupareendi → mini-rotatória do Portão 1',
      sourcePdfPoint: GATE_1_ROUNDABOUT_TUPARENDI_LINK_SOURCE[
        GATE_1_ROUNDABOUT_TUPARENDI_LINK_SOURCE.length - 1
      ],
      point: parkAccessSourcePointToLocal(GATE_1_ROUNDABOUT_TUPARENDI_LINK_SOURCE[
        GATE_1_ROUNDABOUT_TUPARENDI_LINK_SOURCE.length - 1
      ]),
      officialEntityIdentifier: 'AV-TUPARENDI',
      sourceIds: [
        'official-2026-park-map',
        'annex-20-satellite-gate-1-roundabout',
        'annex-21-site-plan-gate-1-motorhome',
      ],
      confidence: 'FIELD_REVIEW_REQUIRED',
      notes: 'Controle conservador [600,3890] encerra a ligação curta no corredor oficial da Tupareendi; tangência, meio-fio e cota exatos requerem conferência em campo.',
    },
  } satisfies Record<string, ParkAccessAnchor>,
  roadSurfaces: ROAD_SURFACES,
  sidewalkSurfaces: SIDEWALK_SURFACES,
  markingSegments: MARKING_SEGMENTS,
  parkingBays: PARKING_BAYS,
  roundabouts: ROUNDABOUTS,
  roundabout: ROUNDABOUTS[0],
  gate1Roundabout: ROUNDABOUTS[1],
  gates: {
    gate1: {
      id: 'gate-1',
      officialEntityIdentifier: 'A1',
      anchor: parkAccessSourcePointToLocal(A1_SOURCE),
      sourcePdfAnchor: A1_SOURCE,
      approachHeadingRadians: parkAccessHeadingBetween(
        GATE_1_LOCAL_ACCESS_SOURCE[GATE_1_LOCAL_ACCESS_SOURCE.length - 2],
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
      approachRoadIds: [
        'gate-1-local-access',
        'costeiros-service-road',
        'gate-1-gate-10-rua-brasil-asphalt',
      ],
      sourceIds: [
        'official-2026-park-map',
        'annex-1-implantation',
        'annex-6-costeiros',
        'annex-13-a1-a10-blue-trace',
        'annex-14-satellite-a1-a10-b22',
        'annex-18-current-map-gate-1',
        'annex-20-satellite-gate-1-roundabout',
        'annex-21-site-plan-gate-1-motorhome',
      ],
      confidence: 'FIELD_REVIEW_REQUIRED',
      notes: 'A1 permanece na âncora oficial e agora recebe o acesso asfaltado da mini-rotatória, o eixo asfaltado A1/A10 e a via de saibro; rotação e dimensões arquitetônicas não são levantamento as-built.',
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
    serviceRoadIds: ['costeiros-service-road'] as const,
    sourcePdfServiceRoadCenterline: COSTEIROS_SERVICE_ROAD_SOURCE,
    serviceRoadCenterline: pathToLocal(COSTEIROS_SERVICE_ROAD_SOURCE),
    serviceRoadPolygon: ROAD_SURFACES.find((road) => road.id === 'costeiros-service-road')!.polygon,
    sourcePdfFieldEdge: [[960, 2840], [1180, 2835], [1430, 2850], [1700, 2880]] as const,
    fieldEdge: pathToLocal([[960, 2840], [1180, 2835], [1430, 2850], [1700, 2880]]),
    sourcePdfForestEdge: [[720, 3150], [770, 3030], [790, 2820], [810, 2520], [850, 2180]] as const,
    forestEdge: pathToLocal([[720, 3150], [770, 3030], [790, 2820], [810, 2520], [850, 2180]]),
    sourceIds: [
      'annex-1-implantation',
      'annex-6-costeiros',
      'annex-17-current-map-overview',
      'annex-21-site-plan-gate-1-motorhome',
      'annex-22-aerial-motorhome-road',
    ],
    confidence: 'ANNEX_REGISTERED_TRACE' as const,
    notes: 'Sede fica a leste da via de pedra/saibro e ao norte do bosque; o eixo permanece distinto do acesso asfaltado A1/A10/Rua Brasil. Nenhum vínculo cadastral ou comercial é criado.',
  },
  motorhomeSetting: {
    id: 'motorhome-setting',
    officialEntityIdentifier: 'AREA-MOTORHOME',
    sourcePdfFootprint: MOTORHOME_FOOTPRINT_SOURCE,
    footprint: polygonToLocal(MOTORHOME_FOOTPRINT_SOURCE),
    accessRoadId: 'costeiros-service-road',
    sourcePdfAccessCenterline: COSTEIROS_SERVICE_ROAD_SOURCE,
    accessCenterline: pathToLocal(COSTEIROS_SERVICE_ROAD_SOURCE),
    sourcePdfAccessPolygon: ROAD_SURFACES.find(
      (road) => road.id === 'costeiros-service-road',
    )!.sourcePdfPolygon,
    accessPolygon: ROAD_SURFACES.find(
      (road) => road.id === 'costeiros-service-road',
    )!.polygon,
    protectedFootprintIdentifiers: ['AREA-MOTORHOME'],
    clearances: {
      footprintMeters: 0,
      roadTreeTrunkMeters: MAIN_ACCESS_ROAD_TREE_CLEARANCE_METERS,
      canopyMeters: 0.75,
    },
    sourceIds: [
      'official-2026-park-map',
      'annex-17-current-map-overview',
      'annex-21-site-plan-gate-1-motorhome',
      'annex-22-aerial-motorhome-road',
    ],
    confidence: 'FIELD_REVIEW_REQUIRED',
    notes: 'Footprint [760,1780,1630,2400] é o limite oficial AREA-MOTORHOME; a via de pedra/saibro cruza esse suporte como acesso físico e os clearances são regras de apresentação, não afastamentos topográficos.',
  } satisfies MotorhomeSetting,
  thirdAgePavilionSetting: {
    id: 'third-age-pavilion-setting',
    officialEntityIdentifier: 'B22',
    sourcePdfFootprint: B22_FOOTPRINT_SOURCE,
    footprint: polygonToLocal(B22_FOOTPRINT_SOURCE),
    sourcePdfCenter: B22_CENTER_SOURCE,
    center: parkAccessSourcePointToLocal(B22_CENTER_SOURCE),
    accessRoadId: 'third-age-pavilion-access',
    sourcePdfAccessCenterline: THIRD_AGE_PAVILION_ACCESS_SOURCE,
    accessCenterline: pathToLocal(THIRD_AGE_PAVILION_ACCESS_SOURCE),
    sourcePdfAccessPolygon: THIRD_AGE_PAVILION_ACCESS_SURFACE_SOURCE,
    accessPolygon: polygonToLocal(THIRD_AGE_PAVILION_ACCESS_SURFACE_SOURCE),
    accessClearanceId: 'third-age-pavilion-access-clearance',
    sourcePdfAccessClearancePolygon: THIRD_AGE_PAVILION_ACCESS_CLEARANCE_SOURCE,
    accessClearancePolygon: polygonToLocal(THIRD_AGE_PAVILION_ACCESS_CLEARANCE_SOURCE),
    sourcePdfThreshold: THIRD_AGE_PAVILION_THRESHOLD_SOURCE,
    threshold: parkAccessSourcePointToLocal(THIRD_AGE_PAVILION_THRESHOLD_SOURCE),
    widthMeters: 4,
    width: parkAccessMetersToLocal(4),
    protectedFootprintIdentifiers: ['B22'],
    clearances: {
      footprintMeters: 0,
      roadTreeTrunkMeters: MAIN_ACCESS_ROAD_TREE_CLEARANCE_METERS,
      pavilionAccessTreeTrunkMeters: THIRD_AGE_PAVILION_ACCESS_TREE_CLEARANCE_METERS,
      canopyMeters: 0.45,
    },
    sourceIds: [
      'official-2026-park-map',
      'annex-10-current-map-overview-east',
      'annex-13-a1-a10-blue-trace',
      'annex-14-satellite-a1-a10-b22',
      'annex-16-site-plan-a1-a10',
      'annex-18-current-map-gate-1',
      'annex-20-satellite-gate-1-roundabout',
      'annex-21-site-plan-gate-1-motorhome',
    ],
    confidence: 'FIELD_REVIEW_REQUIRED',
    notes: 'B22 conserva integralmente seu footprint oficial; o acesso começa no controle compartilhado [629,3332], termina no threshold da fachada oeste e é recortado para não avançar sob a edificação. Controles e clearances não são as-built.',
  } satisfies ThirdAgePavilionSetting,
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
    'Confirmar separadamente em vistoria o raio externo, o raio da ilha, o centro e a altimetria da mini-rotatória do Portão 1; [341,3718], 14 m e 7,5 m são parâmetros cartográficos de trabalho.',
    'Confirmar em vistoria os raios e ilhas separadoras da rotatória principal Tupareendi/Benvenuto, sem reintroduzir ligação viária direta com A1.',
    'Confirmar larguras as-built, drenagem e cotas de meio-fio do acesso asfaltado local A1 e da Avenida Benvenuto de Conti.',
    'Confirmar a largura as-built entre 5,5 m e 7 m, drenagem lateral e composição do asfalto no eixo A1/A10/Rua Brasil.',
    'Confirmar o threshold, a largura livre do acesso e a solução de acessibilidade na fachada oeste do Pavilhão Terceira Idade B22.',
    'Confirmar altura, inclinação de cobertura, beirais e materiais de fachada de B22; os novos anexos fornecem somente leitura aérea e relativa.',
    'Confirmar em campo as árvores junto às vias asfaltadas, à estrada de saibro e ao acesso B22 antes de alterar posições do inventário cartográfico.',
    'Confirmar granulometria, largura, drenagem e continuidade extrema norte da estrada de pedra/saibro junto à Área Motor Home.',
    'Confirmar dimensões, elevação e materiais da Sede Costeiros; os anexos sustentam apenas sua relação espacial com a estrada.',
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
