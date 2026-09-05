import { MathUtils, Vector3, type PerspectiveCamera } from 'three';

export interface ContextualViewportInsets { left: number; right: number; top: number; bottom: number }
type ViewportRect = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>;

/** Panels outside the drawing area contribute no inset; overlapping sheets use
 * the largest obstruction rather than adding the same obscured area twice. */
export function resolveContextualViewportInsets(viewport: ViewportRect, panels: ViewportRect[]): ContextualViewportInsets {
  const insets = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const panel of panels) {
    const width = Math.max(0, Math.min(viewport.right, panel.right) - Math.max(viewport.left, panel.left));
    const height = Math.max(0, Math.min(viewport.bottom, panel.bottom) - Math.max(viewport.top, panel.top));
    if (width < 1 || height < 1) continue;
    if (width >= viewport.width * 0.65 && panel.bottom >= viewport.bottom - 24) {
      insets.bottom = Math.max(insets.bottom, viewport.bottom - panel.top);
    } else if (height >= viewport.height * 0.35) {
      if (panel.left <= viewport.left + 24) insets.left = Math.max(insets.left, panel.right - viewport.left);
      else if (panel.right >= viewport.right - 24) insets.right = Math.max(insets.right, viewport.right - panel.left);
    }
  }
  insets.left = MathUtils.clamp(insets.left, 0, viewport.width * 0.6);
  insets.right = MathUtils.clamp(insets.right, 0, viewport.width * 0.6);
  insets.bottom = MathUtils.clamp(insets.bottom, 0, viewport.height * 0.78);
  return insets;
}

export const COMMERCIAL_MAP_OBSTRUCTION_SELECTOR = '[data-commercial-map-camera-obstruction], .commercial-map-details-panel, .commercial-map-contextual-panel';

export function readContextualViewportInsets(canvas: HTMLCanvasElement): ContextualViewportInsets {
  const shell = canvas.closest('.commercial-map-shell') ?? canvas.parentElement;
  const panels = Array.from(shell?.querySelectorAll<HTMLElement>(COMMERCIAL_MAP_OBSTRUCTION_SELECTOR) ?? [])
    .filter((panel) => panel.getClientRects().length > 0 && getComputedStyle(panel).visibility !== 'hidden')
    .map((panel) => panel.getBoundingClientRect());
  return resolveContextualViewportInsets(canvas.getBoundingClientRect(), panels);
}

export interface ContextualCameraViewOffset { x: number; y: number }

export function contextualCameraViewOffset(width: number, height: number, insets: ContextualViewportInsets): ContextualCameraViewOffset {
  return {
    x: width > 0 ? (insets.right - insets.left) / (2 * width) : 0,
    y: height > 0 ? (insets.bottom - insets.top) / (2 * height) : 0,
  };
}

export function readContextualCameraViewOffset(camera: PerspectiveCamera): ContextualCameraViewOffset {
  const view = camera.view;
  return view?.enabled ? { x: view.offsetX / view.fullWidth, y: view.offsetY / view.fullHeight } : { x: 0, y: 0 };
}

export function applyContextualCameraViewOffset(camera: PerspectiveCamera, width: number, height: number, offset: ContextualCameraViewOffset = { x: 0, y: 0 }) {
  if (width <= 0 || height <= 0 || (Math.abs(offset.x) < 1e-8 && Math.abs(offset.y) < 1e-8)) {
    camera.clearViewOffset();
  } else {
    camera.setViewOffset(width, height, offset.x * width, offset.y * height, width, height);
  }
}

/** Fit through the camera frustum instead of displacing the orbit pivot. Target
 * clamps and manual controls can then keep the exact official ground position. */
export function fitCameraAboveContextualPanel(
  position: Vector3,
  target: Vector3,
  width: number,
  height: number,
  insets: ContextualViewportInsets,
  maxDistance = Number.POSITIVE_INFINITY,
) {
  const viewOffset = contextualCameraViewOffset(width, height, insets);
  if (width <= 0 || height <= 0) return { zoom: 1, viewOffset };
  const usableWidth = Math.max(width * 0.22, width - insets.left - insets.right);
  const usableHeight = Math.max(height * 0.22, height - insets.top - insets.bottom);
  const direction = position.clone().sub(target);
  const desiredDistance = direction.length() * Math.max(width / usableWidth, height / usableHeight);
  const distance = Math.min(maxDistance, desiredDistance);
  direction.normalize();
  position.copy(target).addScaledVector(direction, distance);
  // A 78% sheet can need more distance than the safe orbit range permits.
  // Widen projection by the remainder; do not push the camera past that range.
  return { zoom: desiredDistance > 0 ? Math.min(1, distance / desiredDistance) : 1, viewOffset };
}
