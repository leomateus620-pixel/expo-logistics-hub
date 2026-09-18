import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import polygonClipping from 'polygon-clipping';
import { OFFICIAL_REFERENCE_DATA } from '../features/commercial-map/data/officialReference2026';
import { ARENA_PARKING_ROAD_CUT, arenaParkingPolygons, createArenaParkingGeometry } from '../features/commercial-map/utils/arenaParkingGeometry';
import type { Coordinate } from '../features/commercial-map/types';
import { COMMERCIAL_MAP_TREES } from '../features/commercial-map/data/commercialTrees';
import { commercialTreeGroundElevation } from '../features/commercial-map/utils/treeLayer';
import { naturalParkingGroundElevationAt } from '../features/commercial-map/utils/naturalParkingGround';
import { REAR_TERRAIN_PATCHES, sourcePolygonToLocal } from '../features/commercial-map/data/rearParkEnvironment';
import { buildRearTerrainPatchGeometry } from '../features/commercial-map/utils/rearTerrainGeometry';
import { clipContextPolygon } from '../features/commercial-map/data/commercialMapSpatialBounds';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '../features/commercial-map/constants';
import { TERRITORY_PATCHES } from '../features/commercial-map/data/territorialEnvironment';
import { pointInPolygon } from '../features/commercial-map/utils/spatialSurface';

describe('continuidade natural dos estacionamentos junto às Etnias', () => {
  for (const identifier of ['EST-EXP-VIS', 'EST-VIS']) {
    it(`${identifier}: preserva cadastro, recorta vias e elimina a saia de placa`, () => {
      const entity = OFFICIAL_REFERENCE_DATA.entities.find(e => e.publicIdentifier === identifier)!;
      const before = JSON.stringify(entity);
      const geometry = createArenaParkingGeometry(entity, 0.06);
      const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
      for (let i = 0; i < positions.count; i++) {
        // No vertical retaining wall; the canonical top and world UVs remain.
        expect(positions.getY(i)).toBeCloseTo(0.06, 6);
        expect(uv.getX(i)).toBeCloseTo(positions.getX(i), 5);
        expect(uv.getY(i)).toBeCloseTo(positions.getZ(i), 5);
      }
      const overlap = polygonClipping.intersection(arenaParkingPolygons(entity), ARENA_PARKING_ROAD_CUT);
      const overlapArea = overlap.flat().reduce((sum, ring) => sum + Math.abs(ring.reduce((area, p, i) => {
        const q = ring[(i + 1) % ring.length];
        return area + p[0] * q[1] - p[1] * q[0];
      }, 0)) / 2, 0);
      // Polygon booleans can retain collinear numeric slivers (~1e-14 width).
      expect(overlapArea).toBeLessThan(1e-10);
      expect(JSON.stringify(entity)).toBe(before);
      const center = entity.geometry.coordinates[0].slice(0, -1).reduce(
        (p, q) => [p[0] + q[0] / 4, p[1] + q[1] / 4] as Coordinate, [0, 0] as Coordinate,
      );
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
      mesh.updateMatrixWorld();
      // A hidden material avoids a second terrain draw, while raycasting retains
      // the exact commercial-map interaction owner and road-cut hit surface.
      const hits = new THREE.Raycaster(new THREE.Vector3(center[0], 2, center[1]), new THREE.Vector3(0, -1, 0)).intersectObject(mesh);
      expect(hits.length).toBeGreaterThan(0);
      geometry.dispose(); mesh.material.dispose();
    });
  }

  it('apoia árvores na superfície visual contínua sem modificar IDs ou posições x/z', () => {
    const trees = COMMERCIAL_MAP_TREES.filter(t => ['EST-EXP-VIS', 'EST-VIS'].includes(t.surfaceEntityIdentifier ?? ''));
    expect(trees.length).toBeGreaterThan(0);
    const before = JSON.stringify(trees);
    for (const tree of trees) {
      expect(commercialTreeGroundElevation(tree, OFFICIAL_REFERENCE_DATA.entities))
        .toBeCloseTo(naturalParkingGroundElevationAt(tree.position) + 0.004, 6);
    }
    expect(JSON.stringify(trees)).toBe(before);
  });

  it('deriva o receptor da triangulação real do terreno e da base compartilhada', () => {
    expect(naturalParkingGroundElevationAt([-1000, -1000])).toBe(COMMERCIAL_MAP_GROUND_ELEVATION);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = REAR_TERRAIN_PATCHES.map(patch => {
      const geometry = buildRearTerrainPatchGeometry(clipContextPolygon(sourcePolygonToLocal(patch.sourcePolygon)), patch.baseElevation);
      const mesh = new THREE.Mesh(geometry, material); mesh.updateMatrixWorld();
      return mesh;
    });
    // Check the actual interior tree sites as well as boundary vertices: a
    // different Earcut diagonal can agree at corners but miss the support plane.
    const points = [
      ...COMMERCIAL_MAP_TREES.filter(tree => ['EST-EXP-VIS', 'EST-VIS'].includes(tree.surfaceEntityIdentifier ?? '')).map(tree => tree.position),
      ...OFFICIAL_REFERENCE_DATA.entities.filter(entity => ['EST-EXP-VIS', 'EST-VIS'].includes(entity.publicIdentifier ?? '')).flatMap(entity => entity.geometry.coordinates[0]),
    ];
    for (const point of points) {
      const hits = new THREE.Raycaster(new THREE.Vector3(point[0], 2, point[1]), new THREE.Vector3(0, -1, 0)).intersectObjects(meshes);
      const territoryElevation = TERRITORY_PATCHES.some(patch => patch.kind !== 'water' && pointInPolygon(point, patch.ring)) ? 0.015 : COMMERCIAL_MAP_GROUND_ELEVATION;
      const expected = Math.max(COMMERCIAL_MAP_GROUND_ELEVATION, territoryElevation, ...hits.map(hit => hit.point.y));
      expect(naturalParkingGroundElevationAt(point)).toBeCloseTo(expected, 6);
    }
    meshes.forEach(mesh => mesh.geometry.dispose()); material.dispose();
  });
});
