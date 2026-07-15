import { useCallback, useEffect, useRef } from 'react';

const HISTORY_KEY = '__cronogramaMobileOverlay';

export function useMobileOverlayHistory({
  open,
  dirty,
  onClose,
  onDirtyClose,
}: {
  open: boolean;
  dirty: boolean;
  onClose: () => void;
  onDirtyClose: () => void;
}) {
  const markerRef = useRef<string | null>(null);
  const activeRef = useRef(false);
  const closingRef = useRef(false);
  const dirtyRef = useRef(dirty);
  const onCloseRef = useRef(onClose);
  const onDirtyCloseRef = useRef(onDirtyClose);

  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onDirtyCloseRef.current = onDirtyClose; }, [onDirtyClose]);

  useEffect(() => {
    if (!open) return;
    const marker = `cronograma-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    markerRef.current = marker;
    window.history.pushState({ ...(window.history.state ?? {}), [HISTORY_KEY]: marker }, '', window.location.href);
    activeRef.current = true;
    closingRef.current = false;

    const handlePopState = () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      closingRef.current = false;
      if (dirtyRef.current) {
        window.history.pushState({ ...(window.history.state ?? {}), [HISTORY_KEY]: marker }, '', window.location.href);
        activeRef.current = true;
        onDirtyCloseRef.current();
        return;
      }
      onCloseRef.current();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (!activeRef.current) return;
      activeRef.current = false;
      if (closingRef.current) return;
      closingRef.current = true;
      window.history.back();
    };
  }, [open]);

  const closeThroughHistory = useCallback(() => {
    if (closingRef.current) return;
    const marker = markerRef.current;
    if (activeRef.current && marker) {
      closingRef.current = true;
      window.history.back();
      return;
    }
    onCloseRef.current();
  }, []);

  const requestClose = useCallback(() => {
    if (dirtyRef.current) {
      onDirtyCloseRef.current();
      return;
    }
    closeThroughHistory();
  }, [closeThroughHistory]);

  const discardAndClose = useCallback(() => {
    dirtyRef.current = false;
    closeThroughHistory();
  }, [closeThroughHistory]);

  return { requestClose, discardAndClose };
}
