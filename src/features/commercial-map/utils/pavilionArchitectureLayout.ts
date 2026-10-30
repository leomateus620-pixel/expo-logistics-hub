import { Euler, Quaternion, Vector3 } from 'three';
import { resolvePavilionArchitecture2026, type PavilionArchitectureProfile } from '../data/pavilionArchitecture2026';
import type { CommercialPavilionLayout } from './commercialPavilions';

export type PavilionArchitectureMaterial = 'wall' | 'trim' | 'roof' | 'dark' | 'glass' | 'white' | 'platform' | 'metal' | 'accent' | 'brick' | 'cladding';
export type ArchitecturePoint = [number, number, number];
export interface PavilionArchitectureInstance {
  position: ArchitecturePoint;
  scale: ArchitecturePoint;
  rotation?: ArchitecturePoint;
}
export interface PavilionArchitectureTriangle {
  material: PavilionArchitectureMaterial;
  vertices: ArchitecturePoint[];
}
export interface PavilionArchitectureLayout {
  profile: PavilionArchitectureProfile;
  batches: Partial<Record<PavilionArchitectureMaterial, PavilionArchitectureInstance[]>>;
  triangles: PavilionArchitectureTriangle[];
  /** Same datum as the official floor; exterior reconstruction never lifts modules. */
  floorY: number;
  frontZ: number;
  eaveY: number;
  ridgeY: number;
  canopyFrontZ: number | null;
  facadeOpenings: readonly PavilionArchitectureOpening[];
  boxCount: number;
}
export interface PavilionArchitectureOpening { x: number; y: number; width: number; height: number; kind: 'gate' | 'window' }
type ElevationOpening = PavilionArchitectureOpening;
const X_AXIS = new Vector3(1, 0, 0);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Shared edge height used by the single-owner connected-complex flashing. */
export function pavilionArchitectureEaveY(layout: CommercialPavilionLayout): number {
  const height = pavilionArchitectureHeight(layout);
  if (layout.publicIdentifier === 'B1') return height * 0.96;
  if (layout.publicIdentifier === 'B3') return height * layout.exterior.roof.eaveY / layout.height;
  if (layout.publicIdentifier === 'B6') return height * 0.82;
  return height * 0.79;
}

/** Replaces the inherited sqrt(area) height only in the photographed exterior. */
export function pavilionArchitectureHeight(layout: CommercialPavilionLayout): number {
  const profile = resolvePavilionArchitecture2026(layout.publicIdentifier);
  return profile ? layout.exterior.shell.width * profile.facadeHeightToWidth : layout.height;
}

/**
 * The cadastral front-to-Argentina clearance is ~.24 map units for P8/13/3.
 * Keep projections and canopy feet inside that clearance, without moving roads.
 */
export function pavilionArchitectureCanopyProjection(layout: CommercialPavilionLayout): number {
  const height = pavilionArchitectureHeight(layout);
  const estimated = Math.min(height * 0.36, layout.exterior.shell.depth * 0.19);
  return layout.publicIdentifier === 'B3' ? estimated : Math.min(0.19, estimated);
}

export interface PavilionArchitectureSignPose {
  width: number;
  height: number;
  position: ArchitecturePoint;
  rotation: ArchitecturePoint;
  /** Back of the two mounting brackets terminates on this architectural face. */
  supportSurfaceZ: number;
  supportDepth: number;
  supportAnchorY: number;
  mounting: 'wall-frame' | 'eave-fascia' | 'canopy-truss' | 'folded-fascia';
}

/**
 * Physical signs sit on the outward face of their support. Placing a sign at
 * the wall datum behind an overhang lets the fascia/columns cut its lettering
 * from normal oblique viewpoints, even when the front elevation looks clear.
 */
