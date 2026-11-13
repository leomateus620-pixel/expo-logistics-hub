import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { readContextualViewportInsets } from '../../utils/contextualViewport';
import { isCommercialMapPresentationVisible } from '../../utils/frameActivity';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import { pavilionSalesPercent, type PavilionSalesProgressAnchor } from './pavilionSalesProgress';

const NO_RAYCAST = () => undefined;
const CELL = 192;
const TEXT_SAFE_RADIUS = 51;
const { clamp, lerp, smoothstep } = THREE.MathUtils;

function drawProgressText(ctx: CanvasRenderingContext2D, text: string, font: string, baseline: number) {
  ctx.font = font;
  const { actualBoundingBoxLeft, actualBoundingBoxRight, actualBoundingBoxAscent, actualBoundingBoxDescent } = ctx.measureText(text);
  const inkWidth = actualBoundingBoxLeft + actualBoundingBoxRight;
  const outerY = Math.max(Math.abs(baseline - actualBoundingBoxAscent), Math.abs(baseline + actualBoundingBoxDescent));
  const chordWidth = 2 * Math.sqrt(Math.max(0, TEXT_SAFE_RADIUS ** 2 - outerY ** 2));
  // Centre the visible ink and fit it to the shortest chord it can touch.
  const widthScale = inkWidth > 0 ? Math.min(1, chordWidth / inkWidth) : 1;
  ctx.save();
  ctx.translate(0, baseline);
  ctx.scale(widthScale, 1);
  ctx.fillText(text, (actualBoundingBoxLeft - actualBoundingBoxRight) * 0.5, 0);
  ctx.restore();
}

