import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from './capabilities';
import { CinematicCamera } from './CinematicCamera';
import {
  AlvoradaReadinessContext,
  AlvoradaTimelineContext,
  useAlvoradaReadiness,
  useAlvoradaTimeline,
  type AlvoradaSceneReadiness,
} from './TimelineContext';
import {
  ALVORADA_MAX_FRAME_DELTA,
  ALVORADA_PHASES,
  ALVORADA_SEQUENCE_DURATION,
  createInitialTimelineState,
  deriveAlvoradaVisualState,
  getAlvoradaPhase,
  smoothRange,
  type AlvoradaTimelineState,
} from './timeline';
import { TransitionCloudLayer } from './TransitionCloudLayer';
import { DawnEnvironment } from './scenes/DawnEnvironment';
import { EarthScene } from './scenes/EarthScene';
import type { AlvoradaPreparationEvent } from './types';

interface SceneControllerProps {
  initialElapsed: number;
  onPreparation?: (event: AlvoradaPreparationEvent) => void;
  onProgress: (elapsed: number) => void;
  onReady: () => void;
  quality: AlvoradaQualityProfile;
}

/**
 * Single authority over the authored clock.
 *
 * The clock is monotonic and frame-based: it starts at `initialElapsed` (zero
 * for a fresh intro) on the second frame presented after the critical assets
 * are bound and the scene shaders are compiled, and it advances by the real
 * frame delta clamped to `ALVORADA_MAX_FRAME_DELTA`. Time spent downloading,
 * compiling, suspended or hidden is therefore never charged to the journey,
 * and a multi-second frame moves the sequence by a fraction of a second.
 */
function MasterTimeline({
  initialElapsed,
  onProgress,
  onReady,
}: Pick<SceneControllerProps, 'initialElapsed' | 'onProgress' | 'onReady'>) {
  const timeline = useAlvoradaTimeline();
  const readiness = useAlvoradaReadiness();
  const { gl, scene, camera } = useThree();
  const ready = useRef(false);
  const shadersReady = useRef(false);
  const presentedFrames = useRef(0);
  const lastFrameAt = useRef<number | null>(null);
  const ambientElapsed = useRef(Math.max(0, Number.isNaN(initialElapsed) ? 0 : initialElapsed));
  const clampedFrames = useRef(0);

  useEffect(() => {
    let active = true;
    const compileStarted = performance.now();
    gl.domElement.dataset.preparation = 'shaders';
    readiness.current.report({ kind: 'shader-compile-start' });
    const finish = (mode: 'async' | 'direct-render') => {
      if (!active) return;
      const shaderPreparationMs = performance.now() - compileStarted;
      gl.domElement.dataset.shaderPreparationMs = shaderPreparationMs.toFixed(1);
      gl.domElement.dataset.preparation = mode === 'async' ? 'ready' : 'direct-render';
      shadersReady.current = true;
      readiness.current.report({
        kind: 'shader-compile-end',
        detail: { mode, shaderPreparationMs: Math.round(shaderPreparationMs) },
      });
    };
    // Every scene material is compiled before the clock starts; browsers with
    // KHR_parallel_shader_compile keep the portal responsive meanwhile.
    void gl.compileAsync(scene, camera)
      .then(() => finish('async'))
      // Direct rendering remains the recovery path on drivers without async compilation.
      .catch(() => finish('direct-render'));
    return () => { active = false; };
  }, [camera, gl, readiness, scene]);

  useFrame(() => {
    if (document.hidden || !shadersReady.current || !readiness.current.criticalAssetsReady) {
      // Nothing was presented; the next frame must not inherit this gap.
      lastFrameAt.current = null;
      return;
    }
    presentedFrames.current += 1;
    if (presentedFrames.current < 2) return;

    const now = performance.now();
    let delta = 0;
    if (lastFrameAt.current !== null) {
      const rawDelta = Math.max(0, (now - lastFrameAt.current) / 1000);
      delta = Math.min(ALVORADA_MAX_FRAME_DELTA, rawDelta);
      if (rawDelta > ALVORADA_MAX_FRAME_DELTA) {
        clampedFrames.current += 1;
        gl.domElement.dataset.clampedFrames = String(clampedFrames.current);
      }
    }
    lastFrameAt.current = now;

    if (!ready.current) {
      ready.current = true;
      const createdAt = Number(gl.domElement.dataset.createdAt ?? now);
      const firstFrameMs = now - createdAt;
      gl.domElement.dataset.firstFrameMs = firstFrameMs.toFixed(1);
      readiness.current.report({
        kind: 'first-frame',
        detail: { firstFrameMs: Math.round(firstFrameMs) },
      });
      onReady();
    }

    ambientElapsed.current += delta;
    const elapsed = Math.min(ALVORADA_SEQUENCE_DURATION, ambientElapsed.current);

    timeline.current.ambientElapsed = ambientElapsed.current;
    timeline.current.delta = delta;
    timeline.current.elapsed = elapsed;
    timeline.current.progress = elapsed / ALVORADA_SEQUENCE_DURATION;
    timeline.current.phase = getAlvoradaPhase(ambientElapsed.current);
    const visualState = deriveAlvoradaVisualState(elapsed);

    // Lightweight diagnostics used by visual QA and field support. Keeping the
    // values on the canvas avoids React updates inside the render loop.
    gl.domElement.dataset.elapsed = elapsed.toFixed(3);
    gl.domElement.dataset.ambientElapsed = ambientElapsed.current.toFixed(3);
    gl.domElement.dataset.phase = timeline.current.phase;
    gl.domElement.dataset.scene = visualState.dominantScene;

    onProgress(elapsed);
  }, -2);

  return null;
}

