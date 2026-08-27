import { COMMERCIAL_MAP_MIN_POLAR_ANGLE } from './viewport';

export type ParkingCameraView = 'overview' | 'aerial' | 'rear' | 'lateral' | 'detail';

/** Bounds already expressed in the map's world coordinates (0.15 world units/m). */
export interface ParkingWorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ParkingViewportInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ParkingCameraFrameInput {
  bounds: ParkingWorldBounds;
  view: ParkingCameraView;
  viewportWidth: number;
  viewportHeight: number;
  /** Canvas-local occlusion, including safe areas if reported by the host. */
  insets?: Partial<ParkingViewportInsets>;
  groundY?: number;
}

type Vec3 = [number, number, number];

export interface ParkingCameraFrame {
  position: Vec3;
  target: Vec3;
  fov: number;
  near: number;
  far: number;
  minDistance: number;
  maxDistance: number;
  distance: number;
  insets: ParkingViewportInsets;
  usableViewport: { width: number; height: number };
}

export const PARKING_INSPECTOR_COMPACT_MAX_HEIGHT = 128;
export const PARKING_CAMERA_FOV = 38;

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function isParkingPortraitViewport(width: number, height: number) {
  return width > 0 && width <= 720 && height / width >= 1.2;
}

/** Matches the compact panel; opening its notes never increases map occlusion. */
export function resolveParkingViewportInsets(width: number, height: number): ParkingViewportInsets {
  const shortLandscape = width > height && height <= 540;
  // Landscape phones use the clear area beside the compact panel, preserving
  // useful vertical room rather than shrinking the park above a bottom sheet.
  if (shortLandscape && width >= 740) return { top: 60, right: 18, bottom: 18, left: 384 };
  if (shortLandscape) return { top: 60, right: 18, bottom: 144, left: 18 };
  return {
    top: width <= 720 ? 70 : 76,
    right: width <= 720 ? 14 : 24,
    bottom: PARKING_INSPECTOR_COMPACT_MAX_HEIGHT + 24,
    left: width <= 720 ? 14 : 24,
  };
}

function resolveDirection(view: ParkingCameraView, portrait: boolean, width: number, depth: number): Vec3 {
  // Rear parking is on negative Z; the Crioulos connection is on negative X.
  if (view === 'rear') return normalize([0.12, 0.66, -0.76]);
  if (view === 'lateral') return normalize([-0.85, 0.64, -0.22]);

  // In portrait the longest block axis uses the vertical canvas. This changes
  // azimuth, not coordinates, and leaves orbit/pan/touch handling to OrbitControls.
  const alongX = portrait && width > depth * 1.15;
  if (view === 'aerial') {
    const polar = COMMERCIAL_MAP_MIN_POLAR_ANGLE + 0.008;
    return alongX
      ? [Math.sin(polar), Math.cos(polar), 0]
      : [0, Math.cos(polar), -Math.sin(polar)];
  }
  if (alongX) return normalize([0.54, 0.84, -0.065]);
  if (view === 'detail') return normalize([-0.18, 0.86, -0.5]);
  return normalize([0.13, 0.84, -0.53]);
}

/**
 * Fits every footprint corner in the unobstructed canvas, including perspective
 * depth. The target shift stays on the ground plane, so OrbitControls' Y clamp
 * cannot undo the framing. No world-unit conversion or animation is done here.
 * The caller supplies expanded bounds when surrounding buildings are required.
 */
