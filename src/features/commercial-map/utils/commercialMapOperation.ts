import type { CommercialMapStageRecorder } from './performanceDiagnostics';

function isAbort(error: unknown) {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

/** The caller owns the recorder for the entire operation, including completion
 * after a portal prewarm has handed its in-flight work to the real route.
 * `:end` encerra a medição (com `failed` quando falhou); só `:ok` comprova um
 * resultado utilizável. Cancelamento grava `:aborted` — nem sucesso nem falha. */
export async function measureCommercialMapOperation<T>(record: CommercialMapStageRecorder, stage: string, task: () => PromiseLike<T>): Promise<T> {
  const started = performance.now();
  record(`${stage}:start`);
  try {
    const result = await task();
    const duration = performance.now() - started;
    record(`${stage}:end`, { duration });
    record(`${stage}:ok`, { duration });
    return result;
  } catch (error) {
    const duration = performance.now() - started;
    if (isAbort(error)) record(`${stage}:aborted`, { duration });
    else record(`${stage}:end`, { duration, failed: true });
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

/** Sinal próprio com limite de tempo, também cancelado quando o sinal pai cancela. */
export function boundedSignal(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  parent?.addEventListener('abort', onAbort, { once: true });
  if (parent?.aborted) controller.abort();
  return { signal: controller.signal, dispose: () => { clearTimeout(timer); parent?.removeEventListener('abort', onAbort); } };
}
