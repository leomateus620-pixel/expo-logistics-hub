import { commercialMapDiagnosticsEnabled, markCommercialMapStage, resetCommercialMapReady } from '../../utils/performanceDiagnostics';
import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { prepareCommercialMapCriticalPost, prepareCommercialScene } from '../../utils/sceneShaderWarmup';
import { scheduleCommercialMapSceneTask } from './DeferredSceneLayer';
import { COMMERCIAL_MAP_PREPARING_EVENT } from '../../utils/renderingHealth';

export function CommercialMapSceneShaderWarmup({ preparePost = true }: { preparePost?: boolean }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    let active = true;
    let generation = 0;
    let cancelPostTask: (() => void) | undefined;
    let postController: AbortController | undefined;
    const prepare = () => {
      resetCommercialMapReady();
      postController?.abort();
      cancelPostTask?.();
      postController = new AbortController();
      const signal = postController.signal;
      const current = ++generation;
      const startedAt = performance.now();
      markCommercialMapStage('critical-scene:end');
      gl.domElement.dataset.commercialMapEssentialReady = 'false';
      gl.domElement.dataset.commercialMapReady = 'false';
      gl.domElement.dataset.commercialMapPreparing = 'true';
      gl.domElement.dispatchEvent(new CustomEvent(COMMERCIAL_MAP_PREPARING_EVENT, { bubbles: true }));
      void prepareCommercialScene(gl, scene, camera, signal).then(() => {
        if (!active || current !== generation) return;
        gl.domElement.dataset.commercialMapEssentialReady = 'true';
        markCommercialMapStage('essential-scene:prepared');
        if (commercialMapDiagnosticsEnabled) gl.domElement.dataset.commercialMapSceneWarmup = JSON.stringify({
          durationMs: performance.now() - startedAt,
          parallel: gl.extensions.has('KHR_parallel_shader_compile'),
        });
        delete gl.domElement.dataset.commercialMapPreparing;
        if (preparePost) cancelPostTask = scheduleCommercialMapSceneTask(gl.domElement, {
          id: 'critical-post-shaders', priority: 0,
          run: (complete) => {
            void prepareCommercialMapCriticalPost(gl, scene, camera, signal).catch((error) => {
              if (!signal.aborted) {
                markCommercialMapStage('critical-post:end', undefined, true);
                if (commercialMapDiagnosticsEnabled) console.warn('[CommercialMap] post warmup retained direct rendering', error);
              }
            }).finally(() => { complete(); invalidate(); });
          },
        });
        invalidate();
      }, () => {
        // The frame owner's existing error/recovery path diagnoses failed shaders.
        if (active && current === generation) {
          markCommercialMapStage('essential-scene:failed', undefined, true);
          delete gl.domElement.dataset.commercialMapPreparing;
          invalidate();
        }
      });
    };
    const lost = () => {
      resetCommercialMapReady();
      gl.domElement.dataset.commercialMapEssentialReady = 'false';
      gl.domElement.dataset.commercialMapReady = 'false';
      generation += 1;
      postController?.abort();
      cancelPostTask?.();
    };
    prepare();
    gl.domElement.addEventListener('webglcontextlost', lost);
    gl.domElement.addEventListener('webglcontextrestored', prepare);
    return () => {
      active = false;
      postController?.abort();
      cancelPostTask?.();
      gl.domElement.removeEventListener('webglcontextlost', lost);
      gl.domElement.removeEventListener('webglcontextrestored', prepare);
    };
  }, [camera, gl, invalidate, preparePost, scene]);
  return null;
}
