import * as THREE from "three";
import polygonClipping from "polygon-clipping";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MapEntity, Coordinate } from "../types";
import { withoutClosingPoint } from "./geometry";
import { HYDROLOGICAL_NODES } from "../data/hydrologicalInfrastructure";

export const EXPORURAL_WELL = HYDROLOGICAL_NODES.find(
  (node) => node.id === "well-02",
)!;
export const isExporuralLandscapeLot = (entity: MapEntity) =>
  entity.classification === "SELLABLE_LOT" &&
  /^Q-[RS]-\d{2}$/.test(entity.publicIdentifier) &&
  entity.metadata.areaCode === "EXPORURAL";

/** Presentation only, derived from current cadastral rings. Never writes entities. */
export function buildExporuralLandscape(entities: readonly MapEntity[]) {
  const borders: THREE.BufferGeometry[] = [],
    slopes: THREE.BufferGeometry[] = [],
    terraces: THREE.BufferGeometry[] = [];
  for (const entity of entities.filter(isExporuralLandscapeLot)) {
    const ring = withoutClosingPoint(entity.geometry.coordinates[0]);
    const winding = Math.sign(
      ring.reduce((sum, a, i) => {
        const b = ring[(i + 1) % ring.length];
        return sum + a[0] * b[1] - b[0] * a[1];
      }, 0),
    );
    const top = entity.geometry.elevation + entity.geometry.extrusionHeight;
    const insetPoint = (index: number, offset: number) => {
      const p = ring[index],
        previous = ring[(index + ring.length - 1) % ring.length],
        next = ring[(index + 1) % ring.length];
      const beforeLength = Math.hypot(p[0] - previous[0], p[1] - previous[1]);
      const afterLength = Math.hypot(next[0] - p[0], next[1] - p[1]);
      const before = [
        (-(p[1] - previous[1]) / beforeLength) * winding,
        ((p[0] - previous[0]) / beforeLength) * winding,
      ];
      const after = [
        (-(next[1] - p[1]) / afterLength) * winding,
        ((next[0] - p[0]) / afterLength) * winding,
      ];
      const scale =
        offset / Math.max(0.1, 1 + before[0] * after[0] + before[1] * after[1]);
      return [
        p[0] + (before[0] + after[0]) * scale,
        p[1] + (before[1] + after[1]) * scale,
      ];
    };
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dx, dz);
      if (length < 0.001) return;
      // A narrow mown margin with a shallow rounded shoulder; entirely inward.
      const positions: number[] = [],
        colors: number[] = [];
      const rows = [0, 0.014, 0.045, 0.075],
        heights = [0.002, 0.014, 0.01, 0.002];
      for (let j = 0; j < rows.length; j++)
        for (const index of [i, (i + 1) % ring.length]) {
          const p = insetPoint(index, rows[j]);
          positions.push(p[0], top + heights[j], p[1]);
          const c = new THREE.Color(
            j === 0 ? "#394b30" : j === 1 ? "#9aab72" : "#738555",
          );
          colors.push(c.r, c.g, c.b);
        }
      const indices: number[] = [];
      for (let j = 0; j < 3; j++) {
        const k = j * 2;
        indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      borders.push(g);
    });
    const r2 = entities.find(
      (e) => e.publicIdentifier === "Q-R-02" && isExporuralLandscapeLot(e),
    );
    const r13 = entities.find(
      (e) => e.publicIdentifier === "Q-R-13" && isExporuralLandscapeLot(e),
    );
    if (entity.publicIdentifier === "Q-R-14" && r2 && r13) {
      // Only the unused verge OUTSIDE the parcels. The upper west edge of R14
      // adjoins R13 and must never receive a slope. Keep the toe off the lot.
      // These conservative photo-derived heights are not survey measurements.
      const r2Ring = withoutClosingPoint(r2.geometry.coordinates[0]);
      const r13Ring = withoutClosingPoint(r13.geometry.coordinates[0]);
      // Behind P5 the verge is narrower: retain the building's ground footprint
      // and widen only after passing its eastern facade.
      const rearA = r13Ring[3],
        rearB = r13Ring[2];
      const wideningX = 1.65;
      const rearControl: Coordinate = [
        wideningX,
        THREE.MathUtils.lerp(
          rearA[1],
          rearB[1],
          (wideningX - rearA[0]) / (rearB[0] - rearA[0]),
        ),
      ];
      const edge = [
        rearA,
        rearControl,
        ring[ring.length - 1],
        ring[ring.length - 2],
        ring[2],
        r2Ring[3],
        r2Ring[2],
      ];
      const widths = [0.48, 0.48, 1.6, 0.8, 0.48, 0.48, 0.48];
      const heights = [0.22, 0.22, 0.22, 0.22, 0.22, 0.22, 0.22];
      const lengths = edge
        .slice(1)
        .map((p, i) => Math.hypot(p[0] - edge[i][0], p[1] - edge[i][1]));
      const total = lengths.reduce((a, b) => a + b, 0),
        across = 18;
      const normals = edge
        .slice(1)
        .map((p, i) => [
          -(p[1] - edge[i][1]) / lengths[i],
          (p[0] - edge[i][0]) / lengths[i],
        ]);
      const miters = edge.map((_, i) => {
        const a = normals[Math.max(0, i - 1)],
          b = normals[Math.min(normals.length - 1, i)];
        const denominator = 1 + a[0] * b[0] + a[1] * b[1];
        return [(a[0] + b[0]) / denominator, (a[1] + b[1]) / denominator];
      });
      // Include each corner exactly once, sharing a cross-section. No seam,
      // disconnected mound or diagonal shortcut across a cadastral corner.
      const samples: { segment: number; t: number; distance: number }[] = [];
      let walked = 0;
      lengths.forEach((length, segment) => {
        const start = segment === 0 ? 0.12 : 0,
          stop = segment === lengths.length - 1 ? length - 0.12 : length;
        const count = Math.ceil((stop - start) / 0.14);
        for (let i = segment === 0 ? 0 : 1; i <= count; i++) {
          const local = start + ((stop - start) * i) / count;
          samples.push({
            segment,
            t: local / length,
            distance: walked + local,
          });
        }
        walked += length;
      });
      const steps = samples.length - 1;
      const crest: [number, number, number][] = [];
      const ps: number[] = [],
        cs: number[] = [],
        ix: number[] = [];
      const smooth = (t: number) => {
        const c = THREE.MathUtils.clamp(t, 0, 1);
        return c * c * (3 - 2 * c);
      };
      for (let u = 0; u <= steps; u++)
        for (let v = 0; v <= across; v++) {
          const { distance, segment, t } = samples[u];
          const a = edge[segment],
            b = edge[segment + 1],
            s = v / across;
          const width = THREE.MathUtils.lerp(
            widths[segment],
            widths[segment + 1],
            t,
          );
          const height = THREE.MathUtils.lerp(
            heights[segment],
            heights[segment + 1],
            t,
          );
          const outward = [
            THREE.MathUtils.lerp(miters[segment][0], miters[segment + 1][0], t),
            THREE.MathUtils.lerp(miters[segment][1], miters[segment + 1][1], t),
          ];
          const end =
            smooth((distance - 0.12) / 0.55) *
            smooth((total - 0.12 - distance) / 0.55);
          const offset = 0.035 + s * width;
          // A cut bank rises once from the parcel toe to the level P5 terrace.
          // There is no descending rear face / freestanding berm.
          const crown = smooth(s / 0.86);
          ps.push(
            a[0] + (b[0] - a[0]) * t + outward[0] * offset,
            entity.geometry.elevation + 0.025 + height * crown * end,
            a[1] + (b[1] - a[1]) * t + outward[1] * offset,
          );
          if (v === across) crest.push([ps[ps.length - 3], ps[ps.length - 2], ps[ps.length - 1]]);
          const earth =
            smooth((s - 0.08) / 0.18) *
            (1 - smooth((s - 0.72) / 0.22)) *
            end *
            0.76;
          const c = new THREE.Color("#758556").lerp(
            new THREE.Color("#885b40"),
            earth,
          );
          c.multiplyScalar(0.96 + 0.04 * Math.sin(distance * 9 + s * 13));
          cs.push(c.r, c.g, c.b);
          if (u < steps && v < across) {
            const k = u * (across + 1) + v;
            ix.push(
              k,
              k + across + 1,
              k + 1,
              k + 1,
              k + across + 1,
              k + across + 2,
            );
          }
        }
      const slope = new THREE.BufferGeometry();
      slope.setAttribute("position", new THREE.Float32BufferAttribute(ps, 3));
      slope.setAttribute("color", new THREE.Float32BufferAttribute(cs, 3));
      slope.setIndex(ix);
      slope.computeVertexNormals();
      slopes.push(slope);
      // Fill the idle green terrace behind the bank, clipped to all canonical
      // structures, parcels and roads. The facade meets this upper grade;
      // cadastral elevations and building geometry are not rewritten.
      const outline: Coordinate[] = crest.map(([x, , z]) => [x, z]);
      outline.push([crest.at(-1)![0], -11.67], [-3.6, -11.67], [-3.6, crest[0][2]]);
      const exclusions = entities.filter(e =>
        ["SELLABLE_LOT", "ROAD", "PAVILION", "BUILDING", "RESTROOM"].includes(e.classification),
      ).map(e => [e.geometry.coordinates[0]] as polygonClipping.Polygon);
      const clipped = polygonClipping.difference([outline], ...exclusions);
      const heightAt = (x: number, z: number) => {
        let best = Infinity, height = 0.245;
        for (let i = 1; i < crest.length; i++) {
          const a = crest[i - 1], b = crest[i];
          const dx = b[0] - a[0], dz = b[2] - a[2];
          const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz), 0, 1);
          const distance = Math.hypot(x - a[0] - dx * t, z - a[2] - dz * t);
          if (distance < best) { best = distance; height = THREE.MathUtils.lerp(a[1], b[1], t); }
        }
        return height;
      };
      const positions: number[] = [], colors: number[] = [];
      const emit = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, depth = 0) => {
        if (depth < 7 && Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) > 0.5) {
          const ab = a.clone().lerp(b, .5), bc = b.clone().lerp(c, .5), ca = c.clone().lerp(a, .5);
          emit(a, ab, ca, depth + 1); emit(ab, b, bc, depth + 1);
          emit(ca, bc, c, depth + 1); emit(ab, bc, ca, depth + 1);
          return;
        }
        for (const p of [a, c, b]) {
          positions.push(p.x, heightAt(p.x, p.y), p.y);
          const color = new THREE.Color("#758556");
          colors.push(color.r, color.g, color.b);
        }
      };
      for (const polygon of clipped) {
        const rings = polygon.map(r => withoutClosingPoint(r as Coordinate[]).map(([x, z]) => new THREE.Vector2(x, z)));
        const points = rings.flat();
        for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1))) emit(points[a], points[b], points[c]);
      }
      const terrace = new THREE.BufferGeometry();
      terrace.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      terrace.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      terrace.computeVertexNormals();
      terraces.push(terrace);
    }
  }
  const merge = (parts: THREE.BufferGeometry[]) => {
    const result = parts.length ? mergeGeometries(parts) : null;
    parts.forEach((p) => p.dispose());
    return result;
  };
  return { borders: merge(borders), slopes: merge(slopes), terrace: merge(terraces) };
}
