import { useState } from 'react';
import type { CommercialStatus } from '../types';

/** Hover is transient; tapping a status selects it until the next tap. */
export function useDashboardStatusHighlight() {
  const [selectedStatus, setSelectedStatus] = useState<CommercialStatus | null>(null);
  const [hoveredStatus, setHoveredStatus] = useState<CommercialStatus | null>(null);
  const onToggleStatus = (status: CommercialStatus) => {
    setSelectedStatus((current) => current === status ? null : status);
  };
  return {
    highlightedStatus: hoveredStatus ?? selectedStatus,
    onHoverStatus: setHoveredStatus,
    onToggleStatus,
  };
}
