import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import { SOY_RESTROOM, GATE_NINE_TANKS } from '../data/soyGateInfrastructure';
import { hydrologicalPlanPointToWorldXZ } from '../data/hydrologicalInfrastructure';
import type { StrategicLandmarkBounds } from './landmarks';

type V3 = [number, number, number];
type MaterialKey =
  'wall' | 'roof' | 'trim' | 'platform' | 'metal' | 'accent' | 'dark';

/** Static detail is merged once per material, never rebuilt for selection. */
function builder() {
  const buckets: Partial<Record<MaterialKey, THREE.BufferGeometry[]>> = {};
  const add = (
    key: MaterialKey,
    geometry: THREE.BufferGeometry,
    position: V3,
    rotation: V3 = [0, 0, 0],
  ) => {
    geometry.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.clearGroups();
    (buckets[key] ??= []).push(flat);
  };
  const box = (key: MaterialKey, size: V3, position: V3, rotation?: V3) =>
    add(key, new THREE.BoxGeometry(...size), position, rotation);
  const finish = () =>
    Object.entries(buckets).map(([key, parts]) => {
      const geometry = mergeBufferGeometries(parts, false)!;
      parts.forEach((part) => part.dispose());
      return { key: key as MaterialKey, geometry };
    });
  return { add, box, finish };
}

export function buildSoyRestroomParts() {
  const b = builder();
  const {
    wallHeight: h,
    roofRise: rise,
    wallThickness: t,
  } = SOY_RESTROOM.assumed;
  // Local X is across the entrances; +Z points toward B7 after parent yaw.
  const w = 1.3,
    d = 1.8,
    floor = 0.036,
    door = 0.24,
    doorH = 0.33;
  b.box('platform', [1.46, floor + 0.08, 2.08], [0, (floor - 0.08) / 2, 0]);
  b.box('accent', [w, 0.095, t], [0, 0.08, -d / 2]);
  [-1, 1].forEach((side) => {
    // Separate low concrete approaches terminate at the asphalt edge.
    b.box('platform', [0.28, 0.112, 0.989], [side * 0.34, -0.022, 1.5345]);
    b.box('wall', [t, h, d], [(side * (w - t)) / 2, floor + h / 2, 0]);
    b.box('accent', [t + 0.004, 0.095, d], [(side * (w - t)) / 2, 0.08, 0]);
    // Real recessed openings, with the opaque door set behind the facade.
    const cx = side * 0.34;
    b.box('dark', [door, doorH, 0.018], [cx, floor + doorH / 2, d / 2 - 0.09]);
    b.box(
      'trim',
      [door + 0.035, 0.022, 0.11],
      [cx, floor + doorH + 0.01, d / 2 - 0.035],
    );
    [-1, 1].forEach((edge) =>
      b.box(
        'trim',
        [0.018, doorH, 0.11],
        [cx + (edge * (door + 0.018)) / 2, floor + doorH / 2, d / 2 - 0.035],
      ),
    );
    b.box(
      'platform',
      [door + 0.075, 0.014, 0.18],
      [cx, floor + 0.007, d / 2 - 0.01],
    );
    b.box(
      'metal',
      [0.01, 0.044, 0.016],
      [cx + 0.08, floor + 0.16, d / 2 - 0.075],
    );
    // High-level ventilation in the long side, below the eaves.
    [-0.48, 0.38].forEach((z) => {
      b.box('dark', [0.008, 0.065, 0.23], [side * (w / 2 + 0.001), 0.398, z]);
      [0, 1, 2].forEach((i) =>
        b.box(
          'trim',
          [0.012, 0.009, 0.245],
          [side * (w / 2 + 0.007), 0.373 + i * 0.025, z],
        ),
      );
    });
  });
  b.box('wall', [w, h, t], [0, floor + h / 2, -d / 2 + t / 2]);
  // Front piers and lintel leave both doorway apertures open geometrically.
  b.box('wall', [0.44, doorH, t], [0, floor + doorH / 2, d / 2]);
  [-1, 1].forEach((side) =>
    b.box('wall', [0.19, doorH, t], [side * 0.555, floor + doorH / 2, d / 2]),
  );
  b.box('wall', [w, h - doorH, t], [0, floor + doorH + (h - doorH) / 2, d / 2]);
  const run = w / 2 + 0.045,
    pitch = Math.atan2(rise, run),
    slope = Math.hypot(run, rise);
  [-1, 1].forEach((side) => {
    b.box(
      'roof',
      [slope, 0.027, d + 0.095],
      [(side * run) / 2, floor + h + rise / 2, 0],
      [0, 0, -side * pitch],
    );
    b.box('trim', [0.024, 0.045, d + 0.095], [side * run, floor + h, 0]);
    for (let i = 0; i < 17; i++)
      b.box(
        'roof',
        [slope, 0.008, 0.009],
        [(side * run) / 2, floor + h + rise / 2 + 0.017, -0.88 + i * 0.11],
        [0, 0, -side * pitch],
      );
  });
  b.box('metal', [0.058, 0.024, d + 0.1], [0, floor + h + rise + 0.01, 0]);
  [-1, 1].forEach((end) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(0, rise);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: t,
      bevelEnabled: false,
      steps: 1,
    });
    b.add('wall', g, [0, floor + h, (end * d) / 2 - t / 2]);
  });
  return b.finish();
}

