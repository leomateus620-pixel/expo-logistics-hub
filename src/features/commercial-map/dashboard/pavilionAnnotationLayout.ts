import polygonClipping from 'polygon-clipping';
import { buildCommercialMiniMapViewBox, type CommercialMiniMapGeometry, type MiniMapBounds } from './commercialDashboardGeometry';
import { buildOccupancyVisualScopes, occupancyLotList, OCCUPANCY_STATE_LABEL, summarizeOccupancyState, type OccupancyGroup } from './pavilionOccupancy';

export type AnnotationPoint = [number, number];
export interface AnnotationCluster { rings: AnnotationPoint[][]; path: string; anchor: AnnotationPoint; route: AnnotationPoint[] | null; branches: AnnotationPoint[][]; anchors: AnnotationPoint[] }
export interface PavilionAnnotation {
  id: string; group: OccupancyGroup; clusters: AnnotationCluster[];
  scopeId: string; scopeKind: 'CONTRACT' | 'ORDER' | 'REVIEW'; scopeMarker: string; scopeLabel: string | null; scopeLotIds: string[];
  label: (MiniMapBounds & { lines: string[]; lotLine: string; stateLine: string; referenceLine: string | null }) | null;
}
export interface PavilionAnnotationLayout { annotations: PavilionAnnotation[]; viewBox: string; hiddenLabels: number }
const spatialCache = new WeakMap<CommercialMiniMapGeometry, WeakMap<readonly OccupancyGroup[], {
  annotations: PavilionAnnotation[]; members: Map<string, CommercialMiniMapGeometry['lots']>;
}>>();
const round = (v: number) => Math.round(v * 10000) / 10000;
export const annotationPath = (rings: readonly (readonly AnnotationPoint[])[]) => rings.map(ring => `M ${ring.map(p => p.join(' ')).join(' L ')} Z`).join(' ');
export const annotationLine = (points: readonly AnnotationPoint[]) => `M ${points.map(p => p.join(' ')).join(' L ')}`;
function bounds(ring: readonly AnnotationPoint[]): MiniMapBounds {
  return { minX: Math.min(...ring.map(p => p[0])), maxX: Math.max(...ring.map(p => p[0])),
    minY: Math.min(...ring.map(p => p[1])), maxY: Math.max(...ring.map(p => p[1])) };
}
function wrapName(name: string, limit: number): string[] {
  const normalized = name.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= limit) return [normalized];
  const wordEnd = normalized.lastIndexOf(' ', limit);
  const cut = wordEnd > limit * .4 ? wordEnd : limit;
  const rest = normalized.slice(cut).trim();
  return [normalized.slice(0, cut), rest.length > limit ? `${rest.slice(0, limit - 1)}…` : rest];
}

/** Orthogonal visibility grid in SVG coordinates. Edges never cross a lot's
 * bounding rectangle. This deliberately prefers omitting an unreachable leader
 * to drawing one through a number or suggesting a false association. */
