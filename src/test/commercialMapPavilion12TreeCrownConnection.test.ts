import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { COMMERCIAL_MAP_TREES } from '@/features/commercial-map/data/commercialTrees';
import { isPavilion12FrontTreeId } from '@/features/commercial-map/data/pavilion12FrontTrees';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { commercialTreeWoodStructure } from '@/features/commercial-map/utils/commercialTreeWoodStructure';
import { crownLobeTransform } from '@/features/commercial-map/components/canvas/CommercialTreeLayer';
import { createInternalLeafLobe } from '@/features/commercial-map/utils/internalTreeVisuals';
import { buildVisitWorld } from '@/features/commercial-map/visit/VisitWorld';

const trees = COMMERCIAL_MAP_TREES.filter(tree => isPavilion12FrontTreeId(tree.id));

describe('Pavilion 12 trunk-to-crown continuity', () => {
  it.each(trees)('$id joins the existing central foliage volume with its stem and both forks', tree => {
    const wood = commercialTreeWoodStructure(tree);
    const leafGeometry = createInternalLeafLobe();
    const lobe = crownLobeTransform(tree, 0, 7);
    const object = new THREE.Object3D();
    object.position.set(lobe.offsetX, tree.trunkHeight + tree.crownHeight * .32 + lobe.offsetY + lobe.lift, lobe.offsetZ);
    object.rotation.set(lobe.rotation * .08, lobe.rotation, -lobe.rotation * .045);
    object.scale.set(lobe.scaleX, lobe.scaleY, lobe.scaleZ); object.updateMatrix();
    const foliage = leafGeometry.boundingBox!.clone().applyMatrix4(object.matrix);
    expect(foliage.containsPoint(new THREE.Vector3(0, wood.trunkHeight, 0))).toBe(true);
    for (const branch of wood.branches) {
      expect(branch.endY).toBeGreaterThan(branch.startY);
      expect(branch.endY).toBeGreaterThan(foliage.min.y);
      expect(branch.endY).toBeLessThan(foliage.max.y);
    }
    leafGeometry.dispose();
  });

  it('keeps all other stems, positions, crowns and inventory dimensions unchanged', () => {
    const before = JSON.stringify(COMMERCIAL_MAP_TREES);
    for (const tree of COMMERCIAL_MAP_TREES.filter(tree => !isPavilion12FrontTreeId(tree.id))) {
      const wood = commercialTreeWoodStructure(tree);
      expect(wood.trunkHeight).toBe(tree.trunkHeight);
      wood.branches.forEach((branch, i) => {
        expect(branch.startY).toBe(tree.trunkHeight * (.58 + i * .08));
        expect(branch.endY).toBe(branch.startY + tree.crownHeight * (.34 + i * .045));
      });
    }
    expect(JSON.stringify(COMMERCIAL_MAP_TREES)).toBe(before);
  });

  it('uses the connected stem height for the same three simplified visit colliders', () => {
    const world = buildVisitWorld({ entities: OFFICIAL_REFERENCE_DATA.entities, trees, includeContext: false });
    for (const tree of trees) {
      const collider = world.collisions.colliders.find(c => c.id === tree.id)!;
      expect(collider.maxY - collider.minY).toBeCloseTo(commercialTreeWoodStructure(tree).trunkHeight, 9);
      expect(collider).toMatchObject({ x: tree.position[0], z: tree.position[1] });
    }
    expect(world.collisions.colliders.filter(c => isPavilion12FrontTreeId(c.id))).toHaveLength(3);
  });
});
