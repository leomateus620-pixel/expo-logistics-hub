import { officialLocalPointToPdf, officialPdfPointToLocal } from './officialReference2026';
import { rearRoadSourceToLocalLength } from './rearParkRoadNetwork';
import { INTERCHANGE_ENVELOPES, REGIONAL_HIGHWAY_PROFILE } from './regional-highways/contract';

/**
 * Trevo sul da BR-472 — camada de apresentação isolada.
 *
 * O trevo em Y do Portão 5 / A5 permanece intocado. Esta malha começa no
 * término sul já gerado da BR-472 e modela o cloverleaf simétrico com duas
 * rotatórias amarelas a leste e a oeste da rodovia, no canto sudeste do
 * parque, onde a BR-472 vira de N–S para E–O ao longo da face sul.
 *
 * O join publicado pelo slice #117 era o término sul interior `[6146, 4400]`.
 * Não estender `br472SouthRampToSouth` através deste trevo. A malha regional
 * vive no envelope SE (Anexo 2: sul do parque, BR-472 a ~0.26 larguras a leste).
 */
export const SE_CLOVERLEAF_REVISION = '2026.9-se-cloverleaf.2';

export type SeCloverleafPoint = readonly [number, number];

/** Interior A5 south terminus — documentation only; not the regional junction. */
export const SE_CLOVERLEAF_PUBLISHED_JOIN_SOURCE = Object.freeze([6146, 4400] as const);
export const SE_CLOVERLEAF_PUBLISHED_CENTER_SOURCE = Object.freeze([6146, 4987] as const);

const publishedJoinLocal = officialPdfPointToLocal(SE_CLOVERLEAF_PUBLISHED_JOIN_SOURCE);
const publishedCenterLocal = officialPdfPointToLocal(SE_CLOVERLEAF_PUBLISHED_CENTER_SOURCE);
const northOffset = publishedCenterLocal[1] - publishedJoinLocal[1];

export const SE_CLOVERLEAF_CENTER_LOCAL = INTERCHANGE_ENVELOPES.seCloverleaf.center;
export const SE_CLOVERLEAF_JOIN_LOCAL = Object.freeze([
  SE_CLOVERLEAF_CENTER_LOCAL[0],
  SE_CLOVERLEAF_CENTER_LOCAL[1] - northOffset,
] as const);

export const SE_CLOVERLEAF_JOIN_SOURCE = Object.freeze(
  officialLocalPointToPdf(SE_CLOVERLEAF_JOIN_LOCAL),
);
export const SE_CLOVERLEAF_CENTER_SOURCE = Object.freeze(
  officialLocalPointToPdf(SE_CLOVERLEAF_CENTER_LOCAL),
);

const highwayWidth = REGIONAL_HIGHWAY_PROFILE.carriagewayWidth;
const highwayShoulder = REGIONAL_HIGHWAY_PROFILE.shoulderWidth;
const rampWidth = rearRoadSourceToLocalLength(40);
const crossingWidth = rearRoadSourceToLocalLength(44);

const centerX = SE_CLOVERLEAF_CENTER_LOCAL[0];
const centerZ = SE_CLOVERLEAF_CENTER_LOCAL[1];
const joinZ = SE_CLOVERLEAF_JOIN_LOCAL[1];
const slipRadius = centerZ - joinZ;

export const SE_CLOVERLEAF_LAYOUT = Object.freeze({
  join: SE_CLOVERLEAF_JOIN_LOCAL,
  center: SE_CLOVERLEAF_CENTER_LOCAL,
  highwayWidth,
  highwayShoulder,
  rampWidth,
  crossingWidth,
  /** Raio das pétalas internas (~45 m). */
  loopRadius: 4.62,
  /** Deslocamento do centro de cada pétala em relação ao cruzamento. */
  loopOffset: 5.42,
  /** Distância do eixo da BR-472 ao centro de cada rotatória. */
  roundaboutOffset: 10.15,
  roundaboutOuterRadius: 3.92,
  roundaboutIslandRadius: 1.88,
  roundaboutCurbWidth: 0.16,
  /** Arco externo de conversão à direita; casa com o handoff norte. */
  slipRadius,
  overpassHalfSpan: 4.15,
  riseLength: 6.15,
  overpassHeight: 0.86,
  deckThickness: 0.1,
  gradeElevation: 0.034,
  shoulderDrop: 0.006,
  markingLift: 0.0045,
  roundaboutLift: 0.008,
  islandLift: 0.014,
  grassElevation: 0.0024,
  westTurnRadius: 11.4,
  westExtension: 24,
  westTurnStartOffset: 8.35,
} as const);

