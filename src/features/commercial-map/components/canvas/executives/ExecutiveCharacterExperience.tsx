import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { Html, Line, useAnimations, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import {
  EXECUTIVE_CHARACTER_IDS,
  EXECUTIVE_CHARACTER_PROFILES,
  type ExecutiveCharacterId,
  type ExecutiveCharacterProfile,
} from '../../../data/executiveCharacters';
import {
  EXECUTIVE_WALKING_ROUTE,
  executiveRouteIsVisible,
} from '../../../data/executiveRoute';
import type { CommercialMapSegmentId } from '../../../data/commercialMapSegments';
import { useCommercialMapStore } from '../../../state/useCommercialMapStore';
import {
  advanceExecutiveInteraction,
  createExecutiveInteractionState,
  EXECUTIVE_INTERACTION_TIMING,
  executiveMovementSpeedMultiplier,
  executiveViewerOrientationWeight,
  type ExecutiveInteractionPhase,
} from '../../../utils/executiveInteraction';
import {
  createExecutiveRouteCurve,
  normalizeRouteProgress,
  sampleExecutiveRoutePose,
} from '../../../utils/executiveRoute';
import { ExecutiveExperienceErrorBoundary } from './ExecutiveExperienceErrorBoundary';
import { resetExecutiveExperienceState } from './executiveExperienceState';

const NO_RAYCAST = () => undefined;
const EXECUTIVE_MAX_HEIGHT = Math.max(
  ...EXECUTIVE_CHARACTER_IDS.map((id) => EXECUTIVE_CHARACTER_PROFILES[id].heightMapUnits),
);
const EXECUTIVE_MID_HEIGHT = EXECUTIVE_MAX_HEIGHT * 0.54;
const MAX_FRAME_DELTA = 0.12;
const UP = new THREE.Vector3(0, 1, 0);

interface ExecutiveCharacterExperienceProps {
  isolatedArea?: string | null;
  reducedGraphics: boolean;
}

interface ExecutiveCharacterProps {
  profile: ExecutiveCharacterProfile;
  groupRef: MutableRefObject<THREE.Group | null>;
  interactionPhase: ExecutiveInteractionPhase;
  waveActor: ExecutiveCharacterId;
  movementSpeedRef: MutableRefObject<number>;
  reducedMotion: boolean;
  reducedGraphics: boolean;
}

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined'
    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  ));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reducedMotion;
}

function shortestAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function projectedCharacterHeight(
  position: THREE.Vector3,
  camera: THREE.Camera,
  scratchBottom: THREE.Vector3,
  scratchTop: THREE.Vector3,
) {
  scratchBottom.copy(position).project(camera);
  scratchTop.copy(position).addScaledVector(UP, EXECUTIVE_MAX_HEIGHT).project(camera);
  // NDC spans two units vertically, hence the half to return viewport share.
  return Math.abs(scratchTop.y - scratchBottom.y) * 0.5;
}

function isExecutiveInView(position: THREE.Vector3, camera: THREE.Camera, scratch: THREE.Vector3) {
  scratch.copy(position).addScaledVector(UP, EXECUTIVE_MID_HEIGHT).project(camera);
  return scratch.z >= -1
    && scratch.z <= 1
    && Math.abs(scratch.x) <= 1.16
    && Math.abs(scratch.y) <= 1.16;
}

function normalizedModel(
  source: THREE.Object3D,
  targetHeight: number,
) {
  const model = SkeletonUtils.clone(source) as THREE.Group;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const sourceHeight = Math.max(0.001, bounds.max.y - bounds.min.y);
  const scale = targetHeight / sourceHeight;
  const groundCorrection = -bounds.min.y * scale;

  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    // The park intentionally freezes its global shadow map. A moving caster
    // would leave a stale silhouette, so animated ground contact is supplied
    // by the lightweight ellipse rendered with each character.
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.raycast = NO_RAYCAST;
  });

  return { model, scale, groundCorrection };
}