export function pavilionArchitectureSignPose(layout: CommercialPavilionLayout): PavilionArchitectureSignPose {
  const width = layout.exterior.shell.width, depth = layout.exterior.shell.depth;
  const h = pavilionArchitectureHeight(layout), front = layout.exterior.shell.frontZ;
  const thickness = clamp(Math.min(width, depth) * 0.018, 0.045, 0.095);
  const frame = clamp(Math.min(width, depth) * 0.028, 0.055, 0.15);
  const canopyFront = front + pavilionArchitectureCanopyProjection(layout);
  let x = 0.17 * width, y = h * 0.70, height = h * 0.10;
  let supportSurfaceZ = front;
  let mounting: PavilionArchitectureSignPose['mounting'] = 'wall-frame';
  let angle = 0;
  if (layout.publicIdentifier === 'B3') {
    x = width * 0.22; y = pavilionArchitectureEaveY(layout) - h * 0.04;
    height = h * 0.11; supportSurfaceZ = canopyFront + frame * 0.4; mounting = 'eave-fascia';
  } else if (layout.publicIdentifier === 'B4' || layout.publicIdentifier === 'B5') {
    const canopyEave = h * (layout.publicIdentifier === 'B4' ? 0.65 : 0.70);
    x = 0; y = canopyEave + h * 0.01; height = h * 0.12;
    supportSurfaceZ = canopyFront + frame * 0.33 / 2; mounting = 'canopy-truss';
  } else if (layout.publicIdentifier === 'B6') {
    // Inside one fold, clear of both support posts and the adjacent fold joint.
    x = width * 0.235; y = h * 0.84; height = h * 0.105;
    angle = Math.atan2(h * 0.04, width * 0.17);
    supportSurfaceZ = canopyFront + thickness / 2; mounting = 'folded-fascia';
  }
  const supportDepth = height * 0.30 + (mounting === 'wall-frame' ? thickness * 1.325 : 0);
  // On an open truss the brackets fasten to its real lower chord, rather
  // than terminating in the empty triangular space behind the lettering.
  const supportAnchorY = mounting === 'canopy-truss' ? -height * .5 : 0;
  return { width: height * 4, height, position: [x, y, supportSurfaceZ + supportDepth], rotation: [0, 0, angle],
    supportSurfaceZ, supportDepth, supportAnchorY, mounting };
}

/**
 * Static photo-derived presentation geometry, in the existing local coordinate
 * system. No lot, reference projection, official wall-access flag or selection
 * identifier is read or rewritten here.
 */
