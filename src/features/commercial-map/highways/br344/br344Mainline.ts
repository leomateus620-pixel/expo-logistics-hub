import {
  MAP_REFERENCE_HEIGHT,
  MAP_REFERENCE_WIDTH,
} from '../../constants';
import {
  OFFICIAL_2026_SOURCE_MANIFEST,
  officialPdfPointToLocal,
} from '../../data/officialReference2026';
import {
  br472MainlineXAt,
  REGIONAL_HIGHWAY_PROFILE,
} from '../../data/regional-highways/contract';

/**
 * BR-344 mainline — Agent #2 slice (E–W, farther from the hub).
 *
 * Isolated presentation + source polyline for the integrator. This module does
 * not mount itself into CommercialMapCanvas, does not touch BR-472, and does
 * not emit cloverleaf ramps. Agent #3 consumes `BR344_NE_CLOVERLEAF_HANDOFF`.
 * Agent #1 extends BR-472 north to the same Y and owns scene-bounds expansion.
 */

export type SourcePoint = readonly [number, number];
export type LocalPoint = readonly [number, number];
export type WorldPoint = readonly [number, number, number];

const CROP = OFFICIAL_2026_SOURCE_MANIFEST.parkCropPdf;

/** Uniform park-crop scale (5 500 PDF points → 120 local). Same as annex roads. */
export const BR344_SOURCE_POINTS_PER_LOCAL_UNIT = CROP.width / MAP_REFERENCE_WIDTH;

export function br344SourceToLocalLength(sourceLength: number) {
  return sourceLength / BR344_SOURCE_POINTS_PER_LOCAL_UNIT;
}

export function br344SourcePointToLocal(point: SourcePoint): LocalPoint {
  const [x, z] = officialPdfPointToLocal(point);
  return [x, z];
}

export function br344SourcePointToWorld(point: SourcePoint, elevation = 0): WorldPoint {
  const [x, z] = br344SourcePointToLocal(point);
  return [x, elevation, z];
}

export function br344LocalPointToSource([x, z]: LocalPoint): SourcePoint {
  return [
    ((x + MAP_REFERENCE_WIDTH / 2) / MAP_REFERENCE_WIDTH) * CROP.width + CROP.x,
    ((z + MAP_REFERENCE_HEIGHT / 2) / MAP_REFERENCE_HEIGHT) * CROP.height + CROP.y,
  ];
}

export const BR344_REVISION = '2026.9-br344-mainline.1';
export const BR344_PUBLIC_IDENTIFIER = 'RODOVIA-BR-344';
export const BR344_DISPLAY_NAME = 'BR-344';
export const BR344_LABEL = 'BR-344';

/**
 * Cadastral park rectangle used as the hub scale (Image 1).
 * North = smaller source Y (world −Z). East = larger source X.
 * Northern perimeter streets sit at y=1265; the southern avenues close at 4235.
 * East edge is the park side of the existing BR-472 spine (x≈6008).
 */
export const BR344_HUB_SOURCE_BOUNDS = Object.freeze({
  west: 600,
  east: 6008,
  north: 1265,
  south: 4235,
} as const);

export const BR344_HUB_SOURCE_WIDTH = BR344_HUB_SOURCE_BOUNDS.east - BR344_HUB_SOURCE_BOUNDS.west;
export const BR344_HUB_SOURCE_HEIGHT = BR344_HUB_SOURCE_BOUNDS.south - BR344_HUB_SOURCE_BOUNDS.north;

/**
 * Image 2: BR-344 sits 2–2.5× hub height north of the hub’s northern edge.
 * 2.25 is the midpoint of that band.
 */
export const BR344_NORTH_OFFSET_FACTOR = 2.25;

export const BR344_SOURCE_Y = BR344_HUB_SOURCE_BOUNDS.north
  - BR344_NORTH_OFFSET_FACTOR * BR344_HUB_SOURCE_HEIGHT;

/**
 * Slice #115 published the NE vertex on the interior BR-472 spine (x=6120).
 * The live regional mainline sits ~0.26 hub widths east of the park (Anexo 2),
 * so the folded crossing uses that X at this latitude.
 */
export const BR344_PUBLISHED_NE_HANDOFF_SOURCE = Object.freeze([6120, BR344_SOURCE_Y] as const);

const br344LatitudeLocal = br344SourcePointToLocal([
  BR344_HUB_SOURCE_BOUNDS.west,
  BR344_SOURCE_Y,
])[1];

export const BR344_BR472_CROSSING_SOURCE_X = br344LocalPointToSource([
  br472MainlineXAt(br344LatitudeLocal),
  br344LatitudeLocal,
])[0];

/** West overshoot so the zoomed-out frame still has mainline to the left edge. */
export const BR344_WEST_OVERSHOOT_SOURCE = BR344_HUB_SOURCE_WIDTH * 0.45;
/** East overshoot past the crossing so Agent #3 has mainline to attach to. */
export const BR344_EAST_OVERSHOOT_SOURCE = BR344_HUB_SOURCE_WIDTH * 0.18;