function EarthResidency({
  setEarthResident,
  setTransitionResident,
}: {
  setEarthResident: Dispatch<SetStateAction<boolean>>;
  setTransitionResident: Dispatch<SetStateAction<boolean>>;
}) {
  const timeline = useAlvoradaTimeline();
  const resident = useRef(deriveAlvoradaVisualState(timeline.current.elapsed).earthResident);
  const transitionResident = useRef(timeline.current.elapsed < 6.35);

  useFrame(() => {
    const earthResident = deriveAlvoradaVisualState(timeline.current.elapsed).earthResident;
    if (earthResident !== resident.current) setEarthResident(earthResident);
    resident.current = earthResident;
    if (transitionResident.current && timeline.current.elapsed >= 6.35) {
      transitionResident.current = false;
      setTransitionResident(false);
    }
  });

  return null;
}

function SceneAtmosphere() {
  const timeline = useAlvoradaTimeline();
  const { gl, scene } = useThree();
  const fog = useMemo(() => new THREE.FogExp2('#b98c68', 0), []);
  const originalFog = useRef(scene.fog);
  const originalBackground = useRef(scene.background);

  useEffect(() => {
    const previousFog = originalFog.current;
    const previousBackground = originalBackground.current;
    scene.fog = fog;
    scene.background = new THREE.Color('#010713');
    return () => {
      scene.fog = previousFog;
      scene.background = previousBackground;
    };
  }, [fog, scene]);

  useFrame(() => {
    const elapsed = timeline.current.elapsed;
    const visualState = deriveAlvoradaVisualState(elapsed);
    fog.color.set('#193651');
    fog.density = visualState.transitionOpacity * 0.001;

    const orbitalExposure = THREE.MathUtils.lerp(
      0.94,
      0.94,
      smoothRange(elapsed, 0.5, ALVORADA_PHASES.territory.end - 0.5),
    );
    const dawnExposure = THREE.MathUtils.lerp(
      0.9,
      0.88,
      smoothRange(
        elapsed,
        ALVORADA_PHASES['santa-rosa'].start,
        ALVORADA_PHASES['brand-hold'].start,
      ),
    );
    gl.toneMappingExposure = THREE.MathUtils.lerp(
      orbitalExposure,
      dawnExposure,
      smoothRange(
        elapsed,
        ALVORADA_PHASES['santa-rosa'].start,
        ALVORADA_PHASES['brand-reveal'].start,
      ),
    );
  });

  return null;
}

export function SceneController({
  initialElapsed,
  onPreparation,
  onProgress,
  onReady,
  quality,
}: SceneControllerProps) {
  const timeline = useRef(
    createInitialTimelineState(initialElapsed),
  ) as MutableRefObject<AlvoradaTimelineState>;
  const onPreparationRef = useRef(onPreparation);
  onPreparationRef.current = onPreparation;
  const readiness = useRef<AlvoradaSceneReadiness>({
    // A clock restored past the globe has no critical texture left to wait for.
    criticalAssetsReady: !deriveAlvoradaVisualState(initialElapsed).earthResident,
    report: (event) => {
      if (event.kind === 'critical-assets-ready') readiness.current.criticalAssetsReady = true;
      onPreparationRef.current?.(event);
    },
  });
  const [earthResident, setEarthResident] = useState(
    deriveAlvoradaVisualState(initialElapsed).earthResident,
  );
  const [transitionResident, setTransitionResident] = useState(initialElapsed < 6.35);

  return (
    <AlvoradaTimelineContext.Provider value={timeline}>
      <AlvoradaReadinessContext.Provider value={readiness}>
        <MasterTimeline
          initialElapsed={initialElapsed}
          onProgress={onProgress}
          onReady={onReady}
        />
        <EarthResidency setEarthResident={setEarthResident} setTransitionResident={setTransitionResident} />
        <SceneAtmosphere />
        <CinematicCamera quality={quality} />
        {earthResident && <EarthScene quality={quality} />}
        <DawnEnvironment quality={quality} />
        {transitionResident && <TransitionCloudLayer quality={quality} />}
      </AlvoradaReadinessContext.Provider>
    </AlvoradaTimelineContext.Provider>
  );
}
