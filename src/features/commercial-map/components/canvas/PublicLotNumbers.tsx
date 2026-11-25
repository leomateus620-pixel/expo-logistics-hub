import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MapEntity } from '../../types';
import type { PublicMapInventory } from '../../public/publicMapTypes';
import { PUBLIC_NUMBER_STYLES, type PublicNumberAvailability } from '../../public/publicLotNumberStyle';
import { commercialMapDiagnosticsEnabled } from '../../utils/performanceDiagnostics';
import { comparePublicLotNumbers, createPublicLotNumberProjector, preparePublicLotNumberSurfaces,
  PUBLIC_NUMBER_HEIGHT, readPublicLotNumbers } from './publicLotNumberProjection';
import type { PublicMapLabelLayout } from './publicMapLabelLayout';

const FONT = '700 12px system-ui, -apple-system, "Segoe UI", sans-serif';
const RESOLUTION = 2;
const GAP = 2;
const STATUSES = ['AVAILABLE', 'SOLD', 'UNAVAILABLE'] as const;

export function PublicMapLabelLayoutFrame({ layout }: { layout: PublicMapLabelLayout }) {
  useFrame(({ camera, size }) => layout.update(camera, size.width, size.height));
  return null;
}

function createAtlas(texts: string[], maxTextureSize: number) {
  if (!texts.length) return null;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.font = FONT;
  const rowHeight = STATUSES.length * (PUBLIC_NUMBER_HEIGHT + GAP);
  const atlasWidth = Math.min(maxTextureSize, 1024) / RESOLUTION;
  let x = GAP, y = GAP;
  const cells = texts.flatMap(text => {
    const width = Math.ceil(context.measureText(text).width) + 17;
    if (width + 2 * GAP > atlasWidth) return [];
    if (x + width + GAP > atlasWidth) { x = GAP; y += rowHeight; }
    if ((y + rowHeight) * RESOLUTION > maxTextureSize) return [];
    const cell = { text, x, y, width };
    x += width + GAP;
    return [cell];
  });
  if (!cells.length) return null;
  const atlasHeight = cells[cells.length - 1].y + rowHeight;
  canvas.width = atlasWidth * RESOLUTION;
  canvas.height = atlasHeight * RESOLUTION;
  context.scale(RESOLUTION, RESOLUTION);
  context.font = FONT;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const labels = new Map<string, { width: number; rects: Record<PublicNumberAvailability, THREE.Vector4> }>();
  const middle = PUBLIC_NUMBER_HEIGHT / 2;
  for (const cell of cells) {
    const rects = {} as Record<PublicNumberAvailability, THREE.Vector4>;
    STATUSES.forEach((status, index) => {
      const { background, border, ink, mark } = PUBLIC_NUMBER_STYLES[status];
      const top = cell.y + index * (PUBLIC_NUMBER_HEIGHT + GAP);
      context.save();
      context.translate(cell.x, top);
      context.lineWidth = mark ? 1.25 : 1;
      context.beginPath();
      if (context.roundRect) context.roundRect(0.75, 0.75, cell.width - 1.5, PUBLIC_NUMBER_HEIGHT - 1.5, 4);
      else context.rect(0.75, 0.75, cell.width - 1.5, PUBLIC_NUMBER_HEIGHT - 1.5);
      context.fillStyle = background;
      context.strokeStyle = border;
      context.fill();
      context.stroke();
      context.fillStyle = border;
      if (mark === 'dot') {
        context.beginPath();
        context.arc(7, middle, 2, 0, Math.PI * 2);
        context.fill();
      } else if (mark === 'bar') context.fillRect(4.5, middle - 1, 5, 2);
      context.fillStyle = ink;
      context.fillText(cell.text, cell.width / 2 + (mark ? 3 : 0), middle + 0.5);
      context.restore();
      rects[status] = new THREE.Vector4(cell.x / atlasWidth, 1 - (top + PUBLIC_NUMBER_HEIGHT) / atlasHeight,
        cell.width / atlasWidth, PUBLIC_NUMBER_HEIGHT / atlasHeight);
    });
    labels.set(cell.text, { width: cell.width, rects });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return { labels, texture };
}

function createBatch(texture: THREE.CanvasTexture, capacity: number) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const centers = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const sizesAndSlopes = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const cells = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('plateCenter', centers);
  geometry.setAttribute('plateSizeAndSlope', sizesAndSlopes);
  geometry.setAttribute('plateCell', cells);
  geometry.instanceCount = 0;
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
    uniforms: { atlas: { value: texture } },
    vertexShader: `
      attribute vec3 plateCenter;
      attribute vec4 plateSizeAndSlope;
      attribute vec4 plateCell;
      varying vec2 labelUv;
      void main() {
        labelUv = plateCell.xy + uv * plateCell.zw;
        vec2 offset = position.xy * plateSizeAndSlope.xy;
        // Screen-aligned ink with the depth of the raised lot plane at every pixel.
        gl_Position = vec4(plateCenter.xy + offset, plateCenter.z + dot(plateSizeAndSlope.zw, offset), 1.);
      }`,
    fragmentShader: `
      uniform sampler2D atlas;
      varying vec2 labelUv;
      void main() {
        gl_FragColor = texture2D(atlas, labelUv);
        if (gl_FragColor.a < .06) discard;
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.raycast = () => undefined;
  mesh.name = 'public-authorized-lot-numbers';
  mesh.renderOrder = 6;
  mesh.visible = false;
  return { mesh, geometry, material, centers, sizesAndSlopes, cells };
}

/** The authorized inventory owns the text and its cadastral surface. The atlas
 * and instance buffers survive status changes and camera movement. */
export function PublicLotNumbers({ inventory, renderedEntities, selectedEntityId, layout }: {
  inventory: Pick<PublicMapInventory, 'entities' | 'lots'>;
  renderedEntities: readonly MapEntity[];
  selectedEntityId: string | null;
  layout: PublicMapLabelLayout;
}) {
  const gl = useThree(state => state.gl);
  const invalidate = useThree(state => state.invalidate);
  const numbers = useMemo(() => readPublicLotNumbers(inventory.lots), [inventory.lots]);
  const atlasKey = useMemo(() => JSON.stringify([...new Set([...numbers.values()].map(lot => lot.text))].sort()), [numbers]);
  const atlas = useMemo(() => createAtlas(JSON.parse(atlasKey), gl.capabilities.maxTextureSize), [atlasKey, gl]);
  const surfaces = useMemo(() => preparePublicLotNumberSurfaces(inventory.entities, renderedEntities), [inventory.entities, renderedEntities]);
  const batch = useMemo(() => atlas && surfaces.length ? createBatch(atlas.texture, surfaces.length) : null, [atlas, surfaces.length]);
  const project = useMemo(createPublicLotNumberProjector, []);
  const labels = useMemo(() => surfaces.flatMap(surface => {
    const number = numbers.get(surface.entityId);
    const cell = number && atlas?.labels.get(number.text);
    return number && cell ? [{ ...number, entityId: surface.entityId, cell, surface, fits: false }] : [];
  }).sort(comparePublicLotNumbers), [atlas, numbers, surfaces]);

  useLayoutEffect(() => {
    if (!batch) return;
    const selected = labels.find(label => label.entityId === selectedEntityId);
    let visibleCount = 0;
    const rendered: { id: string; text: string; status: PublicNumberAvailability; rect: number[] }[] = [];
    const accept = (label: typeof labels[number], frame: PublicMapLabelLayout) => {
      const { surface, cell, status } = label;
      surface.visible = label.fits && !frame.isOccupied(surface.rect);
      if (!surface.visible) return;
      frame.reserve(surface.rect);
      const { ndc, depthSlopeX, depthSlopeY, rect } = surface;
      const uv = cell.rects[status];
      batch.centers.setXYZ(visibleCount, ndc.x, ndc.y, ndc.z);
      batch.sizesAndSlopes.setXYZW(visibleCount, 2 * cell.width / frame.width, 2 * PUBLIC_NUMBER_HEIGHT / frame.height, depthSlopeX, depthSlopeY);
      batch.cells.setXYZW(visibleCount, uv.x, uv.y, uv.z, uv.w);
      visibleCount++;
      if (commercialMapDiagnosticsEnabled) rendered.push({ id: label.entityId, text: label.text, status,
        rect: [rect.x0, rect.y0, rect.x1, rect.y1] });
    };
    const unregisterSelected = layout.register('selectedLot', frame => {
      visibleCount = 0;
      rendered.length = 0;
      for (const label of labels) {
        label.fits = project(label.surface, frame, label.cell.width, label === selected);
        if (label.fits && label.surface.detailed) frame.detailedLots.set(label.entityId, label.surface.rect);
        if (!label.fits) label.surface.detailed = false;
      }
      if (selected) accept(selected, frame);
    });
    const unregisterLots = layout.register('lots', frame => {
      for (const label of labels) if (label !== selected) accept(label, frame);
      batch.geometry.instanceCount = visibleCount;
      batch.mesh.visible = visibleCount > 0;
      if (visibleCount) batch.centers.needsUpdate = batch.cells.needsUpdate = batch.sizesAndSlopes.needsUpdate = true;
      if (commercialMapDiagnosticsEnabled) gl.domElement.dataset.commercialMapLotNumbers = JSON.stringify(rendered);
    });
    invalidate();
    return () => {
      unregisterSelected();
      unregisterLots();
      invalidate();
    };
  }, [batch, gl, invalidate, labels, layout, project, selectedEntityId]);

  useLayoutEffect(() => () => {
    if (commercialMapDiagnosticsEnabled) delete gl.domElement.dataset.commercialMapLotNumbers;
  }, [batch, gl]);
  useEffect(() => () => { atlas?.texture.dispose(); }, [atlas]);
  useEffect(() => () => { batch?.geometry.dispose(); batch?.material.dispose(); }, [batch]);
  return batch ? <primitive object={batch.mesh} dispose={null} /> : null;
}