function activeAnimationName(
  phase: ExecutiveInteractionPhase,
  characterId: ExecutiveCharacterId,
  waveActor: ExecutiveCharacterId,
  reducedMotion: boolean,
) {
  if (reducedMotion) return 'Idle';
  if (phase === 'waving') return characterId === waveActor ? 'Wave' : 'Idle';
  return 'Walk';
}

const ExecutiveCharacter = memo(function ExecutiveCharacter({
  profile,
  groupRef,
  interactionPhase,
  waveActor,
  movementSpeedRef,
  reducedMotion,
  reducedGraphics,
}: ExecutiveCharacterProps) {
  // Passing false explicitly keeps GLTFLoader away from any remote Draco CDN.
  const gltf = useGLTF(profile.assetUrl, false, true);
  const normalized = useMemo(
    () => normalizedModel(gltf.scene, profile.heightMapUnits),
    [gltf.scene, profile.heightMapUnits],
  );
  const modelContainerRef = useRef<THREE.Group>(null);
  const { actions, mixer } = useAnimations(gltf.animations, modelContainerRef);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const desiredAnimation = activeAnimationName(
    interactionPhase,
    profile.id,
    waveActor,
    reducedMotion,
  );

  useEffect(() => {
    const nextAction = actions[desiredAnimation] ?? actions.Idle ?? actions.Walk ?? null;
    if (!nextAction || currentActionRef.current === nextAction) return undefined;

    const previousAction = currentActionRef.current;
    previousAction?.fadeOut(reducedMotion ? 0.08 : 0.2);
    nextAction.reset();
    nextAction.enabled = true;
    nextAction.clampWhenFinished = desiredAnimation === 'Wave';
    if (desiredAnimation === 'Wave') {
      nextAction.setLoop(THREE.LoopOnce, 1);
    } else {
      nextAction.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
      const duration = nextAction.getClip().duration;
      nextAction.time = normalizeRouteProgress(profile.route.stridePhase) * duration;
    }
    nextAction.fadeIn(reducedMotion ? 0.08 : 0.2).play();
    currentActionRef.current = nextAction;

    return undefined;
  }, [actions, desiredAnimation, profile.route.stridePhase, reducedMotion]);

  useFrame(() => {
    mixer.timeScale = reducedMotion ? 0 : 1;
    const walk = actions.Walk;
    if (walk) {
      walk.setEffectiveTimeScale(
        Math.max(0.32, movementSpeedRef.current) * profile.route.speedVariation,
      );
    }
    const wave = actions.Wave;
    if (wave) {
      const clipDuration = Math.max(0.01, wave.getClip().duration);
      wave.setEffectiveTimeScale(clipDuration / EXECUTIVE_INTERACTION_TIMING.waveDuration);
    }
    const idle = actions.Idle;
    if (idle) idle.setEffectiveTimeScale(profile.route.speedVariation);
  });

  return (
    <group ref={groupRef}>
      <mesh
        position={[0, 0.004, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[profile.heightMapUnits * 0.2, profile.heightMapUnits * 0.085, 1]}
        renderOrder={2}
        raycast={NO_RAYCAST}
      >
        <circleGeometry args={[1, reducedGraphics ? 14 : 24]} />
        <meshBasicMaterial
          color="#17251c"
          transparent
          opacity={reducedGraphics ? 0.13 : 0.19}
          depthWrite={false}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <group
        ref={modelContainerRef}
        position={[0, normalized.groundCorrection, 0]}
        scale={normalized.scale}
      >
        <primitive object={normalized.model} dispose={null} />
      </group>
    </group>
  );
});

function CasaDaSojaMarker({ reducedGraphics }: { reducedGraphics: boolean }) {
  const executiveFocusActive = useCommercialMapStore((state) => state.executiveFocusActive);
  return (
    <group position={EXECUTIVE_WALKING_ROUTE.anchor.start} raycast={NO_RAYCAST}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.006, 0]}
        renderOrder={4}
        raycast={NO_RAYCAST}
      >
        <ringGeometry args={[0.12, 0.175, reducedGraphics ? 18 : 32]} />
        <meshBasicMaterial
          color="#d0a62f"
          transparent
          opacity={0.94}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0.033, 0]} raycast={NO_RAYCAST}>
        <sphereGeometry args={[0.035, reducedGraphics ? 8 : 14, reducedGraphics ? 6 : 10]} />
        <meshStandardMaterial color="#f4d36c" roughness={0.52} metalness={0.16} />
      </mesh>
      {!reducedGraphics && !executiveFocusActive && (
        <Html
          position={[0, 0.19, 0]}
          center
          distanceFactor={7.5}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div
            style={{
              background: 'rgba(20, 44, 31, 0.92)',
              border: '1px solid rgba(220, 187, 86, 0.72)',
              borderRadius: 999,
              color: '#fffdf5',
              fontFamily: 'inherit',
              fontSize: 11,
              fontWeight: 700,
              lineHeight: 1,
              padding: '6px 9px',
              whiteSpace: 'nowrap',
              boxShadow: '0 3px 12px rgba(17, 36, 25, 0.18)',
            }}
          >
            Casa da Soja
          </div>
        </Html>
      )}
    </group>
  );
}

