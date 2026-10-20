import polygonClipping from 'polygon-clipping';
import { buildCommercialMiniMapViewBox, type CommercialMiniMapGeometry, type MiniMapBounds } from './commercialDashboardGeometry';
import { occupancyLotSummary, OCCUPANCY_STATE_LABEL, type OccupancyGroup } from './pavilionOccupancy';

export type AnnotationPoint = [number, number];
export interface AnnotationCluster {
  rings: AnnotationPoint[][]; path: string; anchor: AnnotationPoint;
  route: AnnotationPoint[] | null; marker: AnnotationPoint | null;
}
export interface PavilionAnnotation {
  id: string; group: OccupancyGroup; clusters: AnnotationCluster[];
  label: (MiniMapBounds & { lines: string[]; lotLine: string; stateLine: string }) | null;
}
export interface PavilionAnnotationLayout { annotations: PavilionAnnotation[]; viewBox: string; hiddenLabels: number }
const spatialCache = new WeakMap<CommercialMiniMapGeometry, WeakMap<readonly OccupancyGroup[], PavilionAnnotation[]>>();
const layoutCache = new WeakMap<CommercialMiniMapGeometry, WeakMap<readonly OccupancyGroup[], Map<string, PavilionAnnotationLayout>>>();
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

/** One primary annotation per company, irrespective of contracts or connected
 * components. All expensive work is cached independently from hover/contract
 * selection. A remote component uses the same small marker instead of a card. */
