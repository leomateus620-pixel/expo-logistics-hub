import { Matrix4, type Camera } from 'three';

export interface PublicLabelRect { x0: number; y0: number; x1: number; y1: number }

const COLLISION_GAP = 3;
const PASSES = ['selectedLot', 'companies', 'lots', 'orientation'] as const;
type Pass = typeof PASSES[number];
type RunPass = (layout: PublicMapLabelLayout) => void;

export function publicLabelRectsOverlap(a: PublicLabelRect, b: PublicLabelRect) {
  return a.x0 < b.x1 + COLLISION_GAP && a.x1 + COLLISION_GAP > b.x0
    && a.y0 < b.y1 + COLLISION_GAP && a.y1 + COLLISION_GAP > b.y0;
}

/** The active public layers share one CSS-pixel layout after CameraRig runs. */
export class PublicMapLabelLayout {
  readonly projection = new Matrix4();
  readonly inverseProjection = new Matrix4();
  readonly detailedLots = new Map<string, PublicLabelRect>();
  width = 0;
  height = 0;
  private readonly nextProjection = new Matrix4();
  private readonly occupied: PublicLabelRect[] = [];
  private readonly passes = new Map<Pass, RunPass>();
  private dirty = true;

  register(pass: Pass, run: RunPass) {
    this.passes.set(pass, run);
    this.dirty = true;
    return () => {
      if (this.passes.get(pass) !== run) return;
      this.passes.delete(pass);
      this.dirty = true;
    };
  }

  reserve(rect: PublicLabelRect) { this.occupied.push(rect); }

  isOccupied(rect: PublicLabelRect) {
    return this.occupied.some(other => publicLabelRectsOverlap(rect, other));
  }

  coversDetailedLot(rect: PublicLabelRect, entityIds: readonly string[]) {
    return entityIds.some(id => {
      const detail = this.detailedLots.get(id);
      return detail && publicLabelRectsOverlap(rect, detail);
    });
  }

  update(camera: Camera, width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    camera.updateMatrixWorld();
    this.nextProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (!this.dirty && width === this.width && height === this.height && this.projection.equals(this.nextProjection)) return;
    this.dirty = false;
    this.projection.copy(this.nextProjection);
    this.inverseProjection.copy(this.projection).invert();
    this.width = width;
    this.height = height;
    this.occupied.length = 0;
    this.detailedLots.clear();
    for (const pass of PASSES) this.passes.get(pass)?.(this);
  }
}
