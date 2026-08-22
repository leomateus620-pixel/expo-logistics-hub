import {
  Suspense,
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
import { AlvoradaTimelineContext, useAlvoradaTimeline } from './TimelineContext';
import {
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

interface SceneControllerProps {
  initialElapsed: number;
  onProgress: (elapsed: number) => void;
  onReady: () => void;
  quality: AlvoradaQualityProfile;
}

function MasterTimeline({
  initialElapsed,
  onProgress,
  onReady,
}: Pick<
  SceneControllerProps,
  'initialElapsed' | 'onProgress' | 'onReady'
>) {
  const timeline = useAlvoradaTimeline();
  const { gl } = useThree();
  const startedAt = useRef<number | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const hiddenDuration = useRef(0);
  const ready = useRef(false);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (startedAt.current !== null) hiddenAt.current ??= performance.now();
        return;
      }
      if (hiddenAt.current !== null) {
        hiddenDuration.current += (performance.now() - hiddenAt.current) / 1000;
        hiddenAt.current = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useFrame(() => {
    const now = performance.now();
    if (startedAt.current === null) startedAt.current = now;
    const activeRuntime = Math.max(
      0,
      (now - startedAt.current) / 1000 - hiddenDuration.current,
    );
    const ambientElapsed = Math.max(0, initialElapsed + activeRuntime);
    const elapsed = Math.min(ALVORADA_SEQUENCE_DURATION, ambientElapsed);
    const delta = Math.min(
      0.1,
      Math.max(0, ambientElapsed - timeline.current.ambientElapsed),
    );

    if (!ready.current) {
      ready.current = true;
      onReady();
    }

    timeline.current.ambientElapsed = ambientElapsed;
    timeline.current.delta = delta;
    timeline.current.elapsed = elapsed;
    timeline.current.progress = elapsed / ALVORADA_SEQUENCE_DURATION;
    timeline.current.phase = getAlvoradaPhase(ambientElapsed);
    const visualState = deriveAlvoradaVisualState(elapsed);

    // Lightweight diagnostics used by visual QA and field support. Keeping the
    // values on the canvas avoids React updates inside the render loop.
    gl.domElement.dataset.elapsed = elapsed.toFixed(3);
    gl.domElement.dataset.ambientElapsed = ambientElapsed.toFixed(3);
    gl.domElement.dataset.phase = timeline.current.phase;
    gl.domElement.dataset.scene = visualState.dominantScene;

    onProgress(elapsed);
  }, -2);

  return null;
}

function EarthResidency({
  setEarthResident,
}: {
  setEarthResident: Dispatch<SetStateAction<boolean>>;
}) {
  const timeline = useAlvoradaTimeline();
  const resident = useRef(deriveAlvoradaVisualState(timeline.current.elapsed).earthResident);

  useFrame(() => {
    const earthResident = deriveAlvoradaVisualState(timeline.current.elapsed).earthResident;
    if (earthResident !== resident.current) setEarthResident(earthResident);
    resident.current = earthResident;
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
    const atmosphericWarmth = smoothRange(
      elapsed,
      ALVORADA_PHASES.territory.start,
      ALVORADA_PHASES['brand-reveal'].end,
    );
    fog.color.setRGB(
      THREE.MathUtils.lerp(0.38, 0.52, atmosphericWarmth),
      THREE.MathUtils.lerp(0.48, 0.63, atmosphericWarmth),
      THREE.MathUtils.lerp(0.62, 0.76, atmosphericWarmth),
    );
    fog.density = visualState.transitionOpacity * 0.0048;

    const orbitalExposure = THREE.MathUtils.lerp(
      0.68,
      0.77,
      smoothRange(elapsed, 0.5, ALVORADA_PHASES.territory.end - 0.5),
    );
    const dawnExposure = THREE.MathUtils.lerp(
      0.78,
      0.96,
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
  onProgress,
  onReady,
  quality,
}: SceneControllerProps) {
  const timeline = useRef(
    createInitialTimelineState(initialElapsed),
  ) as MutableRefObject<AlvoradaTimelineState>;
  const [earthResident, setEarthResident] = useState(
    deriveAlvoradaVisualState(initialElapsed).earthResident,
  );

  return (
    <AlvoradaTimelineContext.Provider value={timeline}>
      <MasterTimeline
        initialElapsed={initialElapsed}
        onProgress={onProgress}
        onReady={onReady}
      />
      <EarthResidency setEarthResident={setEarthResident} />
      <SceneAtmosphere />
      <CinematicCamera quality={quality} />
      {earthResident && (
        <Suspense fallback={null}>
          <EarthScene quality={quality} />
        </Suspense>
      )}
      <DawnEnvironment quality={quality} />
      <TransitionCloudLayer />
    </AlvoradaTimelineContext.Provider>
  );
}
