import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

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
    const probes = createInteriorShaderProbes(reducedGraphics);
    const previousTarget = gl.getRenderTarget();
    const previousFace = gl.getActiveCubeFace();
    const previousLevel = gl.getActiveMipmapLevel();
    const previousToneMapping = gl.toneMapping;
    const previousOutputColorSpace = gl.outputColorSpace;
    const startedAt = performance.now();
    const programsBefore = gl.info.programs?.length ?? 0;
    let cancelled = false;
    let finished = false;
    let compilation: Promise<THREE.Object3D>;

    try {
      // Interiors render directly with ACES/sRGB. An ordinary offscreen target
      // would instead compile linear output with no tone mapping (wrong keys).
      if (previousTarget !== null) gl.setRenderTarget(null);
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.outputColorSpace = THREE.SRGBColorSpace;
      // Three r170 performs compile synchronously, then polls readiness. Restore
      // renderer globals immediately, before awaiting that readiness promise.
      compilation = gl.compileAsync(probes.scene, camera);
    } catch (error) {
      compilation = Promise.reject(error);
    } finally {
      gl.toneMapping = previousToneMapping;
      gl.outputColorSpace = previousOutputColorSpace;
      if (previousTarget !== null) gl.setRenderTarget(previousTarget, previousFace, previousLevel);
    }

    const finish = (error?: unknown) => {
      finished = true;
      if (cancelled) {
        probes.dispose();
        return;
      }
      if (import.meta.env.DEV) {
        gl.domElement.dataset.commercialMapInteriorShaderWarmup = JSON.stringify({
          durationMs: Number((performance.now() - startedAt).toFixed(2)),
          programsBefore,
          programsAfter: gl.info.programs?.length ?? 0,
          error: error instanceof Error ? error.message : error ? String(error) : null,
        });
      }
    };
    void compilation.then(() => finish(), finish);

    return () => {
      cancelled = true;
      // Keep materials alive for the Canvas lifetime so Three retains the
      // compiled programs; do not dispose while compileAsync still polls them.
      if (finished) probes.dispose();
    };
  }, [camera, gl, reducedGraphics]);

  return null;
}
