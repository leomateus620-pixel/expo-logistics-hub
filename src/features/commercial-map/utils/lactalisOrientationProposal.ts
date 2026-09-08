import { OFFICIAL_REFERENCE_ENTITIES } from '../data/officialReference2026';
import { geometryCentroid } from './geometry';
import {
  LACTALIS_STAGE_LAYOUT,
  lactalisStagePresentationFootprint,
} from './lactalisStage';
import { commercialSitePolygonInteriorsOverlap } from './commercialSiteEnvironment';
import type { Coordinate } from '../types';

/** Read-only feasibility study. Not imported by the production renderer.
 * Applying the requested heading at full size violates the user's no-overlap
 * constraint. A plan-size change requires their explicit decision. */
export function lactalisAudienceOrientationProposal() {
  const entity = (id: string) => {
    const found = OFFICIAL_REFERENCE_ENTITIES.find(
      (e) => e.publicIdentifier === id,
    );
    if (!found) throw new Error(`Missing reference entity ${id}`);
    return found;
  };
  const lots = ['Q-D-11', 'Q-D-12'].map((id) => {
    const lot = entity(id);
    if (
      lot.classification !== 'SELLABLE_LOT' ||
      lot.metadata.block !== 'D' ||
      lot.parentEntityId !== 'reference:2026:quadra-d'
    )
      throw new Error(`Invalid audience lot ${id}`);
    return {
      id: lot.id,
      publicIdentifier: id,
      center: geometryCentroid(lot.geometry),
    };
  });
  const center = geometryCentroid(entity('B13').geometry);
  const midpoint: Coordinate = [
    (lots[0].center[0] + lots[1].center[0]) / 2,
    (lots[0].center[1] + lots[1].center[1]) / 2,
  ];
  const yaw = Math.atan2(midpoint[0] - center[0], midpoint[1] - center[1]);
  const ring = entity('B13').geometry.coordinates[0];
  const width =
    Math.max(...ring.map((p) => p[0])) - Math.min(...ring.map((p) => p[0]));
  const depth =
    Math.max(...ring.map((p) => p[1])) - Math.min(...ring.map((p) => p[1]));
  const polygonAt = (scale: number) =>
    lactalisStagePresentationFootprint(width * scale, depth * scale).map(
      ([x, z]): Coordinate => {
        // Undo the existing model yaw, then rotate the complete local envelope.
        const old = LACTALIS_STAGE_LAYOUT.facingRadians,
          dx = x - center[0],
          dz = z - center[1];
        const lx = dx * Math.cos(old) - dz * Math.sin(old),
          lz = dx * Math.sin(old) + dz * Math.cos(old);
        return [
          center[0] + lx * Math.cos(yaw) + lz * Math.sin(yaw),
          center[1] - lx * Math.sin(yaw) + lz * Math.cos(yaw),
        ];
      },
    );
  const northRoad = entity('RUA-URUGUAI-LESTE'),
    headquarters = entity('B12');
  const minZ =
    Math.max(...northRoad.geometry.coordinates[0].map((p) => p[1])) + 0.015;
  const maxZ =
    Math.min(...headquarters.geometry.coordinates[0].map((p) => p[1])) - 0.045;
  const fits = (scale: number) =>
    polygonAt(scale).every(
      ([x, z]) =>
        z >= minZ &&
        z <= maxZ &&
        x >= Math.min(...ring.map((p) => p[0])) + 0.015 &&
        x <= Math.max(...ring.map((p) => p[0])) - 0.015,
    );
  let low = 0.1,
    high = 1;
  for (let i = 0; i < 40; i++) {
    const s = (low + high) / 2;
    if (fits(s)) low = s;
    else high = s;
  }
  const fullSizeFootprint = polygonAt(1);
  return {
    status: 'AWAITING_USER_PLAN_SIZE_DECISION' as const,
    localFrontAxis: [0, 0, 1] as const,
    upAxis: 'Y',
    parentTransform: 'translation-only',
    center,
    lots,
    midpoint,
    yaw,
    degrees: (yaw * 180) / Math.PI,
    frontVector: [Math.sin(yaw), Math.cos(yaw)] as const,
    fullSizeFootprint,
    collisions: [northRoad, headquarters]
      .filter((e) =>
        commercialSitePolygonInteriorsOverlap(
          fullSizeFootprint,
          e.geometry.coordinates[0],
        ),
      )
      .map((e) => e.publicIdentifier),
    roadEncroachment:
      Math.max(...northRoad.geometry.coordinates[0].map((p) => p[1])) -
      Math.min(...fullSizeFootprint.map((p) => p[1])),
    proposedPlanScale: low,
    proposedReductionPercent: (1 - low) * 100,
    proposedFootprint: polygonAt(low),
    heightPreserved: true,
  };
}
