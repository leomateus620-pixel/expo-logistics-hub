import type { CommercialLot, MapEntity } from '../types';

/** A dashboard record already resolved against the map's canonical entity and price. */
export interface CommercialMiniMapItem {
  lot: CommercialLot;
  entity: MapEntity;
  value: number | null;
  pavilion?: MapEntity | null;
  blockCode?: string | null;
  areaName?: string;
}

export interface MiniMapOutline {
  id: string;
  label: string;
  kind: 'segment' | 'block' | 'pavilion' | 'support';
  color: string;
  coordinates: readonly (readonly (readonly [number, number])[])[];
}

export interface MiniMapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MiniMapLotGeometry extends CommercialMiniMapItem {
  /** A projected SVG path made from the actual cadastral polygon, including valid holes. */
  path: string;
  labelPoint: readonly [number, number];
  labelWidth: number;
  labelHeight: number;
}

export interface CommercialMiniMapGeometry {
  viewBox: string;
  bounds: MiniMapBounds | null;
  lots: MiniMapLotGeometry[];
  lotsByEntityId: Map<string, MiniMapLotGeometry>;
  outlines: Array<MiniMapOutline & { path: string; labelPoint: readonly [number, number] }>;
  project: (point: Point) => Point;
  scale: number;
}

type ProjectedLot = Pick<MiniMapLotGeometry, 'path' | 'labelPoint' | 'labelWidth' | 'labelHeight'> & { itemIndex: number };
type SpatialProjection = Omit<CommercialMiniMapGeometry, 'lots' | 'lotsByEntityId'> & { lots: ProjectedLot[] };
// Keep only coordinates/projection results, never status, prices or lot records.
// Current dashboard scopes fit here; older geometries are evicted on revision.
const PROJECTION_CACHE_LIMIT = 16;
const projectionCache = new Map<string, SpatialProjection>();

/** Reuses exact projection work across scope remounts and price/status updates.
 * Current commercial records are joined on every call, outside the cache. */
export function getCommercialMiniMapGeometry(
  items: readonly CommercialMiniMapItem[],
  outlines: readonly MiniMapOutline[] = [],
  contentEnvelope?: MiniMapBounds,
): CommercialMiniMapGeometry {
  const key = JSON.stringify([items.map(({ entity, lot }) => [
    entity.id, lot.id, entity.isArchived, lot.archivedAt, lot.entityId,
    entity.geometry, entity.metadata?.labelAnchor,
  ]), outlines, contentEnvelope]);
  let projection = projectionCache.get(key);
  if (!projection) {
    const built = buildCommercialMiniMapGeometry(items, outlines, contentEnvelope);
    let itemIndex = 0;
    const lots = built.lots.map(({ entity, lot, path, labelPoint, labelWidth, labelHeight }) => {
      while (items[itemIndex].entity !== entity || items[itemIndex].lot !== lot) itemIndex += 1;
      return { itemIndex: itemIndex++, path, labelPoint, labelWidth, labelHeight };
    });
    projection = { viewBox: built.viewBox, bounds: built.bounds,
      outlines: built.outlines.map(({ id, label, kind, color, coordinates, path, labelPoint }) => ({ id, label, kind, color, coordinates, path, labelPoint })),
      project: built.project, scale: built.scale, lots };
    projectionCache.set(key, projection);
    if (projectionCache.size > PROJECTION_CACHE_LIMIT) projectionCache.delete(projectionCache.keys().next().value!);
  } else {
    projectionCache.delete(key);
    projectionCache.set(key, projection);
  }
  const lots = projection.lots.map(({ itemIndex, ...shape }) => ({ ...items[itemIndex], ...shape }));
  return { ...projection, lots, lotsByEntityId: new Map(lots.map((lot) => [lot.entity.id, lot])) };
}

/** Size labels against their actual on-screen cell, not the SVG's arbitrary
 * normalized units. Rotation is chosen only when it improves the usable fit. */
