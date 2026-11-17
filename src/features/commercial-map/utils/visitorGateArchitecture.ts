import type { Coordinate, MapEntity } from '../types';
import { geometryCentroid } from './geometry';
import { buildGateNineAccessPresentation } from './gateNineRoadPresentation';
import { resolveCampeiraTrackBounds, createCampeiraTrackLayout } from './campeiraTrack';

export const VISITOR_GRILLE_GATE_IDS = ['A7', 'A8', 'A9', 'A11'] as const;
export type VisitorGateId = (typeof VISITOR_GRILLE_GATE_IDS)[number];
/** Presentation dimensions in scene units, NOT surveyed dimensions.
 * A11 spans the two already contiguous paving strips. Its cadastral anchor is
 * retained inside the opening; the asymmetric jambs avoid a post in either lane.
 * Earth (19/03/2026 imagery) supports the boundary/road relationship only.
 */
const PROFILES: Record<VisitorGateId, { left: number; right: number }> = {
  A7: { left: -0.72, right: 0.72 },
  A8: { left: -0.47, right: 0.52 },
  A9: { left: -0.83, right: 0.045 },
  A11: { left: -0.32, right: 1.22 },
};
export const isVisitorGrilleGate = (identifier: string): identifier is VisitorGateId =>
  VISITOR_GRILLE_GATE_IDS.includes(identifier as VisitorGateId);
export function visitorGateProfile(
  identifier: string,
  recoveredGateNineAccess = false,
  entities?: readonly MapEntity[],
) {
  if (!isVisitorGrilleGate(identifier)) return null;
  let p =
    identifier === 'A9' && recoveredGateNineAccess ? { left: -0.83, right: 0.365 } : PROFILES[identifier];
  const gate = entities?.find((e) => e.publicIdentifier === identifier && !e.isArchived);
  if (gate && (identifier === 'A8' || identifier === 'A11')) {
    const [cx, cz] = geometryCentroid(gate.geometry);
    const ids = identifier === 'A8' ? ['RUA-15-NOVEMBRO'] : ['RUA-LESTE-EXPORURAL', 'RUA-UBIRETAMA'];
    const xs = entities!
      .filter((e) => !e.isArchived && ids.includes(e.publicIdentifier))
      .flatMap((e) => {
        const ring = e.geometry.coordinates[0] ?? [],
          crossings: number[] = [];
        ring.forEach((a, i) => {
          const b = ring[(i + 1) % ring.length];
          if (a[1] > cz !== b[1] > cz) crossings.push(a[0] + ((b[0] - a[0]) * (cz - a[1])) / (b[1] - a[1]));
        });
        return crossings;
      });
    if (xs.length >= 2) p = { left: Math.min(...xs) - cx, right: Math.max(...xs) - cx };
  }
  return { ...p, width: p.right - p.left, centerX: (p.left + p.right) / 2, height: 0.64, post: 0.054 };
}
export type VisitorGateProfile = NonNullable<ReturnType<typeof visitorGateProfile>>;
export interface GrillePart {
  position: [number, number, number];
  size: [number, number, number];
  yaw?: number;
  material: 'steel' | 'hardware' | 'concrete';
}
export interface VisitorFenceRun {
  from: Coordinate;
  to: Coordinate;
}

/** Open leaves run parallel to the access, never across a traffic lane. */
export function createVisitorGateParts(
  identifier: VisitorGateId,
  coarse = false,
  profile?: VisitorGateProfile,
): GrillePart[] {
  const p = profile ?? visitorGateProfile(identifier)!;
  const parts: GrillePart[] = [];
  const box = (
    material: GrillePart['material'],
    position: GrillePart['position'],
    size: GrillePart['size'],
  ) => parts.push({ material, position, size });
  for (const [side, x] of [
    [-1, p.left],
    [1, p.right],
  ]) {
    box('concrete', [x, 0.025, 0], [0.085, 0.05, 0.085]);
    box('steel', [x, p.height / 2, 0], [p.post, p.height, p.post]);
    box('hardware', [x, p.height + 0.008, 0], [0.065, 0.016, 0.065]);
    box('hardware', [x, 0.054, 0], [0.072, 0.008, 0.072]);
    const leafX = x + side * 0.044,
      length = p.width / 2 - 0.025;
    for (const y of [0.11, 0.37, 0.59]) box('steel', [leafX, y, length / 2], [0.026, 0.024, length]);
    for (const z of [0.012, length - 0.012]) box('steel', [leafX, 0.35, z], [0.03, 0.5, 0.026]);
    const count = Math.max(5, Math.ceil(length / (coarse ? 0.105 : 0.065)));
    for (let i = 1; i < count; i++) box('steel', [leafX, 0.35, (length * i) / count], [0.012, 0.49, 0.012]);
    for (const y of [0.15, 0.54]) box('hardware', [x + side * 0.025, y, 0.015], [0.045, 0.055, 0.035]);
    box('hardware', [leafX - side * 0.018, 0.34, length - 0.07], [0.018, 0.07, 0.038]);
    box('hardware', [leafX, 0.07, length - 0.025], [0.013, 0.13, 0.013]);
  }
  return parts;
}

/** External edge only: never fence individual sales lots. Existing road mouths
 * and the Campeira enclosure remain independent. Runs connect to gate jambs,
 * following the existing north edge of Quadra S and the A7 approach verge.
 */
