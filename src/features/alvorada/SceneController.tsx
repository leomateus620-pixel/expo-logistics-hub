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
  onSequenceComplete: () => void;
  quality: AlvoradaQualityProfile;
}

function MasterTimeline({
  initialElapsed,
  onProgress,
  onReady,
  onSequenceComplete,
}: Pick<
  SceneControllerProps,
  'initialElapsed' | 'onProgress' | 'onReady' | 'onSequenceComplete'
>) {
  const timeline = useAlvoradaTimeline();
  const startedAt = useRef<number | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const hiddenDuration = useRef(0);
  const ready = useRef(false);
  const complete = useRef(false);

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

  useFrame((state) => {
    const clockTime = state.clock.elapsedTime;
    if (startedAt.current === null) startedAt.current = clockTime;
    const elapsed = Math.min(
      ALVORADA_SEQUENCE_DURATION,
      Math.max(
        0,
        initialElapsed + clockTime - startedAt.current - hiddenDuration.current,
      ),
    );
    const delta = Math.min(0.1, Math.max(0, elapsed - timeline.current.elapsed));

    if (!ready.current) {
      ready.current = true;
      onReady();
    }

    if (timeline.current.elapsed < ALVORADA_SEQUENCE_DURATION) {
      timeline.current.delta = delta;
      timeline.current.elapsed = elapsed;
      timeline.current.progress = timeline.current.elapsed / ALVORADA_SEQUENCE_DURATION;
      timeline.current.phase = getAlvoradaPhase(timeline.current.elapsed);
    }

    onProgress(timeline.current.elapsed);

    if (!complete.current && timeline.current.elapsed >= ALVORADA_SEQUENCE_DURATION) {
      complete.current = true;
      onSequenceComplete();
    }
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
    const city = smoothRange(elapsed, 4.48, 5.08);
    fog.density = city * THREE.MathUtils.lerp(0.0085, 0.0032, smoothRange(elapsed, 5.0, 7.2));
    gl.toneMappingExposure = THREE.MathUtils.lerp(0.67, 0.88, smoothRange(elapsed, 0.4, 7.4));
  });

  return null;
}

export function SceneController({
  initialElapsed,
  onProgress,
  onReady,
  onSequenceComplete,
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
        onSequenceComplete={onSequenceComplete}
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
