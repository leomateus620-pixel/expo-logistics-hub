import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { claimCommercialMapBootVisit, releaseCommercialMapBootVisit } from '../utils/performanceDiagnostics';

/** A route identity survives a discarded pre-commit Suspense attempt. A newly
 * allocated object would restart the external loader store on every retry. */
export function useCommercialMapBootVisit() {
  const location = useLocation();
  const owner = useRef(`${location.key}:${location.pathname}`);
  const commit = useRef(0);
  const fresh = claimCommercialMapBootVisit(owner.current);
  useEffect(() => {
    const generation = ++commit.current;
    return () => queueMicrotask(() => {
      // StrictMode reconnects the same effect before this microtask.
      if (commit.current === generation) releaseCommercialMapBootVisit(owner.current);
    });
  }, []);
  return fresh;
}
