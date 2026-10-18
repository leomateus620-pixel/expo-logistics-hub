import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import * as THREE from 'three';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { ARENA_ROOF_BRAND, createArenaRoofBrand } from '../../utils/arenaRoofBrand';
import {
  ARENA_SHOW_PALETTE,
  createArenaLedPanelMaterial,
  createArenaShowController,
  type ArenaShowFrameState,
} from '../../utils/arenaRoofShow';
import { COMMERCIAL_MAP_ANIMATION, requestCommercialMapAnimationFrame } from '../../utils/frameActivity';

const NO_RAYCAST = () => undefined;
interface Props { width: number; depth: number }

const IDLE_FACE_EMISSIVE = new THREE.Color(ARENA_SHOW_PALETTE.idleBlueEmissive);
const FINALE_FACE_BLUE_EMISSIVE = new THREE.Color('#1348B8');
const NIGHT_FACE_EMISSIVE = new THREE.Color('#1A56DB');
const IDLE_RETURN_COLOR = new THREE.Color('#061C47');
const IDLE_RETURN_EMISSIVE = new THREE.Color(ARENA_SHOW_PALETTE.idleReturnEmissive);
const FINALE_GOLD_COLOR = new THREE.Color(ARENA_SHOW_PALETTE.goldHighlight);
const FINALE_LIGHT_GOLD = new THREE.Color(ARENA_SHOW_PALETTE.lightGold);
const SYMBOL_IDLE_COLOR = new THREE.Color('#ffffff');

