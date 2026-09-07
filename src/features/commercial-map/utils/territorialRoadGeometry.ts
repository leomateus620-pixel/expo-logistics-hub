import * as THREE from "three";
import polygonClipping, {
  type MultiPolygon,
  type Ring,
} from "polygon-clipping";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  TERRITORY_ROADS,
  type TerritoryPoint,
  type TerritoryRoad,
} from "../data/territorialRoads";
import {
  clipPlanarSurfaceGeometry,
  type PlanarSurfaceCut,
} from "./planarSurfaceGeometry";
import {
  GENERATED_REAR_ROAD_SEGMENTS,
  rearRoadLocalPath,
} from "../data/rearParkRoadNetwork";

export const TERRITORY_ROAD_Y = 0.034;
export const UNIFIED_TERRITORY_ROADS: readonly TerritoryRoad[] = [
  ...TERRITORY_ROADS,
  ...GENERATED_REAR_ROAD_SEGMENTS.map((r) => ({
    id: r.id,
    name: r.name,
    kind: "access" as const,
    points: rearRoadLocalPath(r),
    width: r.width,
    shoulder: r.shoulderWidth,
    evidence: "project-continuation" as const,
  })),
];
export function sampleTerritoryRoad(road: TerritoryRoad): TerritoryPoint[] {
  if (road.evidence === "osm-aligned") {
    if (road.kind !== "highway") return [...road.points];
    const points: TerritoryPoint[] = [road.points[0]];
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i],
        n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2));
      for (let j = 1; j <= n; j++)
        points.push([
          a[0] + ((b[0] - a[0]) * j) / n,
          a[1] + ((b[1] - a[1]) * j) / n,
        ]);
    }
    return points;
  }
  // Polyline corners in local grids stay straight; road curves use centripetal interpolation.
  if (road.kind === "local") return [...road.points];
  const curve = new THREE.CatmullRomCurve3(
    road.points.map((p) => new THREE.Vector3(p[0], 0, p[1])),
    false,
    "centripetal",
  );
  curve.arcLengthDivisions = Math.ceil(curve.getLength() * 12);
  return curve
    .getSpacedPoints(Math.ceil(curve.getLength() * 2))
    .map((p) => [p.x, p.z]);
}
export function corridorPolygon(
  points: readonly TerritoryPoint[],
  width: number,
): MultiPolygon {
  const left: Ring = [],
    right: Ring = [];
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = ((-(b[1] - a[1]) / d) * width) / 2,
      nz = (((b[0] - a[0]) / d) * width) / 2;
    left.push([p[0] + nx, p[1] + nz]);
    right.push([p[0] - nx, p[1] - nz]);
  });
  const ring = [...left, ...right.reverse()];
  ring.push([...ring[0]]);
  return [[ring]];
}
export function territoryPolygonGeometry(polygons: MultiPolygon, y: number) {
  const pieces = polygons.map((rings) => {
    const shape = new THREE.Shape(
      rings[0].map((p) => new THREE.Vector2(p[0], -p[1])),
    );
    rings
      .slice(1)
      .forEach((r) =>
        shape.holes.push(
          new THREE.Path(r.map((p) => new THREE.Vector2(p[0], -p[1]))),
        ),
      );
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, y, 0);
    const p = geometry.getAttribute("position"),
      uv = geometry.getAttribute("uv");
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
    return geometry;
  });
  const merged = pieces.length
    ? mergeGeometries(pieces)
    : new THREE.BufferGeometry();
  pieces.forEach((g) => g.dispose());
  // Polygon booleans can leave sub-millimetre slivers. Enforce winding after
  // Float32 conversion, where nearly collinear vertices can change orientation.
  const position = merged.getAttribute("position"),
    index = merged.index;
  if (index)
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i),
        b = index.getX(i + 1),
        c = index.getX(i + 2);
      const cross =
        (position.getZ(b) - position.getZ(a)) *
          (position.getX(c) - position.getX(a)) -
        (position.getX(b) - position.getX(a)) *
          (position.getZ(c) - position.getZ(a));
      if (cross < 0) {
        index.setX(i + 1, c);
        index.setX(i + 2, b);
      }
    }
  // All vertices belong to a horizontal surface. Explicit normals also keep
  // boolean slivers from emitting zero normals into the HDR lighting pass.
  if (position) {
    const normals = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) normals[i * 3 + 1] = 1;
    merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  }
  merged.computeBoundingSphere();
  return merged;
}
/** Close the visible edge down to the base terrain, without a second top plane. */
export function territorySurfaceSkirt(
  polygons: MultiPolygon,
  top: number,
  bottom: number,
) {
  const vertices: number[] = [],
    uvs: number[] = [],
    normals: number[] = [];
  for (const rings of polygons)
    for (const sourceRing of rings) {
      const ring = sourceRing.filter((p, i) => {
        if (i === 0 || i === sourceRing.length - 1) return true;
        const a = sourceRing[i - 1],
          b = sourceRing[i + 1];
        return (
          Math.abs(
            (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]),
          ) /
            (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1) >
          0.00001
        );
      });
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 0.00002) continue;
        for (let vertex = 0; vertex < 6; vertex++)
          normals.push((b[1] - a[1]) / length, 0, -(b[0] - a[0]) / length);
        vertices.push(
          a[0],
          top,
          a[1],
          b[0],
          top,
          b[1],
          a[0],
          bottom,
          a[1],
          b[0],
          top,
          b[1],
          b[0],
          bottom,
          b[1],
          a[0],
          bottom,
          a[1],
        );
        uvs.push(
          a[0],
          a[1],
          b[0],
          b[1],
          a[0],
          a[1],
          b[0],
          b[1],
          b[0],
          b[1],
          a[0],
          a[1],
        );
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.computeBoundingSphere();
  return g;
}
const union = (polys: MultiPolygon[]) =>
  polys.length ? polygonClipping.union(polys[0], ...polys.slice(1)) : [];

