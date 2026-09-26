import {
  projectCommercialPavilionReferencePoint,
  type CommercialPavilionReferencePoint as Point,
  type CommercialPavilionReferenceRect as Rect,
} from '../data/commercialPavilionReference';
import { PAVILION_DIMENSION_ANNOTATIONS, type DimensionRectReference, type PavilionDimensionAnnotation } from '../data/pavilionDimensionAnnotations';
import { createCommercialPavilionModuleProjectionFrame, type CommercialPavilionModulePlan } from './commercialPavilionModules';

export interface ResolvedPavilionDimension extends PavilionDimensionAnnotation {
  startPoint: Point;
  endPoint: Point;
  label: string;
}
const edge = (rect: Rect, axis: 'x' | 'z', fraction: number) => axis === 'x'
  ? rect.centerX + rect.width * (fraction - 0.5)
  : rect.centerZ + rect.depth * (fraction - 0.5);

/** The only input is geometric plan data. No lots, sale state or pricing. */
export function resolvePavilionDimensions(plan: CommercialPavilionModulePlan, footprint: { width: number; depth: number; outerWidth?: number; outerDepth?: number }): ResolvedPavilionDimension[] {
  const frame = createCommercialPavilionModuleProjectionFrame(plan, footprint);
  const rectFor = (ref: DimensionRectReference): Rect => {
    const result = ref.kind === 'boundary' ? plan.boundary : ref.kind === 'zone'
      ? plan.zones.find(zone => zone.id === ref.id)?.bounds
      : plan.corridors.find(corridor => corridor.id === ref.id);
    if (!result) throw new Error(`Cota: referência inexistente em ${plan.publicIdentifier}: ${JSON.stringify(ref)}`);
    return result;
  };
  return PAVILION_DIMENSION_ANNOTATIONS.filter(item => item.pavilionId === plan.publicIdentifier).map(item => {
    const anchor = item.anchor;
    let start: Point;
    let end: Point;
    if (anchor.kind === 'context') {
      const corridor = rectFor({ kind: 'corridor', id: anchor.corridor });
      // Outside the source-plan left wall, aligned with that existing side.
      const x = edge(plan.boundary, 'x', 0) - corridor.width * 0.8;
      start = [x, edge(corridor, 'z', 0)];
      end = [x, edge(corridor, 'z', 1)];
    } else {
      let from: number;
      let to: number;
      let across: number;
      const axis = anchor.axis;
      const crossAxis = axis === 'x' ? 'z' : 'x';
      if (anchor.kind === 'corridor') {
        const rect = rectFor({ kind: 'corridor', id: anchor.id });
        from = edge(rect, axis, 0); to = edge(rect, axis, 1);
        across = edge(rect, crossAxis, anchor.at ?? 0.5);
      } else if (anchor.kind === 'cell-edge') {
        const cell = plan.cells.find(cell => cell.number === anchor.number);
        if (!cell) throw new Error(`Cota: box ${anchor.number} inexistente em ${plan.publicIdentifier}`);
        from = edge(cell, axis, 0); to = edge(cell, axis, 1);
        across = edge(rectFor({ kind: 'corridor', id: anchor.lane }), crossAxis, 0.5);
      } else {
        const a = rectFor(anchor.from); const b = rectFor(anchor.to);
        from = edge(a, axis, anchor.fromEdge); to = edge(b, axis, anchor.toEdge);
        // Midpoint of the shared extent, not a guessed viewport coordinate.
        across = (Math.max(edge(a, crossAxis, 0), edge(b, crossAxis, 0))
          + Math.min(edge(a, crossAxis, 1), edge(b, crossAxis, 1))) / 2;
      }
      start = axis === 'x' ? [from, across] : [across, from];
      end = axis === 'x' ? [to, across] : [across, to];
    }
    let startPoint = projectCommercialPavilionReferencePoint(start, frame);
    let endPoint = projectCommercialPavilionReferencePoint(end, frame);
    if (anchor.kind === 'context') {
      // Clear the actual simplified shell/slab as well as the plan boundary.
      const corridor = rectFor({ kind: 'corridor', id: anchor.corridor });
      if (frame.coordinateTransform === 'quarter-turn-clockwise' && footprint.outerDepth) {
        const z = -footprint.outerDepth / 2 - corridor.width * frame.depth / 3;
        startPoint = [startPoint[0], z]; endPoint = [endPoint[0], z];
      } else if (footprint.outerWidth) {
        const x = -footprint.outerWidth / 2 - corridor.width * frame.width / 3;
        startPoint = [x, startPoint[1]]; endPoint = [x, endPoint[1]];
      }
    }
    return { ...item, label: item.unit ? `${item.value} ${item.unit}` : item.value, startPoint, endPoint };
  });
}

