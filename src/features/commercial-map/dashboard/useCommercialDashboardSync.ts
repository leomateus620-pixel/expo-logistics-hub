import { useEffect, useRef } from 'react';

/** Reuses the mounted commercial-map query only while analytics are visible. */
export function useCommercialDashboardSync({
  open,
  enabled,
  isFetching,
  refetch,
}: {
  open: boolean;
  enabled: boolean;
  isFetching: boolean;
  refetch: (options: { cancelRefetch: false }) => Promise<unknown>;
}) {
  const pending = useRef(false);

  useEffect(() => {
    if (!open || !enabled) return undefined;

    const refresh = () => {
      if (document.visibilityState !== 'visible' || isFetching || pending.current) return;
      pending.current = true;
      void refetch({ cancelRefetch: false }).then(
        () => { pending.current = false; },
        () => { pending.current = false; },
      );
    };
    const interval = window.setInterval(refresh, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [enabled, isFetching, open, refetch]);
}