/** Exact polygon union at construction time: no overlapping asphalt planes at a crossing.
 * Holes are retained as islands. Shoulders are the set difference of the two unions.
 * Markings are clipped against every intersecting roadway, rather than running across its mouth.
 */
export function buildTerritoryRoadGeometry() {
  const samples = UNIFIED_TERRITORY_ROADS.map((road) =>
    sampleTerritoryRoad(road),
  );
  const surfaces = UNIFIED_TERRITORY_ROADS.map((r, i) =>
    corridorPolygon(samples[i], r.width),
  );
  const pavement = union(surfaces);
  const unpaved = polygonClipping.difference(
    union(
      surfaces.filter((_, i) =>
        ["unpaved", "gravel", "dirt", "ground"].includes(
          UNIFIED_TERRITORY_ROADS[i].surface ?? "",
        ),
      ),
    ),
    union(
      surfaces.filter(
        (_, i) =>
          !["unpaved", "gravel", "dirt", "ground"].includes(
            UNIFIED_TERRITORY_ROADS[i].surface ?? "",
          ),
      ),
    ),
  );
  const hitSurface = union(
    surfaces.filter(
      (_, i) =>
        UNIFIED_TERRITORY_ROADS[i].ref?.includes("472") ||
        UNIFIED_TERRITORY_ROADS[i].evidence === "project-continuation",
    ),
  );
  const outer = union(
    UNIFIED_TERRITORY_ROADS.map((r, i) =>
      corridorPolygon(samples[i], r.width + r.shoulder * 2),
    ),
  );
  const shoulders = polygonClipping.difference(outer, pavement);
  const edgeBands: MultiPolygon[] = [],
    centerDashes: MultiPolygon[] = [];
  const bounds = surfaces.map((p) => {
    const points = p.flat(2);
    return {
      minX: Math.min(...points.map((v) => v[0])),
      maxX: Math.max(...points.map((v) => v[0])),
      minZ: Math.min(...points.map((v) => v[1])),
      maxZ: Math.max(...points.map((v) => v[1])),
    };
  });
  UNIFIED_TERRITORY_ROADS.forEach((road, index) => {
    if (road.kind !== "highway") return;
    const box = bounds[index];
    const intersections = union(
      surfaces.filter(
        (_, i) =>
          i !== index &&
          bounds[i].minX <= box.maxX &&
          bounds[i].maxX >= box.minX &&
          bounds[i].minZ <= box.maxZ &&
          bounds[i].maxZ >= box.minZ,
      ),
    );
    const outline = polygonClipping.difference(
      surfaces[index],
      corridorPolygon(samples[index], road.width - 0.07),
    );
    edgeBands.push(polygonClipping.difference(outline, intersections));
    const points = samples[index];
    let distance = 0;
    const dashes: MultiPolygon[] = [];
    let dash: TerritoryPoint[] = [];
    for (let i = 1; i < points.length; i++) {
      distance += Math.hypot(
        points[i][0] - points[i - 1][0],
        points[i][1] - points[i - 1][1],
      );
      if (distance % 2.8 < 1.15) {
        if (!dash.length) dash.push(points[i - 1]);
        dash.push(points[i]);
      } else if (dash.length > 1) {
        dashes.push(corridorPolygon(dash, 0.045));
        dash = [];
      }
    }
    if (dash.length > 1) dashes.push(corridorPolygon(dash, 0.045));
    centerDashes.push(polygonClipping.difference(union(dashes), intersections));
  });
  return {
    pavement: territoryPolygonGeometry(
      polygonClipping.difference(pavement, unpaved),
      TERRITORY_ROAD_Y,
    ),
    unpaved: territoryPolygonGeometry(unpaved, TERRITORY_ROAD_Y),
    embankment: territorySurfaceSkirt(outer, TERRITORY_ROAD_Y - 0.003, -0.081),
    hitSurface: territoryPolygonGeometry(hitSurface, TERRITORY_ROAD_Y),
    shoulders: territoryPolygonGeometry(shoulders, TERRITORY_ROAD_Y - 0.003),
    edgeLines: territoryPolygonGeometry(
      union(edgeBands),
      TERRITORY_ROAD_Y + 0.002,
    ),
    centerLines: territoryPolygonGeometry(
      union(centerDashes),
      TERRITORY_ROAD_Y + 0.002,
    ),
    footprint: polygonClipping.difference(pavement, unpaved),
    fullFootprint: pavement,
  };
}

