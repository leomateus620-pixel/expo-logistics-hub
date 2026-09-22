import type { CommercialMapQueryScope } from '../types';

export const FULL_COMMERCIAL_MAP_SCOPE: CommercialMapQueryScope = { mode: 'full' };
export function commercialMapQueryKey(userId: string | null | undefined, orgId: string | null | undefined, scope: CommercialMapQueryScope) {
  return scope.mode === 'commission'
    ? ['commercial-map', 'commission', userId, orgId, scope.commissionId, scope.segmentId] as const
    : ['commercial-map', 'full', userId, orgId] as const;
}
