import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { COMMERCIAL_MAP_OBSTRUCTION_SELECTOR } from '../../utils/contextualViewport';
import { isCommercialMapPresentationVisible } from '../../utils/frameActivity';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

export interface GastronomyMarkerAnchor {
  id: string;
  /** Rendered roof position in map world coordinates. */
  position: [number, number, number];
}

interface GastronomyStructureMarkersProps {
  anchors: readonly GastronomyMarkerAnchor[];
  focused: boolean;
  selectedId?: string | null;
  motionEnabled: boolean;
  reducedGraphics: boolean;
  limitedAnimation?: boolean;
  night: boolean;
}

const FACE_URL = `${import.meta.env.BASE_URL}maps/gastronomy-marker.webp`;
const FACE_DIAMETER = 220 / 256;
const BOB_PERIOD_SECONDS = 4.2;
const NO_RAYCAST = () => undefined;
const OBSTRUCTIONS = `${COMMERCIAL_MAP_OBSTRUCTION_SELECTOR}, .commercial-map-toolbar--desktop, .commercial-map-toolbar-mobile`;
const { clamp, lerp, smoothstep } = THREE.MathUtils;

type ScreenRect = { left: number; top: number; right: number; bottom: number };

function markerPhase(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  return (hash >>> 0) / 4294967296 * Math.PI * 2;
}

function createMarkerResources() {
  // A single, beveled lathe under the artwork gives the bronze rim real depth.
  const body = new THREE.LatheGeometry([
    new THREE.Vector2(0, -0.12),
    new THREE.Vector2(0.445, -0.12),
    new THREE.Vector2(0.5, -0.065),
    new THREE.Vector2(0.5, 0.065),
    new THREE.Vector2(0.465, 0.102),
    new THREE.Vector2(0, 0.102),
  ], 28);
  body.rotateX(Math.PI / 2);
  const vertices = body.getAttribute('position');
  const colors = new Float32Array(vertices.count * 3);
  const bronze = new THREE.Color('#956033');
  const bevel = new THREE.Color('#de9f50');
  const graphite = new THREE.Color('#221b18');
  const color = new THREE.Color();
  for (let index = 0; index < vertices.count; index++) {
    const depth = vertices.getZ(index);
    color.copy(depth < -0.1 ? graphite : depth < 0.02 ? bronze : bevel);
    // A broad highlight reads even when the park uses reduced lighting.
    color.multiplyScalar(0.8 + (vertices.getY(index) + 0.5) * 0.2);
    color.toArray(colors, index * 3);
  }
  body.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const bodyMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false });
  const face = new THREE.PlaneGeometry(1 / FACE_DIAMETER, 1 / FACE_DIAMETER);
  face.translate(0, 0, 0.108);
  const faceMaterial = new THREE.MeshBasicMaterial({ alphaTest: 0.32, toneMapped: false, fog: false });
  const beam = new THREE.PlaneGeometry(1, 1);
  beam.translate(0, 0.5, 0);
  const beamMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      amber: { value: new THREE.Color('#db8b28') },
      core: { value: new THREE.Color('#ffd77e') },
      intensity: { value: 0 },
      falloffHeight: { value: 0.67 },
    },
    vertexShader: /* glsl */ `
      varying vec2 beamUv;
      varying float strength;
      void main() {
        beamUv = uv;
        strength = instanceColor.r;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 amber;
      uniform vec3 core;
      uniform float intensity;
      uniform float falloffHeight;
      varying vec2 beamUv;
      varying float strength;
      void main() {
        float width = mix(0.78, 1.0, beamUv.y);
        float edge = abs(beamUv.x * 2.0 - 1.0) / width;
        float halo = 1.0 - smoothstep(0.1, 1.0, edge);
        float center = 1.0 - smoothstep(0.05, 0.48, edge);
        float falloff = smoothstep(0.0, falloffHeight, beamUv.y);
        gl_FragColor = vec4(mix(amber, core, center * falloff), halo * falloff * strength * intensity);
        #include <colorspace_fragment>
      }
    `,
  });
  return { body, bodyMaterial, face, faceMaterial, beam, beamMaterial };
}

function markerBatch(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, name: string) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.count = 0;
  mesh.visible = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // The projected footprint is culled per marker before writing the batch.
  mesh.frustumCulled = false;
  mesh.raycast = NO_RAYCAST;
  return mesh;
}

