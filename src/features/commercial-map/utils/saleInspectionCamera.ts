import { Box3, MathUtils, Vector3 } from 'three';
import type { InteriorCameraRequest } from '../hooks/useInteriorCameraRequest';
import { contextualCameraViewOffset, type ContextualViewportInsets } from './contextualViewport';

const UP = new Vector3(0, 1, 0);

/** Fits the actual loaded module envelopes through the existing camera's free
 * viewport. An explicit space/group request takes priority over the whole sale. */
export function resolveSaleInspectionInteriorView({ frame, lotIds, entityIds, width, height, insets }: {
  frame: InteriorCameraRequest;
  lotIds: ReadonlySet<string>;
  entityIds: ReadonlySet<string>;
  width: number;
  height: number;
  insets: ContextualViewportInsets;
}) {
  const geometry = frame.pavilion;
  if (!geometry || width <= 0 || height <= 0) return null;
  const saleModules = geometry.modules.filter(module => module.lotId && lotIds.has(module.lotId));
  const requested = saleModules.filter(module => module.entityId && entityIds.has(module.entityId));
  const modules = requested.length ? requested : saleModules;
  if (!modules.length) return null;
  const corners = modules.flatMap(module => [-1, 1].flatMap(x => [-1, 1].map(z => (
    new Vector3(x * module.width / 2, 0, z * module.depth / 2)
      .applyAxisAngle(UP, geometry.facing).add(module.center)
  ))));
  const target = new Box3().setFromPoints(corners).getCenter(new Vector3());
  const direction = frame.position.clone().sub(frame.target).normalize();
  const right = new Vector3().crossVectors(UP, direction).normalize();
  const up = new Vector3().crossVectors(direction, right).normalize();
  const usableWidth = Math.max(1, width - insets.left - insets.right);
  const usableHeight = Math.max(1, height - insets.top - insets.bottom);
  const tangent = Math.tan(MathUtils.degToRad(frame.fov) / 2);
  let desiredDistance = frame.minDistance;
  for (const corner of corners) {
    const delta = corner.clone().sub(target);
    const projectedSpan = Math.max(
      Math.abs(delta.dot(right)) * height / usableWidth,
      Math.abs(delta.dot(up)) * height / usableHeight,
    );
    desiredDistance = Math.max(desiredDistance, 1.18 * projectedSpan / tangent + delta.dot(direction));
  }
  const distance = MathUtils.clamp(desiredDistance, frame.minDistance, frame.maxDistance);
  return {
    position: target.clone().addScaledVector(direction, distance), target,
    fov: frame.fov, near: frame.near, far: frame.far,
    zoom: Math.min(1, distance / desiredDistance),
    viewOffset: contextualCameraViewOffset(width, height, insets),
  };
}
