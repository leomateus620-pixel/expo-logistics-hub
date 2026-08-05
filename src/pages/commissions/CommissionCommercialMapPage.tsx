import { useMemo } from 'react';
import CommercialMapWorkspace from '@/features/commercial-map/CommercialMapPage';
import type { CommercialMapQueryScope } from '@/features/commercial-map/types';
import type { CommissionMapPortalConfig } from '@/modules/commissions/commissionMapPortalRegistry';

interface CommissionCommercialMapPageProps {
  portal: CommissionMapPortalConfig;
}

export default function CommissionCommercialMapPage({ portal }: CommissionCommercialMapPageProps) {
  const scope = useMemo<CommercialMapQueryScope>(() => ({
    mode: 'commission',
    commissionId: portal.id,
    segmentId: portal.segmentId,
  }), [portal.id, portal.segmentId]);

  return <CommercialMapWorkspace scope={scope} />;
}
