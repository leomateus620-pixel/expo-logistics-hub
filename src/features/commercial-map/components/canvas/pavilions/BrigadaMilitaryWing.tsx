import { memo, useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { brigadaWingRoofHeight, type BrigadaMilitaryWingLayout } from '../../../utils/brigadaMilitaryWing';
import { acquirePavilionArchitectureTextures, releasePavilionArchitectureTextures, installPavilionMetricUV } from './PavilionArchitectureMaterials';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '../../../constants';

const NO_RAYCAST = () => undefined;
const COLORS = { wall: '#deddd3', structure: '#424848', roof: '#929795', glass: '#34423f' };
type Batch = keyof typeof COLORS;

/** Four static batches, independent of B6's modules and commercial materials. */
export function createBrigadaMilitaryWingGeometries(layout: BrigadaMilitaryWingLayout) {
  const parts: Record<Batch, THREE.BufferGeometry[]> = { wall: [], structure: [], roof: [], glass: [] };
  const { minX, maxX, frontZ, maxZ, floorY, pavilion3Height: h } = layout;
  const w = maxX - minX, d = maxZ - frontZ, centerX = (minX + maxX) / 2;
  const t = h * .025, frame = h * .045;
  const box = (batch: Batch, x: number, y: number, z: number, width: number, height: number, depth: number, rotationZ = 0, color = '#ffffff') => {
    if (Math.min(width, height, depth) <= 0) return;
    const geometry = new THREE.BoxGeometry(width, height, depth).rotateZ(rotationZ).translate(x, y, z);
    if (batch === 'wall') {
      const shade = new THREE.Color(color), colors = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set(shade.toArray(), i);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    parts[batch].push(geometry);
  };
  const roofQuad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray()], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([a.x, a.z, b.x, b.z, c.x, c.z, a.x, a.z, c.x, c.z, d.x, d.z], 2));
    geometry.setIndex([0, 1, 2, 3, 4, 5]);
    geometry.computeVertexNormals(); parts.roof.push(geometry);
  };
  const closingTriangle = (points: number[][]) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(points.flatMap(point => [point[0], point[1]]), 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(points.flatMap(() => [1, 1, 1]), 3));
    geometry.setIndex([0, 1, 2]); geometry.computeVertexNormals(); parts.wall.push(geometry);
  };
  const frontTop = layout.frontRoofY;
  // Conservatively plain side/rear elevations; the photograph only documents the front.
  for (const side of [-1, 1]) {
    const x = side < 0 ? minX + t / 2 : maxX - t / 2;
    const outerX = side < 0 ? minX : maxX;
    const top = Math.min(brigadaWingRoofHeight(layout, outerX, frontZ), brigadaWingRoofHeight(layout, outerX, maxZ));
    box('wall', x, (floorY + top) / 2, (frontZ + maxZ) / 2, t, top - floorY, d);
    box('structure', x, floorY + h * .055, (frontZ + maxZ) / 2, t * 1.15, h * .11, d);
    const triangle = [[outerX, top, frontZ], [outerX, brigadaWingRoofHeight(layout, outerX, frontZ), frontZ], [outerX, brigadaWingRoofHeight(layout, outerX, maxZ), maxZ]];
    closingTriangle(side < 0 ? triangle.reverse() : triangle);
  }
  const backTop = brigadaWingRoofHeight(layout, minX, maxZ);
  box('wall', centerX, (floorY + backTop) / 2, maxZ - t / 2, w - t * 2, backTop - floorY, t);
  closingTriangle([[minX, backTop, maxZ], [maxX, backTop, maxZ], [maxX, brigadaWingRoofHeight(layout, maxX, maxZ), maxZ]]);
  closingTriangle([[maxX, frontTop, frontZ], [minX, frontTop, frontZ], [maxX, brigadaWingRoofHeight(layout, maxX, frontZ), frontZ]]);
  // One recessed door beside the neighbor and a broad multi-pane front window.
  const door = { left: minX + w * .055, right: minX + w * .24, top: floorY + h * .62 };
  const glazing = { left: minX + w * .31, right: maxX - w * .065, bottom: floorY + h * .18, top: floorY + h * .62 };
  for (const [left, right] of [[minX, door.left], [door.right, glazing.left], [glazing.right, maxX]]) {
    box('wall', (left + right) / 2, (floorY + frontTop) / 2, frontZ + t / 2, right - left, frontTop - floorY, t);
  }
  box('wall', (door.left + door.right) / 2, (door.top + frontTop) / 2, frontZ + t / 2, door.right - door.left, frontTop - door.top, t);
  box('wall', (glazing.left + glazing.right) / 2, (glazing.top + frontTop) / 2, frontZ + t / 2, glazing.right - glazing.left, frontTop - glazing.top, t);
  box('structure', (glazing.left + glazing.right) / 2, (floorY + glazing.bottom) / 2, frontZ + t / 2, glazing.right - glazing.left, glazing.bottom - floorY, t);
  box('glass', (glazing.left + glazing.right) / 2, (glazing.bottom + glazing.top) / 2, frontZ + t * .7,
    glazing.right - glazing.left, glazing.top - glazing.bottom, t * .3);
  box('structure', (door.left + door.right) / 2, (floorY + door.top) / 2, frontZ + t * .7, door.right - door.left, door.top - floorY, t * .3);
  for (const x of [minX + frame / 2, door.right + frame / 2, maxX - frame / 2]) {
    box('structure', x, (floorY + frontTop) / 2, frontZ, frame, frontTop - floorY, t * 1.7);
    box('structure', x, frontTop - h * .018, (frontZ + layout.canopyFrontZ) / 2, frame * .7, h * .045, frontZ - layout.canopyFrontZ);
  }
  const glassWidth = glazing.right - glazing.left, glassHeight = glazing.top - glazing.bottom;
  for (let i = 0; i <= 6; i++) box('structure', glazing.left + glassWidth * i / 6, (glazing.bottom + glazing.top) / 2, frontZ - t * .12,
    frame * .28, glassHeight + frame * .3, t * .7);
  for (let i = 0; i <= 3; i++) box('structure', (glazing.left + glazing.right) / 2, glazing.bottom + glassHeight * i / 3, frontZ - t * .12,
    glassWidth, frame * .28, t * .7);
  box('structure', (glazing.left + glazing.right) / 2, glazing.bottom - frame * .3, frontZ - t * .32, glassWidth + frame, frame * .5, t * 1.8);
  // The rear roof is a restrained low plane; no unsupported rooflights or duplicate P3 roof spans.
  roofQuad(new THREE.Vector3(minX, brigadaWingRoofHeight(layout, minX, frontZ), frontZ),
    new THREE.Vector3(minX, brigadaWingRoofHeight(layout, minX, maxZ), maxZ),
    new THREE.Vector3(maxX, brigadaWingRoofHeight(layout, maxX, maxZ), maxZ),
    new THREE.Vector3(maxX, brigadaWingRoofHeight(layout, maxX, frontZ), frontZ));
  const fasciaSpan = layout.canopyMaxX - layout.canopyMinX;
  const fasciaRise = layout.fasciaOuterY - layout.fasciaInnerY;
  const fasciaAngle = Math.atan2(fasciaRise, fasciaSpan);
  const fasciaCenterY = (layout.fasciaInnerY + layout.fasciaOuterY) / 2;
  box('roof', (layout.canopyMinX + layout.canopyMaxX) / 2, fasciaCenterY, layout.canopyFrontZ,
    Math.hypot(fasciaSpan, fasciaRise), layout.fasciaHeight, t, fasciaAngle);
  box('structure', (layout.canopyMinX + layout.canopyMaxX) / 2, fasciaCenterY - layout.fasciaHeight / 2, layout.canopyFrontZ - t / 2,
    Math.hypot(fasciaSpan, fasciaRise), frame * .35, t * .8, fasciaAngle);
  box('roof', (layout.canopyMinX + layout.canopyMaxX) / 2, fasciaCenterY - h * .025, (frontZ + layout.canopyFrontZ) / 2,
    Math.hypot(fasciaSpan, fasciaRise), layout.roofThickness, frontZ - layout.canopyFrontZ, fasciaAngle);
  // Floor/apron has one owner, runs only in the existing frontage strip and
  // reaches the neighbor's shell edge without covering the street or tree pits.
  const floorBottomY = COMMERCIAL_MAP_GROUND_ELEVATION;
  box('wall', (layout.apronMinX + layout.apronMaxX) / 2, (floorY + floorBottomY) / 2, (layout.apronMinZ + frontZ) / 2,
    layout.apronMaxX - layout.apronMinX, floorY - floorBottomY, frontZ - layout.apronMinZ, 0, '#b4b6af');
  box('wall', centerX, (floorY + floorBottomY) / 2, (frontZ + maxZ) / 2, w - t, floorY - floorBottomY, d - t, 0, '#b4b6af');
  const geometries = {} as Record<Batch, THREE.BufferGeometry>;
  for (const key of Object.keys(parts) as Batch[]) {
    geometries[key] = mergeGeometries(parts[key], false)!;
    parts[key].forEach(part => part.dispose());
    geometries[key].computeBoundingBox(); geometries[key].computeBoundingSphere();
  }
  return geometries;
}

