import { memo, useEffect, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CommercialLot, MapEntity } from '../../types';
import type { PublicExternalScenePolicy } from '../../public/publicScenePolicy';
import { layoutTerritorialOrientation, prepareTerritorialOrientation, type OrientationItem } from '../../utils/territorialOrientation';

const NO_RAYCAST = () => undefined;
const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const ROW_HEIGHT = 80;
const ATLAS_WIDTH = 2048;
const PADDING = 12;

/** All permanent names share one texture, geometry and draw. Rasterization and
 * cadastral fitting happen once per inventory change; navigation needs no DOM. */
function createTerritorialOrientationResources(items: readonly OrientationItem[], entities: readonly MapEntity[], anisotropy: number) {
  if (!items.length) return null;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;
  const metrics = items.map(item => {
    context.font = `${item.kind === 'road' ? 650 : 750} 52px ${FONT_FAMILY}`;
    let width = context.measureText(item.name).width;
    if (item.kind === 'block') {
      context.font = `600 46px ${FONT_FAMILY}`;
      const prefix = context.measureText('Quadra ').width;
      context.font = `850 58px ${FONT_FAMILY}`;
      width = prefix + context.measureText(item.name.slice(7)).width;
    }
    return { item, width: Math.min(ATLAS_WIDTH - PADDING * 2, Math.ceil(width) + PADDING * 2) };
  });
  let nextX = 0, nextY = 0;
  const cells = metrics.map(metric => {
    if (nextX + metric.width > ATLAS_WIDTH) { nextX = 0; nextY += ROW_HEIGHT; }
    const cell = { ...metric, x: nextX, y: nextY };
    nextX += metric.width;
    return cell;
  });
  canvas.width = ATLAS_WIDTH;
  canvas.height = THREE.MathUtils.ceilPowerOfTwo(nextY + ROW_HEIGHT);
  context.textBaseline = 'middle'; context.lineJoin = 'round';
  for (const { item, width, x, y } of cells) {
    context.textAlign = 'left';
    // Cream road lettering, a restrained dark keyline, no white halo/card.
    context.fillStyle = item.kind === 'road' ? '#f7f2d9' : '#173a3e';
    context.strokeStyle = item.kind === 'road' ? '#243536' : '#f6f0d4';
    context.lineWidth = item.kind === 'road' ? 3 : 3.5;
    if (item.kind === 'block') {
      context.font = `600 46px ${FONT_FAMILY}`;
      context.strokeText('Quadra ', x + PADDING, y + ROW_HEIGHT / 2);
      context.fillText('Quadra ', x + PADDING, y + ROW_HEIGHT / 2);
      const prefix = context.measureText('Quadra ').width;
      context.font = `850 58px ${FONT_FAMILY}`;
      context.strokeText(item.name.slice(7), x + PADDING + prefix, y + ROW_HEIGHT / 2);
      context.fillText(item.name.slice(7), x + PADDING + prefix, y + ROW_HEIGHT / 2);
    } else {
      context.font = `${item.kind === 'road' ? 650 : 750} 52px ${FONT_FAMILY}`;
      context.strokeText(item.name, x + PADDING, y + ROW_HEIGHT / 2, width - PADDING * 2);
      context.fillText(item.name, x + PADDING, y + ROW_HEIGHT / 2, width - PADDING * 2);
    }
  }
  const labels = layoutTerritorialOrientation(items, entities, new Map(cells.map(cell => [cell.item.id, cell.width / ROW_HEIGHT])));
  const cellById = new Map(cells.map(cell => [cell.item.id, cell]));
  const positions: number[] = [], uvs: number[] = [], anchors: number[] = [], density: number[] = [], indices: number[] = [];
  labels.forEach((label, index) => {
    const cell = cellById.get(label.id)!;
    const corners = [[0, 1], [1, 1], [1, 0], [0, 0]];
    label.footprint.forEach(([x, z], corner) => {
      positions.push(x, label.elevation, z);
      uvs.push((cell.x + corners[corner][0] * cell.width) / canvas.width,
        1 - (cell.y + (1 - corners[corner][1]) * ROW_HEIGHT) / canvas.height);
      anchors.push(label.anchor[0], label.elevation, label.anchor[1]);
      density.push(label.referenceSpan, label.kind === 'road' ? 0 : label.kind === 'block' ? 1 : 2);
    });
    const base = index * 4;
    indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('labelAnchor', new THREE.Float32BufferAttribute(anchors, 3));
  geometry.setAttribute('labelDensity', new THREE.Float32BufferAttribute(density, 2));
  geometry.setIndex(indices); geometry.computeBoundingSphere();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, anisotropy);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const material = new THREE.ShaderMaterial({
    name: 'territorial-ground-text', transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    uniforms: { atlas: { value: texture }, viewportSize: { value: new THREE.Vector2(1, 1) } },
    vertexShader: `
      attribute vec3 labelAnchor; attribute vec2 labelDensity;
      uniform vec2 viewportSize;
      varying vec2 labelUv; varying float labelOpacity;
      void main() {
        vec4 center = modelViewMatrix * vec4(labelAnchor, 1.);
        float span = abs(projectionMatrix[0][0] * labelDensity.x / max(.01, -center.z)) * viewportSize.x * .5;
        labelOpacity = labelDensity.y < .5 ? 1. : labelDensity.y < 1.5
          ? smoothstep(40., 50., span) : 1. - smoothstep(30., 40., span);
        labelUv = uv;
        // Vertices already contain the complete world footprint. No screen
        // expansion, camera quaternion, billboard or camera-facing rotation.
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      uniform sampler2D atlas; varying vec2 labelUv; varying float labelOpacity;
      void main() {
        vec4 color = texture2D(atlas, labelUv);
        color.a *= labelOpacity;
        if (color.a < .06) discard;
        gl_FragColor = color;
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'territorial-world-labels'; mesh.raycast = NO_RAYCAST;
  mesh.userData = { presentationOnly: true, projection: 'world-xz', labelCount: labels.length,
    labels: labels.map(({ id, name, kind, anchor, angle, width, height, elevation, footprint }) =>
      ({ id, name, kind, anchor, angle, width, height, elevation, footprint })) };
  return { mesh, geometry, material, texture };
}

export const TerritorialOrientation = memo(function TerritorialOrientation({ entities, lots, roads, policy }: {
  entities: readonly MapEntity[]; lots: readonly CommercialLot[]; roads: readonly MapEntity[]; policy?: PublicExternalScenePolicy | null;
}) {
  const gl = useThree(state => state.gl), size = useThree(state => state.size), invalidate = useThree(state => state.invalidate);
  const items = useMemo(() => {
    const scoped = policy ? entities.filter(entity => policy.activeScope.has(entity.id)) : entities;
    const availableRoads = policy ? roads.filter(road => entities.some(entity => entity.id === road.id)) : roads;
    const prepared = prepareTerritorialOrientation(scoped, lots, availableRoads);
    if (!policy) return prepared;
    const focus = policy.focusBounds, pad = focus.diagonal * .12;
    return prepared.filter(item => item.anchor[0] >= focus.minX - pad && item.anchor[0] <= focus.maxX + pad
      && item.anchor[1] >= focus.minZ - pad && item.anchor[1] <= focus.maxZ + pad);
  }, [entities, lots, roads, policy]);
  const resources = useMemo(() => createTerritorialOrientationResources(items, entities, gl.capabilities.getMaxAnisotropy()), [items, entities, gl]);
  useLayoutEffect(() => {
    resources?.material.uniforms.viewportSize.value.set(size.width, size.height);
    invalidate();
  }, [resources, size.width, size.height, invalidate]);
  useEffect(() => () => {
    resources?.geometry.dispose(); resources?.material.dispose(); resources?.texture.dispose();
  }, [resources]);
  return resources ? <primitive object={resources.mesh} dispose={null} /> : null;
});
