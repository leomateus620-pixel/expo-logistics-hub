import { MAP_REFERENCE_HEIGHT, MAP_REFERENCE_WIDTH } from '../constants';
import type { CommercialMapData, Coordinate, MapEntity } from '../types';

/** Registered visual estimates, not surveyed dimensions. Street-facing axes
 * remain fixed. Roof envelopes include the eaves/porch.
 * Test Drive = the existing `sede-costeiros`, never a second cadastral object.
 */
export const RURAL_PAVILION_REVISION = '2026.9-rural-pavilions-photographs.2';
/** Shared source bounds, also consumed by the official B28 entity. */
export const RURAL_PAVILION_NEIGHBOR_BOUNDS = Object.freeze({
  B28: [3000, 2480, 3220, 2570] as const,
});
const livestockFrontSourceX = 2840;
const livestockRearClearance = 3;
const livestockRearSourceX = RURAL_PAVILION_NEIGHBOR_BOUNDS.B28[0] - livestockRearClearance;
export const RURAL_PAVILIONS = Object.freeze({
  testDrive: Object.freeze({
    id: 'sede-costeiros', sourceCenter: [917.5, 2972.5] as const,
    sourceWidth: 85, sourceBayPitch: 27, windowBays: 7,
    sourceEndMargins: 24, sourcePorchDepth: 34,
    // Seven repeated window bays + end masonry + front covered veranda.
    sourceDepth: 7 * 27 + 24 + 34,
    yaw: 0, eaveHeight: 0.53, roofRise: 0.28, floor: 0.036,
    frontAxis: '+Z', evidence: ['IMG_0860.jpeg', 'IMG_0859.jpeg'],
  }),
  livestock: Object.freeze({
    id: 'D4', sourceCenter: [(livestockFrontSourceX + livestockRearSourceX) / 2, 2525] as const,
    sourceWidth: livestockRearSourceX - livestockFrontSourceX, sourceDepth: 132, yaw: -Math.PI / 2,
    sourceFrontX: livestockFrontSourceX, sourceRearX: livestockRearSourceX,
    rearClearanceSource: livestockRearClearance,
    rearNeighborIdentifier: 'B28',
    roofHeight: 1.2, enclosedRearFraction: 0.36,
    evidence: ['IMG_0858.jpeg', 'IMG_0863.jpeg'],
  }),
});

export function ruralSourceBounds(spec: { sourceCenter: readonly [number, number]; sourceWidth: number; sourceDepth: number }) {
  const [x, z] = spec.sourceCenter;
  return [x - spec.sourceWidth / 2, z - spec.sourceDepth / 2,
    x + spec.sourceWidth / 2, z + spec.sourceDepth / 2] as const;
}

export function ruralSourceRing(spec: Parameters<typeof ruralSourceBounds>[0]): Coordinate[] {
  const [x0, z0, x1, z1] = ruralSourceBounds(spec);
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]];
}

// Same official crop transformation, kept independent to avoid an import cycle
// officialReference2026 -> reconstruction -> officialReference2026.
function toLocal([x, z]: Coordinate): Coordinate {
  return [(x - 600) / 5500 * MAP_REFERENCE_WIDTH - MAP_REFERENCE_WIDTH / 2,
    (z - 900) / 4150 * MAP_REFERENCE_HEIGHT - MAP_REFERENCE_HEIGHT / 2];
}

export function reconstructRuralPavilionEntity(entity: MapEntity): MapEntity {
  if (entity.publicIdentifier !== 'D4' || entity.metadata?.ruralReconstructionRevision === RURAL_PAVILION_REVISION) return entity;
  const sourceRing = ruralSourceRing(RURAL_PAVILIONS.livestock);
  return { ...entity,
    geometry: { ...entity.geometry, coordinates: [sourceRing.map(toLocal)] },
    metadata: { ...entity.metadata, sourcePdfPolygon: sourceRing,
      ruralReconstructionRevision: RURAL_PAVILION_REVISION,
      reconstructionAnchors: ['D4', 'Q-Q-01', 'B9', 'B28'], officialMeasurements: false,
      reconstructionPlacementReason: 'Preserve street-facing x2840; trim rear to B28 west edge minus 3 source units, including roof envelope.',
      cartographicConfidence: 'reference_registered_estimate' },
  };
}

export function withRuralPavilionReconstruction<T extends CommercialMapData>(data: T): T {
  return { ...data, entities: data.entities.map(reconstructRuralPavilionEntity) };
}
