import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import { commercialPavilionModelBounds } from '@/features/commercial-map/utils/commercialPavilions';
import { strategicLandmarkBounds, strategicLandmarkVisualHeight } from '@/features/commercial-map/utils/landmarks';
import { administrativeEntranceLawnHeight, createAdministrativeCenterEntranceLayout } from '@/features/commercial-map/utils/administrativeCenterEntrance';
import { administrativeEntranceSignMetrics, createAdministrativeCenterEntranceGeometries, createAdministrativeEntranceTreeGeometries, createAdministrativeEntranceLawnGeometry } from '@/features/commercial-map/components/canvas/AdministrativeCenterEntrance';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '@/features/commercial-map/constants';

const entity = OFFICIAL_REFERENCE_ENTITIES.find(candidate => candidate.publicIdentifier === 'B11')!;
const bounds = commercialPavilionModelBounds(strategicLandmarkBounds(entity), Math.PI / 2);
const layout = createAdministrativeCenterEntranceLayout(bounds, strategicLandmarkVisualHeight(entity)!);

describe('renderização da entrada fotografada do Centro Administrativo', () => {
  it('usa cinco batches estáticos e uma placa, com volumes finitos e gramado recortado próprio', () => {
    const geometry = createAdministrativeCenterEntranceGeometries(layout);
    try {
      expect(Object.keys(geometry)).toEqual(['structure', 'roof', 'platform', 'hedge', 'glass', 'sign']);
      for (const part of Object.values(geometry)) {
        expect(part).toBeTruthy();
        expect(Array.from(part.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      }
      expect(layout.lawnUsesExistingGround).toBe(false);
      expect(geometry.hedge.boundingBox!.max.y).toBeCloseTo(layout.hedgeRows[0].elevation + layout.hedgeRows[0].height, 6);
      expect(geometry.hedge.boundingBox!.min.x).toBeCloseTo(layout.hedgeRows[0].minX, 6);
      expect(geometry.hedge.boundingBox!.max.x).toBeCloseTo(layout.hedgeRows[0].maxX, 6);
    } finally { Object.values(geometry).forEach(part => part.dispose()); }
  });

  it('recorta todo o concreto e coincide com a altura física da encosta em cada vértice', () => {
    const geometry = createAdministrativeEntranceLawnGeometry(layout);
    try {
      const positions = geometry.getAttribute('position'), floors = [layout.walkway, ...layout.steps];
      let area = 0;
      for (let i = 0; i < positions.count; i++) expect(positions.getY(i)).toBeCloseTo(administrativeEntranceLawnHeight(layout, positions.getX(i), positions.getZ(i)), 5);
      for (let i = 0; i < positions.count; i += 3) {
        const x = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3;
        const z = (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3;
        expect(floors.some(rect => x > rect.minX + 1e-6 && x < rect.maxX - 1e-6 && z > rect.minZ + 1e-6 && z < rect.maxZ - 1e-6)).toBe(false);
        area += Math.abs((positions.getX(i + 1) - positions.getX(i)) * (positions.getZ(i + 2) - positions.getZ(i))
          - (positions.getZ(i + 1) - positions.getZ(i)) * (positions.getX(i + 2) - positions.getX(i))) / 2;
      }
      const lawnArea = (layout.lawn.maxX - layout.lawn.minX) * (layout.lawn.maxZ - layout.lawn.minZ);
      const floorArea = [layout.walkway, ...layout.steps.filter(step => step.minX >= layout.walkway.maxX - 1e-8)]
        .reduce((sum, rect) => sum + (rect.maxX - rect.minX) * (rect.maxZ - rect.minZ), 0);
      expect(area).toBeCloseTo(lawnArea - floorArea, 5);
      expect(geometry.boundingBox!.min.y).toBeCloseTo(COMMERCIAL_MAP_GROUND_ELEVATION, 6);
      expect(geometry.boundingBox!.max.y).toBeCloseTo(layout.lawn.elevation, 6);
      const zValues = Array.from({ length: positions.count }, (_, i) => positions.getZ(i));
      expect(zValues.some(z => Math.abs(z - (layout.lawn.minZ + .14)) < 1e-6)).toBe(true);
      expect(zValues.some(z => Math.abs(z - (layout.lawn.maxZ - .14)) < 1e-6)).toBe(true);
    } finally { geometry.dispose(); }
  });

  it('conserva as duas águas, o caminho, os arbustos e a placa quando reduz as diagonais', () => {
    const detailed = createAdministrativeCenterEntranceGeometries(layout, true);
    const reduced = createAdministrativeCenterEntranceGeometries(layout, false);
    try {
      for (const key of ['roof', 'platform', 'hedge', 'glass', 'sign'] as const) expect(reduced[key].getAttribute('position').array).toEqual(detailed[key].getAttribute('position').array);
      expect(reduced.structure.getAttribute('position').count).toBeLessThan(detailed.structure.getAttribute('position').count);
      for (const bound of ['min', 'max'] as const) for (const axis of ['x', 'y', 'z'] as const) {
        expect(reduced.structure.boundingBox![bound][axis]).toBeCloseTo(detailed.structure.boundingBox![bound][axis], 3);
      }
    } finally { [...Object.values(detailed), ...Object.values(reduced)].forEach(part => part.dispose()); }
  });

  it('renderiza a cota TOP do caminho igual ao apoio numérico compartilhado', () => {
    const geometry = createAdministrativeCenterEntranceGeometries(layout);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    try {
      const mesh = new THREE.Mesh(geometry.platform, material);
      const ray = new THREE.Raycaster(new THREE.Vector3((layout.walkway.minX + layout.walkway.maxX) / 2, 2, (layout.walkway.minZ + layout.walkway.maxZ) / 2), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0];
      expect(hit).toBeTruthy();
      expect(hit.point.y).toBeCloseTo(layout.walkway.elevation, 6);
      for (const step of layout.steps) {
        const ray = new THREE.Raycaster(new THREE.Vector3((step.minX + step.maxX) / 2, 2, (step.minZ + step.maxZ) / 2), new THREE.Vector3(0, -1, 0));
        expect(ray.intersectObject(mesh)[0].point.y).toBeCloseTo(step.elevation, 6);
      }
    } finally { material.dispose(); Object.values(geometry).forEach(part => part.dispose()); }
  });

  it('usa duas geometrias para a árvore da foto, com tronco penetrando a copa dentro do raio protegido', () => {
    const geometry = createAdministrativeEntranceTreeGeometries(layout.tree);
    try {
      expect(Object.keys(geometry)).toEqual(['wood', 'foliage']);
      const crown = geometry.foliage.boundingBox!, trunk = geometry.wood.boundingBox!, tree = layout.tree;
      expect(trunk.min.y).toBeCloseTo(tree.groundY, 5);
      expect(trunk.max.y).toBeGreaterThan(crown.min.y + .2);
      expect(crown.min.x).toBeGreaterThanOrEqual(tree.x - tree.crownRadius - 1e-6);
      expect(crown.max.x).toBeLessThanOrEqual(tree.x + tree.crownRadius + 1e-6);
      expect(crown.min.z).toBeGreaterThanOrEqual(tree.z - tree.crownRadius - 1e-6);
      expect(crown.max.z).toBeLessThanOrEqual(tree.z + tree.crownRadius + 1e-6);
      expect(crown.min.y).toBeGreaterThanOrEqual(tree.crownCenterY - tree.crownHalfHeight - 1e-6);
      expect(crown.max.y).toBeLessThanOrEqual(tree.crownCenterY + tree.crownHalfHeight + 1e-6);
      expect(geometry.foliage.getAttribute('position').count).toBe(7 * 40 * 6);
      expect(Array.from(geometry.foliage.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    } finally { Object.values(geometry).forEach(part => part.dispose()); }
  });

  it('mantém todo o letreiro além das treliças e orientado para +X, antes do yaw do B11', () => {
    const geometry = createAdministrativeCenterEntranceGeometries(layout);
    const sign = administrativeEntranceSignMetrics(layout);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    try {
      const meshes = Object.entries(geometry).filter(([key]) => key !== 'sign').map(([, part]) => new THREE.Mesh(part, material));
      const samples = [[sign.bottomY, layout.canopy.minZ], [sign.bottomY, layout.canopy.maxZ], [layout.canopy.eaveY, layout.canopy.minZ],
        [layout.canopy.eaveY, layout.canopy.maxZ], [layout.canopy.ridgeY, sign.centerZ], [sign.bottomY + sign.height * .4, sign.centerZ]];
      for (const [y, z] of samples) for (const direction of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, .15, .4).normalize(), new THREE.Vector3(1, .15, -.4).normalize()]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(sign.frontX, y, z), direction);
        expect(ray.intersectObjects(meshes)).toHaveLength(0);
      }
      const normals = geometry.sign.getAttribute('normal');
      expect(Array.from({ length: normals.count }, (_, i) => normals.getX(i)).every(value => value > .99)).toBe(true);
      expect(Array.from(geometry.sign.getAttribute('uv').array).every(value => value >= -1e-6 && value <= 1 + 1e-6)).toBe(true);
    } finally { material.dispose(); Object.values(geometry).forEach(part => part.dispose()); }
  });
});
