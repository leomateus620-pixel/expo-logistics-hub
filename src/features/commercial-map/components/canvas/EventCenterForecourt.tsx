import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { MapEntity } from '../../types';
import { eventCenterForecourt } from '../../utils/eventCenterForecourt';
import { FENASOJA_EVENT_CENTER_LAYOUT } from '../../utils/eventCenter';
import { applyParkSurfaceDetail } from './parkSurfaceMaterial';
const NO_RAYCAST = () => undefined;

export const EventCenterForecourt = memo(function EventCenterForecourt({
  entities,
  visible,
  reducedGraphics,
}: {
  entities: readonly MapEntity[];
  visible: boolean;
  reducedGraphics: boolean;
}) {
  const resources = useMemo(() => {
    const area = eventCenterForecourt(entities);
    if (!area) return null;
    const material = new THREE.MeshStandardMaterial({
      color: FENASOJA_EVENT_CENTER_LAYOUT.palette.concrete,
      roughness: 0.96,
    });
    applyParkSurfaceDetail(material, 'concrete', reducedGraphics);
    const geometry = new THREE.BoxGeometry(area.maxX - area.minX, 0.022, area.maxZ - area.minZ);
    geometry.translate((area.minX + area.maxX) / 2, area.elevation + 0.011, (area.minZ + area.maxZ) / 2);
    const vertices: number[] = [];
    const count = Math.ceil((area.maxZ - area.minZ) / 0.55);
    for (let i = 1; i < count; i++) {
      const z = area.minZ + ((area.maxZ - area.minZ) * i) / count;
      vertices.push(area.minX, area.elevation + 0.023, z, area.maxX, area.elevation + 0.023, z);
    }
    const joints = new THREE.BufferGeometry();
    joints.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const jointMaterial = new THREE.LineBasicMaterial({
      color: '#6f756d',
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    return { material, geometry, joints, jointMaterial };
  }, [entities, reducedGraphics]);
  useEffect(
    () => () => {
      if (resources) Object.values(resources).forEach((resource) => resource.dispose());
    },
    [resources],
  );
  if (!resources) return null;
  return (
    <group name="centro-eventos-fenasoja-forecourt" visible={visible} dispose={null}>
      <mesh geometry={resources.geometry} material={resources.material} receiveShadow raycast={NO_RAYCAST} />
      <lineSegments geometry={resources.joints} material={resources.jointMaterial} raycast={NO_RAYCAST} />
    </group>
  );
});
