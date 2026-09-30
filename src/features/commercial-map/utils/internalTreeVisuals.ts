import * as THREE from 'three';
import { INTERNAL_GROUND_OWNERSHIP_RINGS } from '../data/internalGroundCoverage';
import { COMMERCIAL_MAP_TREES } from '../data/commercialTrees';
import { isPavilion12FrontTreeId } from '../data/pavilion12FrontTrees';
import { OFFICIAL_REFERENCE_DATA } from '../data/officialReference2026';
import { PARK_ACCESS_SPATIAL_PLAN } from '../data/parkAccessSpatialPlan';
import { PAVILION_COURTYARD } from '../data/pavilionCourtyard';
import { resolveParkAccessEnvironmentPresentation } from '../data/parkAccessEnvironment';
import { parkingConvexHull, parkingContainsPoint } from './parkingGeometry';
import { pilotRandom } from './vegetationPilot';
import type { CommercialMapQualityTier } from './viewport';

// Interior commercial blocks and their intervening streets. This envelope stops
// at their cadastral edges; it never uses the camera bounds or the regional map.
const coreIds = new Set(['QUADRA-I', 'QUADRA-J', 'QUADRA-D', 'QUADRA-E', 'CALCADA-ARVOREDO']);
const core = parkingConvexHull(OFFICIAL_REFERENCE_DATA.entities
  .filter(e => coreIds.has(e.publicIdentifier)).flatMap(e => e.geometry.coordinates[0]));
export const INTERNAL_TREE_VISUAL_RINGS = [
  ...INTERNAL_GROUND_OWNERSHIP_RINGS, core,
  ...OFFICIAL_REFERENCE_DATA.entities.filter(e => e.classification === 'QUADRA'
    || ['RUA-BRASIL', 'RUA-ARGENTINA', 'CALCADA-ARVOREDO', 'AREA-MOTORHOME'].includes(e.publicIdentifier))
    .map(e => e.geometry.coordinates[0]),
  ...PARK_ACCESS_SPATIAL_PLAN.benvenutoPavilionEdge.treeBand.segments.map(s => s.polygon),
  ...PAVILION_COURTYARD.trees.map(tree => tree.rootOpening),
].filter(Boolean);

// Ground cover stops at its material edges, not necessarily at the park edge.
// These four existing park-tree inventories include authored trunks at the
// woodland/B22 collar, Rua Brasil verge and Nations plaza perimeter. Admit only
// their exact stable points; do not invent a wider parcel/perimeter or recolour
// neighboring regional/roadside trees by proximity to one of these records.
const authoredInteriorEdgeAreas = new Set([
  'PAVILIONS_1_14_GROVE', 'RUA_BRASIL_GROVE', 'TERCEIRA_IDADE_EDGE', 'NATIONS_DISTRICT',
]);
const pointKey = (point: readonly [number, number]) => `${point[0].toFixed(4)}:${point[1].toFixed(4)}`;
const authoredInteriorTreePoints = new Set([...COMMERCIAL_MAP_TREES
  .filter(tree => authoredInteriorEdgeAreas.has(tree.area) || isPavilion12FrontTreeId(tree.id))
  .map(tree => pointKey(tree.position)),
  // These five deterministic points belong to the authored B22 approach,
  // including its planted collars. The outer Costeiros road bands stay out.
  ...resolveParkAccessEnvironmentPresentation(false, true).ambientTrees
    .filter(tree => tree.sourceZoneId === 'third-age-access-dense-tree-band'
      || tree.sourceZoneId === 'third-age-access-sparse-tree-band')
    .map(tree => pointKey(tree.position)),
]);
export const isInternalParkVegetationPoint = (point: readonly [number, number]) =>
  authoredInteriorTreePoints.has(pointKey(point))
  || INTERNAL_TREE_VISUAL_RINGS.some(ring => parkingContainsPoint(point, ring));

export const INTERNAL_TREE_TRUNK_RADIUS_FACTOR = 0.58;

/** Leaf sprays need diffuse daylight/night lighting, not a per-fragment metal
 * BRDF. Bark and all exterior/pilot materials retain their existing PBR path.
 */
export function createInternalFoliageMaterial(atlas: THREE.Texture, vertexColors = false) {
  const material = new THREE.MeshLambertMaterial({
    name: 'internal-small-leaf-diffuse',
    color: '#ffffff',
    vertexColors,
    map: atlas,
    alphaTest: .32,
    side: THREE.FrontSide,
    shadowSide: THREE.FrontSide,
    depthWrite: true,
  });
  material.forceSinglePass = true;
  return material;
}

/** Execution budget only: whole-tree geometry, positions and collisions remain
 * identical. Existing trunk/branch casters and contact patches stay active.
 */
export const internalTreeCrownCastsShadow = (tier: CommercialMapQualityTier) =>
  tier === 'HIGH' || tier === 'ULTRA';

/** A small irregular spray, not the pilot's upright pinnate twig. Rasterizing
 * each leaf's bounds avoids testing every leaf against all 65,536 texels.
 * Coverage-preserving mipmaps keep the entire crown at distant LODs.
 */