function MountedArenaRoofBrand({ width, depth }: Props) {
  const font = useLoader(FontLoader, ARENA_ROOF_BRAND.font);
  const source = useLoader(THREE.TextureLoader, ARENA_ROOF_BRAND.symbol);
  const night = useCommercialMapStore(state => state.nightModeActive);
  const arenaShowSequence = useCommercialMapStore(state => state.arenaShowSequence);
  const { gl, invalidate } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const panelMeshRef = useRef<THREE.Mesh>(null);
  const lastSequenceRef = useRef(arenaShowSequence);

  const geometry = useMemo(() => createArenaRoofBrand(width, depth, font), [width, depth, font]);
  const controller = useMemo(() => createArenaShowController(), []);
  const ledPanel = useMemo(() => createArenaLedPanelMaterial(), []);

  const materials = useMemo(() => {
    // Own only this clone; never dispose the official image cached by the loader.
    const map = source.clone();
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    return {
      map,
      faces: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: true,
        roughness: 0.2,
        metalness: 0.22,
        emissive: IDLE_FACE_EMISSIVE.clone(),
        emissiveIntensity: 0.26,
        transparent: true,
        depthWrite: true,
      }),
      nightFaces: new THREE.MeshStandardMaterial({
        color: '#e8f1ff',
        vertexColors: true,
        roughness: 0.24,
        metalness: 0.2,
        emissive: NIGHT_FACE_EMISSIVE.clone(),
        emissiveIntensity: 0.78,
        transparent: true,
        depthWrite: true,
      }),
      returns: new THREE.MeshStandardMaterial({
        color: IDLE_RETURN_COLOR.clone(),
        roughness: 0.32,
        metalness: 0.36,
        emissive: IDLE_RETURN_EMISSIVE.clone(),
        emissiveIntensity: 0.06,
        transparent: true,
        depthWrite: true,
      }),
      // Preserve the official RGB values: scene reflections must not wash out
      // the emblem. Its relief/backing still uses the scene lighting/shadows.
      symbol: new THREE.MeshBasicMaterial({
        map,
        color: '#ffffff',
        toneMapped: false,
        alphaTest: 0.035,
        transparent: true,
        depthWrite: true,
      }),
    };
  }, [gl, source]);

  const applyShowState = useMemo(() => {
    return (frame: ArenaShowFrameState, isNight: boolean) => {
      ledPanel.applyFrame(frame, isNight);
      const panelVisible = frame.panelPower > 0.001;
      if (panelMeshRef.current) {
        panelMeshRef.current.visible = panelVisible;
      }

      const goldBoost = frame.letterGoldBoost;
      const letterOpacity = frame.status === 'idle' ? 1 : frame.sculptedBrandPresence;
      const symbolOpacity = frame.status === 'idle' ? 1 : frame.symbolPresence;

      materials.faces.opacity = letterOpacity;
      materials.faces.emissive.copy(IDLE_FACE_EMISSIVE).lerp(FINALE_FACE_BLUE_EMISSIVE, goldBoost * 0.85);
      materials.faces.emissiveIntensity = 0.26 + goldBoost * 0.48;

      materials.nightFaces.opacity = letterOpacity;
      materials.nightFaces.emissive.copy(NIGHT_FACE_EMISSIVE).lerp(FINALE_FACE_BLUE_EMISSIVE, goldBoost * 0.85);
      materials.nightFaces.emissiveIntensity = 0.78 + goldBoost * 0.42;

      materials.returns.opacity = Math.max(letterOpacity, symbolOpacity * 0.88);
      materials.returns.color.copy(IDLE_RETURN_COLOR).lerp(FINALE_GOLD_COLOR, goldBoost * 0.85);
      materials.returns.emissive.copy(IDLE_RETURN_EMISSIVE).lerp(FINALE_GOLD_COLOR, goldBoost * 0.95);
      materials.returns.emissiveIntensity = (isNight ? 0.16 : 0.06) + goldBoost * 1.15;

      materials.symbol.opacity = symbolOpacity;
      materials.symbol.color.copy(SYMBOL_IDLE_COLOR).lerp(FINALE_LIGHT_GOLD, goldBoost * 0.15);

      if (groupRef.current) {
        groupRef.current.userData.showStatus = frame.status;
        groupRef.current.userData.showStage = frame.stage;
        groupRef.current.userData.showProgress = Number(frame.progress.toFixed(3));
      }
      if (gl?.domElement?.dataset) {
        gl.domElement.dataset.arenaShowStatus = frame.status;
        gl.domElement.dataset.arenaShowStage = frame.stage;
      }
    };
  }, [gl, ledPanel, materials]);

  useLayoutEffect(() => {
    const frame = controller.sample(performance.now());
    applyShowState(frame, night);
    invalidate();
  }, [night, applyShowState, controller, invalidate]);

  useEffect(() => {
    if (arenaShowSequence === lastSequenceRef.current) return;
    lastSequenceRef.current = arenaShowSequence;
    if (arenaShowSequence <= 0) return;

    const now = performance.now();
    const started = controller.trigger(now);
    if (started) {
      const initialFrame = controller.sample(now);
      applyShowState(initialFrame, night);
      requestCommercialMapAnimationFrame(gl, invalidate, COMMERCIAL_MAP_ANIMATION.environment);
    }
  }, [arenaShowSequence, applyShowState, controller, gl, invalidate, night]);

  useFrame(() => {
    if (controller.status === 'idle') return;
    const frame = controller.sample(performance.now());
    applyShowState(frame, night);
    if (frame.status !== 'idle') {
      requestCommercialMapAnimationFrame(gl, invalidate, COMMERCIAL_MAP_ANIMATION.environment);
    } else {
      invalidate();
    }
  });

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => ledPanel.dispose(), [ledPanel]);
  useEffect(() => () => {
    materials.map.dispose();
    materials.faces.dispose();
    materials.nightFaces.dispose();
    materials.returns.dispose();
    materials.symbol.dispose();
  }, [materials]);
  useEffect(() => () => {
    controller.reset();
    if (gl?.domElement?.dataset) {
      delete gl.domElement.dataset.arenaShowStatus;
      delete gl.domElement.dataset.arenaShowStage;
    }
  }, [controller, gl]);

  return (
    <group
      ref={groupRef}
      name="arena-fenasoja-roof-brand"
      dispose={null}
      userData={{
        officialSymbol: ARENA_ROOF_BRAND.symbol,
        roofConforming: true,
        horizontal: true,
        layout: geometry.layout,
        showStatus: controller.status,
        showStage: controller.stage,
      }}
    >
      <mesh
        ref={panelMeshRef}
        name="arena-brand-led-panel"
        geometry={geometry.panel}
        material={ledPanel.material}
        visible={false}
        renderOrder={10}
        raycast={NO_RAYCAST}
      />
      <mesh
        name="arena-brand-relief-edges"
        geometry={geometry.returns}
        material={materials.returns}
        castShadow
        receiveShadow
        renderOrder={11}
        raycast={NO_RAYCAST}
      />
      <mesh
        name="arena-brand-letter-faces"
        geometry={geometry.faces}
        material={night ? materials.nightFaces : materials.faces}
        castShadow
        receiveShadow
        renderOrder={12}
        raycast={NO_RAYCAST}
      />
      <mesh
        name="arena-brand-official-symbol"
        geometry={geometry.symbol}
        material={materials.symbol}
        renderOrder={13}
        raycast={NO_RAYCAST}
      />
    </group>
  );
}

/** Asynchronous branding never suspends the existing arena. */
export function ArenaRoofBrand(props: Props) {
  return <Suspense fallback={null}><MountedArenaRoofBrand {...props} /></Suspense>;
}