function createBrigadaBanner() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const context = canvas.getContext('2d'); if (!context) return null;
  context.fillStyle = '#ebece4'; context.fillRect(0, 0, 512, 96);
  context.fillStyle = '#26332d'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.font = '900 54px Arial, sans-serif'; context.fillText('BRIGADA MILITAR', 256, 51, 480);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

/** B19 is still selected by its original entity hit mesh; this layer never owns clicks. */
export const BrigadaMilitaryWing = memo(function BrigadaMilitaryWing({ layout, visible = true, toneDown = 0, selected = false, hovered = false, cutaway = false }: {
  layout: BrigadaMilitaryWingLayout;
  visible?: boolean;
  toneDown?: number;
  selected?: boolean;
  hovered?: boolean;
  cutaway?: boolean;
}) {
  const geometry = useMemo(() => createBrigadaMilitaryWingGeometries(layout), [layout]);
  const materials = useMemo(() => ({
    wall: new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: .9, vertexColors: true }),
    structure: new THREE.MeshStandardMaterial({ color: COLORS.structure, roughness: .75 }),
    roof: new THREE.MeshStandardMaterial({ color: COLORS.roof, roughness: .75, metalness: .12, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: COLORS.glass, roughness: .3, metalness: .06 }),
  }), []);
  const bannerTexture = useMemo(createBrigadaBanner, []);
  const bannerGeometry = useMemo(() => new THREE.PlaneGeometry(layout.banner.width, layout.banner.height), [layout.banner.width, layout.banner.height]);
  const bannerMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', map: bannerTexture, roughness: .8 }), [bannerTexture]);
  useLayoutEffect(() => {
    const textures = acquirePavilionArchitectureTextures();
    materials.wall.bumpMap = textures.paint; materials.wall.bumpScale = .0007;
    materials.roof.map = materials.roof.bumpMap = textures.zinc; materials.roof.bumpScale = .0007;
    installPavilionMetricUV(materials.wall); installPavilionMetricUV(materials.roof, true);
    materials.wall.needsUpdate = materials.roof.needsUpdate = true;
    return () => { materials.wall.bumpMap = null; materials.roof.map = materials.roof.bumpMap = null; releasePavilionArchitectureTextures(); };
  }, [materials]);
  useEffect(() => {
    for (const key of Object.keys(materials) as Batch[]) {
      materials[key].color.set(COLORS[key]).lerp(new THREE.Color('#dfe8de'), Math.min(.9, Math.max(0, toneDown)) * .82);
      materials[key].emissive.set(COLORS[key]); materials[key].emissiveIntensity = selected ? .04 : hovered ? .012 : 0;
    }
  }, [materials, toneDown, selected, hovered]);
  useEffect(() => () => Object.values(geometry).forEach(part => part.dispose()), [geometry]);
  useEffect(() => () => Object.values(materials).forEach(part => part.dispose()), [materials]);
  useEffect(() => () => { bannerTexture?.dispose(); bannerMaterial.dispose(); }, [bannerMaterial, bannerTexture]);
  useEffect(() => () => bannerGeometry.dispose(), [bannerGeometry]);
  return <group name="brigada-military-wing:B19" visible={visible && !cutaway} raycast={NO_RAYCAST} dispose={null}>
    {(Object.keys(geometry) as Batch[]).map(key => <mesh key={key} name={`brigada-military-wing:${key}`} geometry={geometry[key]} material={materials[key]}
      castShadow={key !== 'glass'} receiveShadow raycast={NO_RAYCAST} dispose={null} />)}
    <mesh name="brigada-military-identity-face" geometry={bannerGeometry} material={bannerMaterial}
      position={[layout.banner.x, layout.banner.y, layout.banner.z]} rotation={[0, Math.PI, 0]} raycast={NO_RAYCAST} dispose={null} />
  </group>;
});
