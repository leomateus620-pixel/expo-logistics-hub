import type { CommercialMapStageRecorder } from './performanceDiagnostics';

/** The caller owns the recorder for the entire operation, including completion
 * after a portal prewarm has handed its in-flight work to the real route. */
export async function measureCommercialMapOperation<T>(record: CommercialMapStageRecorder, stage: string, task: () => PromiseLike<T>): Promise<T> {
  const started = performance.now();
  record(`${stage}:start`);
  try {
    const result = await task();
    record(`${stage}:end`, { duration: performance.now() - started });
    return result;
  } catch (error) {
    record(`${stage}:end`, { duration: performance.now() - started, failed: true });
    throw error;
  }
}

export function throwIfMapRequestAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Commercial map request aborted', 'AbortError');
}

/** Supabase/PostgREST receives the same QueryClient signal on every page. The
 * post-await check also rejects stale results from non-abortable adapters. */
export async function awaitCommercialMapRequest<T>(request: PromiseLike<T> & { abortSignal?: (signal: AbortSignal) => PromiseLike<T> }, signal?: AbortSignal): Promise<T> {
  throwIfMapRequestAborted(signal);
  const result = await (signal && request.abortSignal ? request.abortSignal(signal) : request);
  throwIfMapRequestAborted(signal);
  return result;
}