export function buildPavilionAnnotationLayout(geometry: CommercialMiniMapGeometry, groups: readonly OccupancyGroup[], selectedId: string | null = null, maxLabels = 8, reservedBounds: readonly MiniMapBounds[] = []): PavilionAnnotationLayout {
  if (!geometry.bounds || !groups.length) return { annotations: [], viewBox: buildCommercialMiniMapViewBox(geometry), hiddenLabels: 0 };
  let layouts = layoutCache.get(geometry);
  if (!layouts) { layouts = new WeakMap(); layoutCache.set(geometry, layouts); }
  let variants = layouts.get(groups);
  if (!variants) { variants = new Map(); layouts.set(groups, variants); }
  // Selection only changes the layout if a company outside the progressive
  // default label set needs a label. Existing labels never jump on selection.
  const defaults = [...groups].sort((a, b) => b.items.length - a.items.length || a.marker - b.marker).slice(0, maxLabels);
  const promoted = selectedId && !defaults.some(group => group.id === selectedId) ? selectedId : null;
  const key = JSON.stringify([promoted, maxLabels, reservedBounds]);
  const cached = variants.get(key);
  if (cached) return cached;
  const [x1, y1] = geometry.project([geometry.bounds.minX, geometry.bounds.minY]);
  const [x2, y2] = geometry.project([geometry.bounds.maxX, geometry.bounds.maxY]);
  const floor: MiniMapBounds = { minX: x1, minY: y1, maxX: x2, maxY: y2 };
  const lotObstacles = geometry.lots.map(l => bounds(l.entity.geometry.coordinates[0].map(p => geometry.project(p).map(round) as AnnotationPoint)));
  const obstacles = [...lotObstacles, ...reservedBounds, ...geometry.outlines.filter(o => o.kind === 'support').map(o => bounds(o.coordinates[0].map(p => geometry.project(p) as AnnotationPoint)))];
  let cache = spatialCache.get(geometry);
  if (!cache) { cache = new WeakMap(); spatialCache.set(geometry, cache); }
  let spatial = cache.get(groups);
  if (!spatial) {
    spatial = groups.flatMap(group => {
      const lots = group.items.flatMap(item => {
        const lot = geometry.lotsByEntityId.get(item.entityId);
        // Matching entity IDs alone must never adopt a different cadastral lot.
        return lot?.lot.id === item.lotId ? [lot] : [];
      });
      if (!lots.length) return [];
      const polygons = lots.map(l => l.entity.geometry.coordinates.map(ring => ring.map(p => geometry.project(p).map(round) as AnnotationPoint)));
      const union = polygonClipping.union(polygons[0], ...polygons.slice(1));
      const clusters = union.map(rings => {
        const box = bounds(rings[0]);
        return { rings, path: annotationPath(rings), anchor: [(box.minX + box.maxX) / 2, box.minY] as AnnotationPoint, route: null, marker: null };
      }).sort((a, b) => {
        const area = (c: AnnotationCluster) => { const b = bounds(c.rings[0]); return (b.maxX - b.minX) * (b.maxY - b.minY); };
        return area(b) - area(a) || a.path.localeCompare(b.path);
      });
      return [{ id: group.id, group, clusters, label: null }];
    });
    cache.set(groups, spatial);
  }
  const annotations = spatial.map(a => ({ ...a, clusters: a.clusters.map(c => ({ ...c })) }));
  const priority = [...annotations].sort((a, b) => Number(b.group.id === promoted) - Number(a.group.id === promoted)
    || b.group.items.length - a.group.items.length || a.group.marker - b.group.marker).slice(0, maxLabels);
  const labelWidth = Math.max(134, Math.min(156, (x2 - x1) * .25)), gap = 10;
  const placed: MiniMapBounds[] = [];
  for (const entry of priority) {
    const nameLines = wrapName(entry.group.name, Math.floor((labelWidth - 29) / 5.7));
    const labelHeight = 42 + (nameLines.length - 1) * 10;
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
      const current = Math.hypot(x + labelWidth / 2 - cx, y + labelHeight / 2 - cy) + outside * .35;
      if (current < score) { score = current; best = candidate; }
    }
    if (!best) continue;
    const short = (line: string, unitWidth: number) => {
      const limit = Math.floor((labelWidth - 18) / unitWidth);
      return line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
    };
    entry.label = { ...best, lines: nameLines, lotLine: short(occupancyLotSummary(entry.group.items), 3.8),
      stateLine: short(OCCUPANCY_STATE_LABEL[entry.group.state], 3.6) };
    placed.push(best);
  }
  // Route once to an exposed point on each component's perimeter, never to
  // every cell. Bounding obstacles conservatively protect numbers and holes.
  const usedRoutes: AnnotationPoint[][] = [];
  const componentBadges: MiniMapBounds[] = [];
  for (const entry of annotations) {
    const label = entry.label;
    for (const cluster of entry.clusters) {
      const candidates = edgeAnchors(cluster.rings[0]);
      const lx = label ? (label.minX + label.maxX) / 2 : cluster.anchor[0];
      const ly = label ? (label.minY + label.maxY) / 2 : cluster.anchor[1] - 10;
      candidates.sort((a, b) => Math.hypot(a.anchor[0] - lx, a.anchor[1] - ly) - Math.hypot(b.anchor[0] - lx, b.anchor[1] - ly));
      const allObstacles = [...obstacles, ...placed, ...componentBadges];
      for (const [candidateIndex, { anchor, outward }] of candidates.entries()) {
        const endpoint: AnnotationPoint = [round(anchor[0] + outward[0] * 4), round(anchor[1] + outward[1] * 4)];
        const badge = { minX: endpoint[0] - 3, maxX: endpoint[0] + 3, minY: endpoint[1] - 3, maxY: endpoint[1] + 3 };
        if (!cluster.marker && !allObstacles.some(b => overlaps(badge, b))) cluster.marker = endpoint;
        if (!label || candidateIndex >= 8) { if (cluster.marker) break; else continue; }
        const start: AnnotationPoint = [Math.max(label.minX, Math.min(label.maxX, endpoint[0])), Math.max(label.minY, Math.min(label.maxY, endpoint[1]))];
        // Remote leaders add noise. The local marker identifies the same company.
        if (Math.hypot(start[0] - endpoint[0], start[1] - endpoint[1]) > 110) continue;
        const route = routeAnnotation(start, anchor, allObstacles, 0);
        if (!route) continue;
        const length = route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - route[i][0], p[1] - route[i][1]), 0);
        if (length > 140 || crossesRoutes(route, usedRoutes)) continue;
        cluster.route = route; cluster.anchor = anchor; cluster.marker = null;
        usedRoutes.push(route); break;
      }
      if (cluster.marker) componentBadges.push({ minX: cluster.marker[0] - 3.2, maxX: cluster.marker[0] + 3.2,
        minY: cluster.marker[1] - 3.2, maxY: cluster.marker[1] + 3.2 });
    }
  }
  const result = { annotations, viewBox: buildCommercialMiniMapViewBox(geometry, [...placed,
    ...annotations.flatMap(a => a.clusters.flatMap(c => c.marker ? [{ minX: c.marker[0] - 4, maxX: c.marker[0] + 4, minY: c.marker[1] - 4, maxY: c.marker[1] + 4 }] : []))]),
    hiddenLabels: annotations.filter(a => !a.label).length };
  variants.set(key, result);
  // Bound selection variants; union cache remains shared.
  if (variants.size > 12) variants.delete(variants.keys().next().value!);
  return result;
}
function crossesRoutes(route: AnnotationPoint[], previous: AnnotationPoint[][]) {
  return route.slice(1).some((b, i) => previous.some(line => line.slice(1).some((d, j) => {
    const a = route[i], c = line[j];
    if ((a[0] === b[0]) === (c[0] === d[0])) return false;
    const [v1, v2, h1, h2] = a[0] === b[0] ? [a, b, c, d] : [c, d, a, b];
    return v1[0] > Math.min(h1[0], h2[0]) && v1[0] < Math.max(h1[0], h2[0])
      && h1[1] > Math.min(v1[1], v2[1]) && h1[1] < Math.max(v1[1], v2[1]);
  })));
}
