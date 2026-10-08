import { projectCommercialPavilionReferencePoint, type CommercialPavilionReferenceProjectionFrame } from '../data/commercialPavilionReference';
import type { CommercialPavilionModulePlan } from '../utils/commercialPavilionModules';
import type { DashboardLotRecord } from './commercialDashboardTypes';
import { validDashboardRing } from './commercialDashboardGeometry';

type Point = readonly [number, number];
export type DashboardPavilionFrameIssue = 'missing-metadata' | 'duplicate-key' | 'unknown-key'
  | 'incompatible-geometry' | 'inconsistent-translation' | 'insufficient-anchors';
export interface DashboardPavilionFrameAlignment {
  translation: Point | null;
  issue: DashboardPavilionFrameIssue | null;
}

const failed = (issue: DashboardPavilionFrameIssue): DashboardPavilionFrameAlignment => ({ translation: null, issue });
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const center = (ring: readonly Point[]): Point => [
  ring.reduce((sum, [x]) => sum + x, 0) / ring.length,
  ring.reduce((sum, [, z]) => sum + z, 0) / ring.length,
];

function point(value: unknown): Point | null {
  return Array.isArray(value) && value.length === 2 && value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
    ? value as [number, number] : null;
}

function contains(ring: readonly Point[], target: Point, tolerance: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j], [bx, bz] = ring[i];
    const length = Math.hypot(bx - ax, bz - az);
    const along = length ? ((target[0] - ax) * (bx - ax) + (target[1] - az) * (bz - az)) / (length * length) : 0;
    if (distance(target, [ax + Math.max(0, Math.min(1, along)) * (bx - ax), az + Math.max(0, Math.min(1, along)) * (bz - az)]) <= tolerance) return true;
    if ((az > target[1]) !== (bz > target[1]) && target[0] < (bx - ax) * (target[1] - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

/** Polygon comparison allows a different starting vertex/winding, never scale, rotation or cell rearrangement. */
function matchesTranslatedRing(expected: readonly Point[], actual: readonly Point[], delta: Point, tolerance: number): boolean {
  if (expected.length !== actual.length) return false;
  return actual.some((_, start) => [1, -1].some((direction) => expected.every(([x, z], index) => {
    const target = actual[(start + direction * index + actual.length) % actual.length];
    return distance([x + delta[0], z + delta[1]], target) <= tolerance;
  })));
}

/**
 * Reconciles references with the loaded cadastral frame using translation only.
 * Persisted normalized polygons are essential: P13's current central runs and
 * earlier persisted revisions can have different positions under the same key.
 * This function neither projects replacements for lots nor changes their data.
 */
export function reconcileDashboardPavilionFrame({ records, plan, frame, worldCenter, facingRadians }: {
  records: readonly DashboardLotRecord[];
  plan: Pick<CommercialPavilionModulePlan, 'cells' | 'boundary'>;
  frame: CommercialPavilionReferenceProjectionFrame;
  worldCenter: Point;
  facingRadians: number;
}): DashboardPavilionFrameAlignment {
  const diagonal = Math.hypot(frame.width, frame.depth);
  // 0.01% of the frame diagonal, in source world units before SVG rounding.
  const tolerance = Math.max(1e-6, diagonal * 1e-4);
  const normalizedTolerance = 1e-6;
  const cellsByKey = new Map(plan.cells.map((cell) => [cell.id, cell]));
  const seen = new Set<string>();
  const cosine = Math.cos(facingRadians), sine = Math.sin(facingRadians);
  const project = (source: Point): Point => {
    const [x, z] = projectCommercialPavilionReferencePoint(source, frame);
    return [worldCenter[0] + x * cosine + z * sine, worldCenter[1] - x * sine + z * cosine];
  };
  const correspondences: Array<{ expected: Point[]; actual: Point[]; anchor: Point; actualAnchor: Point; delta: Point }> = [];
  const left = plan.boundary.centerX - plan.boundary.width / 2;
  const right = plan.boundary.centerX + plan.boundary.width / 2;
  const top = plan.boundary.centerZ - plan.boundary.depth / 2;
  const bottom = plan.boundary.centerZ + plan.boundary.depth / 2;

  for (const { entity } of records) {
    const key = entity.metadata.pavilionModuleKey;
    if (typeof key !== 'string') return failed('unknown-key');
    const cell = cellsByKey.get(key);
    if (!cell) return failed('unknown-key');
    if (seen.has(key)) return failed('duplicate-key');
    seen.add(key);
    const normalized = validDashboardRing(entity.metadata.normalizedFootprintPolygon);
    const normalizedAnchor = point(entity.metadata.normalizedLabelAnchor);
    const actualAnchor = point(entity.metadata.labelAnchor);
    if (!normalized || !normalizedAnchor || !actualAnchor) return failed('missing-metadata');
    const official = validDashboardRing(cell.shape?.footprint ?? [
      [cell.centerX - cell.width / 2, cell.centerZ - cell.depth / 2],
      [cell.centerX + cell.width / 2, cell.centerZ - cell.depth / 2],
      [cell.centerX + cell.width / 2, cell.centerZ + cell.depth / 2],
      [cell.centerX - cell.width / 2, cell.centerZ + cell.depth / 2],
    ]);
    if (!official) return failed('incompatible-geometry');
    const officialCenter = center(official), normalizedCenter = center(normalized);
    const localRevisionDelta: Point = [normalizedCenter[0] - officialCenter[0], normalizedCenter[1] - officialCenter[1]];
    const officialAnchor: Point = cell.labelAnchor ?? [cell.centerX, cell.centerZ];
    // A persisted revision may relocate a cell (P13 central runs), but its exact
    // key must retain the official shape, orientation and relative label anchor.
    if (!matchesTranslatedRing(official, normalized, localRevisionDelta, normalizedTolerance)
      || distance([officialAnchor[0] + localRevisionDelta[0], officialAnchor[1] + localRevisionDelta[1]], normalizedAnchor) > normalizedTolerance) {
      return failed('incompatible-geometry');
    }
    const actual = validDashboardRing(entity.geometry?.coordinates[0]);
    if (!actual || normalized.some(([x, z]) => x < left - normalizedTolerance || x > right + normalizedTolerance
      || z < top - normalizedTolerance || z > bottom + normalizedTolerance)
      || !contains(normalized, normalizedAnchor, normalizedTolerance) || !contains(actual, actualAnchor, tolerance)) {
      return failed('incompatible-geometry');
    }
    const expected = normalized.map(project);
    const expectedCenter = center(expected), actualCenter = center(actual);
    const delta: Point = [actualCenter[0] - expectedCenter[0], actualCenter[1] - expectedCenter[1]];
    const anchor = project(normalizedAnchor);
    if (!matchesTranslatedRing(expected, actual, delta, tolerance)
      || distance([anchor[0] + delta[0], anchor[1] + delta[1]], actualAnchor) > tolerance) {
      return failed('incompatible-geometry');
    }
    correspondences.push({ expected, actual, anchor, actualAnchor, delta });
  }

  if (correspondences.length < 3) return failed('insufficient-anchors');
  const anchors = correspondences.map(({ anchor }) => anchor);
  const spanX = Math.max(...anchors.map(([x]) => x)) - Math.min(...anchors.map(([x]) => x));
  const spanZ = Math.max(...anchors.map(([, z]) => z)) - Math.min(...anchors.map(([, z]) => z));
  const first = anchors[0];
  const farthest = anchors.reduce((selected, candidate) => distance(first, candidate) > distance(first, selected) ? candidate : selected, first);
  const nonCollinear = anchors.some(([x, z]) => Math.abs((farthest[0] - first[0]) * (z - first[1])
    - (farthest[1] - first[1]) * (x - first[0])) > tolerance * diagonal);
  if (spanX < frame.width * .2 || spanZ < frame.depth * .2 || !nonCollinear) return failed('insufficient-anchors');
  const delta = center(correspondences.map((item) => item.delta));
  if (correspondences.some(({ expected, actual, anchor, actualAnchor }) => !matchesTranslatedRing(expected, actual, delta, tolerance)
    || distance([anchor[0] + delta[0], anchor[1] + delta[1]], actualAnchor) > tolerance)) {
    return failed('inconsistent-translation');
  }
  return { translation: distance(delta, [0, 0]) <= tolerance ? [0, 0] : delta, issue: null };
}
