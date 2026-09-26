import { useLayoutEffect, useRef } from 'react';
import type { CommercialMapData } from '../types';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import { useSalesStore } from '../sales/useSalesSelection';
import { changedExporuralSelections, exporuralSelectionSnapshot } from '../utils/exporuralRevisionSelection';

/** Drop stale inspections/cart entries when the authorized server snapshot changes. */
export function useExporuralRevisionSelection(data: CommercialMapData | undefined) {
  const previous = useRef<ReturnType<typeof exporuralSelectionSnapshot> | null>(null);
  useLayoutEffect(() => {
    if (!data) return;
    const current = exporuralSelectionSnapshot(data);
    if (previous.current) {
      const changed = changedExporuralSelections(previous.current, current);
      const map = useCommercialMapStore.getState();
      const sales = useSalesStore.getState();
      if (changed.some(row => row.entityId === map.selectedEntityId)) map.setSelectedEntityId(null);
      const selected = new Set(sales.selection.map(row => row.lotId));
      const stale = changed.filter(row => selected.has(row.lotId));
      stale.forEach(row => sales.removeLot(row.lotId));
      if (stale.length) sales.setCheckoutOpen(false);
    }
    previous.current = current;
  }, [data]);
}
