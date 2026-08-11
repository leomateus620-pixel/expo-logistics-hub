import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from './capabilities';
import { CinematicCamera } from './CinematicCamera';
import { AlvoradaTimelineContext, useAlvoradaTimeline } from './TimelineContext';
import {
  ALVORADA_SEQUENCE_DURATION,
  createInitialTimelineState,
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

    // Lightweight diagnostics used by visual QA and field support. Keeping the
    // values on the existing canvas avoids React updates inside the render loop.
    gl.domElement.dataset.elapsed = elapsed.toFixed(3);
    gl.domElement.dataset.ambientElapsed = ambientElapsed.toFixed(3);
    gl.domElement.dataset.phase = timeline.current.phase;

    onProgress(elapsed);
  }, -2);

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
    const city = smoothRange(elapsed, 4.38, 5.35);
    const settled = smoothRange(elapsed, 5.15, 6.4);
    const cloudBridge = smoothRange(elapsed, 4.34, 4.84)
      * (1 - smoothRange(elapsed, 4.98, 5.52));
    fog.color.setRGB(
      THREE.MathUtils.lerp(0.38, 0.52, settled),
      THREE.MathUtils.lerp(0.48, 0.63, settled),
      THREE.MathUtils.lerp(0.62, 0.76, settled),
    );
    fog.density = cloudBridge * 0.01
      + city * THREE.MathUtils.lerp(0.0046, 0.00145, settled);
    const orbitalExposure = THREE.MathUtils.lerp(
      0.68,
      0.77,
      smoothRange(elapsed, 0.5, 3.8),
    );
    const dawnExposure = THREE.MathUtils.lerp(
      0.76,
      0.88,
      smoothRange(elapsed, 5.2, 9.6),
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

  return (
    <AlvoradaTimelineContext.Provider value={timeline}>
      <MasterTimeline
        initialElapsed={initialElapsed}
        onProgress={onProgress}
        onReady={onReady}
      />
      <SceneAtmosphere />
      <CinematicCamera quality={quality} />
      <EarthScene />
      <DawnEnvironment quality={quality} />
      <SantaRosaCity quality={quality} />
      <FenasojaTitle3D quality={quality} />
      <TransitionCloudLayer />
    </AlvoradaTimelineContext.Provider>
  );
}
