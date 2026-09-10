import { OFFICIAL_REFERENCE_ENTITIES } from '../data/officialReference2026';
import { geometryCentroid } from './geometry';
import { lactalisStageModelDimensions, lactalisStagePresentationFootprint } from './lactalisStage';
import { commercialSitePolygonInteriorsOverlap } from './commercialSiteEnvironment';
import { strategicLandmarkBounds, strategicLandmarkFacingRadians } from './landmarks';
import type { Coordinate, MapEntity } from '../types';
import { FENASOJA_COMPLEX, reconstructFenasojaEntity } from '../data/fenasojaComplexReconstruction';

/** Resolve the exact lot entities, then validate the reference-registered street
 * normal. A single audience centroid must never skew a rectangular roof. */
export function lactalisAudienceOrientationProposal(entities: readonly MapEntity[] = OFFICIAL_REFERENCE_ENTITIES) {
  const entity = (id: string) => {
    const found = entities.find((e) => e.publicIdentifier === id);
    if (!found) throw new Error(`Missing reference entity ${id}`);
    return reconstructFenasojaEntity(found);
  };
  const lots = ['Q-D-11', 'Q-D-12'].map((id) => {
    const lot = entity(id);
    if (lot.classification !== 'SELLABLE_LOT' || lot.metadata.block !== 'D'
      || lot.parentEntityId !== entity('QUADRA-D').id) throw new Error(`Invalid audience lot ${id}`);
    return { id: lot.id, publicIdentifier: id, center: geometryCentroid(lot.geometry) };
  });
  const stage = entity('B13');
  const bounds = strategicLandmarkBounds(stage);
  const center: Coordinate = [bounds.centerX, bounds.centerZ];
  const midpoint: Coordinate = [(lots[0].center[0] + lots[1].center[0]) / 2, (lots[0].center[1] + lots[1].center[1]) / 2];
  const yaw = strategicLandmarkFacingRadians(stage);
  const expectedYaw = midpoint[0] < center[0] ? -Math.PI/2 : Math.PI/2;
  const angleToAudienceMidpoint = Math.atan2(midpoint[0] - center[0], midpoint[1] - center[1]);
  const model = lactalisStageModelDimensions(bounds.width, bounds.depth, center);
  const footprint = lactalisStagePresentationFootprint(bounds.width, bounds.depth, center);
  return {
    status: 'APPLIED_REFERENCE_REGISTRATION' as const,
    localFrontAxis: [0, 0, 1] as const, upAxis: 'Y', parentTransform: 'translation-only',
    center, lots, midpoint, yaw, expectedYaw, angleToAudienceMidpoint, degrees: yaw * 180 / Math.PI,
    referenceRevision:FENASOJA_COMPLEX.revision,
    frontVector: [Math.sin(yaw), Math.cos(yaw)] as const,
    planScale: model.containmentScale, reductionPercent: (1 - model.containmentScale) * 100,
    footprint, heightPreserved: false,
    collisions: ['RUA-URUGUAI-LESTE', 'RUA-BRASILIA', 'RUA-ARGENTINA-LESTE', 'B12'].filter((id) => commercialSitePolygonInteriorsOverlap(footprint, entity(id).geometry.coordinates[0])),
  };
}
