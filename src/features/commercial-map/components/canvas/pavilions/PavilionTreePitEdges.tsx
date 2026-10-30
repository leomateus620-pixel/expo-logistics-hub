import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { MapEntity } from '../../../types';
import { PAVILION_COURTYARD } from '../../../data/pavilionCourtyard';

const NO_RAYCAST = () => undefined;

/** Existing circular root opening remains open at its exact radius. Only the
 * photographed dark plinth and light coping are added; no new tree or soil.
 */
export const PavilionTreePitEdges = memo(function PavilionTreePitEdges({ entities, visible = true }: {
  entities: readonly MapEntity[];
  visible?: boolean;
}) {
  const tree = PAVILION_COURTYARD.trees.find(candidate => candidate.sourceZoneId === 'pavilion-1-sidewalk-tree')!;
  const owned = entities.some(entity => entity.publicIdentifier === 'B1' && !entity.isArchived);
  const resources = useMemo(() => {
    const ring = (outerRadius: number, depth: number, baseY: number) => {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      tree.rootOpening.forEach(([x, z], index) => {
        if (index === 0) hole.moveTo(x - tree.position[0], z - tree.position[1]);
        else hole.lineTo(x - tree.position[0], z - tree.position[1]);
      });
      hole.closePath(); shape.holes.push(hole);
      return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 24 })
        .rotateX(-Math.PI / 2).translate(tree.position[0], baseY, tree.position[1]);
    };
    return {
      base: ring(tree.radius + .045, .027, PAVILION_COURTYARD.elevation),
      coping: ring(tree.radius + .027, .027, PAVILION_COURTYARD.elevation + .027),
      dark: new THREE.MeshStandardMaterial({ color: '#555754', roughness: .94 }),
      light: new THREE.MeshStandardMaterial({ color: '#d5d4ca', roughness: .92 }),
    };
  }, [tree]);
  useEffect(() => () => Object.values(resources).forEach(resource => resource.dispose()), [resources]);
  return <group name="pavilion-1-existing-tree-pit-edge" visible={visible && owned} raycast={NO_RAYCAST} dispose={null}>
    <mesh geometry={resources.base} material={resources.dark} receiveShadow raycast={NO_RAYCAST} />
    <mesh geometry={resources.coping} material={resources.light} receiveShadow raycast={NO_RAYCAST} />
  </group>;
});
