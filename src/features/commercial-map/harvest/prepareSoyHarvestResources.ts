import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';
type PreparedProgram = { program: WebGLProgram; getUniforms: () => unknown };

/** Three r170 compileAsync has an uncancellable timer over material properties.
 * A cancelled experience must be allowed to dispose those properties. This uses
 * the same local compile/KHR readiness mechanism with an owned, bounded timer.
 * Only owned programs receive first-use diagnostics before entering the map. */
export function prepareSoyHarvestResources(renderer: WebGLRenderer, root: Object3D, camera: Camera, scene: Scene) {
  let cancelled = false, settled = false, timer: ReturnType<typeof setTimeout> | undefined;
  let rejectPreparation: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    rejectPreparation = reject;
    const started = performance.now();
    const locallyChecked = <T,>(work: () => T): T => {
      const previousError = renderer.debug.onShaderError, previousCheck = renderer.debug.checkShaderErrors;
      let failed = false;
      const localError: NonNullable<typeof renderer.debug.onShaderError> = () => { failed = true; };
      renderer.debug.onShaderError = localError; renderer.debug.checkShaderErrors = true;
      try {
        const result = work();
        if (failed) throw new Error('soy-local-shader-error');
        return result;
      } finally {
        if (renderer.debug.onShaderError === localError) renderer.debug.onShaderError = previousError;
        renderer.debug.checkShaderErrors = previousCheck;
      }
    };
    try {
      const materials = locallyChecked(() => renderer.compile(root, camera, scene));
      const programs = new Set<PreparedProgram>();
      for (const material of materials) {
        const program = (renderer.properties.get(material) as { currentProgram?: PreparedProgram }).currentProgram;
        if (program) programs.add(program);
      }
      const context = renderer.getContext();
      const parallel = renderer.extensions.get('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null;
      const check = () => {
        if (cancelled || settled) return;
        try {
          if (context.isContextLost()) throw new Error('soy-context-lost');
          if (performance.now() - started > 15000) throw new Error('soy-preparation-timeout');
          if (parallel) for (const program of programs) {
            if (!context.getProgramParameter(program.program, parallel.COMPLETION_STATUS_KHR)) {
              timer = setTimeout(check, 10); return;
            }
          }
          // compile() starts shader linking, but Three reports link diagnostics
          // lazily from getUniforms. Resolve those while the local callback owns it.
          locallyChecked(() => { for (const program of programs) program.getUniforms(); });
          settled = true; resolve();
        } catch (error) { settled = true; reject(error); }
      };
      timer = setTimeout(check, 0);
    } catch (error) { settled = true; reject(error); }
  });
  return { promise, cancel() {
    if (settled || cancelled) return;
    cancelled = true; clearTimeout(timer); rejectPreparation(new Error('soy-preparation-cancelled'));
  } };
}