function getObstructions(canvas: HTMLCanvasElement): ScreenRect[] {
  const shell = canvas.closest('.commercial-map-shell');
  if (!shell) return [];
  const viewport = canvas.getBoundingClientRect();
  return Array.from(shell.querySelectorAll<HTMLElement>(OBSTRUCTIONS)).flatMap(element => {
    if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') return [];
    const { left, top, right, bottom } = element.getBoundingClientRect();
    return [{ left: left - viewport.left, top: top - viewport.top, right: right - viewport.left, bottom: bottom - viewport.top }];
  });
}

export const GastronomyStructureMarkers = memo(function GastronomyStructureMarkers({
  anchors,
  focused,
  selectedId,
  motionEnabled,
  reducedGraphics,
  limitedAnimation = false,
  night,
}: GastronomyStructureMarkersProps) {
  const gl = useThree(state => state.gl);
  const size = useThree(state => state.size);
  const get = useThree(state => state.get);
  const invalidate = useThree(state => state.invalidate);
  const resources = useMemo(createMarkerResources, []);
  const capacity = anchors.length;
  const batches = useMemo(() => {
    const body = markerBatch(resources.body, resources.bodyMaterial, capacity, 'gastronomy-emblem-body');
    const face = markerBatch(resources.face, resources.faceMaterial, capacity, 'gastronomy-emblem-face');
    const beam = markerBatch(resources.beam, resources.beamMaterial, capacity, 'gastronomy-marker-beam');
    beam.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    beam.instanceColor.setUsage(THREE.DynamicDrawUsage);
    return { body, face, beam };
  }, [capacity, resources]);
  const markers = useMemo(() => anchors.map(({ id, position }) => ({
    id,
    roof: new THREE.Vector3(...position),
    center: new THREE.Vector3(),
    phase: markerPhase(id),
    screenX: 0,
    screenY: 0,
    depth: 0,
    diameter: 0,
    radiusPx: 0,
    scale: 1,
    animated: false,
    visible: false,
  })), [anchors]);
  const diagnostics = useMemo(() => ({ presentationOnly: true, anchors, visibleIds: [] as string[] }), [anchors]);
  const textureReady = useRef(false);
  const obstructions = useRef<ScreenRect[] | null>(null);
  const motion = useRef({ time: 0, lastAt: 0, timer: 0, active: false });
  const dirty = useRef(true);
  const scratch = useMemo(() => ({
    cameraWorld: new THREE.Matrix4(),
    projection: new THREE.Matrix4(),
    cameraPosition: new THREE.Vector3(),
    cameraRotation: new THREE.Quaternion(),
    cameraSpace: new THREE.Vector3(),
    projected: new THREE.Vector3(),
    towardsCamera: new THREE.Vector3(),
    transform: new THREE.Object3D(),
    angle: new THREE.Euler(0, 0, 0, 'YXZ'),
    beamStrength: new THREE.Color(),
  }), []);

  useEffect(() => {
    let mounted = true;
    const texture = new THREE.TextureLoader().load(FACE_URL, () => {
      if (!mounted) return;
      textureReady.current = true;
      resources.faceMaterial.map = texture;
      resources.faceMaterial.needsUpdate = true;
      dirty.current = true;
      invalidate();
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
    return () => {
      mounted = false;
      textureReady.current = false;
      resources.faceMaterial.map = null;
      texture.dispose();
    };
  }, [gl, invalidate, resources]);

  useEffect(() => () => {
    Object.values(batches).forEach(disposeInstancedMesh);
  }, [batches]);

  useEffect(() => () => {
    Object.values(resources).forEach(resource => resource.dispose());
  }, [resources]);

  useLayoutEffect(() => {
    if (!capacity) return;
    const refresh = () => {
      obstructions.current = null;
      dirty.current = true;
      invalidate();
    };
    refresh();
    window.addEventListener('commercial-map-panel-resize', refresh);
    return () => window.removeEventListener('commercial-map-panel-resize', refresh);
  }, [capacity, invalidate, size.width, size.height, selectedId]);

  useLayoutEffect(() => {
    resources.beamMaterial.uniforms.intensity.value = reducedGraphics
      ? (focused ? 0.45 : 0.22)
      : (focused ? (night ? 0.88 : 0.92) : (night ? 0.46 : 0.33));
    resources.beamMaterial.uniforms.falloffHeight.value = focused ? 0.48 : 0.67;
    dirty.current = true;
    invalidate();
    const playback = motion.current;
    return () => {
      window.clearTimeout(playback.timer);
      playback.timer = 0;
      playback.active = false;
    };
  }, [batches, focused, invalidate, limitedAnimation, markers, motionEnabled, night, reducedGraphics, resources, selectedId]);

  useFrame(({ camera, frameloop }) => {
    if (!textureReady.current || !capacity || size.width < 1 || size.height < 1) return;
    camera.updateMatrixWorld();
    const changedCamera = !scratch.cameraWorld.equals(camera.matrixWorld)
      || !scratch.projection.equals(camera.projectionMatrix);
    const animationAllowed = motionEnabled && !reducedGraphics && !document.hidden && frameloop === 'demand'
      && isCommercialMapPresentationVisible(gl);
    const playback = motion.current;
    const now = performance.now();
    const mobile = size.width <= 650;
    const interval = 1000 / (limitedAnimation || mobile ? 16 : 24);
    const updateMotion = playback.active && animationAllowed && now - playback.lastAt >= interval - 2;
    if (!dirty.current && !changedCamera && !updateMotion) return;
    dirty.current = false;
    scratch.cameraWorld.copy(camera.matrixWorld);
    scratch.projection.copy(camera.projectionMatrix);
    scratch.cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    scratch.cameraRotation.setFromRotationMatrix(camera.matrixWorld);
    if (updateMotion) {
      playback.time += Math.min((now - playback.lastAt) / 1000, 0.1);
      playback.lastAt = now;
    }

    const { cameraSpace, projected, towardsCamera, transform, angle, beamStrength } = scratch;
    const panels = obstructions.current ??= getObstructions(gl.domElement);
    const cameraTop = camera.matrixWorld.elements[9];
    const focalPx = size.height * camera.projectionMatrix.elements[5] * 0.5;
    const perspective = camera instanceof THREE.PerspectiveCamera;
    for (const marker of markers) {
      marker.visible = false;
      marker.scale = 1;
      const depth = -cameraSpace.copy(marker.roof).applyMatrix4(camera.matrixWorldInverse).z;
      if (depth < camera.near || depth > camera.far) continue;
      const pxPerUnit = focalPx / (perspective ? depth : 1);
      const compact = smoothstep(depth, 28, 132);
      const selected = selectedId === marker.id;
      const nominalPx = focused
        ? lerp(mobile ? 32 : 38, mobile ? 12 : 14, compact)
        : lerp(mobile ? 23 : 26, mobile ? 10 : 11, compact);
      // Portrait fitting backs the camera away to fit the map's width. Give
      // its distant emblems room to retain the same compact screen silhouette.
      const maxDiameter = mobile ? lerp(3.45, 7, smoothstep(depth, 67, 170)) : 3.45;
      const diameter = Math.min(maxDiameter, nominalPx / pxPerUnit) * (selected ? 0.72 : 1);
      const animated = animationAllowed && !selected && depth < (focused ? 157 : 52);
      const bob = animated ? Math.sin(playback.time * Math.PI * 2 / BOB_PERIOD_SECONDS + marker.phase) * diameter * 0.075 : 0;
      const lift = clamp(diameter * (focused ? 1.02 : 0.68) + 0.25, 0.57, focused ? 3.65 : 2.9);
      marker.center.copy(marker.roof);
      marker.center.y += lift + bob;
      projected.copy(marker.center).project(camera);
      const x = (projected.x + 1) * size.width * 0.5;
      const y = (1 - projected.y) * size.height * 0.5;
      const radius = diameter * pxPerUnit * 0.5;
      if (projected.z < -1 || projected.z > 1 || x + radius < 0 || y + radius < 0
        || x - radius > size.width || y - radius > size.height) continue;
      if (panels.some(rect => x + radius > rect.left && x - radius < rect.right
        && y + radius > rect.top && y - radius < rect.bottom)) continue;
      marker.visible = true;
      marker.animated = animated;
      marker.depth = depth;
      marker.diameter = diameter;
      marker.radiusPx = radius;
      marker.screenX = x;
      marker.screenY = y;
    }

    // Shrink converging icons in place. At an almost identical projection the
    // foreground (or selected) building has priority until the camera separates them.
    for (let index = 0; index < markers.length; index++) {
      const marker = markers[index];
      if (!marker.visible) continue;
      for (let next = index + 1; next < markers.length; next++) {
        const other = markers[next];
        if (!other.visible) continue;
        const separation = Math.hypot(marker.screenX - other.screenX, marker.screenY - other.screenY);
        const scale = (separation - 2) / (marker.radiusPx + other.radiusPx);
        if (scale >= 1) continue;
        if (scale < 0.42) {
          const keepMarker = marker.id === selectedId || (other.id !== selectedId && marker.depth <= other.depth);
          if (keepMarker) other.visible = false;
          else { marker.visible = false; break; }
        } else {
          marker.scale = Math.min(marker.scale, Math.max(0.6, scale));
          other.scale = Math.min(other.scale, Math.max(0.6, scale));
        }
      }
    }

    let emblemCount = 0;
    let beamCount = 0;
    let animateNext = false;
    for (const marker of markers) {
      if (!marker.visible) continue;
      const diameter = marker.diameter * marker.scale;
      towardsCamera.copy(scratch.cameraPosition).sub(marker.center).normalize();
      const yaw = Math.atan2(towardsCamera.x, towardsCamera.z);
      const elevation = Math.asin(clamp(towardsCamera.y, -1, 1));
      const overhead = smoothstep(Math.max(cameraTop, towardsCamera.y), 0.86, 0.985);
      const tilt = clamp(elevation * 0.63, -0.2, 0.62);
      transform.position.copy(marker.center);
      transform.scale.setScalar(diameter);
      transform.quaternion.setFromEuler(angle.set(-tilt, yaw, 0));
      // The same face gradually lies flat at steep angles. Camera-up gives it
      // a stable reading direction even when the orbit is directly overhead.
      transform.quaternion.slerp(scratch.cameraRotation, overhead);
      transform.updateMatrix();
      batches.body.setMatrixAt(emblemCount, transform.matrix);
      batches.face.setMatrixAt(emblemCount, transform.matrix);
      diagnostics.visibleIds[emblemCount++] = marker.id;
      animateNext ||= marker.animated;

      const strength = (selectedId === marker.id ? 0.55 : 1) * (1 - smoothstep(cameraTop, 0.89, 0.99));
      if (strength < 0.03) continue;
      transform.position.copy(marker.roof);
      transform.rotation.set(0, yaw, 0);
      transform.scale.set(
        diameter * (focused ? 0.4 : 0.25),
        Math.max(0.05, marker.center.y - marker.roof.y - diameter * (focused ? 0.22 : 0.3)),
        1,
      );
      transform.updateMatrix();
      batches.beam.setMatrixAt(beamCount, transform.matrix);
      batches.beam.setColorAt(beamCount++, beamStrength.setRGB(strength, 0, 0));
    }
    diagnostics.visibleIds.length = emblemCount;
    batches.body.count = emblemCount;
    batches.face.count = emblemCount;
    batches.beam.count = beamCount;
    batches.body.visible = batches.face.visible = emblemCount > 0;
    batches.beam.visible = beamCount > 0;
    if (emblemCount > 0) {
      batches.body.instanceMatrix.needsUpdate = true;
      batches.face.instanceMatrix.needsUpdate = true;
    }
    if (beamCount > 0) {
      batches.beam.instanceMatrix.needsUpdate = true;
      batches.beam.instanceColor!.needsUpdate = true;
    }

    if (!animateNext) {
      window.clearTimeout(playback.timer);
      playback.timer = 0;
    } else {
      if (!playback.active) playback.lastAt = now;
      if (!playback.timer) playback.timer = window.setTimeout(() => {
        playback.timer = 0;
        if (!document.hidden && get().frameloop === 'demand' && isCommercialMapPresentationVisible(gl)) invalidate();
      }, Math.max(1, interval - (now - playback.lastAt)));
    }
    playback.active = animateNext;
  });

  if (!capacity) return null;
  return (
    <group name="gastronomy-structure-markers" userData={diagnostics}>
      <primitive object={batches.body} />
      <primitive object={batches.face} />
      <primitive object={batches.beam} />
    </group>
  );
});
