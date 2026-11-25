import { memo, useEffect, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CommercialLot, MapEntity } from '../../types';
import type { PublicExternalScenePolicy } from '../../public/publicScenePolicy';
import { layoutTerritorialOrientation, prepareTerritorialOrientation, type OrientationItem, type TerritorialObstacle } from '../../utils/territorialOrientation';
import { createTerritorialOrientationInputResolver } from '../../utils/territorialOrientationInputs';
import type { PublicLabelRect, PublicMapLabelLayout } from './publicMapLabelLayout';

const NO_RAYCAST = () => undefined;
const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const ROW_HEIGHT = 80;
const ATLAS_WIDTH = 2048;
const PADDING = 12;
const NO_OBSTACLES: readonly TerritorialObstacle[] = [];

/** All permanent names share one texture, geometry and draw. Rasterization and
 * cadastral fitting happen once per inventory change; navigation needs no DOM. */
function createTerritorialOrientationResources(items: readonly OrientationItem[], entities: readonly MapEntity[], anisotropy: number,
  obstacles: readonly TerritorialObstacle[], exteriorBlockObstacles: readonly TerritorialObstacle[], managed: boolean) {
  if (!items.length) return null;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.textBaseline = 'middle';
  const metrics = items.map(item => {
    context.font = `${item.kind === 'road' ? 650 : 750} 52px ${FONT_FAMILY}`;
    const measured = context.measureText(item.name);
    let width = measured.width;
    let ink = { left: 0, right: 1, top: 0, bottom: 1 };
    if (item.kind === 'road' && [measured.actualBoundingBoxLeft, measured.actualBoundingBoxRight,
      measured.actualBoundingBoxAscent, measured.actualBoundingBoxDescent].every(Number.isFinite)) {
      const cellWidth = Math.min(ATLAS_WIDTH - PADDING * 2, Math.ceil(width) + PADDING * 2), edge = 3 / 2 + 1;
      ink = { left: (PADDING - measured.actualBoundingBoxLeft - edge) / cellWidth,
        right: (PADDING + measured.actualBoundingBoxRight + edge) / cellWidth,
        top: (ROW_HEIGHT / 2 - measured.actualBoundingBoxAscent - edge) / ROW_HEIGHT,
        bottom: (ROW_HEIGHT / 2 + measured.actualBoundingBoxDescent + edge) / ROW_HEIGHT };
    }
    if (item.kind === 'block') {
      context.font = `600 46px ${FONT_FAMILY}`;
      const prefix = context.measureText('Quadra ');
      context.font = `850 58px ${FONT_FAMILY}`;
      const suffix = context.measureText(item.name.slice(7));
      width = prefix.width + suffix.width;
      const cellWidth = Math.min(ATLAS_WIDTH - PADDING * 2, Math.ceil(width) + PADDING * 2);
      // Exact painted bounds include half the keyline and one antialias pixel.
      // Transparent atlas padding must not push a label across a parking area.
      const edge = 3.5 / 2 + 1;
      if ([prefix.actualBoundingBoxAscent, prefix.actualBoundingBoxDescent,
        suffix.actualBoundingBoxAscent, suffix.actualBoundingBoxDescent].every(Number.isFinite)) {
        ink = { left: (PADDING - prefix.actualBoundingBoxLeft - edge) / cellWidth,
          right: (PADDING + prefix.width + suffix.actualBoundingBoxRight + edge) / cellWidth,
          top: (ROW_HEIGHT / 2 - Math.max(prefix.actualBoundingBoxAscent, suffix.actualBoundingBoxAscent) - edge) / ROW_HEIGHT,
          bottom: (ROW_HEIGHT / 2 + Math.max(prefix.actualBoundingBoxDescent, suffix.actualBoundingBoxDescent) + edge) / ROW_HEIGHT };
      }
    }
    return { item, ink, width: Math.min(ATLAS_WIDTH - PADDING * 2, Math.ceil(width) + PADDING * 2) };
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
    context.fillStyle = item.subdued ? '#b9beb9' : item.kind === 'road' ? '#f7f2d9' : '#173a3e';
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
  const labels = layoutTerritorialOrientation(items, entities, new Map(cells.map(cell => [cell.item.id, cell.width / ROW_HEIGHT])),
    obstacles, exteriorBlockObstacles, new Map(cells.map(cell => [cell.item.id, cell.ink])));
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
  const suppressed = managed ? new THREE.BufferAttribute(new Float32Array(positions.length / 3), 1).setUsage(THREE.DynamicDrawUsage) : null;
  if (suppressed) geometry.setAttribute('labelSuppressed', suppressed);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, anisotropy);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const material = new THREE.ShaderMaterial({
    name: 'territorial-ground-text', transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
    // Lots use -3/-2. A weaker slope bias lets their fill erase ground text
    // in oblique views even with physical clearance. Match that slope and
    // retain one extra depth unit; buildings still occlude the world plane.
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    defines: managed ? { PUBLIC_LABEL_LAYOUT: 1 } : undefined,
    uniforms: { atlas: { value: texture }, viewportSize: { value: new THREE.Vector2(1, 1) } },
    vertexShader: `
      attribute vec3 labelAnchor; attribute vec2 labelDensity;
      #ifdef PUBLIC_LABEL_LAYOUT
        attribute float labelSuppressed;
      #endif
      uniform vec2 viewportSize;
      varying vec2 labelUv; varying float labelOpacity;
      void main() {
        vec4 center = modelViewMatrix * vec4(labelAnchor, 1.);
        float span = abs(projectionMatrix[0][0] * labelDensity.x / max(.01, -center.z)) * viewportSize.x * .5;
        labelOpacity = labelDensity.y < .5 ? 1. : labelDensity.y < 1.5
          ? smoothstep(40., 50., span) : 1. - smoothstep(30., 40., span);
        #ifdef PUBLIC_LABEL_LAYOUT
          labelOpacity *= 1. - labelSuppressed;
        #endif
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
    labels: labels.map(({ id, name, kind, anchor, angle, width, height, elevation, footprint, inkFootprint }) =>
      ({ id, name, kind, anchor, angle, width, height, elevation, footprint, inkFootprint })) };
  return { mesh, geometry, material, texture, labels, suppressed };
}

export const TerritorialOrientation = memo(function TerritorialOrientation({ entities, lots, roads, policy, publicLabelLayout,
  obstacles = NO_OBSTACLES, exteriorBlockObstacles = NO_OBSTACLES }: {
  entities: readonly MapEntity[]; lots: readonly CommercialLot[]; roads: readonly MapEntity[]; policy?: PublicExternalScenePolicy | null;
  publicLabelLayout?: PublicMapLabelLayout;
  obstacles?: readonly TerritorialObstacle[];
  exteriorBlockObstacles?: readonly TerritorialObstacle[];
}) {
  const gl = useThree(state => state.gl), size = useThree(state => state.size), invalidate = useThree(state => state.invalidate);
  const resolveInputs = useMemo(createTerritorialOrientationInputResolver, []);
  const stable = resolveInputs({ entities, lots, roads, policy, obstacles, exteriorBlockObstacles });
  entities = stable.entities; lots = stable.lots; roads = stable.roads; policy = stable.policy;
  obstacles = stable.obstacles; exteriorBlockObstacles = stable.exteriorBlockObstacles;
  const items = useMemo(() => {
    const scoped = policy ? entities.filter(entity => policy.activeScope.has(entity.id)) : entities;
    const availableRoads = policy ? roads.filter(road => entities.some(entity => entity.id === road.id)) : roads;
    const prepared = prepareTerritorialOrientation(scoped, lots, availableRoads);
    if (!policy) return prepared;
    const focus = policy.focusBounds, pad = focus.diagonal * .12;
    return prepared.filter(item => item.anchor[0] >= focus.minX - pad && item.anchor[0] <= focus.maxX + pad
      && item.anchor[1] >= focus.minZ - pad && item.anchor[1] <= focus.maxZ + pad);
  }, [entities, lots, roads, policy]);
  const managed = Boolean(publicLabelLayout);
  const resources = useMemo(() => createTerritorialOrientationResources(items, entities, gl.capabilities.getMaxAnisotropy(),
    obstacles, exteriorBlockObstacles, managed), [items, entities, gl, obstacles, exteriorBlockObstacles, managed]);
  useLayoutEffect(() => {
    resources?.material.uniforms.viewportSize.value.set(size.width, size.height);
    invalidate();
  }, [resources, size.width, size.height, invalidate]);
  useLayoutEffect(() => {
    if (!publicLabelLayout || !resources?.suppressed) return;
    const { labels, suppressed } = resources;
    const point = new THREE.Vector4();
    const rect: PublicLabelRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
    const unregister = publicLabelLayout.register('orientation', frame => {
      let changed = false;
      labels.forEach((label, index) => {
        rect.x0 = rect.y0 = Infinity;
        rect.x1 = rect.y1 = -Infinity;
        const inFront = (label.inkFootprint ?? label.footprint).every(([x, z]) => {
          point.set(x, label.elevation, z, 1).applyMatrix4(frame.projection);
          if (point.w <= 0) return false;
          const px = (point.x / point.w + 1) * frame.width / 2;
          const py = (1 - point.y / point.w) * frame.height / 2;
          rect.x0 = Math.min(rect.x0, px); rect.x1 = Math.max(rect.x1, px);
          rect.y0 = Math.min(rect.y0, py); rect.y1 = Math.max(rect.y1, py);
          return true;
        });
        const hidden = Number(inFront && frame.isOccupied(rect));
        const first = index * 4;
        if (suppressed.getX(first) === hidden) return;
        for (let i = first; i < first + 4; i++) suppressed.setX(i, hidden);
        changed = true;
      });
      if (changed) suppressed.needsUpdate = true;
    });
    invalidate();
    return () => { unregister(); invalidate(); };
  }, [invalidate, publicLabelLayout, resources]);
  useEffect(() => () => {
    resources?.geometry.dispose(); resources?.material.dispose(); resources?.texture.dispose();
  }, [resources]);
  return resources ? <primitive object={resources.mesh} dispose={null} /> : null;
});
