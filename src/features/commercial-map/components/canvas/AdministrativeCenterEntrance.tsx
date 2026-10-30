import { memo, useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CommercialPavilionMaterials } from './CommercialPavilion';
import { administrativeEntranceLawnHeight, type AdministrativeCenterEntranceLayout, type AdministrativeEntranceRect } from '../../utils/administrativeCenterEntrance';
import { createInternalFoliageMaterial, createInternalLeafAtlas, createInternalLeafLobe } from '../../utils/internalTreeVisuals';
import { createPilotBarkMaterial } from './vegetationPilotMaterial';
import { useSceneVegetationEnabled } from './PublicScenePolicyContext';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { applyInteriorGroundMaterial } from './interiorGroundMaterial';
import { acquirePavilionArchitectureTextures, releasePavilionArchitectureTextures, installPavilionMetricUV } from './pavilions/PavilionArchitectureMaterials';

const NO_RAYCAST = () => undefined;
type Batch = 'structure' | 'roof' | 'platform' | 'hedge' | 'glass';
type Point = [number, number, number];

/** One graded lawn surface, cut exactly around the shared concrete footprints. */
export function createAdministrativeEntranceLawnGeometry(layout: AdministrativeCenterEntranceLayout) {
  const { lawn } = layout, floors = [layout.walkway, ...layout.steps];
  const xs = [...new Set([lawn.minX, lawn.maxX, ...floors.flatMap(rect => [rect.minX, rect.maxX])])]
    .filter(x => x >= lawn.minX && x <= lawn.maxX).sort((a, b) => a - b);
  const zs = [...new Set([lawn.minZ, lawn.minZ + .14, lawn.maxZ - .14, lawn.maxZ, ...floors.flatMap(rect => [rect.minZ, rect.maxZ])])]
    .filter(z => z >= lawn.minZ && z <= lawn.maxZ).sort((a, b) => a - b);
  const positions: number[] = [], uvs: number[] = [];
  for (let xi = 0; xi < xs.length - 1; xi++) for (let zi = 0; zi < zs.length - 1; zi++) {
    const x0 = xs[xi], x1 = xs[xi + 1], z0 = zs[zi], z1 = zs[zi + 1];
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    if (floors.some(rect => x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ)) continue;
    for (const [px, pz] of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]) {
      positions.push(px, administrativeEntranceLawnHeight(layout, px, pz), pz); uvs.push(px, pz);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function administrativeEntranceSignMetrics(layout: AdministrativeCenterEntranceLayout) {
  const { canopy } = layout;
  const width = canopy.maxZ - canopy.minZ, rise = canopy.ridgeY - canopy.eaveY;
  const height = Math.max(width * .16, rise * 1.8);
  const postSize = Math.max(.015, width * .025);
  return { width, height, rise, bottomY: canopy.ridgeY - height, centerZ: (canopy.minZ + canopy.maxZ) / 2,
    frontX: canopy.maxX + postSize * .68, postSize };
}

/** Only entrance dressing. The B11 body, identity and picking stay with its landmark. */
export function createAdministrativeCenterEntranceGeometries(layout: AdministrativeCenterEntranceLayout, showDetail = true) {
  const parts: Record<Batch, THREE.BufferGeometry[]> = { structure: [], roof: [], platform: [], hedge: [], glass: [] };
  const { canopy, walkway, door } = layout;
  const sign = administrativeEntranceSignMetrics(layout);
  const length = canopy.maxX - canopy.minX, centerX = (canopy.minX + canopy.maxX) / 2;
  const centerZ = sign.centerZ, halfZ = sign.width / 2;
  const post = sign.postSize, steel = post * .46, groundY = layout.hedgeRows[0]?.elevation ?? .03;
  const trussDepth = Math.max(.035, sign.rise * .62), chordY = canopy.eaveY - trussDepth;
  const box = (batch: Batch, position: Point, scale: Point, rotation: Point = [0, 0, 0]) => {
    if (scale.some(value => value <= 0)) return;
    const geometry = new THREE.BoxGeometry(...scale);
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1)));
    parts[batch].push(geometry);
  };
  const beam = (from: Point, to: Point, size = steel) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), delta = b.clone().sub(a), length = delta.length();
    if (length <= 0) return;
    const geometry = new THREE.BoxGeometry(length, size, size);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), delta.normalize()));
    geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); parts.structure.push(geometry);
  };
  // Walkway/landing elevation is the visible top, shared with numeric visit supports.
  const slab = (rect: AdministrativeEntranceRect) => box('platform', [(rect.minX + rect.maxX) / 2, rect.elevation - rect.height / 2, (rect.minZ + rect.maxZ) / 2],
    [rect.maxX - rect.minX, rect.height, rect.maxZ - rect.minZ]);
  slab(walkway); layout.steps.forEach(slab);
  for (const hedge of layout.hedgeRows) {
    // A clipped hedge has a level top and softened upper edges; one extruded
    // profile gives that silhouette without a mesh or React object per leaf.
    const half = (hedge.maxZ - hedge.minZ) / 2, radius = Math.min(half * .35, hedge.height * .25);
    const shape = new THREE.Shape();
    shape.moveTo(-half, 0); shape.lineTo(half, 0); shape.lineTo(half, hedge.height - radius);
    shape.quadraticCurveTo(half, hedge.height, half - radius, hedge.height);
    shape.lineTo(-half + radius, hedge.height); shape.quadraticCurveTo(-half, hedge.height, -half, hedge.height - radius); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: hedge.maxX - hedge.minX, bevelEnabled: false, steps: 1, curveSegments: 3 });
    geometry.rotateY(Math.PI / 2).translate(hedge.minX, hedge.elevation, (hedge.minZ + hedge.maxZ) / 2);
    // Consistent indexed attributes allow one merged batch with both hedges.
    if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.getAttribute('position').count }, (_, index) => index));
    parts.hedge.push(geometry);
  }
  const pitch = Math.atan2(sign.rise, halfZ), slope = Math.hypot(halfZ, sign.rise);
  for (const side of [-1, 1]) {
    box('roof', [centerX, canopy.eaveY + sign.rise / 2, centerZ + side * sign.width / 4], [length, .012, slope], [side * pitch, 0, 0]);
    beam([canopy.minX, canopy.eaveY, centerZ + side * halfZ], [canopy.maxX, canopy.eaveY, centerZ + side * halfZ], steel * 1.1);
    beam([canopy.minX, chordY, centerZ + side * halfZ], [canopy.maxX, chordY, centerZ + side * halfZ], steel);
    const sidePanels = showDetail ? 8 : 4;
    for (let i = 0; i < sidePanels; i++) {
      const x0 = canopy.minX + length * i / sidePanels, x1 = canopy.minX + length * (i + 1) / sidePanels;
      beam([x0, i % 2 ? canopy.eaveY : chordY, centerZ + side * halfZ], [x1, i % 2 ? chordY : canopy.eaveY, centerZ + side * halfZ], steel * .72);
    }
  }
  beam([canopy.minX, canopy.ridgeY + .004, centerZ], [canopy.maxX, canopy.ridgeY + .004, centerZ], steel);
  for (const [x, z] of layout.posts) {
    box('structure', [x, (groundY + canopy.eaveY) / 2, z], [post, canopy.eaveY - groundY, post]);
    box('platform', [x, groundY + .014, z], [post * 1.8, .028, post * 1.8]);
  }
  const stations = [...new Set([...layout.posts.map(([x]) => x), canopy.maxX])];
  for (const x of stations) {
    beam([x, canopy.eaveY, canopy.minZ], [x, canopy.ridgeY, centerZ]);
    beam([x, canopy.ridgeY, centerZ], [x, canopy.eaveY, canopy.maxZ]);
    beam([x, chordY, canopy.minZ], [x, chordY, canopy.maxZ]);
    const count = showDetail ? 8 : 4;
    const topAt = (z: number) => canopy.ridgeY - Math.abs(z - centerZ) / halfZ * sign.rise;
    for (let i = 0; i < count; i++) {
      const z0 = canopy.minZ + sign.width * i / count, z1 = canopy.minZ + sign.width * (i + 1) / count;
      beam([x, i % 2 ? topAt(z0) : chordY, z0], [x, i % 2 ? chordY : topAt(z1), z1], steel * .72);
    }
  }
  // Thin rear structure fixes the sign to the front truss; lettering is beyond
  // the steel envelope rather than behind it, including in pedestrian views.
  const backingX = canopy.maxX + post * .35;
  beam([backingX, sign.bottomY, canopy.minZ], [backingX, sign.bottomY, canopy.maxZ], steel * .7);
  beam([backingX, sign.bottomY, canopy.minZ], [backingX, canopy.eaveY, canopy.minZ], steel * .7);
  beam([backingX, sign.bottomY, canopy.maxZ], [backingX, canopy.eaveY, canopy.maxZ], steel * .7);
  // Overlay only: opening the B11 main-body wall is not required to render its
  // photographed dark recessed door, and no commercial opening is inferred.
  box('glass', [door.x, door.bottomY + door.height / 2, door.centerZ], [.012, door.height, door.width]);
  for (const z of [door.centerZ - door.width / 2, door.centerZ + door.width / 2]) box('structure', [door.x + .01, door.bottomY + door.height / 2, z], [.026, door.height + .02, .018]);
  box('structure', [door.x + .01, door.bottomY + door.height, door.centerZ], [.026, .02, door.width + .035]);

  const result = {} as Record<Batch, THREE.BufferGeometry>;
  for (const key of Object.keys(parts) as Batch[]) {
    result[key] = mergeGeometries(parts[key], false)!;
    parts[key].forEach(part => part.dispose()); result[key].computeBoundingBox(); result[key].computeBoundingSphere();
  }
  const shape = new THREE.Shape();
  shape.moveTo(-halfZ, sign.bottomY); shape.lineTo(halfZ, sign.bottomY); shape.lineTo(halfZ, canopy.eaveY);
  shape.lineTo(0, canopy.ridgeY); shape.lineTo(-halfZ, canopy.eaveY); shape.closePath();
  const signGeometry = new THREE.ShapeGeometry(shape);
  const positions = signGeometry.getAttribute('position'), uvs = signGeometry.getAttribute('uv');
  for (let i = 0; i < positions.count; i++) uvs.setXY(i, positions.getX(i) / sign.width + .5, (positions.getY(i) - sign.bottomY) / sign.height);
  signGeometry.rotateY(Math.PI / 2).translate(sign.frontX, 0, centerZ);
  signGeometry.computeBoundingBox(); signGeometry.computeBoundingSphere();
  return { ...result, sign: signGeometry };
}

