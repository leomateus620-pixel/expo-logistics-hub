import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { prepareCommercialScene } from '../../utils/sceneShaderWarmup';
import { COMMERCIAL_MAP_PREPARING_EVENT } from '../../utils/renderingHealth';

export function CommercialMapSceneShaderWarmup() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    let active = true;
    let generation = 0;
    const prepare = () => {
      const current = ++generation;
      const startedAt = performance.now();
      gl.domElement.dataset.commercialMapPreparing = 'true';
      gl.domElement.dispatchEvent(new CustomEvent(COMMERCIAL_MAP_PREPARING_EVENT, { bubbles: true }));
      void prepareCommercialScene(gl, scene, camera).then(() => {
        if (!active || current !== generation) return;
        if (import.meta.env.DEV) gl.domElement.dataset.commercialMapSceneWarmup = JSON.stringify({
          durationMs: performance.now() - startedAt,
          parallel: gl.extensions.has('KHR_parallel_shader_compile'),
        });
        delete gl.domElement.dataset.commercialMapPreparing;
        invalidate();
      }, () => {
        // The frame owner's existing error/recovery path diagnoses failed shaders.
        if (active && current === generation) {
          delete gl.domElement.dataset.commercialMapPreparing;
          invalidate();
        }
      });
    };
    prepare();
    gl.domElement.addEventListener('webglcontextrestored', prepare);
    return () => {
      active = false;
      gl.domElement.removeEventListener('webglcontextrestored', prepare);
    };
  }, [camera, gl, invalidate, scene]);
  return null;
}