function ExecutiveRoutePresentation({
  routePoints,
  reducedGraphics,
}: {
  routePoints: THREE.Vector3[];
  reducedGraphics: boolean;
}) {
  return (
    <>
      <Line
        points={routePoints}
        color="#1e794d"
        lineWidth={reducedGraphics ? 1.15 : 1.55}
        transparent
        opacity={reducedGraphics ? 0.48 : 0.66}
        depthWrite={false}
        toneMapped={false}
        renderOrder={3}
        raycast={NO_RAYCAST}
      />
      <CasaDaSojaMarker reducedGraphics={reducedGraphics} />
    </>
  );
}

function ExecutiveCharacterExperienceScene({ reducedGraphics }: { reducedGraphics: boolean }) {
  const { camera, invalidate } = useThree();
  const reducedMotion = useReducedMotionPreference();
  const routeCurve = useMemo(
    () => createExecutiveRouteCurve(EXECUTIVE_WALKING_ROUTE),
    [],
  );
  const routeLength = useMemo(() => routeCurve.getLength(), [routeCurve]);
  const routePoints = useMemo(
    () => routeCurve.getSpacedPoints(reducedGraphics ? 220 : 480),
    [reducedGraphics, routeCurve],
  );
  const fabianoRef = useRef<THREE.Group | null>(null);
  const djeisonRef = useRef<THREE.Group | null>(null);
  const distanceTravelledRef = useRef(0);
  const movementSpeedRef = useRef(1);
  const targetFpsRef = useRef(reducedGraphics ? 18 : 24);
  const interactionRef = useRef(createExecutiveInteractionState(0));
  const [interactionPhase, setInteractionPhase] = useState<ExecutiveInteractionPhase>('walking');
  const [waveActor, setWaveActor] = useState<ExecutiveCharacterId>('fabiano-soltis');
  const initializedRotationsRef = useRef(false);
  const viewerAcknowledgementRef = useRef(false);
  const center = useMemo(() => new THREE.Vector3(), []);
  const cameraTarget = useMemo(() => new THREE.Vector3(), []);
  const projectedBottom = useMemo(() => new THREE.Vector3(), []);
  const projectedTop = useMemo(() => new THREE.Vector3(), []);
  const projectedCenter = useMemo(() => new THREE.Vector3(), []);
  const viewerDirection = useMemo(() => new THREE.Vector3(), []);
  const averageTangent = useMemo(() => new THREE.Vector3(), []);
  const cameraLateral = useMemo(() => new THREE.Vector3(), []);
  const cameraOffset = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    invalidate();
    const store = useCommercialMapStore.getState();
    store.setExecutiveExperienceAvailable(true);
    store.setExecutiveInteractionPhase('walking');
    return resetExecutiveExperienceState;
  }, [invalidate]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let stopped = false;
    let timer = 0;
    const requestNextFrame = () => {
      if (stopped) return;
      const framesPerSecond = Math.max(8, targetFpsRef.current);
      timer = window.setTimeout(() => {
        if (!document.hidden) invalidate();
        requestNextFrame();
      }, Math.round(1000 / framesPerSecond));
    };
    const handleVisibility = () => {
      if (!document.hidden) invalidate();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    if (!reducedMotion) requestNextFrame();
    else invalidate();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [invalidate, reducedMotion]);

  useFrame(({ clock }, delta) => {
    const now = clock.elapsedTime;
    const safeDelta = reducedMotion || (typeof document !== 'undefined' && document.hidden)
      ? 0
      : Math.min(Math.max(delta, 0), MAX_FRAME_DELTA);

    const interaction = interactionRef.current;
    const speedMultiplier = executiveMovementSpeedMultiplier(interaction, now);
    movementSpeedRef.current = speedMultiplier;
    distanceTravelledRef.current = (
      distanceTravelledRef.current
      + safeDelta * EXECUTIVE_WALKING_ROUTE.speedMapUnitsPerSecond * speedMultiplier
    ) % routeLength;
    const progress = normalizeRouteProgress(distanceTravelledRef.current / routeLength);

    const fabiano = EXECUTIVE_CHARACTER_PROFILES['fabiano-soltis'];
    const djeison = EXECUTIVE_CHARACTER_PROFILES['djeison-drey'];
    const fabianoPose = sampleExecutiveRoutePose(
      routeCurve,
      progress + fabiano.route.longitudinalOffset / routeLength,
      fabiano.route.lateralOffset,
    );
    const djeisonPose = sampleExecutiveRoutePose(
      routeCurve,
      progress + djeison.route.longitudinalOffset / routeLength,
      djeison.route.lateralOffset,
    );
    center.copy(fabianoPose.position).add(djeisonPose.position).multiplyScalar(0.5);

    const orientationWeight = reducedMotion ? 0 : executiveViewerOrientationWeight(interaction);
    const rotationFactor = reducedMotion ? 1 : 1 - Math.exp(-safeDelta * 7.5);
    const characters = [
      { ref: fabianoRef, pose: fabianoPose },
      { ref: djeisonRef, pose: djeisonPose },
    ] as const;
    characters.forEach(({ ref, pose }) => {
      const group = ref.current;
      if (!group) return;
      group.position.copy(pose.position);
      // Blender's -Y authoring front is exported as local +Z in glTF.
      const routeYaw = pose.yaw;
      viewerDirection.copy(camera.position).sub(pose.position).setY(0);
      const viewerYaw = viewerDirection.lengthSq() > 0.000001
        ? Math.atan2(viewerDirection.x, viewerDirection.z)
        : routeYaw;
      const desiredYaw = routeYaw + shortestAngleDelta(routeYaw, viewerYaw) * orientationWeight;
      if (!initializedRotationsRef.current || reducedMotion) group.rotation.y = desiredYaw;
      else group.rotation.y += shortestAngleDelta(group.rotation.y, desiredYaw) * rotationFactor;
    });
    initializedRotationsRef.current = Boolean(fabianoRef.current && djeisonRef.current);

    cameraTarget.copy(center).addScaledVector(UP, EXECUTIVE_MID_HEIGHT);
    const observation = {
      now,
      cameraDistance: camera.position.distanceTo(cameraTarget),
      projectedCharacterHeight: projectedCharacterHeight(
        center,
        camera,
        projectedBottom,
        projectedTop,
      ),
      inView: isExecutiveInView(center, camera, projectedCenter),
      reducedMotion,
    };
    const nextInteraction = advanceExecutiveInteraction(interaction, observation);
    if (nextInteraction !== interaction) {
      interactionRef.current = nextInteraction;
      if (nextInteraction.phase !== interaction.phase) {
        setInteractionPhase(nextInteraction.phase);
        useCommercialMapStore.getState().setExecutiveInteractionPhase(nextInteraction.phase);
      }
      if (nextInteraction.waveActor !== interaction.waveActor) {
        setWaveActor(nextInteraction.waveActor);
      }
    }

    averageTangent.copy(fabianoPose.tangent).add(djeisonPose.tangent).setY(0);
    if (averageTangent.lengthSq() < 0.000001) averageTangent.set(0, 0, 1);
    else averageTangent.normalize();
    cameraLateral.set(-averageTangent.z, 0, averageTangent.x);
    // A forward position sees the executives front-on. The lateral component
    // turns it into a deliberate three-quarter portrait; the modest Y offset
    // keeps the lens near face height instead of looking down from overview.
    cameraOffset
      .copy(averageTangent)
      .multiplyScalar(0.82)
      .addScaledVector(cameraLateral, 0.56)
      .addScaledVector(UP, 0.24)
      .normalize();
    // Publish the camera contract on every rendered frame. The adaptive
    // invalidator already owns the frame budget; an additional 10 Hz gate made
    // close follow visibly step between route samples.
    useCommercialMapStore.setState({
      executiveTarget: cameraTarget.toArray() as [number, number, number],
      executiveCameraOffset: cameraOffset.toArray() as [number, number, number],
    });

    const executiveFocusActive = useCommercialMapStore.getState().executiveFocusActive;
    const acknowledgementActive = !reducedMotion && (
      executiveFocusActive || observation.projectedCharacterHeight >= 0.065
    );
    if (acknowledgementActive !== viewerAcknowledgementRef.current) {
      viewerAcknowledgementRef.current = acknowledgementActive;
      useCommercialMapStore.getState().setExecutiveInteractionEnabled(acknowledgementActive);
    }
    targetFpsRef.current = reducedGraphics
      ? executiveFocusActive || observation.cameraDistance < 4 ? 22 : 14
      : executiveFocusActive || observation.cameraDistance < 4 ? 30
        : observation.cameraDistance < 12 ? 22
          : 14;
  });

  return (
    <group name="FenasojaExecutiveCharacterExperience" raycast={NO_RAYCAST}>
      <ExecutiveRoutePresentation
        routePoints={routePoints}
        reducedGraphics={reducedGraphics}
      />
      <ExecutiveCharacter
        profile={EXECUTIVE_CHARACTER_PROFILES['fabiano-soltis']}
        groupRef={fabianoRef}
        interactionPhase={interactionPhase}
        waveActor={waveActor}
        movementSpeedRef={movementSpeedRef}
        reducedMotion={reducedMotion}
        reducedGraphics={reducedGraphics}
      />
      <ExecutiveCharacter
        profile={EXECUTIVE_CHARACTER_PROFILES['djeison-drey']}
        groupRef={djeisonRef}
        interactionPhase={interactionPhase}
        waveActor={waveActor}
        movementSpeedRef={movementSpeedRef}
        reducedMotion={reducedMotion}
        reducedGraphics={reducedGraphics}
      />
    </group>
  );
}

/**
 * Kept as a two-level component so isolated commission views return before
 * either useGLTF hook runs. The parent owns the Suspense boundary.
 */
export const ExecutiveCharacterExperience = memo(function ExecutiveCharacterExperience({
  isolatedArea,
  reducedGraphics,
}: ExecutiveCharacterExperienceProps) {
  if (!executiveRouteIsVisible(isolatedArea as CommercialMapSegmentId | null | undefined)) return null;
  return (
    <ExecutiveExperienceErrorBoundary>
      <ExecutiveCharacterExperienceScene reducedGraphics={reducedGraphics} />
    </ExecutiveExperienceErrorBoundary>
  );
});
