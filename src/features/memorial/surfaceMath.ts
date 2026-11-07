export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface SurfaceView extends Point { scale: number }
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Geometry lives in content coordinates, never transformed DOM/scroll bounds. */
export function galleryLayout(viewport: Size, count = 26) {
  const mobile = viewport.width < 760 || (viewport.width < 1000 && viewport.height < 420);
  const cellWidth = 164, cellHeight = 182, padding = 24;
  const sizeFor = (columns: number) => ({ width: columns * cellWidth + padding * 2, height: Math.ceil(count / columns) * cellHeight + padding * 2 });
  const fitFor = (columns: number) => {
    const size = sizeFor(columns);
    return Math.min(viewport.width / size.width, viewport.height / size.height);
  };
  const columns = mobile ? (viewport.width >= 600 ? 5 : viewport.width >= 350 ? 3 : 2) : [6, 7, 8].reduce((best, n) => fitFor(n) > fitFor(best) + .001 ? n : best, 6);
  const size = sizeFor(columns);
  const fit = Math.max(.05, fitFor(columns));
  const initial = mobile ? viewport.width / size.width : fit;
  const cells = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = row % 2 ? columns - 1 - index % columns : index % columns;
    return { x: padding + column * cellWidth, y: padding + row * cellHeight };
  });
  return { ...size, columns, cells, cellWidth, cellHeight, initial, min: fit, max: Math.max(initial * 4, 2.5) };
}

export function boundView(view: SurfaceView, viewport: Size, content: Size): SurfaceView {
  const bound = (offset: number, available: number, extent: number) => extent <= available ? (available - extent) / 2 : clamp(offset, available - extent, 0);
  return { ...view, x: bound(view.x, viewport.width, content.width * view.scale), y: bound(view.y, viewport.height, content.height * view.scale) };
}
export function zoomAt(view: SurfaceView, factor: number, anchor: Point, min: number, max: number): SurfaceView {
  const scale = clamp(view.scale * factor, min, max), ratio = scale / view.scale;
  return { scale, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio };
}
export interface GesturePoint extends Point { id: number; pan?: boolean }
export interface GestureDelta { dx: number; dy: number; factor: number; anchor: Point; pan: boolean }

/** Rebase on EVERY pointer-count change: 1→2→1 cannot reuse a stale centroid. */
export class PointerGesture {
  points = new Map<number, GesturePoint>();
  private baseline?: { center: Point; distance: number };
  moved = false;
  private travel = 0;
  private sample() {
    const [a, b] = [...this.points.values()];
    if (!a) return undefined;
    return b ? { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) }
      : { center: { x: a.x, y: a.y }, distance: 0 };
  }
  down(point: GesturePoint) {
    if (!this.points.size) { this.moved = false; this.travel = 0; }
    this.points.set(point.id, point); this.baseline = this.sample();
    if (this.points.size > 1) this.moved = true;
  }
  move(point: GesturePoint): GestureDelta | undefined {
    const old = this.points.get(point.id);
    if (!old || !this.baseline) return;
    this.points.set(point.id, { ...point, pan: old.pan });
    const next = this.sample()!;
    const dx = next.center.x - this.baseline.center.x, dy = next.center.y - this.baseline.center.y;
    this.travel += Math.hypot(dx, dy);
    if (this.travel > 5) this.moved = true;
    const result = { dx, dy, factor: this.baseline.distance > 0 && next.distance > 0 ? next.distance / this.baseline.distance : 1,
      anchor: this.baseline.center, pan: this.points.size > 1 || Boolean(old.pan) };
    this.baseline = next;
    return this.moved ? result : undefined;
  }
  up(id: number) { this.points.delete(id); this.baseline = this.sample(); }
  cancel() { this.points.clear(); this.baseline = undefined; }
}