// Clearance uses the same sampled axes as the pavement, not the unsmoothed control polygon.
const CLEARANCE_AXES = UNIFIED_TERRITORY_ROADS.map((r) => ({
  road: r,
  points: r.evidence === "osm-aligned" ? r.points : sampleTerritoryRoad(r),
}));
const TERRITORY_GROUND_CUTS: PlanarSurfaceCut[] = CLEARANCE_AXES.flatMap(
  ({ road, points }) =>
    points.slice(1).map((p, i) => {
      const polygon = corridorPolygon(
        [points[i], p],
        road.width + road.shoulder * 2,
      )[0][0];
      return {
        polygon,
        minX: Math.min(...polygon.map((p) => p[0])),
        maxX: Math.max(...polygon.map((p) => p[0])),
        minZ: Math.min(...polygon.map((p) => p[1])),
        maxZ: Math.max(...polygon.map((p) => p[1])),
      };
    }),
);
export function integrateGroundWithTerritory(geometry: THREE.BufferGeometry) {
  return clipPlanarSurfaceGeometry(
    geometry,
    TERRITORY_GROUND_CUTS,
    () => TERRITORY_ROAD_Y - 0.004,
  );
}
export function territoryRoadClearance(point: TerritoryPoint) {
  let best = Infinity;
  for (const { road, points } of CLEARANCE_AXES)
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1];
      const t = THREE.MathUtils.clamp(
        ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) /
          (dx * dx + dz * dz || 1),
        0,
        1,
      );
      best = Math.min(
        best,
        Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz) -
          road.width / 2 -
          road.shoulder,
      );
    }
  return best;
}

/** The decorative local grid must never masquerade as a commercial highway. */
export function territoryHighwayOwnerAt(point: TerritoryPoint) {
  for (const { road, points } of CLEARANCE_AXES) {
    if (road.kind !== "highway" || !road.ref?.includes("472")) continue;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1];
      const t = THREE.MathUtils.clamp(
        ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) /
          (dx * dx + dz * dz || 1),
        0,
        1,
      );
      if (
        Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz) <=
        road.width / 2 + 0.03
      )
        return "RODOVIA-RS-472";
    }
  }
  return null;
}
