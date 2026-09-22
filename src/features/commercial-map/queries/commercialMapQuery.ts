import { queryOptions } from '@tanstack/react-query';
import type { CommercialMapQueryScope } from '../types';
import { fetchCommercialMap } from '../services/commercialMapService';
import { presentCommercialMapData } from '../utils/presentCommercialMapData';
import { captureCommercialMapStageRecorder, type CommercialMapStageRecorder } from '../utils/performanceDiagnostics';
import { measureCommercialMapOperation } from '../utils/commercialMapOperation';
import { commercialMapQueryKey, FULL_COMMERCIAL_MAP_SCOPE } from './commercialMapQueryKey';
export { commercialMapQueryKey, FULL_COMMERCIAL_MAP_SCOPE } from './commercialMapQueryKey';

export const COMMERCIAL_MAP_GC_TIME = 10 * 60_000;

/** Route and portal use one raw cache, identity, expiry and presentation policy. */
export function commercialMapQueryOptions(userId: string | null | undefined, orgId: string | null | undefined,
  scope: CommercialMapQueryScope = FULL_COMMERCIAL_MAP_SCOPE, recordStage?: CommercialMapStageRecorder) {
  return queryOptions({
    queryKey: commercialMapQueryKey(userId, orgId, scope),
    queryFn: ({ signal }) => {
      if (!userId || !orgId) throw new Error('MAP_PERMISSION_DENIED');
      const record = recordStage ?? captureCommercialMapStageRecorder();
      return measureCommercialMapOperation(record, 'essential-data', () => fetchCommercialMap(orgId, scope, {
        includeReferenceImage: false, signal, recordStage: record,
      }));
    },
    select: presentCommercialMapData,
    enabled: Boolean(userId && orgId),
    staleTime: 30_000,
    gcTime: COMMERCIAL_MAP_GC_TIME,
    retry: 1,
    meta: { persist: false },
  });
}
