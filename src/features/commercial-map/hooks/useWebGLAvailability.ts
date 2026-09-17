import { useCallback, useRef, useState } from 'react';

/** A disposable capability probe; never keeps a spare GPU context alive. */
export function probeCommercialMapWebGL2() {
  let context: WebGL2RenderingContext | null = null;
  try {
    if (typeof window === 'undefined' || !window.WebGL2RenderingContext) return false;
    context = document.createElement('canvas').getContext('webgl2');
    return Boolean(context && !context.isContextLost());
  } catch {
    return false;
  } finally {
    try { context?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* Driver already lost the disposable context. */ }
  }
}

export function useWebGLAvailability(qaUnavailable = false) {
  const [available, setAvailable] = useState(() => !qaUnavailable && probeCommercialMapWebGL2());
  const [attempts, setAttempts] = useState(0);
  const attemptsRef = useRef(0);
  const retrying = useRef(false);
  const retry = useCallback(() => {
    if (available || retrying.current || attemptsRef.current >= 3) return available;
    attemptsRef.current += 1;
    retrying.current = true;
    const supported = !qaUnavailable && probeCommercialMapWebGL2();
    setAvailable(supported);
    setAttempts((count) => count + 1);
    retrying.current = false;
    return supported;
  }, [available, qaUnavailable]);
  return { available, retry, attempts, canRetry: attempts < 3 };
}