export function buildGateNineTankParts(
  bounds: Pick<StrategicLandmarkBounds, 'centerX' | 'centerZ'>,
) {
  const b = builder(),
    spec = GATE_NINE_TANKS;
  spec.sourcePagePositions.forEach((point, index) => {
    const world = hydrologicalPlanPointToWorldXZ([...point]);
    const x = world[0] - bounds.centerX,
      z = world[1] - bounds.centerZ;
    const baseY = 0.04,
      top = baseY + spec.supportHeight;
    b.box(
      'platform',
      [spec.baseSize, baseY + 0.08, spec.baseSize],
      [x, (baseY - 0.08) / 2, z],
    );
    [-1, 1].forEach((sx) =>
      [-1, 1].forEach((sz) => {
        b.box(
          'metal',
          [0.023, spec.supportHeight, 0.023],
          [x + sx * 0.115, baseY + spec.supportHeight / 2, z + sz * 0.115],
        );
      }),
    );
    for (let level = 1; level <= 3; level++) {
      [-1, 1].forEach((side) => {
        b.box(
          'metal',
          [0.25, 0.012, 0.018],
          [x, baseY + level * 0.28, z + side * 0.115],
        );
        b.box(
          'metal',
          [0.018, 0.012, 0.25],
          [x + side * 0.115, baseY + level * 0.28, z],
        );
      });
    }
    b.box('platform', [0.38, 0.03, 0.38], [x, top, z]);
    const r = spec.radius,
      height = spec.tankHeight * [1.03, 1, 0.97][index];
    const profile = [
      [0, 0],
      [r * 0.84, 0],
      [r * 0.97, 0.025],
      [r, 0.055],
      [r, height - 0.05],
      [r * 0.97, height - 0.015],
      [r * 0.85, height],
      [0, height],
    ].map(([a, y]) => new THREE.Vector2(a, y));
    b.add('wall', new THREE.LatheGeometry(profile, 32), [x, top + 0.018, z]);
    b.add(
      index === 0 ? 'accent' : 'roof',
      new THREE.SphereGeometry(
        r * 0.98,
        32,
        8,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2,
      ).scale(1, 0.18, 1),
      [x, top + height + 0.018, z],
    );
    b.add('metal', new THREE.CylinderGeometry(0.03, 0.03, 0.018, 16), [
      x,
      top + height + 0.055,
      z,
    ]);
    b.add(
      'metal',
      new THREE.CylinderGeometry(0.009, 0.009, spec.supportHeight, 8),
      [x + 0.09, baseY + spec.supportHeight / 2, z + 0.09],
    );
  });
  return b.finish();
}
