import type { CommercialLot, MapEntity } from '../types';

/** A dashboard record already resolved against the map's canonical entity and price. */
export interface CommercialMiniMapItem {
  lot: CommercialLot;
  entity: MapEntity;
  value: number | null;
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
}

export interface CommercialMiniMapGeometry {
  viewBox: string;
  bounds: MiniMapBounds | null;
  lots: MiniMapLotGeometry[];
  lotsByEntityId: Map<string, MiniMapLotGeometry>;
}

const WIDTH = 1000;
const HEIGHT = 600;
const PADDING = 28;
const VIEW_BOX = `0 0 ${WIDTH} ${HEIGHT}`;
const MIN_POLYGON_AREA = 1e-10;
type Point = readonly [number, number];

function validRing(source: unknown): Point[] | null {
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

/**
 * Projects only the supplied lot records. Cadastral X/Z map directly to SVG
 * X/Y, matching the official PDF and the map's vector geometry editor.
 * Invalid polygons are omitted so one damaged record cannot hide the rest.
 */
export function buildCommercialMiniMapGeometry(items: readonly CommercialMiniMapItem[]): CommercialMiniMapGeometry {
  const source: Array<{ item: CommercialMiniMapItem; rings: Point[][] }> = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const item of items) {
    if (item.entity.isArchived || item.lot.archivedAt || item.lot.entityId !== item.entity.id) continue;
    if (item.entity.geometry?.type !== 'Polygon' || !Array.isArray(item.entity.geometry.coordinates)) continue;
    const [outerSource, ...holeSources] = item.entity.geometry.coordinates;
    const outer = validRing(outerSource);
    if (!outer) continue;
    const rings = [outer];
    for (const holeSource of holeSources) {
      const hole = validRing(holeSource);
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

  if (source.length === 0) {
    return { viewBox: VIEW_BOX, bounds: null, lots: [], lotsByEntityId: new Map() };
  }

  const bounds = { minX, minY, maxX, maxY };
  const mapWidth = Math.max(maxX - minX, 1e-10);
  const mapHeight = Math.max(maxY - minY, 1e-10);
  const scale = Math.min((WIDTH - 2 * PADDING) / mapWidth, (HEIGHT - 2 * PADDING) / mapHeight);
  const offsetX = (WIDTH - (maxX - minX) * scale) / 2;
  const offsetY = (HEIGHT - (maxY - minY) * scale) / 2;
  const lots: MiniMapLotGeometry[] = [];
  const lotsByEntityId = new Map<string, MiniMapLotGeometry>();

  for (const { item, rings } of source) {
    const path = rings.map((ring) => {
      const points = ring.map(([x, y]) => `${formatCoordinate(offsetX + (x - minX) * scale)} ${formatCoordinate(offsetY + (y - minY) * scale)}`);
      return `M ${points[0]} L ${points.slice(1).join(' L ')} Z`;
    }).join(' ');
    const geometry = { ...item, path };
    lots.push(geometry);
    lotsByEntityId.set(item.entity.id, geometry);
  }

  return { viewBox: VIEW_BOX, bounds, lots, lotsByEntityId };
}
