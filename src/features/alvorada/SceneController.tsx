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
import { FenasojaTitle3D } from './scenes/FenasojaTitle3D';
import { SantaRosaCity } from './scenes/SantaRosaCity';

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
    // values on the existing canvas avoids React updates inside the render loop.
    gl.domElement.dataset.elapsed = elapsed.toFixed(3);
    gl.domElement.dataset.ambientElapsed = ambientElapsed.toFixed(3);
    gl.domElement.dataset.phase = timeline.current.phase;
    gl.domElement.dataset.scene = visualState.dominantScene;

    onProgress(elapsed);
  }, -2);

  return null;
}

function SceneResidency({
  setCityResident,
  setEarthResident,
  setTitleResident,
}: {
  setCityResident: Dispatch<SetStateAction<boolean>>;
  setEarthResident: Dispatch<SetStateAction<boolean>>;
  setTitleResident: Dispatch<SetStateAction<boolean>>;
}) {
  const timeline = useAlvoradaTimeline();
  const residency = useRef(deriveAlvoradaVisualState(timeline.current.elapsed));

  useFrame(() => {
    const visualState = deriveAlvoradaVisualState(timeline.current.elapsed);
    if (visualState.earthResident !== residency.current.earthResident) {
      setEarthResident(visualState.earthResident);
    }
    if (visualState.cityResident !== residency.current.cityResident) {
      setCityResident(visualState.cityResident);
    }
    if (visualState.titleResident !== residency.current.titleResident) {
      setTitleResident(visualState.titleResident);
    }
    residency.current = visualState;
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
    const city = visualState.cityVisible ? 1 : 0;
    const settled = smoothRange(elapsed, 5.4, 7.1);
    const cloudBridge = visualState.transitionOpacity;
    fog.color.setRGB(
      THREE.MathUtils.lerp(0.38, 0.52, settled),
      THREE.MathUtils.lerp(0.48, 0.63, settled),
      THREE.MathUtils.lerp(0.62, 0.76, settled),
    );
    fog.density = cloudBridge * 0.0048
      + city * THREE.MathUtils.lerp(0.0046, 0.00145, settled);
    const orbitalExposure = THREE.MathUtils.lerp(
      0.68,
      0.77,
      smoothRange(elapsed, 0.5, 3.8),
    );
    const dawnExposure = THREE.MathUtils.lerp(
      0.78,
      0.96,
      smoothRange(elapsed, 5.4, 11.7),
    );
    gl.toneMappingExposure = THREE.MathUtils.lerp(
      orbitalExposure,
      dawnExposure,
      smoothRange(elapsed, 4.3, 5.35),
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
  const initialVisualState = deriveAlvoradaVisualState(initialElapsed);
  const [earthResident, setEarthResident] = useState(initialVisualState.earthResident);
  const [cityResident, setCityResident] = useState(initialVisualState.cityResident);
  const [titleResident, setTitleResident] = useState(initialVisualState.titleResident);

  return (
    <AlvoradaTimelineContext.Provider value={timeline}>
      <MasterTimeline
        initialElapsed={initialElapsed}
        onProgress={onProgress}
        onReady={onReady}
      />
      <SceneResidency
        setCityResident={setCityResident}
        setEarthResident={setEarthResident}
        setTitleResident={setTitleResident}
      />
      <SceneAtmosphere />
      <CinematicCamera quality={quality} />
      {earthResident && (
        <Suspense fallback={null}>
          <EarthScene quality={quality} />
        </Suspense>
      )}
      <DawnEnvironment quality={quality} />
      {cityResident && (
        <Suspense fallback={null}>
          <SantaRosaCity quality={quality} />
        </Suspense>
      )}
      {titleResident && (
        <Suspense fallback={null}>
          <FenasojaTitle3D quality={quality} />
        </Suspense>
      )}
      <TransitionCloudLayer />
    </AlvoradaTimelineContext.Provider>
  );
}
