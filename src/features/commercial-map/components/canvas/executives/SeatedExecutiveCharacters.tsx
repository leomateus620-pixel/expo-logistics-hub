import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import {
  EXECUTIVE_CHARACTER_IDS,
  EXECUTIVE_CHARACTER_PROFILES,
  SEATED_EXECUTIVE_CLIP,
  type ExecutiveCharacterProfile,
} from '../../../data/executiveCharacters';
import { SeatedExecutiveErrorBoundary } from './SeatedExecutiveErrorBoundary';

const NO_RAYCAST = () => undefined;
interface SeatedExecutiveCharactersProps {
  reducedGraphics: boolean;
}

interface RiggedSeatedCharacterProps {
  profile: ExecutiveCharacterProfile;
  source: THREE.Object3D;
  clip: THREE.AnimationClip;
  reducedMotion: boolean;
  reducedGraphics: boolean;
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    setReducedMotion(query.matches);
    query.addEventListener?.('change', updatePreference);
    return () => query.removeEventListener?.('change', updatePreference);
  }, []);

  return reducedMotion;
}

function prepareModel(source: THREE.Object3D, targetHeight: number) {
  const model = SkeletonUtils.clone(source) as THREE.Group;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const sourceHeight = Math.max(0.001, bounds.max.y - bounds.min.y);
  const scale = targetHeight / sourceHeight;
  const groundCorrection = -bounds.min.y * scale;

  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.raycast = NO_RAYCAST;
    mesh.receiveShadow = true;
    // The Commercial Map freezes its global shadow atlas; animated casters
    // would leave stale silhouettes. Contact is represented by the ellipse.
    mesh.castShadow = false;
  });

  return { model, scale, groundCorrection };
}

const RiggedSeatedCharacter = memo(function RiggedSeatedCharacter({
  profile,
  source,
  clip,
  reducedMotion,
  reducedGraphics,
}: RiggedSeatedCharacterProps) {
  const modelContainerRef = useRef<THREE.Group>(null);
  const prepared = useMemo(
    () => prepareModel(source, profile.heightMeters),
    [profile.heightMeters, source],
  );
  const { actions, mixer } = useAnimations([clip], modelContainerRef);

  useEffect(() => {
    const action = actions[SEATED_EXECUTIVE_CLIP];
    if (!action) return undefined;
    action.reset();
    action.enabled = true;
    action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
    action.time = clip.duration * profile.seated.idlePhase;
    action.paused = reducedMotion;
    mixer.timeScale = reducedMotion ? 0 : 1;
    action.play();
    if (reducedMotion) {
      mixer.update(0);
    }
    return () => {
      action.stop();
    };
  }, [actions, clip.duration, mixer, profile.seated.idlePhase, reducedMotion]);

  return (
    <group
      name={`SeatedExecutive_${profile.id}`}
      position={profile.seated.position}
      rotation={[0, profile.seated.rotationY, 0]}
      raycast={NO_RAYCAST}
    >
      <mesh
        position={[0, 0.008, 0.03]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[0.29, 0.14, 1]}
        renderOrder={2}
        raycast={NO_RAYCAST}
      >
        <circleGeometry args={[1, reducedGraphics ? 14 : 24]} />
        <meshBasicMaterial
          color="#241b16"
          transparent
          opacity={reducedGraphics ? 0.1 : 0.17}
          depthWrite={false}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <group
        ref={modelContainerRef}
        position={[0, prepared.groundCorrection, 0]}
        scale={prepared.scale}
      >
        <primitive object={prepared.model} dispose={null} />
      </group>
    </group>
  );
});

function SeatedExecutiveAsset({
  profile,
  reducedMotion,
  reducedGraphics,
}: {
  profile: ExecutiveCharacterProfile;
  reducedMotion: boolean;
  reducedGraphics: boolean;
}) {
  // Explicit false prevents GLTFLoader from requesting a remote Draco decoder.
  const gltf = useGLTF(profile.assetUrl, false, true);
  const clip = gltf.animations.find((animation) => animation.name === SEATED_EXECUTIVE_CLIP);
  if (!clip) throw new Error(`${profile.displayName}: clip ${SEATED_EXECUTIVE_CLIP} ausente`);

  return (
    <RiggedSeatedCharacter
      profile={profile}
      source={gltf.scene}
      clip={clip}
      reducedMotion={reducedMotion}
      reducedGraphics={reducedGraphics}
    />
  );
}

export const SeatedExecutiveCharacters = memo(function SeatedExecutiveCharacters({
  reducedGraphics,
}: SeatedExecutiveCharactersProps) {
  const invalidate = useThree((state) => state.invalidate);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    invalidate();
    if (reducedMotion || typeof window === 'undefined') return undefined;
    const interval = window.setInterval(
      () => {
        if (typeof document === 'undefined' || !document.hidden) {
          invalidate();
        }
      },
      Math.round(1000 / (reducedGraphics ? 14 : 22)),
    );
    return () => window.clearInterval(interval);
  }, [invalidate, reducedGraphics, reducedMotion]);

  return (
    <group name="SeatedFenasojaExecutives" raycast={NO_RAYCAST}>
      {EXECUTIVE_CHARACTER_IDS.map((id) => (
        <SeatedExecutiveErrorBoundary key={id}>
          <SeatedExecutiveAsset
            profile={EXECUTIVE_CHARACTER_PROFILES[id]}
            reducedMotion={reducedMotion}
            reducedGraphics={reducedGraphics}
          />
        </SeatedExecutiveErrorBoundary>
      ))}
    </group>
  );
});