export function commercialMiniMapNumberLabel(number: string, width: number, height: number, pixelsPerUnit: number, targetPixels = 11) {
  const inset = 1.5 / pixelsPerUnit;
  const horizontalSize = Math.min((width - inset) / (number.length * .62), height - inset);
  const verticalSize = Math.min((height - inset) / (number.length * .62), width - inset);
  const vertical = verticalSize > horizontalSize * 1.08;
  const along = vertical ? height : width;
  const across = vertical ? width : height;
  const fontSize = Math.max(.5, Math.min(targetPixels / pixelsPerUnit, (along - inset) / (number.length * .62), across - inset));
  return { vertical, fontSize, fontPixels: fontSize * pixelsPerUnit };
}

/** Fits projected geometry and its presentation symbols without changing cadastral coordinates. */
export function buildCommercialMiniMapViewBox(
  geometry: CommercialMiniMapGeometry,
  decorations: readonly MiniMapBounds[] = [],
): string {
  if (!geometry.bounds) return geometry.viewBox;
  const [minX, minY] = geometry.project([geometry.bounds.minX, geometry.bounds.minY]);
  const [maxX, maxY] = geometry.project([geometry.bounds.maxX, geometry.bounds.maxY]);
  const bounds = decorations.reduce((current, decoration) => ({
    minX: Math.min(current.minX, decoration.minX), minY: Math.min(current.minY, decoration.minY),
    maxX: Math.max(current.maxX, decoration.maxX), maxY: Math.max(current.maxY, decoration.maxY),
  }), { minX, minY, maxX, maxY });
  const padding = Math.max(12, Math.min(PADDING, Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.04));
  return [bounds.minX - padding, bounds.minY - padding,
    bounds.maxX - bounds.minX + 2 * padding, bounds.maxY - bounds.minY + 2 * padding]
    .map(formatCoordinate).join(' ');
}

const WIDTH = 1000;
const HEIGHT = 600;
const PADDING = 28;
const VIEW_BOX = `0 0 ${WIDTH} ${HEIGHT}`;
const MIN_POLYGON_AREA = 1e-10;
type Point = readonly [number, number];

export function validDashboardRing(source: unknown): Point[] | null {
  if (!Array.isArray(source)) return null;
  const points: Point[] = [];
  for (const rawPoint of source) {
    if (!Array.isArray(rawPoint) || rawPoint.length < 2) return null;
    const [x, z] = rawPoint;
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    const point: Point = [x, z];
    const previous = points[points.length - 1];
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) points.push(point);
  }
  if (points.length > 1 && points[0][0] === points[points.length - 1][0]
    && points[0][1] === points[points.length - 1][1]) points.pop();
  if (points.length < 3) return null;

  let doubleArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    doubleArea += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(doubleArea) > MIN_POLYGON_AREA ? points : null;
}

function formatCoordinate(value: number): string {
  return String(Number(value.toFixed(4)));
}

function createMiniMapProjection(minX: number, minY: number, offsetX: number, offsetY: number, scale: number) {
  // This closure contains numbers only, so cached projections cannot keep a
  // discarded snapshot's commercial records alive through their scope.
  return ([x, y]: Point): Point => [offsetX + (x - minX) * scale, offsetY + (y - minY) * scale];
}

/**
 * Projects only the supplied lot records. Cadastral X/Z map directly to SVG
 * X/Y, matching the official PDF and the map's vector geometry editor.
 * Invalid polygons are omitted so one damaged record cannot hide the rest.
 */