export function createVisitorFenceRuns(entities: readonly MapEntity[]): VisitorFenceRun[] {
  const quadra = entities.find((e) => !e.isArchived && e.publicIdentifier === 'QUADRA-S');
  if (!quadra) return [];
  const north = Math.min(...quadra.geometry.coordinates.flat().map((p) => p[1])) - 0.12;
  const access = buildGateNineAccessPresentation(entities);
  const gates = new Map(
    entities
      .filter((e) => !e.isArchived && e.classification === 'GATE' && isVisitorGrilleGate(e.publicIdentifier))
      .map((e) => [
        e.publicIdentifier,
        {
          entity: e,
          center: geometryCentroid(e.geometry),
          profile: visitorGateProfile(e.publicIdentifier, Boolean(access), entities)!,
        },
      ]),
  );
  const runs: VisitorFenceRun[] = [];
  const add = (from: Coordinate, to: Coordinate) => {
    if (Math.hypot(to[0] - from[0], to[1] - from[1]) > 0.01) runs.push({ from, to });
  };
  const northGates = ['A9', 'A8', 'A11'].map((id) => gates.get(id)).filter((g) => !!g);
  for (const gate of northGates) {
    const [x, z] = gate.center;
    add([x + gate.profile.left, z], [x + gate.profile.left, north]);
    add([x + gate.profile.right, north], [x + gate.profile.right, z]);
  }
  for (let i = 1; i < northGates.length; i++) {
    const a = northGates[i - 1],
      b = northGates[i];
    add([a.center[0] + a.profile.right, north], [b.center[0] + b.profile.left, north]);
  }
  const a7 = gates.get('A7'),
    a9 = gates.get('A9');
  if (a7 && a9) {
    const east = a7.center[0] + a7.profile.right;
    add([east, a7.center[1]], [east, north]);
    add([east, north], [a9.center[0] + a9.profile.left, north]);
    const campeira = entities.find((e) => e.publicIdentifier === 'PISTA-CAMPEIRA' && !e.isArchived);
    if (campeira) {
      const bounds = resolveCampeiraTrackBounds(campeira);
      const layout = createCampeiraTrackLayout(bounds);
      const corner: Coordinate = [bounds.maxX - layout.fence.inset, bounds.minZ + layout.fence.inset];
      const jamb: Coordinate = [a7.center[0] + a7.profile.left, a7.center[1]];
      const returnX = Math.min(jamb[0], corner[0]) - 0.13;
      add(jamb, [returnX, jamb[1]]);
      add([returnX, jamb[1]], [returnX, corner[1]]);
      add([returnX, corner[1]], corner);
    }
  }
  // Road mouths stay open even when the fence lies just beyond their polygon
  // cap. In particular, the narrow road beside A9 is a separate public access.
  const mouthIntervals = entities
    .filter((e) => !e.isArchived && e.classification === 'ROAD')
    .flatMap((e) => {
      const ring = e.geometry.coordinates[0] ?? [],
        xs: number[] = [],
        z = north + 0.2;
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length];
        if (a[1] > z !== b[1] > z) xs.push(a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]));
      });
      xs.sort((a, b) => a - b);
      const intervals: [number, number][] = [];
      for (let i = 0; i + 1 < xs.length; i += 2) intervals.push([xs[i] - 0.025, xs[i + 1] + 0.025]);
      return intervals;
    });
  return runs.flatMap((run) => {
    if (run.from[1] !== north || run.to[1] !== north) return [run];
    let spans: [number, number][] = [[Math.min(run.from[0], run.to[0]), Math.max(run.from[0], run.to[0])]];
    for (const [a, b] of mouthIntervals)
      spans = spans.flatMap(([l, r]) =>
        b <= l || a >= r
          ? [[l, r]]
          : [...(a > l ? [[l, a] as [number, number]] : []), ...(b < r ? [[b, r] as [number, number]] : [])],
      );
    return spans
      .filter(([l, r]) => r - l > 0.03)
      .map(([l, r]) => ({ from: [l, north] as Coordinate, to: [r, north] as Coordinate }));
  });
}

export function createVisitorFenceParts(runs: readonly VisitorFenceRun[], coarse = false): GrillePart[] {
  const parts: GrillePart[] = [];
  const posts = new Set<string>();
  for (const { from: a, to: b } of runs) {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    const panels = Math.ceil(length / 0.9),
      yaw = -Math.atan2(dz, dx);
    const at = (t: number): Coordinate => [a[0] + dx * t, a[1] + dz * t];
    for (let i = 0; i <= panels; i++) {
      const [x, z] = at(i / panels),
        key = `${x.toFixed(4)},${z.toFixed(4)}`;
      if (!posts.has(key)) {
        posts.add(key);
        parts.push({ material: 'steel', position: [x, 0.285, z], size: [0.035, 0.57, 0.035] });
        parts.push({ material: 'concrete', position: [x, 0.018, z], size: [0.06, 0.036, 0.06] });
      }
    }
    for (let i = 0; i < panels; i++) {
      const [x, z] = at((i + 0.5) / panels),
        span = length / panels;
      for (const y of [0.1, 0.51])
        parts.push({ material: 'steel', position: [x, y, z], size: [span, 0.018, 0.018], yaw });
      const count = Math.ceil(span / (coarse ? 0.15 : 0.085));
      for (let j = 1; j < count; j++) {
        const [px, pz] = at((i + j / count) / panels);
        parts.push({ material: 'steel', position: [px, 0.305, pz], size: [0.009, 0.41, 0.009] });
      }
    }
  }
  return parts;
}