export function createPavilionArchitectureLayout(layout: CommercialPavilionLayout, detail = true): PavilionArchitectureLayout | null {
  const profile = resolvePavilionArchitecture2026(layout.publicIdentifier);
  if (!profile) return null;
  const batches: PavilionArchitectureLayout['batches'] = {};
  const triangles: PavilionArchitectureTriangle[] = [];
  const { shell, slab } = layout.exterior;
  const w = shell.width, d = shell.depth, h = pavilionArchitectureHeight(layout);
  const base = slab.height;
  const front = shell.frontZ;
  const thickness = clamp(Math.min(w, d) * 0.018, 0.045, 0.095);
  const frame = clamp(Math.min(w, d) * 0.028, 0.055, 0.15);
  const box = (material: PavilionArchitectureMaterial, position: ArchitecturePoint, scale: ArchitecturePoint, rotation?: ArchitecturePoint) => {
    if (scale.some(value => !Number.isFinite(value) || value <= 0)) return;
    (batches[material] ??= []).push({ position, scale, ...(rotation ? { rotation } : {}) });
  };
  const beam = (material: PavilionArchitectureMaterial, from: ArchitecturePoint, to: ArchitecturePoint, size = frame * 0.34) => {
    const delta = new Vector3(...to).sub(new Vector3(...from));
    const length = delta.length();
    if (length < 0.0001) return;
    const rotation = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(X_AXIS, delta.normalize()));
    box(material, from.map((value, i) => (value + to[i]) / 2) as ArchitecturePoint,
      [length, size, size], [rotation.x, rotation.y, rotation.z]);
  };
  const gable = (centerX: number, span: number, eave: number, ridge: number, depth: number, centerZ = 0, fill = false) => {
    const rise = ridge - eave;
    const half = span / 2;
    const pitch = Math.atan2(rise, half);
    for (const side of [-1, 1]) {
      box('roof', [centerX + side * span / 4, eave + rise / 2, centerZ],
        [Math.hypot(half, rise), h * 0.015, depth], [0, 0, -side * pitch]);
    }
    box('metal', [centerX, ridge + h * 0.008, centerZ], [frame * 0.8, h * 0.018, depth]);
    if (fill) {
      for (const side of [-1, 1]) {
        const z = side * (depth / 2 - thickness * 0.45);
        triangles.push({ material: 'cladding', vertices: side > 0
          ? [[centerX - half, eave, z], [centerX + half, eave, z], [centerX, ridge, z]]
          : [[centerX + half, eave, z], [centerX - half, eave, z], [centerX, ridge, z]] });
        beam('trim', [centerX - half, eave, z + side * thickness], [centerX, ridge, z + side * thickness], frame * 0.75);
        beam('trim', [centerX, ridge, z + side * thickness], [centerX + half, eave, z + side * thickness], frame * 0.75);
      }
    }
  };
  const gateHeightBasis = (h - base) * 0.99;
  const openings: ElevationOpening[] = profile.gates.map(gate => ({
    x: gate.x * w, y: base + gate.height * gateHeightBasis / 2,
    width: gate.width * w, height: gate.height * gateHeightBasis, kind: 'gate',
  }));
  const window = (x: number, width: number, bottom: number, height: number) => {
    openings.push({ x: x * w, y: base + (bottom + height / 2) * (h - base), width: width * w, height: height * (h - base), kind: 'window' });
  };
  let eave = pavilionArchitectureEaveY(layout), ridge = h * 0.99;
  if (profile.id === 'B1') { eave = h * 0.96; ridge = h * 0.985; }
  if (profile.id === 'B3') {
    eave = pavilionArchitectureEaveY(layout); ridge = h;
    for (const x of [-0.42, -0.285, -0.15, -0.015, 0.09, 0.40]) window(x, x === 0.09 ? 0.06 : 0.106, 0.39, 0.28);
  }
  if (profile.id === 'B4') for (const x of [-0.39, -0.23, -0.07, 0.09, 0.25, 0.41]) window(x, 0.124, 0.60, 0.12);
  if (profile.id === 'B6') {
    eave = h * 0.82; ridge = h * 0.98;
    window(-0.365, 0.22, 0.23, 0.40);
    window(-0.155, 0.15, 0.25, 0.36);
    window(0.435, 0.09, 0.28, 0.31);
  }

  /** Fill the wall around true visual recesses; never place a full wall behind glass. */
  const elevation = (span: number, top: number, holes: ElevationOpening[], transform: (x: number, y: number) => ArchitecturePoint,
    sideWall = false, materialAt: (x: number) => PavilionArchitectureMaterial = () => 'wall') => {
    const xs = [...new Set([-span / 2, span / 2, ...holes.flatMap(hole => [hole.x - hole.width / 2, hole.x + hole.width / 2])])]
      .filter(x => x >= -span / 2 && x <= span / 2).sort((a, b) => a - b);
    const ys = [...new Set([base, top, ...holes.flatMap(hole => [hole.y - hole.height / 2, hole.y + hole.height / 2])])]
      .filter(y => y >= base && y <= top).sort((a, b) => a - b);
    for (let xi = 0; xi < xs.length - 1; xi++) for (let yi = 0; yi < ys.length - 1; yi++) {
      const x = (xs[xi] + xs[xi + 1]) / 2, y = (ys[yi] + ys[yi + 1]) / 2;
      if (holes.some(hole => Math.abs(x - hole.x) < hole.width / 2 && Math.abs(y - hole.y) < hole.height / 2)) continue;
      box(materialAt(x), transform(x, y), sideWall
        ? [thickness, ys[yi + 1] - ys[yi], xs[xi + 1] - xs[xi]]
        : [xs[xi + 1] - xs[xi], ys[yi + 1] - ys[yi], thickness]);
    }
  };
  const facadeMaterial = (x: number): PavilionArchitectureMaterial => profile.id === 'B3'
    ? Math.abs(x / w - 0.22) < 0.125 ? 'wall' : 'brick'
    : 'wall';
  elevation(w, eave, openings, (x, y) => [x, y, front - thickness / 2], false, facadeMaterial);
  // Unphotographed elevations deliberately remain restrained. B1 alone has a
  // documented long-side high-window rhythm; do not mirror the front four times.
  const sideWindows: ElevationOpening[] = profile.id === 'B1'
    ? Array.from({ length: 9 }, (_, index) => ({
        x: -d / 2 + d * (index + 0.5) / 9, y: h * 0.73,
        width: d * 0.074, height: h * 0.14, kind: 'window' as const,
      })) : [];
  for (const side of [-1, 1]) {
    const documentedWindows = side < 0 ? sideWindows : [];
    elevation(d, eave, documentedWindows, (z, y) => [side * (w / 2 - thickness / 2), y, z], true,
      () => profile.id === 'B3' ? 'brick' : 'wall');
    for (const opening of documentedWindows) {
      const x = side * (w / 2 - thickness * 0.5);
      box('glass', [x, opening.y, opening.x], [thickness * 0.34, opening.height, opening.width]);
      if (detail) {
        for (const y of [opening.y - opening.height / 2, opening.y + opening.height / 2]) box('metal',
          [side * w / 2, y, opening.x], [thickness * 0.6, frame * 0.22, opening.width]);
        for (const z of [opening.x - opening.width / 2, opening.x, opening.x + opening.width / 2]) box('metal',
          [side * w / 2, opening.y, z], [thickness * 0.6, opening.height, frame * 0.22]);
      }
    }
    // Surface-mounted perimeter structure remains outside the commercial clear envelope.
    const bayCount = profile.id === 'B1' ? 9 : Math.max(3, Math.min(7, Math.round(d / Math.max(0.5, w * 0.16))));
    for (let i = 0; i <= bayCount; i++) {
      const z = -d / 2 + d * i / bayCount;
      box('trim', [side * (w / 2 - frame * 0.15), (base + eave) / 2, z], [frame * 0.7, eave - base, frame * 0.75]);
    }
    box('trim', [side * (w / 2 - frame * 0.12), base + h * 0.055, 0], [frame * 0.78, h * 0.11, d]);
  }
  box(profile.id === 'B3' ? 'brick' : 'wall', [0, (base + eave) / 2, -d / 2 + thickness / 2], [w - thickness * 2, eave - base, thickness]);
  // The slab is an internal floor, flush with walls, not an enlarged display plinth.
  box('platform', [0, slab.centerY, 0], [w - thickness, slab.height, d - thickness]);

  for (const opening of openings) {
    const isWindow = opening.kind === 'window';
    const material = isWindow ? 'glass' : 'dark';
    box(material, [opening.x, opening.y, front - thickness * 0.68], [opening.width, opening.height, thickness * 0.45]);
    const stile = isWindow ? frame * 0.24 : frame * 0.40;
    for (const x of [opening.x - opening.width / 2, opening.x + opening.width / 2]) box(isWindow && profile.id === 'B3' ? 'metal' : 'trim',
      [x, opening.y, front + thickness * 0.12], [stile, opening.height + stile, thickness * 0.8]);
    for (const y of [opening.y - opening.height / 2, opening.y + opening.height / 2]) box(isWindow && profile.id === 'B3' ? 'metal' : 'trim',
      [opening.x, y, front + thickness * 0.12], [opening.width, stile, thickness * 0.8]);
    if (isWindow) {
      const columns = profile.id === 'B6' ? 6 : 4;
      // Coarse mullions are kept at reduced quality because they identify these facades.
      for (let i = 1; i < columns; i++) box(profile.id === 'B3' ? 'metal' : 'trim',
        [opening.x - opening.width / 2 + opening.width * i / columns, opening.y, front + thickness * 0.15],
        [stile * 0.55, opening.height, thickness * 0.5]);
      const rows = profile.id === 'B6' ? 3 : 2;
      for (let i = 1; i < rows; i++) box(profile.id === 'B3' ? 'metal' : 'trim',
        [opening.x, opening.y - opening.height / 2 + opening.height * i / rows, front + thickness * 0.15],
        [opening.width, stile * 0.55, thickness * 0.5]);
      if (detail) box('metal', [opening.x, opening.y - opening.height / 2 - stile * 0.75, front + thickness * 0.45],
        [opening.width + stile, stile * 0.75, thickness * 1.4]);
    } else {
      box('dark', [opening.x, opening.y, front - thickness * 0.1], [frame * 0.22, opening.height, thickness * 0.36]);
      box('dark', [opening.x, opening.y + opening.height * 0.16, front - thickness * 0.09], [opening.width, frame * 0.14, thickness * 0.34]);
      if (detail) for (let i = 1; i < 9; i++) box('dark',
        [opening.x - opening.width / 2 + opening.width * i / 9, opening.y, front - thickness * 0.06],
        [frame * 0.07, opening.height, thickness * 0.2]);
    }
  }

  let canopyFront: number | null = null;
  if (profile.id === 'B1') {
    const top = h * 1.03;
    // Photographed rectangular frame hides the uncertain roof completely at the front.
    box('wall', [0, (eave + top) / 2, front - thickness / 2], [w, top - eave, thickness]);
    for (const x of [-0.49, -0.315, -0.065, 0.06, 0.28, 0.49]) box('trim', [w * x, (base + top) / 2, front + thickness * 0.42], [frame, top - base, thickness * 1.5]);
    for (const ratio of [0.52, 0.87, 1.02]) box('trim', [0, h * ratio, front + thickness * 0.50], [w, frame * 1.10, thickness * 1.65]);
    beam('trim', [-w / 2, h * 0.85, front + thickness * 0.52], [w * 0.06, h * 0.76, front + thickness * 0.52], frame * 0.8);
    box('trim', [0, h * 0.51, front + thickness], [w, frame * 0.65, thickness * 2.8]);
    // Low concealed roof, no invented triangular front or doorway awnings.
    gable(0, w, eave, ridge, d, 0, false);
    for (const side of [-1, 1]) box('trim', [side * w / 2, h * 0.98, 0], [thickness, h * 0.14, d]);
  } else if (profile.id === 'B3') {
    const count = 4;
    const span = w / count;
    const rise = ridge - eave;
    for (let i = 0; i < count; i++) {
      const x = -w / 2 + span * (i + 0.5);
      box('roof', [x, eave + rise / 2, 0], [Math.hypot(span, rise), h * 0.015, d], [0, 0, -Math.atan2(rise, span)]);
      // Opaque, inherited roof return: no invented clerestory glass or new northlights.
      box('cladding', [x - span / 2 + thickness / 2, eave + rise / 2, 0], [thickness, rise, d]);
      for (const side of [-1, 1]) triangles.push({ material: 'cladding', vertices: side > 0
        ? [[x - span / 2, eave, front], [x + span / 2, eave, front], [x - span / 2, ridge, front]]
        : [[x + span / 2, eave, -front], [x - span / 2, eave, -front], [x - span / 2, ridge, -front]] });
    }
    const projection = pavilionArchitectureCanopyProjection(layout);
    canopyFront = front + projection;
    const canopyY = eave + h * 0.015;
    box('roof', [0, canopyY, front + projection / 2], [w + thickness * 2, h * 0.022, projection]);
    box('trim', [0, canopyY - h * 0.055, canopyFront], [w, h * 0.09, frame * 0.8]);
    box('accent', [0, h * 0.755, front + thickness * 0.1], [w, h * 0.06, thickness * 0.9]);
    for (const x of [-0.49, -0.345, -0.21, -0.075, 0.06, 0.345, 0.49]) {
      box('trim', [x * w, (base + eave) / 2, front + thickness * 0.4], [frame, eave - base, thickness * 1.5]);
      beam('trim', [x * w, canopyY - h * 0.10, front], [x * w, canopyY - h * 0.025, canopyFront], frame * 0.45);
      if (detail) beam('trim', [x * w, h * 0.68, front], [x * w, canopyY - h * 0.025, canopyFront - projection * 0.18], frame * 0.32);
    }
  } else if (profile.id === 'B4' || profile.id === 'B5') {
    gable(0, w, eave, ridge, d, 0, true);
    for (const x of [-0.25, 0, 0.25]) {
      const top = ridge - Math.abs(x * 2) * (ridge - eave);
      box('trim', [x * w, (eave + top) / 2, front + thickness * 0.8], [frame * 0.45, top - eave, thickness * 0.6]);
    }
    const upperBandBottom = profile.id === 'B4' ? h * 0.76 : h * 0.70;
    box('cladding', [0, (eave + upperBandBottom) / 2, front + thickness * 0.2], [w - frame, eave - upperBandBottom, thickness * 0.65]);
    box('trim', [0, upperBandBottom, front + thickness * 0.6], [w, frame * 0.85, thickness]);
    for (const x of [-0.49, 0, 0.49]) box('trim', [x * w, (base + eave) / 2, front + thickness * 0.3], [frame, eave - base, thickness * 1.3]);
    // One wide, pitched canopy. Its triangulation is batched into the same
    // steel draw call as the facade, never one React object per diagonal.
    const canopyW = w * (profile.id === 'B4' ? 0.78 : 0.88);
    const projection = pavilionArchitectureCanopyProjection(layout);
    canopyFront = front + projection;
    const canopyEave = h * (profile.id === 'B4' ? 0.65 : 0.70);
    const canopyRidge = canopyEave + h * 0.105;
    gable(0, canopyW, canopyEave, canopyRidge, projection, front + projection / 2, false);
    const chordY = canopyEave - h * 0.055;
    const steel = frame * 0.33;
    for (const z of [front + thickness, canopyFront]) {
      beam('metal', [-canopyW / 2, chordY, z], [canopyW / 2, chordY, z], steel);
      beam('metal', [-canopyW / 2, canopyEave, z], [0, canopyRidge, z], steel);
      beam('metal', [0, canopyRidge, z], [canopyW / 2, canopyEave, z], steel);
      const count = detail ? 12 : 8;
      for (let i = 0; i < count; i++) {
        const x0 = -canopyW / 2 + canopyW * i / count;
        const x1 = -canopyW / 2 + canopyW * (i + 1) / count;
        const topAt = (x: number) => canopyRidge - Math.abs(x / (canopyW / 2)) * (canopyRidge - canopyEave);
        beam('metal', [x0, i % 2 ? topAt(x0) : chordY, z], [x1, i % 2 ? chordY : topAt(x1), z], steel * 0.72);
      }
    }
    for (const x of [-canopyW / 2, canopyW / 2]) {
      box('metal', [x, (base + chordY) / 2, canopyFront - Math.min(0.03, projection * 0.12)], [steel * 1.65, chordY - base, steel * 1.65]);
      beam('metal', [x, chordY, front], [x, chordY, canopyFront], steel);
      beam('metal', [x, canopyEave, front], [x, canopyEave, canopyFront], steel);
      for (let i = 0; i < 4; i++) {
        const z0 = front + projection * i / 4, z1 = front + projection * (i + 1) / 4;
        beam('metal', [x, i % 2 ? canopyEave : chordY, z0], [x, i % 2 ? chordY : canopyEave, z1], steel * 0.72);
      }
    }
    // Sparse small vents where visible in P8, not a continuous monitor.
    if (profile.id === 'B4') for (const z of [-d * 0.24, d * 0.15]) {
      box('metal', [0, ridge + h * 0.035, z], [frame, h * 0.065, frame]);
      box('metal', [0, ridge + h * 0.075, z], [frame * 1.7, h * 0.025, frame * 1.7]);
    }
  } else {
    // The inherited upper roof is conservative. The photographed identity is
    // the single long front and its folded metal fascia, not three entrances.
    for (let i = 0; i < 3; i++) gable(-w / 2 + w / 3 * (i + 0.5), w / 3, eave, ridge, d, 0, true);
    const projection = pavilionArchitectureCanopyProjection(layout);
    canopyFront = front + projection;
    const nodes = [-0.5, -0.29, -0.06, 0.15, 0.32, 0.5];
    const levels = [0.87, 0.91, 0.84, 0.82, 0.86, 0.80];
    for (let i = 0; i < nodes.length - 1; i++) {
      const dx = (nodes[i + 1] - nodes[i]) * w, dy = (levels[i + 1] - levels[i]) * h;
      const length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
      const centerX = (nodes[i] + nodes[i + 1]) * w / 2, y = (levels[i] + levels[i + 1]) * h / 2;
      box('roof', [centerX, y - h * 0.03, front + projection / 2], [length, h * 0.018, projection], [0, 0, angle]);
      box('cladding', [centerX, y, canopyFront], [length, h * 0.115, thickness], [0, 0, angle]);
      beam('trim', [nodes[i] * w, levels[i] * h - h * 0.06, canopyFront + thickness / 2],
        [nodes[i + 1] * w, levels[i + 1] * h - h * 0.06, canopyFront + thickness / 2], frame * 0.4);
    }
    for (const x of [-0.49, -0.245, -0.055, 0.135, 0.185, 0.355, 0.49]) {
      box('trim', [x * w, h * 0.43, front + thickness * 0.25], [frame * 0.85, h * 0.78, thickness * 1.4]);
      beam('trim', [x * w, h * 0.77, front], [x * w, h * 0.80, canopyFront], frame * 0.6);
    }
    // Dark plinth is interrupted at gates; never form a barrier at a threshold.
    for (const [a, b] of [[-0.5, -0.06], [0.135, 0.185], [0.355, 0.5]]) box('trim',
      [(a + b) * w / 2, base + h * 0.075, front], [(b - a) * w, h * 0.15, thickness * 1.3]);
  }
  if (detail) {
    // Gutters/downpipes stay on outer edges, clear of doors and canopies.
    for (const side of [-1, 1]) box('metal', [side * (w / 2 - frame * 0.45), (base + eave) / 2, front + thickness],
      [frame * 0.22, eave - base, frame * 0.22]);
  }
  return { profile, batches, triangles, floorY: layout.interior.floorY, frontZ: front, eaveY: eave, ridgeY: ridge,
    canopyFrontZ: canopyFront, facadeOpenings: openings, boxCount: Object.values(batches).reduce((count, items) => count + items.length, 0) };
}