export const SE_CLOVERLEAF_QUADRANTS = Object.freeze([
  Object.freeze({ id: 'ne', sx: 1, sz: -1, label: 'NE' }),
  Object.freeze({ id: 'se', sx: 1, sz: 1, label: 'SE' }),
  Object.freeze({ id: 'sw', sx: -1, sz: 1, label: 'SW' }),
  Object.freeze({ id: 'nw', sx: -1, sz: -1, label: 'NW' }),
] as const);

export type SeCloverleafQuadrantId = (typeof SE_CLOVERLEAF_QUADRANTS)[number]['id'];

export function seCloverleafLoopCenter(sx: number, sz: number): SeCloverleafPoint {
  return [
    centerX + sx * SE_CLOVERLEAF_LAYOUT.loopOffset,
    centerZ + sz * SE_CLOVERLEAF_LAYOUT.loopOffset,
  ];
}

export function seCloverleafRoundaboutCenter(side: -1 | 1): SeCloverleafPoint {
  return [centerX + side * SE_CLOVERLEAF_LAYOUT.roundaboutOffset, centerZ];
}

export const SE_CLOVERLEAF_ROUNDABOUTS = Object.freeze({
  west: seCloverleafRoundaboutCenter(-1),
  east: seCloverleafRoundaboutCenter(1),
} as const);

export const SE_CLOVERLEAF_ELEVATION_BANDS = Object.freeze({
  grass: SE_CLOVERLEAF_LAYOUT.grassElevation,
  shoulder: SE_CLOVERLEAF_LAYOUT.gradeElevation - SE_CLOVERLEAF_LAYOUT.shoulderDrop,
  grade: SE_CLOVERLEAF_LAYOUT.gradeElevation,
  roundabout: SE_CLOVERLEAF_LAYOUT.gradeElevation + SE_CLOVERLEAF_LAYOUT.roundaboutLift,
  island: SE_CLOVERLEAF_LAYOUT.gradeElevation + SE_CLOVERLEAF_LAYOUT.islandLift,
  markings: SE_CLOVERLEAF_LAYOUT.gradeElevation + SE_CLOVERLEAF_LAYOUT.markingLift,
  overpass: SE_CLOVERLEAF_LAYOUT.overpassHeight,
  deckSoffit: SE_CLOVERLEAF_LAYOUT.overpassHeight - SE_CLOVERLEAF_LAYOUT.deckThickness,
} as const);

export const SE_CLOVERLEAF_RENDER_BUDGET = Object.freeze({
  maximumPrimaryDrawCalls: 10,
  maximumTriangles: 28_000,
  maximumReducedTriangles: 14_000,
});

function westBoundZ() {
  return centerZ + SE_CLOVERLEAF_LAYOUT.westTurnStartOffset + SE_CLOVERLEAF_LAYOUT.westTurnRadius;
}

function westTerminusX() {
  return centerX - SE_CLOVERLEAF_LAYOUT.westTurnRadius - SE_CLOVERLEAF_LAYOUT.westExtension;
}

export function seCloverleafWestTerminusPoint(): SeCloverleafPoint {
  return [westTerminusX(), westBoundZ()];
}

/** Envelope da malha, para câmera/terreno (Agent 1 — bounds). */
export const SE_CLOVERLEAF_FOCUS_BOUNDS = Object.freeze({
  minX: westTerminusX() - highwayWidth,
  maxX: centerX + slipRadius + highwayWidth,
  minZ: joinZ - highwayWidth,
  maxZ: westBoundZ() + highwayWidth,
} as const);

export const SE_CLOVERLEAF_SCENE_SUPPORT_POINTS = Object.freeze([
  Object.freeze({ position: SE_CLOVERLEAF_JOIN_LOCAL, height: 1.2 }),
  Object.freeze({ position: SE_CLOVERLEAF_CENTER_LOCAL, height: SE_CLOVERLEAF_LAYOUT.overpassHeight + 0.5 }),
  Object.freeze({ position: SE_CLOVERLEAF_ROUNDABOUTS.west, height: 0.9 }),
  Object.freeze({ position: SE_CLOVERLEAF_ROUNDABOUTS.east, height: 0.9 }),
  Object.freeze({
    position: [westTerminusX(), westBoundZ()] as const,
    height: 1.1,
  }),
  Object.freeze({
    position: [centerX + slipRadius, centerZ] as const,
    height: 0.9,
  }),
  Object.freeze({
    position: [centerX, centerZ + slipRadius] as const,
    height: 1.1,
  }),
]);

export function seCloverleafIsSouthOfA5Trevo() {
  return SE_CLOVERLEAF_FOCUS_BOUNDS.minZ > 22;
}

export function seCloverleafIsEastOfParkCore() {
  return SE_CLOVERLEAF_CENTER_LOCAL[0] > 50;
}