function createEntranceSignTexture(layout: AdministrativeCenterEntranceLayout) {
  if (typeof document === 'undefined') return null;
  const sign = administrativeEntranceSignMetrics(layout);
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 192;
  const context = canvas.getContext('2d'); if (!context) return null;
  context.fillStyle = '#eeeee6'; context.fillRect(0, 0, 768, 192);
  const gablePixels = sign.rise / sign.height * 192, textHeight = 192 - gablePixels;
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = '#303936';
  context.font = `800 ${Math.floor(textHeight * .49)}px Arial, sans-serif`;
  context.fillText('CENTRO ADMINISTRATIVO', 384, gablePixels + textHeight * .25, 724);
  context.fillStyle = '#b66b41'; context.font = `700 ${Math.floor(textHeight * .37)}px Arial, sans-serif`;
  context.fillText('ADELCKI CAMILO BELTRAME', 384, gablePixels + textHeight * .74, 724);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

/** Photo-confirmed B11 tree only; the canonical park-tree inventory is untouched. */
export function createAdministrativeEntranceTreeGeometries(tree: AdministrativeCenterEntranceLayout['tree']) {
  const wood: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(tree.trunkRadius * .64, tree.trunkRadius, tree.trunkHeight, 9);
  trunk.translate(tree.x, tree.groundY + tree.trunkHeight / 2, tree.z); wood.push(trunk);
  const branch = (from: THREE.Vector3, to: THREE.Vector3, radius: number) => {
    const delta = to.clone().sub(from), part = new THREE.CylinderGeometry(radius * .45, radius, delta.length(), 7);
    part.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    part.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2); wood.push(part);
  };
  for (const [dx, dz] of [[-.48, .25], [.44, .32], [.13, -.48]]) branch(
    new THREE.Vector3(tree.x, tree.groundY + tree.trunkHeight * .70, tree.z),
    new THREE.Vector3(tree.x + tree.crownRadius * dx, tree.crownCenterY + tree.crownHalfHeight * .12, tree.z + tree.crownRadius * dz),
    tree.trunkRadius * .42);
  const leaf = createInternalLeafLobe();
  const bounds = leaf.boundingBox!, size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  // Normalize the authored spray before placing the lobes, so the actual
  // crown stays inside the exact radius checked against paths/streets/B19.
  leaf.translate(-center.x, -center.y, -center.z).scale(2 / size.x, 2 / size.y, 2 / size.z);
  const lobes = [
    { offset: [0, 0, 0], scale: [.70, .72, .72] },
    ...Array.from({ length: 4 }, (_, index) => ({ offset: [Math.cos(index * Math.PI / 2) * .34, -.08, Math.sin(index * Math.PI / 2) * .34], scale: [.60, .60, .60] })),
    { offset: [-.08, .39, .04], scale: [.62, .60, .62] },
    { offset: [.06, -.35, -.03], scale: [.63, .65, .63] },
  ];
  const leaves = lobes.map((lobe, index) => {
    const geometry = leaf.clone();
    geometry.scale(lobe.scale[0] * tree.crownRadius, lobe.scale[1] * tree.crownHalfHeight, lobe.scale[2] * tree.crownRadius);
    geometry.translate(tree.x + lobe.offset[0] * tree.crownRadius, tree.crownCenterY + lobe.offset[1] * tree.crownHalfHeight, tree.z + lobe.offset[2] * tree.crownRadius);
    const color = new THREE.Color(['#81945e', '#7d9157', '#748b52'][index % 3]);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set(color.toArray(), i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  });
  leaf.dispose();
  const result = { wood: mergeGeometries(wood, false)!, foliage: mergeGeometries(leaves, false)! };
  [...wood, ...leaves].forEach(part => part.dispose());
  Object.values(result).forEach(part => { part.computeBoundingBox(); part.computeBoundingSphere(); });
  return result;
}

function AdministrativeEntranceTree({ tree, visible }: { tree: AdministrativeCenterEntranceLayout['tree']; visible: boolean }) {
  const geometry = useMemo(() => createAdministrativeEntranceTreeGeometries(tree), [tree]);
  const atlas = useMemo(createInternalLeafAtlas, []);
  const foliage = useMemo(() => createInternalFoliageMaterial(atlas, true), [atlas]);
  const wood = useMemo(() => {
    const material = createPilotBarkMaterial(); material.vertexColors = false; material.color.set('#7e6b50'); return material;
  }, []);
  useEffect(() => () => { geometry.wood.dispose(); geometry.foliage.dispose(); }, [geometry]);
  useEffect(() => () => { foliage.dispose(); atlas.dispose(); wood.dispose(); }, [foliage, atlas, wood]);
  return <group name="administrative-center-photo-tree:B11" visible={visible} raycast={NO_RAYCAST} dispose={null}>
    <mesh name="administrative-center-photo-tree:wood" geometry={geometry.wood} material={wood} castShadow receiveShadow raycast={NO_RAYCAST} dispose={null} />
    <mesh name="administrative-center-photo-tree:foliage" geometry={geometry.foliage} material={foliage} receiveShadow raycast={NO_RAYCAST} dispose={null} />
  </group>;
}

export const AdministrativeCenterEntrance = memo(function AdministrativeCenterEntrance({ layout, materials, showDetail = true }: {
  layout: AdministrativeCenterEntranceLayout;
  materials: CommercialPavilionMaterials;
  showDetail?: boolean;
}) {
  const vegetationEnabled = useSceneVegetationEnabled();
  const treesVisible = useCommercialMapStore(state => state.treesVisible);
  const salesPresentationActive = useCommercialMapStore(state => state.salesPresentationActive);
  const geometry = useMemo(() => createAdministrativeCenterEntranceGeometries(layout, showDetail), [layout, showDetail]);
  const lawnGeometry = useMemo(() => createAdministrativeEntranceLawnGeometry(layout), [layout]);
  const texture = useMemo(() => createEntranceSignTexture(layout), [layout]);
  const hedgeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3f592f', roughness: 1 }), []);
  const lawnMaterial = useMemo(() => applyInteriorGroundMaterial(new THREE.MeshStandardMaterial({ color: '#687a49', roughness: 1, metalness: 0 })), []);
  const roofMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#a6a9a0', roughness: .7, metalness: .16 }), []);
  const signMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', map: texture, roughness: .85 }), [texture]);
  const batchMaterials = { structure: materials.metal, roof: roofMaterial, platform: materials.platform, glass: materials.glass, hedge: hedgeMaterial };
  useLayoutEffect(() => {
    const textures = acquirePavilionArchitectureTextures();
    roofMaterial.map = roofMaterial.bumpMap = textures.zinc; roofMaterial.bumpScale = .0007;
    // This canopy's ridge runs along X: x/z UVs put the sheet ribs down Z.
    installPavilionMetricUV(roofMaterial); roofMaterial.needsUpdate = true;
    return () => { roofMaterial.map = roofMaterial.bumpMap = null; releasePavilionArchitectureTextures(); };
  }, [roofMaterial]);
  useEffect(() => () => Object.values(geometry).forEach(part => part.dispose()), [geometry]);
  useEffect(() => () => lawnGeometry.dispose(), [lawnGeometry]);
  useEffect(() => () => { texture?.dispose(); signMaterial.dispose(); }, [signMaterial, texture]);
  useEffect(() => () => hedgeMaterial.dispose(), [hedgeMaterial]);
  useEffect(() => () => { lawnMaterial.dispose(); roofMaterial.dispose(); }, [lawnMaterial, roofMaterial]);
  return <group name="administrative-center-entrance:B11" raycast={NO_RAYCAST} dispose={null}>
    {(Object.keys(batchMaterials) as Batch[]).map(key => <mesh key={key} name={`administrative-center-entrance:${key}`} geometry={geometry[key]} material={batchMaterials[key]}
      castShadow={key === 'structure' || key === 'roof' || key === 'hedge'} receiveShadow raycast={NO_RAYCAST} dispose={null} />)}
    <mesh name="administrative-center-identity-face" geometry={geometry.sign} material={signMaterial} raycast={NO_RAYCAST} dispose={null} />
    <mesh name="administrative-center-graded-lawn" geometry={lawnGeometry} material={lawnMaterial} receiveShadow raycast={NO_RAYCAST} dispose={null} />
    {vegetationEnabled && <AdministrativeEntranceTree tree={layout.tree} visible={treesVisible && !salesPresentationActive} />}
  </group>;
});
