import * as THREE from 'three';
import type { SpecimenTreeProfile } from '../data/commercialTreeSpecimens';
import { createInternalLeafLobe } from './internalTreeVisuals';
import type { VegetationLodTier } from './vegetationLod';

const DETAIL = {
  near: { ringSides: 12, samplesPerLink: 4, leafSprays: 76, sprayScale: .74, fineWood: true },
  mid: { ringSides: 8, samplesPerLink: 2, leafSprays: 35, sprayScale: .84, fineWood: false },
  far: { ringSides: 6, samplesPerLink: 1, leafSprays: 15, sprayScale: 1, fineWood: false },
} as const;

function makeWood(profile: SpecimenTreeProfile, tier: VegetationLodTier) {
  const { ringSides, samplesPerLink, fineWood } = DETAIL[tier];
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const dark = new THREE.Color(profile.barkPalette[0]);
  const light = new THREE.Color(profile.barkPalette[1]);
  const color = new THREE.Color();
  const right = new THREE.Vector3(0, 0, 1);
  const up = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const previous = new THREE.Vector3();
  const bend = new THREE.Quaternion();
  const center = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  const paths = fineWood ? [...profile.limbs, ...profile.fineWood] : profile.limbs;
  for (const [branch, path] of paths.entries()) {
    const curve = new THREE.CatmullRomCurve3(path.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const steps = (path.length - 1) * samplesPerLink;
    const first = positions.length / 3;
    curve.getTangent(0, previous);
    axis.set(Math.abs(previous.y) > .8 ? 1 : 0, Math.abs(previous.y) > .8 ? 0 : 1, 0);
    right.crossVectors(axis, previous).normalize();
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      curve.getPoint(t, center);
      curve.getTangent(t, tangent);
      bend.setFromUnitVectors(previous, tangent);
      right.applyQuaternion(bend).normalize();
      up.crossVectors(tangent, right).normalize();
      previous.copy(tangent);
      const knot = Math.min(path.length - 2, Math.floor(step / samplesPerLink));
      const radius = THREE.MathUtils.lerp(path[knot][3], path[knot + 1][3], step / samplesPerLink - knot);
      for (let side = 0; side < ringSides; side += 1) {
        const angle = side * 2 * Math.PI / ringSides;
        const fold = Math.sin(5 * angle + branch * 1.6 + t * .63);
        const fluting = Math.sin(3 * angle - t * 2.2 + branch) * .046 + fold * .043;
        const across = Math.cos(angle) * radius * (1 + fluting);
        const rise = Math.sin(angle) * radius * (1 + fluting);
        positions.push(
          center.x + right.x * across + up.x * rise,
          center.y + right.y * across + up.y * rise,
          center.z + right.z * across + up.z * rise,
        );
        color.copy(dark).lerp(light, .53 + fold * .19 + Math.cos(angle * 2 + t * 9 + branch) * .13);
        colors.push(color.r, color.g, color.b);
        if (step < steps) {
          const a = first + step * ringSides + side;
          const b = first + step * ringSides + (side + 1) % ringSides;
          indices.push(a, b, a + ringSides, b, b + ringSides, a + ringSides);
        }
      }
    }
    const last = first + steps * ringSides;
    for (let side = 1; side < ringSides - 1; side += 1) {
      indices.push(first, first + side + 1, first + side, last, last + side, last + side + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeFoliage(profile: SpecimenTreeProfile, tier: VegetationLodTier) {
  const { leafSprays, sprayScale } = DETAIL[tier];
  const lobe = createInternalLeafLobe(leafSprays, sprayScale);
  const sourcePosition = lobe.getAttribute('position');
  const sourceNormal = lobe.getAttribute('normal');
  const sourceUv = lobe.getAttribute('uv');
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const axis = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const palette = profile.foliagePalette.map((color) => new THREE.Color(color));
  const shade = new THREE.Color();
  for (const [index, [x, y, z, radiusX, radiusY, radiusZ, tone]] of profile.foliage.entries()) {
    const yaw = index * 2.399963;
    // Move each whole leaf spray by a different amount. The branch tips
    // remain the centers of open, irregular clusters at every detail level.
    for (let vertex = 0; vertex < sourcePosition.count; vertex += 1) {
      const spray = Math.floor(vertex / 6);
      const phase = spray * 2.399963 + index * 3.3;
      position.fromBufferAttribute(sourcePosition, vertex).applyAxisAngle(axis, yaw);
      normal.fromBufferAttribute(sourceNormal, vertex).applyAxisAngle(axis, yaw);
      positions.push(
        x + (position.x + Math.sin(phase * 1.9) * .10) * radiusX,
        y + (position.y + Math.cos(phase * .83) * .14) * radiusY,
        z + (position.z + Math.sin(phase) * .10) * radiusZ,
      );
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(sourceUv.getX(vertex), sourceUv.getY(vertex));
      shade.copy(palette[tone]).multiplyScalar(.98 + Math.sin(spray * 2.2 + index) * .16);
      colors.push(shade.r, shade.g, shade.b);
    }
  }
  lobe.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createCommercialTreeSpecimenGeometry(profile: SpecimenTreeProfile, tier: VegetationLodTier) {
  return { bark: makeWood(profile, tier), foliage: makeFoliage(profile, tier) };
}
