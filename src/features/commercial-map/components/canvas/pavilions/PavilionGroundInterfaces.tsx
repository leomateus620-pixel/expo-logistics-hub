import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CommercialPavilionMaterials } from '../CommercialPavilion';
import type { CommercialPavilionLayout } from '../../../utils/commercialPavilions';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '../../../constants';
import { createPavilionGroundInterfaces, type PavilionGroundRect } from '../../../utils/pavilionGroundInterfaces';

const NO_RAYCAST = () => undefined;

function merged(parts: THREE.BufferGeometry[]) {
  if (!parts.length) return null;
  const geometry = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  return geometry;
}
function rectGeometry(rect: PavilionGroundRect) {
  return new THREE.BoxGeometry(rect.maxX - rect.minX, rect.topY - rect.bottomY, rect.maxZ - rect.minZ)
    .translate((rect.minX + rect.maxX) / 2, (rect.bottomY + rect.topY) / 2, (rect.minZ + rect.maxZ) / 2);
}
function railGeometry(from: THREE.Vector3, to: THREE.Vector3, size: number) {
  const geometry = new THREE.BoxGeometry(size, from.distanceTo(to), size);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  geometry.applyQuaternion(quaternion).translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return geometry;
}

/** Two merged batches. There is no collider or React object per railing bar. */
export const PavilionGroundInterfaces = memo(function PavilionGroundInterfaces({ layout, materials, cutaway = false }: {
  layout: CommercialPavilionLayout;
  materials: CommercialPavilionMaterials;
  showDetail?: boolean;
  cutaway?: boolean;
}) {
  const geometry = useMemo(() => {
    const plan = createPavilionGroundInterfaces(layout);
    const slabs = [...plan.landings, ...plan.steps].map(rectGeometry);
    for (const ramp of plan.ramps) {
      const part = new THREE.BoxGeometry(ramp.maxX - ramp.minX, 1, ramp.maxZ - ramp.minZ);
      const positions = part.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const t = positions.getX(i) / (ramp.maxX - ramp.minX) + 0.5;
        positions.setY(i, positions.getY(i) > 0 ? ramp.startY + (ramp.endY - ramp.startY) * t : ramp.bottomY);
      }
      part.translate((ramp.minX + ramp.maxX) / 2, 0, (ramp.minZ + ramp.maxZ) / 2);
      part.computeVertexNormals(); slabs.push(part);
    }
    // The window deck has visible short support piers below its edge.
    const deck = plan.landings.find(part => part.id === 'p3:window-platform');
    if (deck) for (let i = 0; i < 4; i++) {
      const x = deck.minX + (deck.maxX - deck.minX) * (i + 0.5) / 4;
      const pierHeight = Math.max(.01, deck.bottomY - COMMERCIAL_MAP_GROUND_ELEVATION);
      slabs.push(new THREE.BoxGeometry(.035, pierHeight, .045).translate(x, COMMERCIAL_MAP_GROUND_ELEVATION + pierHeight / 2, deck.maxZ - .035));
    }
    const rails: THREE.BufferGeometry[] = [];
    const height = layout.height * .065, bar = layout.height * .0045;
    for (const rail of plan.rails) {
      const from = new THREE.Vector3(...rail.from), to = new THREE.Vector3(...rail.to);
      for (const ratio of [.52, 1]) rails.push(railGeometry(from.clone().add(new THREE.Vector3(0, height * ratio, 0)), to.clone().add(new THREE.Vector3(0, height * ratio, 0)), bar));
      const count = Math.max(2, Math.ceil(from.distanceTo(to) / .24));
      for (let index = 0; index <= count; index++) {
        const point = from.clone().lerp(to, index / count);
        rails.push(railGeometry(point, point.clone().add(new THREE.Vector3(0, height, 0)), bar));
      }
    }
    return { slabs: merged(slabs), rails: merged(rails) };
  }, [layout]);
  useEffect(() => () => { geometry.slabs?.dispose(); geometry.rails?.dispose(); }, [geometry]);
  return <group name="pavilion-ground-interfaces" raycast={NO_RAYCAST} dispose={null}>
    {geometry.slabs && <mesh geometry={geometry.slabs} material={materials.platform} receiveShadow raycast={NO_RAYCAST} />}
    {!cutaway && geometry.rails && <mesh geometry={geometry.rails} material={materials.metal} raycast={NO_RAYCAST} />}
  </group>;
});
