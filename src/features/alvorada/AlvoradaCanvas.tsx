import { Suspense, useCallback, useEffect, useRef } from 'react';
import { AdaptiveDpr, PerformanceMonitor, Preload } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from './capabilities';
import { CinematicPostFX } from './CinematicPostFX';
import { SceneController } from './SceneController';
import type { AlvoradaWebGLTier } from './types';

interface AlvoradaCanvasProps {
  initialElapsed: number;
  onProgress: (elapsed: number) => void;
  onReady: () => void;
  onContextLost: (elapsed: number) => void;
  quality: AlvoradaQualityProfile;
  rendererTier: Exclude<AlvoradaWebGLTier, 'unavailable'>;
}

function RendererTelemetry({ quality }: { quality: AlvoradaQualityProfile }) {
  const { gl } = useThree();
  const sample = useRef({ elapsed: 0, frames: 0 });

  useFrame((_, delta) => {
    sample.current.elapsed += delta;
    sample.current.frames += 1;
    if (sample.current.elapsed < 0.5) return;

    const canvas = gl.domElement;
    canvas.dataset.fps = String(Math.round(sample.current.frames / sample.current.elapsed));
    canvas.dataset.drawCalls = String(gl.info.render.calls);
    canvas.dataset.triangles = String(gl.info.render.triangles);
    canvas.dataset.geometries = String(gl.info.memory.geometries);
    canvas.dataset.textures = String(gl.info.memory.textures);
    canvas.dataset.quality = quality.level;
    sample.current.elapsed = 0;
    sample.current.frames = 0;
  });

  return null;
}

function CanvasRuntimeGuard({ onContextLost }: { onContextLost: () => void }) {
  const { gl, performance } = useThree();

  useEffect(() => {
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onContextLost();
    };
    gl.domElement.addEventListener('webglcontextlost', handleContextLost);
    return () => gl.domElement.removeEventListener('webglcontextlost', handleContextLost);
  }, [gl, onContextLost]);

  return (
    <PerformanceMonitor
      bounds={(refreshRate) => [Math.min(34, refreshRate * 0.54), refreshRate * 0.82]}
      flipflops={3}
      onDecline={() => performance.regress()}
    />
  );
}

export function AlvoradaCanvas({
  initialElapsed,
  onContextLost,
  onProgress,
  onReady,
  quality,
  rendererTier,
}: AlvoradaCanvasProps) {
  const elapsed = useRef(initialElapsed);
  const handleProgress = useCallback((nextElapsed: number) => {
    elapsed.current = nextElapsed;
    onProgress(nextElapsed);
  }, [onProgress]);
  const handleContextLost = useCallback(() => {
    onContextLost(elapsed.current);
  }, [onContextLost]);

  return (
    <Canvas
      camera={{
        far: 900,
        fov: quality.mobile ? 53 : 45,
        near: 0.08,
        position: [0, 0, 12],
      }}
      dpr={quality.dpr}
      frameloop="always"
      gl={{
        alpha: false,
        antialias: quality.antialias,
        failIfMajorPerformanceCaveat: rendererTier === 'hardware',
        powerPreference: rendererTier === 'hardware' ? 'high-performance' : 'default',
        stencil: false,
      }}
      performance={{ min: 0.55, debounce: 180 }}
      shadows={quality.shadows ? 'soft' : false}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.7;
        gl.localClippingEnabled = true;
        gl.setClearColor('#010713', 1);
      }}
    >
      <CanvasRuntimeGuard onContextLost={handleContextLost} />
      <RendererTelemetry quality={quality} />
      <Suspense fallback={null}>
        <SceneController
          initialElapsed={initialElapsed}
          onProgress={handleProgress}
          onReady={onReady}
          quality={quality}
        />
        <CinematicPostFX quality={quality} />
        <Preload all />
      </Suspense>
      <AdaptiveDpr pixelated={false} />
    </Canvas>
  );
}