export function createInternalLeafAtlas() {
  const size = 256, data = new Uint8Array(size * size * 4), random = pilotRandom(48173);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 202; data[i + 1] = 218; data[i + 2] = 180;
  }
  for (let leaf = 0; leaf < 64; leaf++) {
    const phase = leaf * 2.399963 + (random() - .5) * .8;
    const radius = Math.sqrt(random()) * .35;
    const cx = .5 + Math.cos(phase) * radius, cy = .5 + Math.sin(phase) * radius;
    const angle = random() * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
    const length = .047 + random() * .032, width = length * (.36 + random() * .22);
    const extent = Math.max(length, width), tone = .76 + random() * .2;
    for (let y = Math.max(0, Math.floor((cy - extent) * size)); y <= Math.min(size - 1, Math.ceil((cy + extent) * size)); y++) {
      for (let x = Math.max(0, Math.floor((cx - extent) * size)); x <= Math.min(size - 1, Math.ceil((cx + extent) * size)); x++) {
        const dx = (x + .5) / size - cx, dy = (y + .5) / size - cy;
        const along = (dx * c + dy * s) / length, across = (-dx * s + dy * c) / width;
        const contour = Math.abs(along) ** 1.55 + across * across;
        if (contour >= 1) continue;
        const offset = (y * size + x) * 4;
        const alpha = Math.min(1, (1 - contour) * 13);
        if (alpha * 255 < data[offset + 3]) continue;
        const shade = tone * (.94 - across * .09 - contour * .08 + Math.exp(-Math.abs(across) * 30) * .035);
        data[offset] = Math.round(231 * shade);
        data[offset + 1] = Math.round(246 * shade);
        data[offset + 2] = Math.round(214 * shade);
        data[offset + 3] = Math.round(alpha * 255);
      }
    }
  }
  const coverage = data.filter((value, index) => index % 4 === 3 && value >= 82).length / (size * size);
  const mipmaps = [{ data, width: size, height: size }];
  let previous = data, width = size;
  while (width > 1) {
    const nextWidth = width / 2, next = new Uint8Array(nextWidth * nextWidth * 4);
    for (let y = 0; y < nextWidth; y++) for (let x = 0; x < nextWidth; x++) for (let channel = 0; channel < 4; channel++) {
      const source = (y * 2 * width + x * 2) * 4 + channel;
      next[(y * nextWidth + x) * 4 + channel] = (previous[source] + previous[source + 4]
        + previous[source + width * 4] + previous[source + width * 4 + 4]) / 4;
    }
    const alphas = Array.from({ length: nextWidth * nextWidth }, (_, i) => next[i * 4 + 3]).sort((a, b) => b - a);
    const gain = 90 / Math.max(1, alphas[Math.max(0, Math.ceil(alphas.length * coverage) - 1)]);
    for (let i = 3; i < next.length; i += 4) next[i] = Math.min(255, next[i] * gain);
    mipmaps.push({ data: next, width: nextWidth, height: nextWidth });
    previous = next; width = nextWidth;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.name = 'internal-irregular-small-leaf-spray';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mipmaps = mipmaps;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** Forty stationary sprays per lobe: 80 triangles, equal to the former solid
 * icosahedron. Tangential, rolled cards form a volume instead of a repeated
 * vertical ear. Seven authored lobes retain species/ID-specific silhouettes.
 * One shared 256² atlas, one instanced crown batch, no per-frame leaf work.
 */
export function createInternalLeafLobe() {
  const random = pilotRandom(89231), p: number[] = [], n: number[] = [], uv: number[] = [];
  const center = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const normal = new THREE.Vector3(), reference = new THREE.Vector3(), roll = new THREE.Quaternion();
  for (let i = 0; i < 40; i++) {
    const y = 1 - 2 * (i + .5) / 40, angle = i * 2.399963 + (random() - .5) * .4;
    const radius = .25 + Math.cbrt(random()) * .56;
    center.set(Math.sqrt(1 - y * y) * Math.cos(angle), y, Math.sqrt(1 - y * y) * Math.sin(angle)).multiplyScalar(radius);
    normal.copy(center).normalize();
    reference.set(Math.abs(normal.y) > .9 ? 1 : 0, Math.abs(normal.y) > .9 ? 0 : 1, 0);
    right.crossVectors(reference, normal).normalize();
    up.crossVectors(normal, right).normalize();
    roll.setFromAxisAngle(normal, random() * Math.PI * 2);
    right.applyQuaternion(roll); up.applyQuaternion(roll);
    const length = .56 + random() * .2, width = length * (.8 + random() * .22);
    const mirror = random() > .5;
    for (const [u,v] of [[0,0],[1,0],[0,1],[1,0],[1,1],[0,1]]) {
      const vertex = center.clone().addScaledVector(right, (u-.5)*width).addScaledVector(up, (v-.5)*length);
      p.push(vertex.x, vertex.y, vertex.z);
      const shadingNormal = center.clone().setY(center.y * .45 + .55).normalize();
      n.push(shadingNormal.x, shadingNormal.y, shadingNormal.z); uv.push(mirror ? 1-u : u,v);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p,3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(n,3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