export const BR344_SOURCE_NODES = Object.freeze({
  westTerminus: Object.freeze([
    BR344_HUB_SOURCE_BOUNDS.west - BR344_WEST_OVERSHOOT_SOURCE,
    BR344_SOURCE_Y,
  ] as const satisfies SourcePoint),
  hubNorthWest: Object.freeze([
    BR344_HUB_SOURCE_BOUNDS.west,
    BR344_SOURCE_Y,
  ] as const satisfies SourcePoint),
  hubNorthEast: Object.freeze([
    BR344_HUB_SOURCE_BOUNDS.east,
    BR344_SOURCE_Y,
  ] as const satisfies SourcePoint),
  neCloverleaf: Object.freeze([
    BR344_BR472_CROSSING_SOURCE_X,
    BR344_SOURCE_Y,
  ] as const satisfies SourcePoint),
  eastTerminus: Object.freeze([
    BR344_BR472_CROSSING_SOURCE_X + BR344_EAST_OVERSHOOT_SOURCE,
    BR344_SOURCE_Y,
  ] as const satisfies SourcePoint),
});

/**
 * Source-space centre-line, west → east. Perfectly straight (constant Y).
 * Named vertices: hub north edge projections + NE cloverleaf handoff.
 */
export const BR344_SOURCE_POLYLINE: readonly SourcePoint[] = Object.freeze([
  BR344_SOURCE_NODES.westTerminus,
  BR344_SOURCE_NODES.hubNorthWest,
  BR344_SOURCE_NODES.hubNorthEast,
  BR344_SOURCE_NODES.neCloverleaf,
  BR344_SOURCE_NODES.eastTerminus,
]);

export const BR344_LOCAL_POLYLINE: readonly LocalPoint[] = Object.freeze(
  BR344_SOURCE_POLYLINE.map((point) => Object.freeze(br344SourcePointToLocal(point)) as LocalPoint),
);

export const BR344_WORLD_POLYLINE: readonly WorldPoint[] = Object.freeze(
  BR344_SOURCE_POLYLINE.map((point) => Object.freeze(br344SourcePointToWorld(point)) as WorldPoint),
);

/**
 * Architectural-aerial finish — charcoal asphalt, compacted shoulders and
 * restrained yellow edges. Local widths are the shared regional family so BR-344,
 * BR-472 and the cloverleaf stubs meet without a neck.
 */
export const BR344_CARTOGRAPHIC_FINISH = Object.freeze({
  carriagewayColor: '#44494c',
  carriagewayRoughness: 0.91,
  shoulderColor: '#a99b84',
  shoulderRoughness: 0.98,
  yellowEdgeColor: '#e3c44b',
  yellowEdgeRoughness: 0.72,
  laneDashColor: '#f4f0d8',
  laneDashRoughness: 0.78,
  medianColor: '#5f7c45',
  medianRoughness: 0.97,
  /** Dual-band source proportions (70 pavement + 24 shoulders = 94). */
  carriagewayWidthSource: 32,
  medianWidthSource: 6,
  shoulderWidthSource: 12,
  yellowEdgeWidthSource: 2.2,
  laneDashWidthSource: 1.6,
} as const);

export const BR344_CROSS_SECTION = Object.freeze({
  carriagewayWidth: REGIONAL_HIGHWAY_PROFILE.dualCarriagewayWidth,
  medianWidth: REGIONAL_HIGHWAY_PROFILE.medianWidth,
  shoulderWidth: REGIONAL_HIGHWAY_PROFILE.shoulderWidth,
  yellowEdgeWidth: REGIONAL_HIGHWAY_PROFILE.edgeLineWidth,
  laneDashWidth: br344SourceToLocalLength(BR344_CARTOGRAPHIC_FINISH.laneDashWidthSource),
} as const);

const halfMedian = BR344_CROSS_SECTION.medianWidth / 2;
const carriageway = BR344_CROSS_SECTION.carriagewayWidth;
const shoulder = BR344_CROSS_SECTION.shoulderWidth;
const yellow = BR344_CROSS_SECTION.yellowEdgeWidth;

/**
 * Z offsets from the centre-line. Negative = north (world −Z).
 * Layout: yellow | tan | green | median | green | tan | yellow
 */
export const BR344_OFFSETS = Object.freeze({
  northYellowOuter: -(halfMedian + carriageway + shoulder + yellow),
  northYellowInner: -(halfMedian + carriageway + shoulder),
  northShoulderOuter: -(halfMedian + carriageway + shoulder),
  northShoulderInner: -(halfMedian + carriageway),
  northCarriagewayOuter: -(halfMedian + carriageway),
  northCarriagewayInner: -halfMedian,
  southCarriagewayInner: halfMedian,
  southCarriagewayOuter: halfMedian + carriageway,
  southShoulderInner: halfMedian + carriageway,
  southShoulderOuter: halfMedian + carriageway + shoulder,
  southYellowInner: halfMedian + carriageway + shoulder,
  southYellowOuter: halfMedian + carriageway + shoulder + yellow,
  northLaneDash: -(halfMedian + carriageway / 2),
  southLaneDash: halfMedian + carriageway / 2,
} as const);

