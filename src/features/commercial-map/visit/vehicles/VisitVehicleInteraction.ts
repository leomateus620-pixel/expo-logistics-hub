import { EXPORURAL_MAP_UNITS_PER_METER } from '../../data/exporuralReference2026';
import { strategicLandmarkVisualHeight } from '../../utils/landmarks';
import { VisitSpatialIndex, visitPointInRing } from '../VisitSpatialIndex';
import type { VisitPOI, VisitPoint } from '../VisitPOIManager';

interface IndexedPOI {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  poi: VisitPOI;
}

export interface VisitVehiclePickingWorld {
  occluded(from: VisitPoint, to: VisitPoint, ignoreId?: string): boolean;
}

/** Click/tap only. The visit POI snapshot is also the authorized card snapshot. */
export class VisitVehicleInteraction {
  private readonly index: VisitSpatialIndex<IndexedPOI>;
  private readonly candidates: IndexedPOI[] = [];
  private readonly seen = new Set<VisitPOI>();
  private readonly endpoint: VisitPoint = { x: 0, y: 0, z: 0 };
  private readonly unitsPerMeter: number;
  readonly focusPosition: VisitPoint = { x: 0, y: 0, z: 0 };
  readonly diagnostics = { candidates: 0, intersectionQueries: 0, visibilityQueries: 0 };

  constructor(pois: readonly VisitPOI[], unitsPerMeter = EXPORURAL_MAP_UNITS_PER_METER) {
    this.unitsPerMeter = Number.isFinite(unitsPerMeter) && unitsPerMeter > 0 ? unitsPerMeter : EXPORURAL_MAP_UNITS_PER_METER;
    const cellSize = Math.max(0.5, this.unitsPerMeter * 20);
    this.index = new VisitSpatialIndex(pois.map(poi => ({ ...poi.bounds, poi })), cellSize);
  }

  /** `direction` is the camera's world-space pointer ray, not the vehicle heading. */
  pick(origin: VisitPoint, direction: VisitPoint, world: VisitVehiclePickingWorld, maxDistance = 200): VisitPOI | null {
    this.diagnostics.candidates = 0;
    this.diagnostics.intersectionQueries = 0;
    this.diagnostics.visibilityQueries = 0;
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z)
      || !Number.isFinite(length) || length < 1e-8 || !Number.isFinite(maxDistance) || maxDistance <= 0) return null;
    const dx = direction.x / length, dy = direction.y / length, dz = direction.z / length;
    const distance = Math.min(maxDistance, 200);
    this.seen.clear();
    // March the pointer ray through short indexed corridors. A diagonal view
    // never requests the whole park-sized bounding rectangle.
    const horizontal = Math.hypot(dx, dz);
    const segmentLength = horizontal < 1e-8 ? distance : Math.min(distance, this.index.cellSize * 2 / horizontal);
    let best: VisitPOI | null = null, bestDistance = distance;
    for (let start = 0; start < bestDistance; start += segmentLength) {
      const end = Math.min(distance, start + segmentLength);
      const x0 = origin.x + dx * start, z0 = origin.z + dz * start;
      const x1 = origin.x + dx * end, z1 = origin.z + dz * end;
      this.index.query(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), this.candidates);
      for (const candidate of this.candidates) {
        const poi = candidate.poi;
        if (this.seen.has(poi)) continue;
        this.seen.add(poi);
        this.diagnostics.candidates++;
        this.diagnostics.intersectionQueries++;
        const entity = poi.entity;
        const baseY = poi.lot
          ? Math.max(entity.geometry.elevation, poi.position.y - 1.25 * this.unitsPerMeter)
          : entity.geometry.elevation;
        const authoredHeight = Number.isFinite(entity.geometry.extrusionHeight) ? entity.geometry.extrusionHeight : 0;
        const topY = poi.lot
          ? baseY + Math.max(0.025, Math.min(authoredHeight, 0.08))
          : baseY + Math.max(0.025, authoredHeight, strategicLandmarkVisualHeight(entity) ?? 0);
        const t = intersectExtrudedFootprint(origin, dx, dy, dz, baseY, topY, poi, bestDistance);
        if (t === null) continue;
        this.endpoint.x = origin.x + dx * t;
        this.endpoint.y = origin.y + dy * t;
        this.endpoint.z = origin.z + dz * t;
        // End just before the face so its own wall/ground does not mask a hit.
        const visibleT = Math.max(0, t - 0.003);
        const visibleEndpoint = { x: origin.x + dx * visibleT, y: origin.y + dy * visibleT, z: origin.z + dz * visibleT };
        this.diagnostics.visibilityQueries++;
        if (world.occluded(origin, visibleEndpoint, entity.id)) continue;
        bestDistance = t;
        best = poi;
        this.focusPosition.x = this.endpoint.x;
        this.focusPosition.y = this.endpoint.y;
        this.focusPosition.z = this.endpoint.z;
      }
    }
    return best;
  }
}

function footprintContains(poi: VisitPOI, x: number, z: number) {
  if (!visitPointInRing(x, z, poi.footprint)) return false;
  for (const hole of poi.entity.geometry.coordinates.slice(1)) {
    if (hole.length >= 3 && visitPointInRing(x, z, hole)) return false;
  }
  return true;
}

function intersectExtrudedFootprint(origin: VisitPoint, dx: number, dy: number, dz: number,
  baseY: number, topY: number, poi: VisitPOI, maxDistance: number): number | null {
  let nearest = maxDistance;
  let found = false;
  if (Math.abs(dy) > 1e-8) {
    const capT = (topY - origin.y) / dy;
    if (capT >= 0 && capT < nearest) {
      const x = origin.x + dx * capT, z = origin.z + dz * capT;
      if (footprintContains(poi, x, z)) { nearest = capT; found = true; }
    }
  }
  // Vertical facade intersections make structures selectable from a cart.
  if (Math.hypot(dx, dz) < 1e-8) return found ? nearest : null;
  for (const ring of poi.entity.geometry.coordinates) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const determinant = dx * ez - dz * ex;
      if (Math.abs(determinant) < 1e-10) continue;
      const ox = a[0] - origin.x, oz = a[1] - origin.z;
      const t = (ox * ez - oz * ex) / determinant;
      const u = (ox * dz - oz * dx) / determinant;
      if (t < 0 || t >= nearest || u < 0 || u > 1) continue;
      const y = origin.y + dy * t;
      if (y < baseY - 0.005 || y > topY + 0.005) continue;
      nearest = t;
      found = true;
    }
  }
  return found ? nearest : null;
}