function drawProgress(ctx: CanvasRenderingContext2D, index: number, sold: number, total: number) {
  const center = CELL * 0.5;
  ctx.save();
  ctx.translate(CELL * index + center, center);
  const metal = ctx.createLinearGradient(-58, -86, 65, 83);
  metal.addColorStop(0, '#d7e1eb');
  metal.addColorStop(0.32, '#778595');
  metal.addColorStop(0.55, '#424f61');
  metal.addColorStop(0.84, '#273343');
  metal.addColorStop(1, '#708195');
  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.arc(0, 0, 91, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#192331';
  ctx.beginPath();
  ctx.arc(0, 0, 86, 0, Math.PI * 2);
  ctx.fill();
  const start = -Math.PI / 2;
  const slate = ctx.createLinearGradient(-34, -80, 39, 80);
  slate.addColorStop(0, '#8391a0');
  slate.addColorStop(1, '#546174');
  ctx.lineWidth = 20;
  ctx.strokeStyle = slate;
  ctx.beginPath();
  ctx.arc(0, 0, 73, start, start + Math.PI * 2);
  ctx.stroke();
  if (sold > 0) {
    const cobalt = ctx.createLinearGradient(-55, -82, 70, 74);
    cobalt.addColorStop(0, '#6297ff');
    cobalt.addColorStop(0.48, '#2766e9');
    cobalt.addColorStop(1, '#184cc0');
    ctx.strokeStyle = cobalt;
    ctx.beginPath();
    ctx.arc(0, 0, 73, start, start + Math.PI * 2 * sold / total);
    ctx.stroke();
  }

  const face = ctx.createRadialGradient(-17, -30, 5, 0, 0, 67);
  face.addColorStop(0, '#2a3442');
  face.addColorStop(1, '#111822');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(0, 0, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#344458';
  ctx.stroke();
  ctx.fillStyle = '#fff3dc';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  drawProgressText(ctx, `${pavilionSalesPercent(sold, total)}%`, '750 41px system-ui, sans-serif', 8);
  ctx.fillStyle = '#c0cbd8';
  drawProgressText(ctx, 'VENDIDO', '700 15px system-ui, sans-serif', 31);
  ctx.restore();
}

function makeChartAtlas(anchors: readonly PavilionSalesProgressAnchor[]) {
  const atlas = document.createElement('canvas');
  atlas.width = Math.max(1, anchors.length) * CELL;
  atlas.height = CELL;
  const context = atlas.getContext('2d');
  if (context) anchors.forEach(({ sold, total }, index) => drawProgress(context, index, sold, total));
  const texture = new THREE.CanvasTexture(atlas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createResources(capacity: number) {
  const bodyGeometry = new THREE.LatheGeometry([
    new THREE.Vector2(0, -0.10), new THREE.Vector2(0.41, -0.10), new THREE.Vector2(0.475, -0.062),
    new THREE.Vector2(0.475, 0.045), new THREE.Vector2(0.44, 0.075), new THREE.Vector2(0, 0.075),
  ], 28);
  bodyGeometry.rotateX(Math.PI / 2);
  const faceGeometry = new THREE.PlaneGeometry(1, 1).translate(0, 0, 0.081);
  const beamGeometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const bodyMaterial = new THREE.MeshBasicMaterial({ color: '#566172', toneMapped: false, fog: false });
  const instanceVertex = /* glsl */ `
    varying vec2 markerUv;
    varying vec3 markerData;
    void main() {
      markerUv = uv;
      markerData = instanceColor;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }
  `;
  const faceMaterial = new THREE.ShaderMaterial({
    uniforms: { atlas: { value: null }, width: { value: Math.max(1, capacity) } },
    toneMapped: false,
    vertexShader: instanceVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D atlas;
      uniform float width;
      varying vec2 markerUv;
      varying vec3 markerData;
      void main() {
        vec4 face = texture2D(atlas, vec2((markerData.r + markerUv.x) / width, markerUv.y));
        if (face.a < 0.36) discard;
        gl_FragColor = vec4(face.rgb, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const beamMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: { strength: { value: 0.7 }, blue: { value: new THREE.Color('#2766e9') }, core: { value: new THREE.Color('#8ec2ff') } },
    vertexShader: instanceVertex,
    fragmentShader: /* glsl */ `
      uniform vec3 blue;
      uniform vec3 core;
      uniform float strength;
      varying vec2 markerUv;
      varying vec3 markerData;
      void main() {
        float edge = abs(markerUv.x - 0.5) * 2.0;
        float halo = 1.0 - smoothstep(0.10, 1.0, edge);
        float falloff = smoothstep(0.0, 0.56, markerUv.y);
        gl_FragColor = vec4(mix(blue, core, (1.0 - smoothstep(0.0, 0.45, edge)) * falloff), halo * falloff * markerData.r * strength);
        #include <colorspace_fragment>
      }
    `,
  });
  const batch = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string) => {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = name;
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.raycast = NO_RAYCAST;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    return mesh;
  };
  const body = batch(bodyGeometry, bodyMaterial, 'pavilion-progress-body');
  const face = batch(faceGeometry, faceMaterial, 'pavilion-progress-face');
  const beam = batch(beamGeometry, beamMaterial, 'pavilion-progress-beam');
  return {
    body, face, beam, faceMaterial, beamMaterial,
    dispose() {
      [body, face, beam].forEach(disposeInstancedMesh);
      [bodyGeometry, faceGeometry, beamGeometry, bodyMaterial, faceMaterial, beamMaterial].forEach(resource => resource.dispose());
    },
  };
}

export interface PavilionSalesProgressMarkersProps {
  anchors: readonly PavilionSalesProgressAnchor[];
  motionEnabled: boolean;
  reducedGraphics: boolean;
  limitedAnimation?: boolean;
  night: boolean;
}

export const PavilionSalesProgressMarkers = memo(function PavilionSalesProgressMarkers({
  anchors, motionEnabled, reducedGraphics, limitedAnimation = false, night,
}: PavilionSalesProgressMarkersProps) {
  const gl = useThree(state => state.gl);
  const size = useThree(state => state.size);
  const get = useThree(state => state.get);
  const invalidate = useThree(state => state.invalidate);
  const resources = useMemo(() => createResources(anchors.length), [anchors.length]);
  const atlas = useMemo(() => makeChartAtlas(anchors), [anchors]);
  const roofs = useMemo(() => anchors.map((anchor, index) => ({
    anchor, index, position: new THREE.Vector3(...anchor.position), distance: 0,
  })), [anchors]);
  const placed = useMemo(() => anchors.map(() => ({ x: 0, y: 0, radius: 0 })), [anchors]);
  const diagnostics = useMemo(() => ({ presentationOnly: true, anchors, visibleIds: [] as string[] }), [anchors]);
  const playback = useRef({ time: 0, lastStep: 0, timer: 0, running: false });
  const dirty = useRef(true);
  const insets = useRef<ReturnType<typeof readContextualViewportInsets> | null>(null);
  const scratch = useMemo(() => ({
    cameraWorld: new THREE.Matrix4(), projection: new THREE.Matrix4(), cameraRotation: new THREE.Quaternion(),
    eye: new THREE.Vector3(), projected: new THREE.Vector3(), normal: new THREE.Vector3(),
    transform: new THREE.Object3D(), euler: new THREE.Euler(0, 0, 0, 'YXZ'), data: new THREE.Color(),
  }), []);

  useLayoutEffect(() => {
    resources.faceMaterial.uniforms.atlas.value = atlas;
    resources.beamMaterial.uniforms.strength.value = reducedGraphics ? 0.46 : night ? 0.8 : 0.72;
    dirty.current = true;
    invalidate();
    const clock = playback.current;
    return () => {
      window.clearTimeout(clock.timer);
      clock.timer = 0;
      clock.running = false;
    };
  }, [atlas, invalidate, limitedAnimation, motionEnabled, night, reducedGraphics, resources]);
  useEffect(() => () => atlas.dispose(), [atlas]);
  useEffect(() => () => resources.dispose(), [resources]);
  useLayoutEffect(() => {
    const updateInsets = () => {
      insets.current = null;
      dirty.current = true;
      invalidate();
    };
    updateInsets();
    window.addEventListener('commercial-map-panel-resize', updateInsets);
    return () => window.removeEventListener('commercial-map-panel-resize', updateInsets);
  }, [invalidate, size.width, size.height]);

  useFrame(({ camera, frameloop }) => {
    camera.updateMatrixWorld();
    const clock = playback.current;
    const allowAnimation = motionEnabled && !reducedGraphics && !document.hidden && frameloop === 'demand'
      && isCommercialMapPresentationVisible(gl);
    const mobile = size.width <= 650;
    const interval = 1000 / (mobile || limitedAnimation ? 16 : 24);
    const now = performance.now();
    const tick = allowAnimation && clock.running && now - clock.lastStep >= interval - 2;
    if (!tick && !dirty.current && scratch.cameraWorld.equals(camera.matrixWorld)
      && scratch.projection.equals(camera.projectionMatrix)) return;
    if (tick) {
      clock.time += Math.min(0.1, (now - clock.lastStep) / 1000);
      clock.lastStep = now;
    }
    dirty.current = false;
    scratch.cameraWorld.copy(camera.matrixWorld);
    scratch.projection.copy(camera.projectionMatrix);
    scratch.cameraRotation.setFromRotationMatrix(camera.matrixWorld);
    const { eye, projected, normal, transform, euler, data } = scratch;
    eye.setFromMatrixPosition(camera.matrixWorld);
    const { width, height } = size;
    const focalPx = height * camera.projectionMatrix.elements[5] * 0.5;
    const perspective = camera instanceof THREE.PerspectiveCamera;
    const panel = insets.current ??= readContextualViewportInsets(gl.domElement);
    let faces = 0;
    let beams = 0;
    let animateNext = false;
    for (const roof of roofs) roof.distance = roof.position.distanceTo(eye);
    roofs.sort((a, b) => a.distance - b.distance);
    for (const { anchor, index, position: roof, distance } of roofs) {
      if (distance >= anchor.farDistance) continue;
      const depth = -projected.copy(roof).applyMatrix4(camera.matrixWorldInverse).z;
      if (depth <= camera.near) continue;
      const near = 1 - smoothstep(distance, anchor.nearDistance * 0.78, anchor.nearDistance * 1.35);
      const visible = 1 - smoothstep(distance, anchor.farDistance * 0.84, anchor.farDistance);
      let radiusPx = lerp(mobile ? 17 : 21, mobile ? 28 : 34, near) * visible;
      if (radiusPx < 7) continue;
      const baseDiameter = 2 * radiusPx * (perspective ? depth : 1) / focalPx;
      const moving = allowAnimation && visible > 0.8;
      const bob = moving ? Math.sin(clock.time * Math.PI * 2 / 4.6 + anchor.publicIdentifier.charCodeAt(1)) * baseDiameter * 0.065 : 0;
      const lift = clamp(baseDiameter * 0.85 + 0.28, 0.50, 2.35) + bob;
      transform.position.copy(roof);
      transform.position.y += lift;
      projected.copy(transform.position).project(camera);
      const x = (projected.x + 1) * width * 0.5;
      const y = (1 - projected.y) * height * 0.5;
      for (let drawn = 0; drawn < faces; drawn++) {
        const other = placed[drawn];
        radiusPx = Math.min(radiusPx, Math.hypot(x - other.x, y - other.y) - other.radius - 2);
      }
      if (radiusPx < (mobile ? 9 : 10)) continue;
      if (projected.z < -1 || projected.z > 1 || x - radiusPx < panel.left || x + radiusPx > width - panel.right
        || y - radiusPx < panel.top + 52 || y + radiusPx > height - panel.bottom) continue;
      const diameter = 2 * radiusPx * (perspective ? depth : 1) / focalPx;
      const placement = placed[faces];
      placement.x = x;
      placement.y = y;
      placement.radius = radiusPx;
      normal.copy(eye).sub(transform.position).normalize();
      const yaw = Math.atan2(normal.x, normal.z);
      const tilt = clamp(Math.asin(clamp(normal.y, -1, 1)) * 0.68, -0.15, 0.66);
      const overhead = smoothstep(camera.matrixWorld.elements[9], 0.86, 0.985);
      transform.scale.setScalar(diameter);
      transform.quaternion.setFromEuler(euler.set(-tilt, yaw, 0)).slerp(scratch.cameraRotation, overhead);
      transform.updateMatrix();
      resources.body.setMatrixAt(faces, transform.matrix);
      resources.face.setMatrixAt(faces, transform.matrix);
      resources.face.setColorAt(faces, data.setRGB(index, 0, 0));
      diagnostics.visibleIds[faces++] = anchor.id;
      animateNext ||= moving;
      const beamStrength = (1 - overhead) * visible * lerp(0.42, 1, near);
      if (beamStrength < 0.08) continue;
      transform.position.copy(roof);
      transform.scale.set(diameter * 0.23, Math.max(0.04, lift - diameter * 0.25), 1);
      transform.rotation.set(0, yaw, 0);
      transform.updateMatrix();
      resources.beam.setMatrixAt(beams, transform.matrix);
      resources.beam.setColorAt(beams++, data.setRGB(beamStrength, 0, 0));
    }
    diagnostics.visibleIds.length = faces;
    resources.body.count = resources.face.count = faces;
    resources.beam.count = beams;
    resources.body.visible = resources.face.visible = faces > 0;
    resources.beam.visible = beams > 0;
    if (faces > 0) {
      resources.body.instanceMatrix.needsUpdate = true;
      resources.face.instanceMatrix.needsUpdate = true;
      resources.face.instanceColor!.needsUpdate = true;
    }
    if (beams > 0) {
      resources.beam.instanceMatrix.needsUpdate = true;
      resources.beam.instanceColor!.needsUpdate = true;
    }
    if (animateNext) {
      if (!clock.running) clock.lastStep = now;
      if (!clock.timer) clock.timer = window.setTimeout(() => {
        clock.timer = 0;
        if (!document.hidden && get().frameloop === 'demand' && isCommercialMapPresentationVisible(gl)) invalidate();
      }, Math.max(1, interval - (now - clock.lastStep)));
    } else {
      window.clearTimeout(clock.timer);
      clock.timer = 0;
    }
    clock.running = animateNext;
  });

  return <group name="pavilion-sales-progress-markers" userData={diagnostics}>
    <primitive object={resources.body} />
    <primitive object={resources.face} />
    <primitive object={resources.beam} />
  </group>;
});