export const BR344_TOTAL_HALF_WIDTH = Math.abs(BR344_OFFSETS.northYellowOuter);

export const BR344_ELEVATION = Object.freeze({
  pavement: 0.034,
  median: 0.031,
  shoulder: 0.028,
  markings: 0.038,
  yellow: 0.039,
} as const);

export const BR344_NE_CLOVERLEAF_HANDOFF = Object.freeze({
  id: 'br344-ne-cloverleaf-handoff' as const,
  sourcePoint: BR344_SOURCE_NODES.neCloverleaf,
  localPoint: BR344_LOCAL_POLYLINE[3],
  worldPoint: BR344_WORLD_POLYLINE[3],
  headingSource: Object.freeze([1, 0] as const),
  headingLocal: Object.freeze([1, 0] as const),
  mainlineHalfWidth: BR344_TOTAL_HALF_WIDTH,
  notes: 'Folded onto the regional BR-472 X at this latitude. NE cloverleaf stubs land here. This slice has no ramps.',
});

export function br344TerrainElevationAt(x: number, z: number) {
  // Same gentle undulation as the rear-road builder so the NE meeting stays flush.
  return (
    Math.sin(x * 0.075 + z * 0.043) * 0.0018
    + Math.sin(x * 0.031 - z * 0.067) * 0.0012
  );
}

export const BR344_RENDER_BUDGET = Object.freeze({
  maximumBaseDrawCalls: 6,
  maximumTriangles: 28_000,
});

function supportPoint(source: SourcePoint, zOffset: number, height = 0.85) {
  const [x, z] = br344SourcePointToLocal(source);
  return Object.freeze({
    position: Object.freeze([x, z + zOffset] as const),
    height,
  });
}

/** Drop into CommercialMapCanvas `getSceneExtent` supportPoints (integrator). */
export const BR344_SCENE_SUPPORT_POINTS = Object.freeze(
  BR344_SOURCE_POLYLINE.flatMap((point) => [
    supportPoint(point, 0),
    supportPoint(point, -BR344_TOTAL_HALF_WIDTH - 0.6),
    supportPoint(point, BR344_TOTAL_HALF_WIDTH + 0.6),
  ]),
);

export function br344HubLocalBounds() {
  const [west, north] = br344SourcePointToLocal([
    BR344_HUB_SOURCE_BOUNDS.west,
    BR344_HUB_SOURCE_BOUNDS.north,
  ]);
  const [east, south] = br344SourcePointToLocal([
    BR344_HUB_SOURCE_BOUNDS.east,
    BR344_HUB_SOURCE_BOUNDS.south,
  ]);
  return Object.freeze({
    minX: Math.min(west, east),
    maxX: Math.max(west, east),
    minZ: Math.min(north, south),
    maxZ: Math.max(north, south),
    width: Math.abs(east - west),
    height: Math.abs(south - north),
  });
}

export function br344FocusBounds() {
  const xs = BR344_LOCAL_POLYLINE.map(([x]) => x);
  const zs = BR344_LOCAL_POLYLINE.map(([, z]) => z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs) - BR344_TOTAL_HALF_WIDTH;
  const maxZ = Math.max(...zs) + BR344_TOTAL_HALF_WIDTH;
  return Object.freeze({
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  });
}

export function br344FootprintPolygon(): readonly LocalPoint[] {
  const west = BR344_LOCAL_POLYLINE[0][0];
  const east = BR344_LOCAL_POLYLINE[BR344_LOCAL_POLYLINE.length - 1][0];
  const z = BR344_LOCAL_POLYLINE[0][1];
  const half = BR344_TOTAL_HALF_WIDTH;
  return Object.freeze([
    Object.freeze([west, z - half] as const),
    Object.freeze([east, z - half] as const),
    Object.freeze([east, z + half] as const),
    Object.freeze([west, z + half] as const),
  ]);
}

export const BR344_FOCUS_BOUNDS = br344FocusBounds();

export const BR344_INTEGRATOR_CONTRACT = Object.freeze({
  revision: BR344_REVISION,
  publicIdentifier: BR344_PUBLIC_IDENTIFIER,
  displayName: BR344_DISPLAY_NAME,
  mount: '<Br344Mainline reducedGraphics={reducedGraphics} />',
  sceneSupport: 'Spread BR344_SCENE_SUPPORT_POINTS into getSceneExtent(..., supportPoints).',
  sourcePolyline: 'BR344_SOURCE_POLYLINE',
  neCloverleafHandoff: BR344_NE_CLOVERLEAF_HANDOFF.id,
  visualLanguage: 'BR344_CARTOGRAPHIC_FINISH — charcoal asphalt, compacted shoulders, restrained yellow edges.',
  outOfScope: Object.freeze([
    'cloverleaf ramps',
    'BR-472',
    'CommercialMapCanvas edits',
    'park interior',
  ] as const),
});
