import { commercialMapDiagnosticsEnabled, markCommercialMapStage, resetCommercialMapReady } from '../../utils/performanceDiagnostics';
import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { prepareCommercialMapCriticalPost, prepareCommercialScene, RetiredSceneProgramError } from '../../utils/sceneShaderWarmup';
import { scheduleCommercialMapSceneTask } from './DeferredSceneLayer';
import { COMMERCIAL_MAP_PREPARING_EVENT, COMMERCIAL_MAP_RENDER_RETRY_EVENT } from '../../utils/renderingHealth';

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
    let recoveryUsed = false;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    const prepare = () => {
      clearTimeout(recoveryTimer);
      delete gl.domElement.dataset.commercialMapPreparationError;
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
      }, (error: unknown) => {
        // The frame owner's existing error/recovery path diagnoses failed shaders.
        if (active && current === generation) {
          if (!recoveryUsed && (error instanceof RetiredSceneProgramError || (error instanceof Error && error.message === 'SHADER_PREPARATION_TIMEOUT'))) {
            recoveryUsed = true;
            markCommercialMapStage('essential-scene:automatic-recovery');
            // Same renderer, scene, controls, camera and authorized data. Let
            // pending React effects settle before collecting fresh programs.
            recoveryTimer = setTimeout(prepare, 0);
            return;
          }
          markCommercialMapStage('essential-scene:failed', undefined, true);
          gl.domElement.dataset.commercialMapPreparationError = error instanceof Error ? error.message : 'SCENE_PREPARATION_FAILED';
          delete gl.domElement.dataset.commercialMapPreparing;
          gl.domElement.dispatchEvent(new CustomEvent(COMMERCIAL_MAP_PREPARING_EVENT, { bubbles: true }));
          invalidate();
        }
      });
    };
    const lost = () => {
      resetCommercialMapReady();
      gl.domElement.dataset.commercialMapEssentialReady = 'false';
      gl.domElement.dataset.commercialMapReady = 'false';
      generation += 1;
      clearTimeout(recoveryTimer);
      postController?.abort();
      cancelPostTask?.();
    };
    const retry = () => {
      if (gl.getContext().isContextLost()) return; // restoration owns its preparation
      recoveryUsed = false;
      prepare();
    };
    prepare();
    gl.domElement.addEventListener('webglcontextlost', lost);
    gl.domElement.addEventListener('webglcontextrestored', prepare);
    gl.domElement.addEventListener(COMMERCIAL_MAP_RENDER_RETRY_EVENT, retry);
    return () => {
      active = false;
      clearTimeout(recoveryTimer);
      postController?.abort();
      cancelPostTask?.();
      gl.domElement.removeEventListener('webglcontextlost', lost);
      gl.domElement.removeEventListener('webglcontextrestored', prepare);
      gl.domElement.removeEventListener(COMMERCIAL_MAP_RENDER_RETRY_EVENT, retry);
    };
  }, [camera, gl, invalidate, preparePost, scene]);
  return null;
}
