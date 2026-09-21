import { MathUtils, Spherical, Vector3 } from 'three';
import type { InteriorCameraRequest, InteriorViewAction, PavilionCameraGeometry } from '../hooks/useInteriorCameraRequest';
import { contextualCameraViewOffset, type ContextualViewportInsets } from './contextualViewport';

const UP = new Vector3(0, 1, 0);

/** Choose an axis in local plan space, retaining the official reading direction. */
export function pavilionViewRotation(geometry: Pick<PavilionCameraGeometry, 'readingAxis' | 'defaultRotation'>, action: 'vertical' | 'horizontal') {
  const base = (geometry.readingAxis === 'x') === (action === 'vertical') ? Math.PI / 2 : 0;
  return base + Math.round((geometry.defaultRotation - base) / Math.PI) * Math.PI;
}

export function resolveInteriorView({ frame, action, position, target, selectedModuleId, width, height, insets }: {
  frame: InteriorCameraRequest;
  action: InteriorViewAction;
  position: Vector3;
  target: Vector3;
  selectedModuleId: string | null;
  width: number;
  height: number;
  insets: ContextualViewportInsets;
}) {
  const geometry = frame.pavilion;
  if (!geometry || width <= 0 || height <= 0) return null;
  const usableWidth = Math.max(1, width - insets.left - insets.right);
  const usableHeight = Math.max(1, height - insets.top - insets.bottom);
  const tangent = Math.tan(MathUtils.degToRad(frame.fov) / 2);
  const viewOffset = contextualCameraViewOffset(width, height, insets);
  let nextTarget = frame.target.clone();
  let direction: Vector3;
  let desiredDistance: number;
  if (action === 'inspect') {
    const selected = geometry.modules.find(module => module.id === selectedModuleId);
    const localTarget = target.clone().sub(frame.target).applyAxisAngle(UP, -geometry.facing);
    const validTarget = target.toArray().every(Number.isFinite)
      && Math.abs(localTarget.x) <= geometry.width / 2
      && Math.abs(localTarget.z) <= geometry.depth / 2;
    if (selected) nextTarget = selected.center.clone();
    else if (validTarget) nextTarget.copy(target);
    else if (geometry.modules.length) {
      nextTarget.set(0, 0, 0);
      geometry.modules.forEach(module => nextTarget.add(module.center));
      nextTarget.divideScalar(geometry.modules.length);
    }
    nextTarget.y = frame.target.y;
    direction = position.clone().sub(target);
    if (!direction.toArray().every(Number.isFinite) || direction.lengthSq() < 1e-10) {
      direction.copy(frame.position).sub(frame.target);
    }
    direction.normalize();
    const dimensions = geometry.modules.map(module => Math.min(module.width, module.depth)).sort((a, b) => a - b);
    const moduleSize = selected ? Math.min(selected.width, selected.depth) : dimensions[Math.floor(dimensions.length / 2)] ?? Math.min(geometry.width, geometry.depth) / 12;
    // Aim for a readable 42px module, bounded by the pavilion and usable region.
    const span = Math.min(moduleSize * Math.min(usableWidth, usableHeight) / 42, Math.max(geometry.width, geometry.depth) * 0.48);
    desiredDistance = Math.max(frame.minDistance, span / (2 * tangent) * height / usableHeight);
  } else {
    const rotation = pavilionViewRotation(geometry, action);
    const cos = Math.abs(Math.cos(rotation));
    const sin = Math.abs(Math.sin(rotation));
    const screenWidth = geometry.width * cos + geometry.depth * sin;
    const screenDepth = geometry.width * sin + geometry.depth * cos;
    // Keep a finite polar angle. The near corner is slightly closer to the lens.
    const phi = 0.04;
    desiredDistance = 1.12 * Math.max(screenDepth * height / usableHeight, screenWidth * height / usableWidth) / (2 * tangent)
      + Math.max(screenWidth, screenDepth) * Math.sin(phi) / 2;
    direction = new Vector3().setFromSpherical(new Spherical(1, phi, geometry.facing + rotation));
  }
  const distance = MathUtils.clamp(desiredDistance, frame.minDistance, frame.maxDistance);
  return {
    position: nextTarget.clone().addScaledVector(direction, distance),
    target: nextTarget,
    fov: frame.fov,
    near: frame.near,
    far: frame.far,
    zoom: Math.min(1, distance / desiredDistance),
    viewOffset,
  };
}

/** Clamp a pan as a translation, never changing the visible orbit direction. */
export function clampInteriorPan(position: Vector3, target: Vector3, bounds: NonNullable<InteriorCameraRequest['panBounds']>, local: Vector3, shift: Vector3) {
  shift.copy(target);
  local.copy(target).sub(bounds.center).applyAxisAngle(UP, -bounds.facing);
  local.set(
    MathUtils.clamp(local.x, bounds.min[0], bounds.max[0]),
    MathUtils.clamp(local.y, bounds.min[1], bounds.max[1]),
    MathUtils.clamp(local.z, bounds.min[2], bounds.max[2]),
  );
  target.copy(local.applyAxisAngle(UP, bounds.facing).add(bounds.center));
  position.add(shift.subVectors(target, shift));
}

/** Orbit around the pivot instead of crossing the singular top-view direction. */
export function interpolateInteriorOrbit(fromPosition: Vector3, fromTarget: Vector3, toPosition: Vector3, toTarget: Vector3, progress: number, position: Vector3, target: Vector3, scratch: { from: Spherical; to: Spherical; offset: Vector3 }) {
  scratch.from.setFromVector3(scratch.offset.subVectors(fromPosition, fromTarget));
  scratch.to.setFromVector3(scratch.offset.subVectors(toPosition, toTarget));
  const delta = Math.atan2(Math.sin(scratch.to.theta - scratch.from.theta), Math.cos(scratch.to.theta - scratch.from.theta));
  scratch.from.set(
    Math.max(0.001, MathUtils.lerp(scratch.from.radius, scratch.to.radius, progress)),
    Math.max(0.02, MathUtils.lerp(scratch.from.phi, scratch.to.phi, progress)),
    scratch.from.theta + delta * progress,
  );
  target.lerpVectors(fromTarget, toTarget, progress);
  position.copy(target).add(scratch.offset.setFromSpherical(scratch.from));
}
