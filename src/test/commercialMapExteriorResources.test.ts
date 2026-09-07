import { expect, it } from 'vitest';
import * as THREE from 'three';
import { buildExteriorArchitectureScene, updateExteriorLod } from '../features/commercial-map/utils/exteriorArchitectureScene';
import { finishExteriorPatch } from '../features/commercial-map/utils/exteriorSurfaceMaterials';
import { territoryPolygonGeometry } from '../features/commercial-map/utils/territorialRoadGeometry';
import { TERRITORY_PATCHES, TERRITORY_BUILDINGS, TERRITORY_TREES } from '../features/commercial-map/data/territorialEnvironment';

it('keeps every building and tree represented across LOD/quality changes, reuses resources and disposes them once', () => {
  const plan = buildExteriorArchitectureScene();
  const resources = new Set<THREE.BufferGeometry>();
  plan.meshes.forEach(m => ['near', 'map', 'far'].forEach(lod => resources.add(m.userData[lod])));
  plan.farCells.forEach(c => resources.add(c.mesh.geometry));
  const original = [...resources].map(g => g.uuid);
  const counts = new Map<string, number>();
  resources.forEach(g => g.addEventListener('dispose', () => counts.set(g.uuid, (counts.get(g.uuid) ?? 0) + 1)));
  const camera = new THREE.PerspectiveCamera(38, 1.7, .1, 1000);
  try {
    for (let i = 0; i < 30; i++) {
      camera.position.set(-27, i % 3 ? 12 : 280, -101);
      const trees = i % 4 !== 0;
      updateExteriorLod(plan.meshes, camera, 768, i % 2 === 0, trees, plan.farCells);
      const direct = plan.meshes.filter(m => m.visible && !m.userData.exteriorTrees).reduce((sum, m) => sum + m.count, 0);
      const batched = plan.farCells.filter(c => c.mesh.visible).reduce((sum, c) => sum + c.owners.reduce((n, m) => n + m.count, 0), 0);
      expect(direct + batched).toBe(TERRITORY_BUILDINGS.length);
      expect(plan.meshes.filter(m => m.visible && m.userData.exteriorTrees).reduce((sum, m) => sum + m.count, 0)).toBe(trees ? TERRITORY_TREES.length : 0);
      expect([...resources].map(g => g.uuid)).toEqual(original);
    }
  } finally { plan.dispose(); }
  expect([...counts.values()]).toHaveLength(resources.size);
  expect([...counts.values()].every(count => count === 1)).toBe(true);
});

it('adds terrain detail without changing planar area, bounds or elevation', () => {
  function area(geometry: THREE.BufferGeometry) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = g.getAttribute('position');
    let sum = 0;
    for (let i = 0; i < p.count; i += 3) {
      sum += Math.abs((p.getX(i + 1) - p.getX(i)) * (p.getZ(i + 2) - p.getZ(i)) - (p.getZ(i + 1) - p.getZ(i)) * (p.getX(i + 2) - p.getX(i))) / 2;
    }
    if (g !== geometry) g.dispose();
    return sum;
  }
  for (const patch of TERRITORY_PATCHES.filter(p => p.kind !== 'water')) {
    const ring = patch.ring.map(p => [p[0], p[1]] as [number, number]);
    ring.push([...ring[0]]);
    const source = territoryPolygonGeometry([[ring]], .015);
    source.computeBoundingBox();
    const bounds = source.boundingBox!.clone(), originalArea = area(source);
    const refined = finishExteriorPatch(source, patch);
    try {
      refined.computeBoundingBox();
      expect(refined.boundingBox!.min.distanceTo(bounds.min)).toBeLessThan(.0001);
      expect(refined.boundingBox!.max.distanceTo(bounds.max)).toBeLessThan(.0001);
      expect(Math.abs(area(refined) - originalArea)).toBeLessThan(.02);
      const positions = refined.getAttribute('position');
      for (let i = 0; i < positions.count; i++) expect(positions.getY(i)).toBeCloseTo(.015, 6);
    } finally { refined.dispose(); }
  }
});