export function buildCommercialMiniMapGeometry(
  items: readonly CommercialMiniMapItem[],
  outlines: readonly MiniMapOutline[] = [],
  contentEnvelope?: MiniMapBounds,
): CommercialMiniMapGeometry {
  const source: Array<{ item: CommercialMiniMapItem; rings: Point[][] }> = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const item of items) {
    if (item.entity.isArchived || item.lot.archivedAt || item.lot.entityId !== item.entity.id) continue;
    if (item.entity.geometry?.type !== 'Polygon' || !Array.isArray(item.entity.geometry.coordinates)) continue;
    const [outerSource, ...holeSources] = item.entity.geometry.coordinates;
    const outer = validDashboardRing(outerSource);
    if (!outer) continue;
    const rings = [outer];
    for (const holeSource of holeSources) {
      const hole = validDashboardRing(holeSource);
      if (hole) rings.push(hole);
    }
    for (const [x, y] of outer) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    source.push({ item, rings });
  }
  const outlineSource = outlines.flatMap((outline) => {
    const outer = validDashboardRing(outline.coordinates[0]);
    if (!outer) return [];
    for (const [x, y] of outer) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return [{ outline, rings: [outer, ...outline.coordinates.slice(1).flatMap((ring) => {
      const valid = validDashboardRing(ring);
      return valid ? [valid] : [];
    })] }];
  });

  if (!source.length && !outlineSource.length) {
    return { viewBox: VIEW_BOX, bounds: null, lots: [], lotsByEntityId: new Map(), outlines: [], project: (point) => point, scale: 1 };
  }

  // Official circulation/support envelopes affect presentation only. Never
  // exclude a persisted module, even if its current geometry is unmatched.
  if (contentEnvelope) {
    minX = Math.min(minX, contentEnvelope.minX); maxX = Math.max(maxX, contentEnvelope.maxX);
    minY = Math.min(minY, contentEnvelope.minY); maxY = Math.max(maxY, contentEnvelope.maxY);
  }

  const bounds = { minX, minY, maxX, maxY };
  const mapWidth = Math.max(maxX - minX, 1e-10);
  const mapHeight = Math.max(maxY - minY, 1e-10);
  const scale = Math.min((WIDTH - 2 * PADDING) / mapWidth, (HEIGHT - 2 * PADDING) / mapHeight);
  const offsetX = (WIDTH - (maxX - minX) * scale) / 2;
  const offsetY = (HEIGHT - (maxY - minY) * scale) / 2;
  const lots: MiniMapLotGeometry[] = [];
  const lotsByEntityId = new Map<string, MiniMapLotGeometry>();
  const project = createMiniMapProjection(minX, minY, offsetX, offsetY, scale);
  const pathFor = (rings: Point[][]) => rings.map((ring) => {
    const points = ring.map((point) => project(point).map(formatCoordinate).join(' '));
    return `M ${points[0]} L ${points.slice(1).join(' L ')} Z`;
  }).join(' ');
  const center = (ring: Point[]): Point => [
    (Math.min(...ring.map(([x]) => x)) + Math.max(...ring.map(([x]) => x))) / 2,
    (Math.min(...ring.map(([, y]) => y)) + Math.max(...ring.map(([, y]) => y))) / 2,
  ];

  for (const { item, rings } of source) {
    const anchor = item.entity.metadata?.labelAnchor;
    const labelPoint = Array.isArray(anchor) && anchor.length === 2 && anchor.every(Number.isFinite)
      && anchor[0] >= Math.min(...rings[0].map(([x]) => x)) && anchor[0] <= Math.max(...rings[0].map(([x]) => x))
      && anchor[1] >= Math.min(...rings[0].map(([, y]) => y)) && anchor[1] <= Math.max(...rings[0].map(([, y]) => y))
      ? anchor as [number, number] : center(rings[0]);
    const geometry = { ...item, path: pathFor(rings), labelPoint: project(labelPoint),
      labelWidth: (Math.max(...rings[0].map(([x]) => x)) - Math.min(...rings[0].map(([x]) => x))) * scale,
      labelHeight: (Math.max(...rings[0].map(([, y]) => y)) - Math.min(...rings[0].map(([, y]) => y))) * scale,
    };
    lots.push(geometry);
    lotsByEntityId.set(item.entity.id, geometry);
  }

  return { viewBox: VIEW_BOX, bounds, lots, lotsByEntityId, project, scale,
    outlines: outlineSource.map(({ outline, rings }) => ({
      ...outline, path: pathFor(rings), labelPoint: project([center(rings[0])[0], Math.min(...rings[0].map(([, y]) => y))]),
    })),
  };
}
