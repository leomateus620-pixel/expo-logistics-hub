import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from './capabilities';
import { AlvoradaErrorBoundary } from './AlvoradaErrorBoundary';
import { CinematicPostFX } from './CinematicPostFX';
import { SceneController } from './SceneController';
import type { AlvoradaPreparationEvent, AlvoradaWebGLTier } from './types';

interface AlvoradaCanvasProps {
  initialElapsed: number;
  paused?: boolean;
  reducedMotion?: boolean;
  onContextLost: (elapsed: number) => void;
  /** Preparation milestones for the host watchdog and telemetry. */
  onPreparation?: (event: AlvoradaPreparationEvent) => void;
  onProgress: (elapsed: number) => void;
  onQualityDecline: () => void;
  onReady: () => void;
  quality: AlvoradaQualityProfile;
  rendererTier: Exclude<AlvoradaWebGLTier, 'unavailable'>;
}

function RendererTelemetry({ quality }: { quality: AlvoradaQualityProfile }) {
  const { gl } = useThree();
  const sample = useRef({ elapsed: 0, frames: 0, frameTimes: [] as number[], longFrames: 0 });
  const drawingBuffer = useRef(new THREE.Vector2());

  useFrame((_, delta) => {
    sample.current.elapsed += delta;
    sample.current.frames += 1;
    sample.current.frameTimes.push(delta * 1000);
    if (delta > 1 / 30) sample.current.longFrames += 1;
    if (sample.current.elapsed < 0.5) return;

    const canvas = gl.domElement;
    const sortedFrameTimes = [...sample.current.frameTimes].sort((left, right) => left - right);
    const p95Index = Math.min(
      sortedFrameTimes.length - 1,
      Math.floor(sortedFrameTimes.length * 0.95),
    );
    gl.getDrawingBufferSize(drawingBuffer.current);
    canvas.dataset.fps = String(Math.round(sample.current.frames / sample.current.elapsed));
    canvas.dataset.frameTimeMs = String((sample.current.elapsed * 1000 / sample.current.frames).toFixed(2));
    canvas.dataset.frameTimeP95Ms = String((sortedFrameTimes[p95Index] ?? 0).toFixed(2));
    canvas.dataset.longFrames = String(sample.current.longFrames);
    canvas.dataset.drawCalls = String(gl.info.render.calls);
    canvas.dataset.triangles = String(gl.info.render.triangles);
    canvas.dataset.geometries = String(gl.info.memory.geometries);
    canvas.dataset.textures = String(gl.info.memory.textures);
    canvas.dataset.renderPixels = String(
      Math.round(drawingBuffer.current.x * drawingBuffer.current.y),
    );
    canvas.dataset.quality = quality.level;
    sample.current.elapsed = 0;
    sample.current.frames = 0;
    sample.current.frameTimes = [];
    sample.current.longFrames = 0;
  });

  return null;
}

function CanvasRuntimeGuard({
  ready,
  onContextLost,
  onQualityDecline,
}: {
  ready: boolean;
  onContextLost: () => void;
  onQualityDecline: () => void;
}) {
  const { gl, performance } = useThree();

  useEffect(() => {
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onContextLost();
    };
    gl.domElement.addEventListener('webglcontextlost', handleContextLost);
    return () => gl.domElement.removeEventListener('webglcontextlost', handleContextLost);
  }, [gl, onContextLost]);

  return ready ? (
    <PerformanceMonitor
      bounds={(refreshRate) => [Math.min(34, refreshRate * 0.54), refreshRate * 0.82]}
      flipflops={3}
      onDecline={() => {
        performance.regress();
        onQualityDecline();
      }}
    />
  ) : null;
}

export function AlvoradaCanvas({
  initialElapsed,
  paused = false,
  reducedMotion = false,
  onContextLost,
  onPreparation,
  onProgress,
  onQualityDecline,
  onReady,
  quality,
  rendererTier,
}: AlvoradaCanvasProps) {
  const [ready, setReady] = useState(false);
  const handleReady = useCallback(() => {
    setReady(true);
    onReady();
  }, [onReady]);
  const elapsed = useRef(initialElapsed);
  const handleProgress = useCallback((nextElapsed: number) => {
    elapsed.current = nextElapsed;
    onProgress(nextElapsed);
  }, [onProgress]);
  const handleContextLost = useCallback(() => {
    onContextLost(elapsed.current);
  }, [onContextLost]);
  const onPreparationRef = useRef(onPreparation);
  onPreparationRef.current = onPreparation;
  const report = useCallback((event: AlvoradaPreparationEvent) => {
    onPreparationRef.current?.(event);
  }, []);

  useEffect(() => {
    report({ kind: 'canvas-created' });
  }, [report]);

  const [initialCamera] = useState(() => ({ far: 900, fov: quality.mobile ? 53 : 45, near: 0.08, position: [0, 0, 12] as [number, number, number] }));
  const [contextAttributes] = useState<THREE.WebGLRendererParameters>(() => ({
    alpha: false, antialias: quality.antialias && !quality.postprocessing,
    failIfMajorPerformanceCaveat: false, powerPreference: 'default', stencil: false,
  }));

  return (
    <Canvas
      camera={initialCamera}
      dpr={quality.dpr}
      frameloop="always"
      gl={contextAttributes}
      performance={{ min: 0.55, debounce: 180 }}
      shadows={false}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.94;
        gl.domElement.dataset.createdAt = String(performance.now());
        gl.setClearColor('#010713', 1);
        const context = gl.getContext();
        let gpu = 'privacy-restricted';
        try {
          const info = context.getExtension('WEBGL_debug_renderer_info');
          gpu = String(context.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : context.RENDERER));
        } catch { /* Optional diagnostic extension, not a readiness requirement. */ }
        gl.debug.onShaderError = () => report({ kind: 'render-error', detail: { reason: 'shader-link-failed' } });
        report({
          kind: 'context-created',
          detail: {
            webglVersion: gl.capabilities.isWebGL2 ? 'webgl2' : 'webgl1',
            parallelShaderCompile: Boolean(context.getExtension('KHR_parallel_shader_compile')),
            renderer: gpu, contextCreationResult: 'created', requestedTier: rendererTier,
            maxTextureSize: gl.capabilities.maxTextureSize,
          },
        });
      }}
    >
      <CanvasRuntimeGuard
        ready={ready}
        onContextLost={handleContextLost}
        onQualityDecline={onQualityDecline}
      />
      <RendererTelemetry quality={quality} />
      <SceneController
        initialElapsed={initialElapsed}
        paused={paused}
        reducedMotion={reducedMotion}
        onPreparation={report}
        onProgress={handleProgress}
        onReady={handleReady}
        quality={quality}
      />
      <AlvoradaErrorBoundary fallback={null} onError={onQualityDecline}>
        <Suspense fallback={null}>
          <CinematicPostFX quality={quality} />
        </Suspense>
      </AlvoradaErrorBoundary>
      <AdaptiveDpr pixelated={false} />
    </Canvas>
  );
}
