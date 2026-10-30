import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { MapEntity } from '../../../types';
import { buildPavilionConnectedComplex, type PavilionConstructionJoin } from '../../../utils/pavilionConnectedComplex';

const NO_RAYCAST = () => undefined;

/** One closed construction seam between the two existing side-wall envelopes.
 * Side faces are omitted: their only neighbors are the existing shells. No
 * duplicate coplanar facade, canopy, accessible opening or commercial hitbox.
 */
export function createPavilionJoinGeometry(join: PavilionConstructionJoin) {
  const { minX, maxX, minZ, maxZ, floorY, westEaveY, eastEaveY, thickness } = join;
  const vertices: number[] = [], roofVertices: number[] = [];
  const quad = (out: number[], a: number[], b: number[], c: number[], d: number[]) => out.push(...a, ...b, ...c, ...a, ...c, ...d);
  const westRear = join.westRearEaveY ?? westEaveY, eastRear = join.eastRearEaveY ?? eastEaveY;
  const y0 = 0, w = westEaveY - thickness, e = eastEaveY - thickness;
  quad(vertices, [minX, y0, minZ], [minX, w, minZ], [maxX, e, minZ], [maxX, y0, minZ]);
  quad(vertices, [maxX, y0, maxZ], [maxX, eastRear - thickness, maxZ], [minX, westRear - thickness, maxZ], [minX, y0, maxZ]);
  quad(roofVertices, [minX, westEaveY, minZ], [minX, westRear, maxZ], [maxX, eastRear, maxZ], [maxX, eastEaveY, minZ]);
  // Roof fascia is a single-owner fold, entirely inside the join footprint.
  for (const [z, reverse, westY, eastY] of [[minZ, false, westEaveY, eastEaveY], [maxZ, true, westRear, eastRear]] as const) {
    const points = [[minX, westY - thickness, z], [minX, westY, z], [maxX, eastY, z], [maxX, eastY - thickness, z]];
    if (reverse) points.reverse(); quad(roofVertices, ...points as [number[], number[], number[], number[]]);
  }
  const geometry = (positions: number[]) => {
    const part = new THREE.BufferGeometry();
    part.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    part.computeVertexNormals(); return part;
  };
  // The slab fills only the construction gap and has no side faces: those
  // edges terminate exactly at the existing side walls.
  quad(vertices, [minX, floorY, minZ], [minX, floorY, maxZ], [maxX, floorY, maxZ], [maxX, floorY, minZ]);
  return { walls: geometry(vertices), roof: geometry(roofVertices) };
}

export function PavilionConstructionJoinMesh({ join, opacity, visible }: { join: PavilionConstructionJoin; opacity: number; visible: boolean }) {
  const geometry = useMemo(() => createPavilionJoinGeometry(join), [join]);
  const materials = useMemo(() => ({
    wall: new THREE.MeshStandardMaterial({ color: '#c9c8bf', roughness: .91 }),
    roof: new THREE.MeshStandardMaterial({ color: '#777e7d', roughness: .66, metalness: .24, side: THREE.DoubleSide }),
  }), []);
  useEffect(() => {
    for (const material of Object.values(materials)) {
      material.color.set(material === materials.wall ? '#c9c8bf' : '#777e7d').lerp(new THREE.Color('#748078'), (1 - opacity) * .7);
    }
  }, [materials, opacity]);
  useEffect(() => () => {
    geometry.walls.dispose(); geometry.roof.dispose();
  }, [geometry]);
  useEffect(() => () => { materials.wall.dispose(); materials.roof.dispose(); }, [materials]);
  return <group name={join.owner} visible={visible} raycast={NO_RAYCAST} dispose={null}>
    <mesh geometry={geometry.walls} material={materials.wall} receiveShadow raycast={NO_RAYCAST} />
    <mesh geometry={geometry.roof} material={materials.roof} castShadow receiveShadow raycast={NO_RAYCAST} />
  </group>;
}

export const PavilionConnectedComplex = memo(function PavilionConnectedComplex({ entities, visible = true, selectedEntityId = null, layerOpacity = {} }: {
  entities: readonly MapEntity[];
  visible?: boolean;
  selectedEntityId?: string | null;
  layerOpacity?: Readonly<Record<string, number>>;
}) {
  const joins = useMemo(() => buildPavilionConnectedComplex(entities), [entities]);
  const layers = useMemo(() => new Map(entities.map(entity => [entity.id, entity.layerId])), [entities]);
  return <group visible={visible} name="pavilions-3-13-8-construction-joins">
    {joins.map(join => {
      const opacity = Math.min(...join.entityIds.map(id => layerOpacity[layers.get(id) ?? ''] ?? 1));
      return <PavilionConstructionJoinMesh key={join.id} join={join} opacity={opacity} visible={opacity > .015 && !join.entityIds.includes(selectedEntityId ?? '')} />;
    })}
  </group>;
});
