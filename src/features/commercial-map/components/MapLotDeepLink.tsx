import { useEffect, useRef } from 'react';

/** Resolves only a loaded, authorized persisted lot; selection uses the existing map navigation. */
export function MapLotDeepLink({ lotId, lots, onOpen, onConsume }: {
  lotId: string | null; lots: ReadonlyArray<{ id: string; entityId: string }>;
  onOpen: (entityId: string) => void; onConsume: () => void;
}) {
  const consumed = useRef<string | null>(null);
  useEffect(() => {
    if (!lotId) { consumed.current = null; return; }
    if (consumed.current === lotId) return;
    consumed.current = lotId;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(lotId)) {
      const lot = lots.find(candidate => candidate.id === lotId);
      if (lot) onOpen(lot.entityId);
    }
    onConsume();
  }, [lotId, lots, onOpen, onConsume]);
  return null;
}
