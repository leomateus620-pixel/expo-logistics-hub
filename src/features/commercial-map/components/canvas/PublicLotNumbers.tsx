import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MapEntity } from '../../types';
import { placeSoldLock } from '../../utils/soldLotPresentation';

/** One atlas and one instanced draw. The vertex shader reveals numbers only
 * when their real footprint occupies enough screen space; no React frame updates. */
export function PublicLotNumbers({ entities, soldEntityIds }: { entities: readonly MapEntity[]; soldEntityIds?: ReadonlySet<string> }) {
  const size = useThree(state => state.size);
  const invalidate = useThree(state => state.invalidate);
  const resources = useMemo(() => {
    const atlas = document.createElement('canvas');
    const cellWidth = 128, cellHeight = 40, columns = 8;
    atlas.width = columns * cellWidth;
    atlas.height = Math.max(1, Math.ceil(entities.length / columns)) * cellHeight;
    const context = atlas.getContext('2d');
    if (!context || !entities.length) return null;
    context.font = '600 23px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    const geometry = new THREE.PlaneGeometry(1, 1);
    const rectangles = new Float32Array(entities.length * 4);
    const widths = new Float32Array(entities.length);
    const lockScales = new Float32Array(entities.length);
    entities.forEach((entity, i) => {
      const x = i % columns * cellWidth, y = Math.floor(i / columns) * cellHeight;
      context.fillStyle = '#ffffffdd'; context.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);
      context.fillStyle = '#15292b';
      const label = String(entity.metadata.lotNumber ?? entity.publicIdentifier);
      context.fillText(label, x + cellWidth / 2, y + cellHeight / 2, cellWidth - 12);
      rectangles.set([x / atlas.width, 1 - (y + cellHeight) / atlas.height, cellWidth / atlas.width, cellHeight / atlas.height], i * 4);
      const points = entity.geometry.coordinates[0] ?? [];
      widths[i] = Math.max(0.1, Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0])));
      lockScales[i] = placeSoldLock({ id: entity.id, status: 'SOLD', geometry: entity.geometry })?.scale ?? 0;
    });
    geometry.setAttribute('labelRect', new THREE.InstancedBufferAttribute(rectangles, 4));
    geometry.setAttribute('lotWidth', new THREE.InstancedBufferAttribute(widths, 1));
    geometry.setAttribute('labelVerticalOffset', new THREE.InstancedBufferAttribute(new Float32Array(entities.length), 1));
    const texture = new THREE.CanvasTexture(atlas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
      uniforms: { atlas: { value: texture }, viewportSize: { value: new THREE.Vector2(1, 1) } },
      vertexShader: `attribute vec4 labelRect; attribute float lotWidth; attribute float labelVerticalOffset;
        uniform vec2 viewportSize; varying vec2 labelUv; varying float showLabel;
        void main() {
          vec4 center = modelViewMatrix * instanceMatrix * vec4(0.,0.,0.,1.);
          float pixels = abs(projectionMatrix[0][0] * lotWidth / max(0.01,-center.z)) * viewportSize.x * .5;
          showLabel = step(34.,pixels) * step(0.,-center.z);
          labelUv = labelRect.xy + uv * labelRect.zw;
          gl_Position = projectionMatrix * center;
          gl_Position.xy += position.xy * vec2(46.,16.) / viewportSize * 2. * gl_Position.w;
          float markerPixels = abs(projectionMatrix[1][1] * labelVerticalOffset / max(0.01,-center.z)) * viewportSize.y * .5;
          float labelGap = labelVerticalOffset > 0. ? markerPixels * .7 + 12. : 0.;
          gl_Position.y -= labelGap / viewportSize.y * 2. * gl_Position.w;
        }`,
      fragmentShader: `uniform sampler2D atlas; varying vec2 labelUv; varying float showLabel;
        void main(){ if(showLabel < .5) discard; gl_FragColor=texture2D(atlas,labelUv); if(gl_FragColor.a<.05)discard; }`,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, entities.length);
    const matrix = new THREE.Matrix4();
    entities.forEach((entity, i) => {
      const ring = entity.geometry.coordinates[0] ?? [];
      const xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
      matrix.makeTranslation((Math.min(...xs)+Math.max(...xs))/2, entity.geometry.elevation + Math.max(.08, entity.geometry.extrusionHeight) + .16, (Math.min(...zs)+Math.max(...zs))/2);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.raycast = () => undefined;
    mesh.name = 'public-authorized-lot-numbers'; mesh.renderOrder = 6;
    return { mesh, geometry, material, texture, lockScales };
  }, [entities]);
  useLayoutEffect(() => {
    if (!resources) return;
    const offsets = resources.geometry.getAttribute('labelVerticalOffset');
    entities.forEach((entity, i) => offsets.setX(i, soldEntityIds?.has(entity.id) ? resources.lockScales[i] : 0));
    offsets.needsUpdate = true;
    invalidate();
  }, [entities, resources, soldEntityIds, invalidate]);
  useLayoutEffect(() => { resources?.material.uniforms.viewportSize.value.set(size.width, size.height); }, [resources, size]);
  useEffect(() => () => { if (resources) THREE.InstancedMesh.prototype.dispose.call(resources.mesh); resources?.geometry.dispose(); resources?.material.dispose(); resources?.texture.dispose(); }, [resources]);
  return resources ? <primitive object={resources.mesh} dispose={null} /> : null;
}