export function routeAnnotation(start: AnnotationPoint, end: AnnotationPoint, obstacles: readonly MiniMapBounds[], clearance = .8): AnnotationPoint[] | null {
  const xs = [...new Set([start[0], end[0], ...obstacles.flatMap(b => [round(b.minX - clearance), round(b.maxX + clearance)])])].sort((a, b) => a - b);
  const ys = [...new Set([start[1], end[1], ...obstacles.flatMap(b => [round(b.minY - clearance), round(b.maxY + clearance)])])].sort((a, b) => a - b);
  const w = xs.length, h = ys.length, n = w * h;
  if (n > 60_000) return null;
  const xIndex = new Map(xs.map((x, i) => [x, i])), yIndex = new Map(ys.map((y, i) => [y, i]));
  const blocked = new Uint8Array(n), horizontal = new Uint8Array(n), vertical = new Uint8Array(n);
  for (const b of obstacles) {
    const x1 = xIndex.get(round(b.minX - clearance))!, x2 = xIndex.get(round(b.maxX + clearance))!;
    const y1 = yIndex.get(round(b.minY - clearance))!, y2 = yIndex.get(round(b.maxY + clearance))!;
    for (let y = y1 + 1; y < y2; y++) for (let x = x1; x < x2; x++) horizontal[y * w + x] = 1;
    for (let x = x1 + 1; x < x2; x++) for (let y = y1; y < y2; y++) vertical[y * w + x] = 1;
    for (let y = y1 + 1; y < y2; y++) for (let x = x1 + 1; x < x2; x++) blocked[y * w + x] = 1;
  }
  const from = yIndex.get(start[1])! * w + xIndex.get(start[0])!, to = yIndex.get(end[1])! * w + xIndex.get(end[0])!;
  if (blocked[from] || blocked[to]) return null;
  const distance = new Float64Array(n).fill(Infinity), previous = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
  const heap: Array<{ id: number; score: number }> = [];
  const push = (id: number, score: number) => {
    let i = heap.length; heap.push({ id, score });
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p].score <= score) break; heap[i] = heap[p]; i = p; }
    heap[i] = { id, score };
  };
  const pop = () => {
    const first = heap[0], last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (2 * i + 1 < heap.length) {
        let child = 2 * i + 1;
        if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
        if (heap[child].score >= last.score) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = last;
    }
    return first.id;
  };
  distance[from] = 0; push(from, 0);
  while (heap.length) {
    const current = pop();
    if (closed[current]) continue;
    if (current === to) {
      const points: AnnotationPoint[] = [];
      for (let id = to; id !== -1; id = previous[id]) points.push([xs[id % w], ys[Math.floor(id / w)]]);
      points.reverse();
      return points.filter((p, i) => !i || i === points.length - 1 || !(
        (points[i - 1][0] === p[0] && points[i + 1][0] === p[0]) || (points[i - 1][1] === p[1] && points[i + 1][1] === p[1])));
    }
    closed[current] = 1;
    const x = current % w, y = Math.floor(current / w);
    const neighbors = [x > 0 && !horizontal[current - 1] ? current - 1 : -1,
      x < w - 1 && !horizontal[current] ? current + 1 : -1,
      y > 0 && !vertical[current - w] ? current - w : -1, y < h - 1 && !vertical[current] ? current + w : -1];
    for (const next of neighbors) {
      if (next < 0 || blocked[next] || closed[next]) continue;
      const nx = next % w, ny = Math.floor(next / w);
      const turn = previous[current] >= 0 && ((previous[current] % w === x) !== (nx === x)) ? 6 : 0;
      const cost = distance[current] + Math.abs(xs[nx] - xs[x]) + Math.abs(ys[ny] - ys[y]) + turn;
      if (cost >= distance[next]) continue;
      distance[next] = cost; previous[next] = current;
      push(next, cost + Math.abs(xs[nx] - end[0]) + Math.abs(ys[ny] - end[1]));
    }
  }
  return null;
}

function overlaps(a: MiniMapBounds, b: MiniMapBounds, gap = 0) {
  return a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minY < b.maxY + gap && a.maxY > b.minY - gap;
}
function edgeAnchors(ring: AnnotationPoint[]) {
  const area = ring.slice(0, -1).reduce((sum, a, i) => sum + a[0] * ring[i + 1][1] - ring[i + 1][0] * a[1], 0);
  return ring.slice(0, -1).flatMap((a, i) => {
    const b = ring[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < 1) return [];
    const anchor: AnnotationPoint = [round((a[0] + b[0]) / 2), round((a[1] + b[1]) / 2)];
    const direction = area > 0 ? 1 : -1;
    return [{ anchor, outward: [direction * dy / length, -direction * dx / length] as AnnotationPoint }];
  });
}

/** Labels occupy nearby empty floor first. Disconnected spatial sets repeat the
 * same company marker locally, avoiding a remote label with long crossing lines.
 * Each local tree has one trunk, a shared bus and a branch to every actual lot. */
