import { useLayoutEffect, useState } from 'react';
import type { CommercialStatus } from '../types';

/** Hover is transient; tapping a status selects it until the next tap. */
export function useDashboardStatusHighlight(memory?: { selectedStatus?: CommercialStatus | null }) {
  const [selectedStatus, setSelectedStatus] = useState<CommercialStatus | null>(memory?.selectedStatus ?? null);
  const [hoveredStatus, setHoveredStatus] = useState<CommercialStatus | null>(null);
  useLayoutEffect(() => {
    if (memory) memory.selectedStatus = selectedStatus;
  }, [memory, selectedStatus]);
  const onToggleStatus = (status: CommercialStatus) => {
    setSelectedStatus((current) => current === status ? null : status);
  };
  return {
    highlightedStatus: hoveredStatus ?? selectedStatus,
    onHoverStatus: setHoveredStatus,
    onToggleStatus,
  };
}