export function resolveParkingCameraFrame({
  bounds,
  view,
  viewportWidth,
  viewportHeight,
  insets: customInsets,
  groundY = 0.12,
}: ParkingCameraFrameInput): ParkingCameraFrame {
  const viewportW = Math.max(1, finite(viewportWidth, 1));
  const viewportH = Math.max(1, finite(viewportHeight, 1));
  const firstX = finite(bounds.minX, 0);
  const secondX = finite(bounds.maxX, firstX);
  const firstZ = finite(bounds.minZ, 0);
  const secondZ = finite(bounds.maxZ, firstZ);
  const minX = Math.min(firstX, secondX);
  const maxX = Math.max(firstX, secondX);
  const minZ = Math.min(firstZ, secondZ);
  const maxZ = Math.max(firstZ, secondZ);
  const width = Math.max(0.15, maxX - minX);
  const depth = Math.max(0.15, maxZ - minZ);
  const diagonal = Math.hypot(width, depth);
  const center: Vec3 = [(minX + maxX) / 2, finite(groundY, 0.12), (minZ + maxZ) / 2];
  const suppliedInsets = { ...resolveParkingViewportInsets(viewportW, viewportH), ...customInsets };
  const insets: ParkingViewportInsets = {
    top: Math.max(0, finite(suppliedInsets.top, 0)),
    right: Math.max(0, finite(suppliedInsets.right, 0)),
    bottom: Math.max(0, finite(suppliedInsets.bottom, 0)),
    left: Math.max(0, finite(suppliedInsets.left, 0)),
  };
  const horizontalInsetScale = Math.min(1, viewportW * 0.75 / Math.max(1, insets.left + insets.right));
  const verticalInsetScale = Math.min(1, viewportH * 0.75 / Math.max(1, insets.top + insets.bottom));
  insets.left *= horizontalInsetScale;
  insets.right *= horizontalInsetScale;
  insets.top *= verticalInsetScale;
  insets.bottom *= verticalInsetScale;
  const usableWidth = viewportW - insets.left - insets.right;
  const usableHeight = viewportH - insets.top - insets.bottom;
  const direction = resolveDirection(view, isParkingPortraitViewport(viewportW, viewportH), width, depth);
  const horizontalLength = Math.hypot(direction[0], direction[2]);
  const right: Vec3 = [direction[2] / horizontalLength, 0, -direction[0] / horizontalLength];
  const groundUp: Vec3 = [-direction[0] / horizontalLength, 0, -direction[2] / horizontalLength];
  const up: Vec3 = [
    groundUp[0] * direction[1], horizontalLength, groundUp[2] * direction[1],
  ];
  const tanVerticalFov = Math.tan(PARKING_CAMERA_FOV * Math.PI / 360);
  const tanHorizontalFov = tanVerticalFov * viewportW / viewportH;
  const centerX = (insets.left - insets.right) / viewportW;
  const centerY = (insets.bottom - insets.top) / viewportH;
  const padding = view === 'detail' ? 1.16 : view === 'aerial' ? 1.07 : 1.1;
  const halfAvailableX = usableWidth / viewportW / padding;
  const halfAvailableY = usableHeight / viewportH / padding;

  // Shift/distance ratios account for the depth change caused by translating
  // the target along groundUp instead of moving it above/below the terrain.
  const upShiftRatio = -centerY * tanVerticalFov
    / (direction[1] - centerY * tanVerticalFov * horizontalLength);
  const depthRatio = 1 - horizontalLength * upShiftRatio;
  const rightShiftRatio = -centerX * tanHorizontalFov * depthRatio;
  let distance = 1.8;
  for (const x of [-width / 2, width / 2]) {
    for (const z of [-depth / 2, depth / 2]) {
      const corner: Vec3 = [x, 0, z];
      const cornerDepth = dot(corner, direction);
      const horizontalFit = (cornerDepth + Math.abs(
        dot(corner, right) + centerX * tanHorizontalFov * cornerDepth,
      ) / (halfAvailableX * tanHorizontalFov)) / depthRatio;
      const verticalFit = (cornerDepth + Math.abs(
        dot(corner, up) + centerY * tanVerticalFov * cornerDepth,
      ) / (halfAvailableY * tanVerticalFov)) / depthRatio;
      distance = Math.max(distance, horizontalFit, verticalFit);
    }
  }
  const target: Vec3 = [
    center[0] + (right[0] * rightShiftRatio + groundUp[0] * upShiftRatio) * distance,
    center[1],
    center[2] + (right[2] * rightShiftRatio + groundUp[2] * upShiftRatio) * distance,
  ];
  return {
    position: [
      target[0] + direction[0] * distance,
      target[1] + direction[1] * distance,
      target[2] + direction[2] * distance,
    ],
    target,
    fov: PARKING_CAMERA_FOV,
    near: Math.max(0.025, distance / 2000),
    far: Math.max(720, diagonal * 9, distance * 4),
    minDistance: Math.max(0.65, Math.min(2.4, diagonal * 0.035)),
    maxDistance: Math.max(120, distance * 2.8),
    distance,
    insets,
    usableViewport: { width: usableWidth, height: usableHeight },
  };
}
