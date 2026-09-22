import { EXPORURAL_MAP_UNITS_PER_METER } from '../data/exporuralReference2026';
import type { VisitPOI, VisitPoint } from './VisitPOIManager';

export interface VisitVisibilityWorld {
  occluded(from: VisitPoint, to: VisitPoint, ignoreId?: string): boolean;
}

/** Called by the visit controller at 10 Hz, never by React or a scene-wide raycast. */
export class VisitInteractionManager {
  private readonly cells = new Map<string, VisitPOI[]>();
  private readonly cellSize: number;
  private active: VisitPOI | null = null;
  private readonly candidatePoint: VisitPoint = { x: 0, y: 0, z: 0 };
  readonly focusPosition: VisitPoint = { x: 0, y: 0, z: 0 };
  readonly diagnostics = { candidates: 0, visibilityQueries: 0, indexedPOIs: 0 };

  constructor(pois: readonly VisitPOI[], unitsPerMeter = EXPORURAL_MAP_UNITS_PER_METER) {
    this.cellSize = Math.max(0.1, unitsPerMeter * 20);
    this.diagnostics.indexedPOIs = pois.length;
    for (const poi of pois) {
      const radius = poi.interactionRadius;
      const { minX, maxX, minZ, maxZ } = poi.bounds;
      // Expanded footprints admit long facades without scanning distant POIs.
      for (let x = Math.floor((minX - radius) / this.cellSize); x <= Math.floor((maxX + radius) / this.cellSize); x++) {
        for (let z = Math.floor((minZ - radius) / this.cellSize); z <= Math.floor((maxZ + radius) / this.cellSize); z++) {
          const key = `${x}:${z}`;
          const cell = this.cells.get(key);
          if (cell) cell.push(poi); else this.cells.set(key, [poi]);
        }
      }
    }
  }

  reset() { this.active = null; }

  update(origin: VisitPoint, direction: VisitPoint, world: VisitVisibilityWorld): VisitPOI | null {
    const entries = this.cells.get(`${Math.floor(origin.x / this.cellSize)}:${Math.floor(origin.z / this.cellSize)}`);
    this.diagnostics.candidates = entries?.length ?? 0;
    this.diagnostics.visibilityQueries = 0;
    const directionLength = Math.hypot(direction.x, direction.y, direction.z);
    if (!entries || directionLength < 1e-6) { this.active = null; return null; }
    let best: VisitPOI | null = null, bestScore = -Infinity;
    const consider = (poi: VisitPOI, x: number, z: number) => {
      const dx = x - origin.x, dy = poi.position.y - origin.y, dz = z - origin.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance < 0.005 || distance > poi.interactionRadius) return;
      const dot = (dx * direction.x + dy * direction.y + dz * direction.z) / (distance * directionLength);
      // Narrow frontal cone, plus small hysteresis only while still visible.
      if (dot < (this.active?.id === poi.id ? 0.80 : 0.85)) return;
      const score = dot * 4 + (1 - distance / poi.interactionRadius) * 0.65 + poi.priority * 0.08
        + (this.active?.id === poi.id ? 0.06 : 0);
      if (score <= bestScore) return;
      this.candidatePoint.x = x; this.candidatePoint.y = poi.position.y; this.candidatePoint.z = z;
      this.diagnostics.visibilityQueries++;
      if (world.occluded(origin, this.candidatePoint, poi.entity.id)) return;
      bestScore = score; best = poi;
      this.focusPosition.x = x; this.focusPosition.y = poi.position.y; this.focusPosition.z = z;
    };
    for (const poi of entries) {
      const { minX, maxX, minZ, maxZ } = poi.bounds;
      const nearX = Math.max(minX, Math.min(maxX, origin.x));
      const nearZ = Math.max(minZ, Math.min(maxZ, origin.z));
      if (Math.hypot(nearX - origin.x, nearZ - origin.z) > poi.interactionRadius) continue;
      consider(poi, poi.position.x, poi.position.z);
      // Frontage samples allow an edge of a large structure/lot to be visible
      // even when its center is far away or hidden by another structure.
      for (let i = 0; i < poi.footprint.length; i++) {
        const a = poi.footprint[i], b = poi.footprint[(i + 1) % poi.footprint.length];
        const sx = b[0] - a[0], sz = b[1] - a[1], lengthSq = sx * sx + sz * sz;
        if (lengthSq < 1e-10) continue;
        const t = Math.max(0, Math.min(1, ((origin.x - a[0]) * sx + (origin.z - a[1]) * sz) / lengthSq));
        consider(poi, a[0] + sx * t, a[1] + sz * t);
        consider(poi, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      }
    }
    this.active = best;
    return best;
  }
}
