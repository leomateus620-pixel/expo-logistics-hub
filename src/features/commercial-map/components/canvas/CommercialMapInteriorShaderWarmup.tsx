import { commercialMapDiagnosticsEnabled, markCommercialMapStage } from '../../utils/performanceDiagnostics';
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { compileCommercialMapPrograms } from '../../utils/sceneShaderWarmup';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import { scheduleCommercialMapSceneTask } from './DeferredSceneLayer';

const NO_RAYCAST = () => undefined;

function createInteriorShaderProbes(reducedGraphics: boolean) {
  // Compile the seven observed pavilion program variants, not a hidden copy of
  // any model. Dimensions and texture pixels are not part of these shader keys.
  const scene = new THREE.Scene();
  scene.name = 'commercial-map-interior-shader-warmup';
  scene.fog = new THREE.Fog('#edf0ed', 30, 70);
  const directional = new THREE.DirectionalLight('#fff4d9', 1.72);
  directional.castShadow = !reducedGraphics;
  scene.add(directional, new THREE.HemisphereLight('#ffffff', '#c4c8bd', 1), new THREE.AmbientLight('#ffffff', 1));

  const geometry = new THREE.BoxGeometry(0.001, 0.001, 0.001);
  const texture = new THREE.Texture();
  texture.colorSpace = THREE.SRGBColorSpace;
  const materials = [
    new THREE.MeshStandardMaterial({ map: texture, bumpMap: texture, bumpScale: 0.012, roughness: 0.96 }),
    new THREE.MeshStandardMaterial({ roughness: 0.94 }),
    new THREE.MeshStandardMaterial({ roughness: 0.68, metalness: 0.025 }),
    new THREE.MeshStandardMaterial({ roughness: 0.68, metalness: 0.025 }),
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.05, depthWrite: false, toneMapped: false }),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.24, depthWrite: false, toneMapped: false }),
  ];
  const instances = [
    new THREE.InstancedMesh(geometry, materials[1], 1),
    new THREE.InstancedMesh(geometry, materials[2], 1),
  ];
  // The modules use instanceColor, never a synthetic vertexColors attribute.
  instances[1].setColorAt(0, new THREE.Color('#ffffff'));
  const probes = [
    new THREE.Mesh(geometry, materials[0]),
    ...instances,
    ...materials.slice(3).map((material) => new THREE.Mesh(geometry, material)),
  ];
  probes.forEach((probe) => { probe.raycast = NO_RAYCAST; });
  scene.add(...probes);
  let disposed = false;
  return {
    scene,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      instances.forEach(disposeInstancedMesh);
      geometry.dispose();
      materials.forEach((material) => material.dispose());
      texture.dispose();
      scene.clear();
    },
  };
}

export function CommercialMapInteriorShaderWarmup({ reducedGraphics }: { reducedGraphics: boolean }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    markCommercialMapStage('interior-preparation:start');
    const probes = createInteriorShaderProbes(reducedGraphics);
    let controller: AbortController | null = null;
    let disposed = false;
    let generation = 0;
    let cancelRestoreTask: (() => void) | undefined;
    let releaseRestoreTask: (() => void) | undefined;
    const prepare = (complete?: () => void) => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const currentGeneration = ++generation;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        if (releaseRestoreTask === release) releaseRestoreTask = undefined;
        complete?.();
      };
      if (complete) releaseRestoreTask = release;
      const previousTarget = gl.getRenderTarget();
      const previousFace = gl.getActiveCubeFace();
      const previousLevel = gl.getActiveMipmapLevel();
      const previousToneMapping = gl.toneMapping;
      const previousOutputColorSpace = gl.outputColorSpace;
      const startedAt = performance.now();
      const programsBefore = gl.info.programs?.length ?? 0;
      let compilation: Promise<void>;
      try {
        // Preserve the exact ACES/sRGB direct-output keys used by interiors.
        if (previousTarget !== null) gl.setRenderTarget(null);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        compilation = compileCommercialMapPrograms(gl, probes.scene, camera, probes.scene, current.signal);
      } catch (error) {
        compilation = Promise.reject(error);
      } finally {
        gl.toneMapping = previousToneMapping;
        gl.outputColorSpace = previousOutputColorSpace;
        if (previousTarget !== null) gl.setRenderTarget(previousTarget, previousFace, previousLevel);
      }
      const finish = (error?: unknown) => {
        release();
        if (disposed || controller !== current || currentGeneration !== generation) return;
        markCommercialMapStage('interior-preparation:end', performance.now() - startedAt, Boolean(error));
        if (commercialMapDiagnosticsEnabled) {
          gl.domElement.dataset.commercialMapInteriorShaderWarmup = JSON.stringify({
            durationMs: Number((performance.now() - startedAt).toFixed(2)), programsBefore,
            programsAfter: gl.info.programs?.length ?? 0,
            error: error instanceof Error ? error.message : error ? String(error) : null,
          });
        }
      };
      void compilation.then(() => finish(), finish);
    };
    const lost = () => {
      generation += 1;
      controller?.abort();
      releaseRestoreTask?.();
      cancelRestoreTask?.();
      cancelRestoreTask = undefined;
      // Release the optional queue even when the driver's old program can no
      // longer become ready. The critical renderer owns context recovery.
      markCommercialMapStage('interior-preparation:end', undefined, true);
    };
    const restored = () => {
      generation += 1;
      controller?.abort();
      releaseRestoreTask?.();
      cancelRestoreTask?.();
      // The first admission already runs inside DeferredSceneLayer. Retained
      // probes must re-enter that same queue after context restoration, behind
      // the essential barrier and critical post job, rather than submitting
      // optional programs while the driver's essential programs are linking.
      cancelRestoreTask = scheduleCommercialMapSceneTask(gl.domElement, {
        id: 'restore:interior-programs', priority: 140,
        run: (complete) => {
          if (disposed) { complete(); return; }
          prepare(complete);
        },
      });
    };
    gl.domElement.addEventListener('webglcontextlost', lost);
    gl.domElement.addEventListener('webglcontextrestored', restored);
    prepare();
    return () => {
      disposed = true;
      generation += 1;
      controller?.abort();
      releaseRestoreTask?.();
      cancelRestoreTask?.();
      gl.domElement.removeEventListener('webglcontextlost', lost);
      gl.domElement.removeEventListener('webglcontextrestored', restored);
      // Fixed-program polling releases references on abort; GPU resources can
      // now be disposed immediately, including an abandoned pending warmup.
      probes.dispose();
    };
  }, [camera, gl, reducedGraphics]);

  return null;
}