export function buildPavilionAnnotationLayout(geometry: CommercialMiniMapGeometry, groups: readonly OccupancyGroup[], selectedId: string | null = null, maxLabels = 8, reservedBounds: readonly MiniMapBounds[] = [], selectedScopeId: string | null = null): PavilionAnnotationLayout {
  if (!geometry.bounds || !groups.length) return { annotations: [], viewBox: buildCommercialMiniMapViewBox(geometry), hiddenLabels: 0 };
  const [x1, y1] = geometry.project([geometry.bounds.minX, geometry.bounds.minY]);
  const [x2, y2] = geometry.project([geometry.bounds.maxX, geometry.bounds.maxY]);
  const floor: MiniMapBounds = { minX: x1, minY: y1, maxX: x2, maxY: y2 };
  const lotObstacles = geometry.lots.map(l => bounds(l.entity.geometry.coordinates[0].map(p => geometry.project(p).map(round) as AnnotationPoint)));
  const obstacles = [...lotObstacles, ...reservedBounds, ...geometry.outlines.filter(o => o.kind === 'support').map(o => bounds(o.coordinates[0].map(p => geometry.project(p) as AnnotationPoint)))];
  let cache = spatialCache.get(geometry);
  if (!cache) { cache = new WeakMap(); spatialCache.set(geometry, cache); }
  let spatial = cache.get(groups);
  if (!spatial) {
    const annotations: PavilionAnnotation[] = [];
    const members = new Map<string, typeof geometry.lots>();
    for (const scope of buildOccupancyVisualScopes(groups)) {
      const group = scope.group;
      const lots = scope.items.flatMap(item => { const lot = geometry.lotsByEntityId.get(item.entityId); return lot ? [lot] : []; });
      if (!lots.length) continue;
      const polygons = lots.map(l => l.entity.geometry.coordinates.map(ring => ring.map(p => geometry.project(p).map(round) as AnnotationPoint)));
      const union = polygonClipping.union(polygons[0], ...polygons.slice(1));
      union.forEach((rings, index) => {
        const id = `${scope.id}:spatial:${index}`;
        const ownLots = lots.filter((_, lotIndex) => polygonClipping.intersection(polygons[lotIndex], rings).length > 0);
        const box = bounds(rings[0]);
        const cluster: AnnotationCluster = { rings, path: annotationPath(rings), anchor: [(box.minX + box.maxX) / 2, box.minY], route: null, branches: [], anchors: [] };
        annotations.push({ id, group, clusters: [cluster], label: null, scopeId: scope.id, scopeKind: scope.kind,
          scopeMarker: scope.marker, scopeLabel: scope.label, scopeLotIds: scope.items.map(item => item.lotId) });
        members.set(id, ownLots);
      });
    }
    spatial = { annotations, members }; cache.set(groups, spatial);
  }
  const members = spatial.members;
  const annotations = spatial.annotations.map(a => ({ ...a, clusters: a.clusters.map(c => ({ ...c, branches: [], anchors: [], route: null })) }));
  const priority = [...annotations].sort((a, b) => Number(b.scopeId === selectedScopeId) - Number(a.scopeId === selectedScopeId)
    || Number(b.group.id === selectedId) - Number(a.group.id === selectedId)
    || (members.get(b.id)?.length ?? 0) - (members.get(a.id)?.length ?? 0) || a.group.marker - b.group.marker).slice(0, maxLabels);
  const labelWidth = Math.max(126, Math.min(146, (x2 - x1) * .23)), gap = 11;
  const placed: MiniMapBounds[] = [];
  for (const entry of priority) {
    const nameLines = wrapName(entry.group.name, Math.floor((labelWidth - 28) / 6.3));
    const labelHeight = 39 + (nameLines.length - 1) * 9 + (entry.scopeLabel ? 7 : 0);
    const box = bounds(entry.clusters[0].rings[0]);
    const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
    const xs = [...new Set([cx - labelWidth / 2, box.minX, box.maxX - labelWidth, ...obstacles.flatMap(b => [b.minX - labelWidth - gap, b.maxX + gap])])];
    const ys = [...new Set([cy - labelHeight / 2, box.minY - labelHeight - gap, box.maxY + gap, ...obstacles.flatMap(b => [b.minY - labelHeight - gap, b.maxY + gap])])];
    let best: MiniMapBounds | null = null, score = Infinity;
    for (const x of xs) for (const y of ys) {
      const candidate = { minX: x, maxX: x + labelWidth, minY: y, maxY: y + labelHeight };
      if (obstacles.some(b => overlaps(candidate, b, 4)) || placed.some(b => overlaps(candidate, b, gap))) continue;
      const outside = Math.max(0, floor.minX - x) + Math.max(0, candidate.maxX - floor.maxX)
        + Math.max(0, floor.minY - y) + Math.max(0, candidate.maxY - floor.maxY);
      const distance = Math.hypot(x + labelWidth / 2 - cx, y + labelHeight / 2 - cy);
      // Proximity wins over staying inside a narrow pavilion: a nearby free
      // margin is preferable to a distant label at the opposite end of a plan.
      const current = distance + outside * .35;
      if (current < score) { score = current; best = candidate; }
    }
    if (!best) continue;
    const ownLots = members.get(entry.id) ?? [];
    const ownIds = new Set(ownLots.map(l => l.lot.id));
    const items = entry.group.items.filter(item => ownIds.has(item.lotId));
    const state = items.length ? summarizeOccupancyState(items) : entry.group.state;
    const short = (line: string, unitWidth: number) => {
      const limit = Math.floor((labelWidth - 20) / unitWidth);
      return line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
    };
    entry.label = { ...best, lines: nameLines, lotLine: short(occupancyLotList(items, 5), 3.9), referenceLine: entry.scopeLabel ? short(entry.scopeLabel, 4.1) : null,
      stateLine: short(`${items.length}${items.length < entry.scopeLotIds.length ? ` de ${entry.scopeLotIds.length}` : ''} ${entry.scopeLotIds.length === 1 ? 'lote' : 'lotes'} · ${state === 'MIXED' ? 'Situações distintas' : OCCUPANCY_STATE_LABEL[state]}`, 3.5) };
    placed.push(best);
  }
  for (const entry of priority) {
    const label = entry.label;
    if (!label) continue;
    const cluster = entry.clusters[0], box = bounds(cluster.rings[0]);
    const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
    const lx = (label.minX + label.maxX) / 2, ly = (label.minY + label.maxY) / 2;
    const vertical = label.maxY <= box.minY || label.minY >= box.maxY;
    const sign = vertical ? ly < cy ? -1 : 1 : lx < cx ? -1 : 1;
    const hub: AnnotationPoint = vertical ? [cx, sign < 0 ? box.minY - 5 : box.maxY + 5] : [sign < 0 ? box.minX - 5 : box.maxX + 5, cy];
    const start: AnnotationPoint = vertical ? [Math.max(label.minX + 8, Math.min(label.maxX - 8, cx)), sign < 0 ? label.maxY : label.minY]
      : [sign < 0 ? label.maxX : label.minX, Math.max(label.minY + 8, Math.min(label.maxY - 8, cy))];
    const allObstacles = [...obstacles, ...placed.filter(b => b !== label && (b.minX !== label.minX || b.minY !== label.minY))];
    cluster.route = routeAnnotation(start, hub, allObstacles, 0);
    // If another row obstructs the ideal bus, use an exposed perimeter midpoint.
    if (!cluster.route) {
      for (const candidate of edgeAnchors(cluster.rings[0]).sort((a, b) => Math.hypot(a.anchor[0] - lx, a.anchor[1] - ly) - Math.hypot(b.anchor[0] - lx, b.anchor[1] - ly))) {
        const alternate: AnnotationPoint = [round(candidate.anchor[0] + candidate.outward[0] * 5), round(candidate.anchor[1] + candidate.outward[1] * 5)];
        const route = routeAnnotation(start, alternate, allObstacles, 0);
        if (route) { hub[0] = alternate[0]; hub[1] = alternate[1]; cluster.route = route; break; }
      }
    }
    if (!cluster.route) continue;
    cluster.anchor = hub;
    for (const lot of members.get(entry.id) ?? []) {
      const ring = lot.entity.geometry.coordinates[0].map(p => geometry.project(p).map(round) as AnnotationPoint);
      const candidates = edgeAnchors(ring).sort((a, b) => Math.hypot(a.anchor[0] - hub[0], a.anchor[1] - hub[1]) - Math.hypot(b.anchor[0] - hub[0], b.anchor[1] - hub[1]));
      for (const { anchor } of candidates) {
        // Common bus is parallel to the row; short orthogonal teeth reach each
        // actual polygon. Routing only intervenes if a neighbor blocks it.
        const elbow: AnnotationPoint = vertical ? [anchor[0], hub[1]] : [hub[0], anchor[1]];
        const bus = routeAnnotation(hub, elbow, allObstacles, 0);
        const tooth = routeAnnotation(elbow, anchor, allObstacles, 0);
        if (bus && tooth) { cluster.branches.push([...bus, ...tooth.slice(1)]); cluster.anchors.push(anchor); break; }
      }
    }
  }
  return { annotations, viewBox: buildCommercialMiniMapViewBox(geometry, placed), hiddenLabels: annotations.filter(a => !a.label).length };
}
