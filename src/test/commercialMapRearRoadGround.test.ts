import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { officialPdfPointToLocal } from '@/features/commercial-map/data/officialReference2026';
import { REAR_GATE_5_PRESENTATION, rearRoadFocusBoundsForOfficialOwner } from '@/features/commercial-map/data/rearParkRoadNetwork';
import { integrateGroundGeometryWithRearRoads } from '@/features/commercial-map/utils/rearRoadGroundIntegration';
import { rearAttachment5ReferencePointById } from '@/features/commercial-map/utils/rearSpatialCalibration';
import { ARENA_FRONT_LAYOUT } from '@/features/commercial-map/data/parkEnvironment';
import { buildRearRoadCorridorFootprints, distanceToPath } from '@/features/commercial-map/utils/rearRoadNetwork';
import { REAR_TERRAIN_PATCHES, sourcePolygonToLocal } from '@/features/commercial-map/data/rearParkEnvironment';
import { buildRearTerrainPatchGeometry } from '@/features/commercial-map/utils/rearTerrainGeometry';

describe('encontro físico da Arena com a rede posterior', () => {
  it('mantém a face e as normais da extensão de terreno voltadas para cima', () => {
    REAR_TERRAIN_PATCHES.forEach((patch) => {
      const geometry = buildRearTerrainPatchGeometry(sourcePolygonToLocal(patch.sourcePolygon), patch.baseElevation);
      const normal = geometry.getAttribute('normal');
      for (let vertex = 0; vertex < normal.count; vertex += 1) expect(normal.getY(vertex)).toBeGreaterThan(0.99);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
      const position = geometry.getAttribute('position');
      const indices = geometry.getIndex()!;
      const center = new THREE.Vector3();
      for (let vertex = 0; vertex < 3; vertex += 1) center.add(new THREE.Vector3().fromBufferAttribute(position, indices.getX(vertex)));
      center.divideScalar(3).add(new THREE.Vector3(0, 2, 0));
      expect(new THREE.Raycaster(center, new THREE.Vector3(0, -1, 0)).intersectObject(mesh).length).toBeGreaterThan(0);
      geometry.dispose();
      mesh.material.dispose();
    });
  });

  it('preserva as 20 árvores decorativas e mantém todas as copas fora do asfalto', () => {
    const roads = buildRearRoadCorridorFootprints();
    expect(ARENA_FRONT_LAYOUT.treeClusters).toHaveLength(20);
    ARENA_FRONT_LAYOUT.treeClusters.forEach((tree) => roads.forEach((road) => {
      const center = officialPdfPointToLocal(tree.sourcePosition);
      expect(distanceToPath(center, road.centerline), `${tree.sourcePosition}: ${road.segmentId}`)
        .toBeGreaterThan(road.halfWidth + tree.scale * 0.3);
    }));
  });

  it('recorta triângulos inteiros e parciais sem perder UVs, cor ou orientação', () => {
    // Control point on the annex-2 Portão 5 ribbon (curve → Etnias), so the
    // cut is sampled on live asphalt rather than a historic centerline.
    const [x, z] = officialPdfPointToLocal([5128, 3478]);
    const geometry = new THREE.PlaneGeometry(8, 4, 10, 6);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(x, 0.052, z);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(
      Array.from({ length: geometry.getAttribute('position').count * 3 }, () => 0.5), 3,
    ));
    integrateGroundGeometryWithRearRoads(geometry);
    expect(geometry.getIndex()).toBeNull();
    const positions = geometry.getAttribute('position');
    expect(positions.count).toBeGreaterThan(0);
    expect(geometry.getAttribute('uv').count).toBe(positions.count);
    expect(geometry.getAttribute('color').count).toBe(positions.count);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    // The old .052 terrain hid the .032 road. Even rays through partial
    // grid cells must now see a true opening, rather than a lowered decal.
    for (const dx of [-2, -1, 0, 1, 2]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x + dx, 2, z), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObject(mesh)).toHaveLength(0);
    }
    const outsideRay = new THREE.Raycaster(new THREE.Vector3(x, 2, z + 1.5), new THREE.Vector3(0, -1, 0));
    expect(outsideRay.intersectObject(mesh).length).toBeGreaterThan(0);
    const normals = geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i += 1) expect(normals.getY(i)).toBeGreaterThan(0);
    geometry.dispose();
    mesh.material.dispose();
  });

  it('não altera nenhuma superfície fora da intervenção', () => {
    const geometry = new THREE.PlaneGeometry(2, 2);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(-50, 0.052, -50);
    const index = geometry.getIndex();
    const position = geometry.getAttribute('position');
    integrateGroundGeometryWithRearRoads(geometry);
    expect(geometry.getIndex()).toBe(index);
    expect(geometry.getAttribute('position')).toBe(position);
    geometry.dispose();
  });

  it('estrutura, seleção e foco do A5 acompanham P6, sem um pedestal sobre o asfalto', () => {
    expect(REAR_GATE_5_PRESENTATION.center).toEqual(
      officialPdfPointToLocal(rearAttachment5ReferencePointById(6).officialSource),
    );
    const focus = rearRoadFocusBoundsForOfficialOwner('A5')!;
    expect((focus.minX + focus.maxX) / 2).toBeCloseTo(REAR_GATE_5_PRESENTATION.center[0]);
    expect((focus.minZ + focus.maxZ) / 2).toBeCloseTo(REAR_GATE_5_PRESENTATION.center[1]);
    expect(REAR_GATE_5_PRESENTATION.clearWidth).toBeGreaterThan(0.8);
    expect(REAR_GATE_5_PRESENTATION.clearHeight).toBeGreaterThan(0.8);
  });
});
