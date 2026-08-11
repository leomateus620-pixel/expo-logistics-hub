import { Suspense, useEffect } from 'react';
import { AdaptiveDpr, PerformanceMonitor, Preload } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from './capabilities';
import { SceneController } from './SceneController';

interface AlvoradaCanvasProps {
  onReady: () => void;
  onContextLost: () => void;
  onSequenceComplete: () => void;
  quality: AlvoradaQualityProfile;
}

function CanvasRuntimeGuard({ onContextLost }: Pick<AlvoradaCanvasProps, 'onContextLost'>) {
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
  onContextLost,
  onReady,
  onSequenceComplete,
  quality,
}: AlvoradaCanvasProps) {
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
        powerPreference: 'high-performance',
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
      <Suspense fallback={null}>
        <CanvasRuntimeGuard onContextLost={onContextLost} />
        <SceneController
          onReady={onReady}
          onSequenceComplete={onSequenceComplete}
          quality={quality}
        />
        <Preload all />
      </Suspense>
      <AdaptiveDpr pixelated={quality.mobile} />
    </Canvas>
  );
}