export interface DimensionScreenRect { left: number; top: number; right: number; bottom: number }
export const dimensionRectsOverlap = (a: DimensionScreenRect, b: DimensionScreenRect, margin = 0) =>
  a.left < b.right + margin && a.right > b.left - margin && a.top < b.bottom + margin && a.bottom > b.top - margin;

/** Fixed CSS-pixel typography, with LOD based on the actual projected modules. */
export function layoutDimensionOnScreen({ dimension, start, end, modulePixels, width, height, obstacles, previouslyVisible = false }: {
  dimension: Pick<ResolvedPavilionDimension, 'type' | 'priority' | 'label'>;
  start: Point; end: Point; modulePixels: number; width: number; height: number;
  obstacles: readonly DimensionScreenRect[]; previouslyVisible?: boolean;
}) {
  const threshold = [0, 0, 9, 24][dimension.priority];
  if (modulePixels < threshold * (previouslyVisible ? 0.88 : 1)) return null;
  const dx = end[0] - start[0]; const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 8) return null;
  let angle = Math.atan2(dy, dx);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  const fontSize = dimension.priority === 3 ? 10.5 : 11.5;
  const textWidth = dimension.label.length * fontSize * 0.56 + 4;
  const textHeight = fontSize + 4;
  const cx = (start[0] + end[0]) / 2; const cy = (start[1] + end[1]) / 2;
  let textBounds: DimensionScreenRect | undefined;
  let textAngle = angle;
  let perpendicular = false;
  const viewportMargin = dimension.type === 'context-label' ? 2 : 6;
  // A narrow aisle can fit text ALONG the aisle while its dimension line
  // crosses it. This keeps distant/mobile labels readable without shrinking.
  for (const rotate of [false, true]) {
    if (rotate && dimension.type === 'context-label') break;
    let candidate = angle + (rotate ? Math.PI / 2 : 0);
    if (candidate > Math.PI / 2) candidate -= Math.PI;
    const halfWidth = (Math.abs(Math.cos(candidate)) * textWidth + Math.abs(Math.sin(candidate)) * textHeight) / 2;
    const halfHeight = (Math.abs(Math.sin(candidate)) * textWidth + Math.abs(Math.cos(candidate)) * textHeight) / 2;
    const bounds = { left: cx - halfWidth, right: cx + halfWidth, top: cy - halfHeight, bottom: cy + halfHeight };
    // No clamping: moving a dimension severs its relationship to geometry.
    if (bounds.left < viewportMargin || bounds.top < viewportMargin || bounds.right > width - viewportMargin || bounds.bottom > height - viewportMargin) continue;
    if (obstacles.some(rect => dimensionRectsOverlap(bounds, rect, 3))) continue;
    textBounds = bounds; textAngle = candidate; perpendicular = rotate; break;
  }
  if (!textBounds) return null;
  const half = Math.max(0, length / 2 - 4);
  const gap = (perpendicular ? textHeight : textWidth) / 2 + 3;
  const path = dimension.type === 'context-label' || half <= gap ? ''
    : `M ${-half} -3 v 6 M ${-half} 0 H ${-gap} M ${gap} 0 H ${half} M ${half} -3 v 6`;
  return { cx, cy, angle: angle * 180 / Math.PI, textRotation: (textAngle - angle) * 180 / Math.PI, fontSize, textBounds, path };
}
