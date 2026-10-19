import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { scheduleCommercialMapRefresh } from '../queries/commercialMapRefresh';
import type { CommercialPavilionDashboardSnapshot } from './commercialDashboardTypes';
import { occupancyMatchesInventory, pavilionOccupancySchema } from './pavilionOccupancy';

export const pavilionOccupancyKey = (projectId: string, pavilionId: string) => ['commercial-sale-orders', projectId, 'pavilion-occupancy', pavilionId] as const;
export function usePavilionOccupancy(projectId: string, snapshot: CommercialPavilionDashboardSnapshot, dataUpdatedAt: number) {
  const pavilionId = snapshot.entity!.id;
  const client = useQueryClient();
  const query = useQuery({ queryKey: pavilionOccupancyKey(projectId, pavilionId),
    queryFn: async ({ signal }) => {
      // Generated database types predate this read-only RPC.
      const { data, error } = await supabase.rpc('commercial_pavilion_occupancy' as never,
        { p_project_id: projectId, p_pavilion_id: pavilionId } as never).abortSignal(signal);
      if (error) throw error;
      const payload = pavilionOccupancySchema.parse(data);
      if (payload.projectId !== projectId || payload.pavilionId !== pavilionId) throw new Error('Recorte comercial divergente.');
      return payload;
    }, staleTime: 30_000, gcTime: 0, refetchOnWindowFocus: false, retry: false,
  });
  const lots = useMemo(() => snapshot.records.map(r => r.lot), [snapshot.records]);
  const matches = query.data ? occupancyMatchesInventory(query.data, lots) : false;
  const recovery = useRef<string | null>(null);
  useEffect(() => {
    if (!query.data || matches || query.isFetching) return;
    if (recovery.current === pavilionId) return;
    recovery.current = pavilionId;
    // One coalesced recovery, without a new observer, timer or per-lot requests.
    void scheduleCommercialMapRefresh(client);
  }, [client, matches, query.data, query.dataUpdatedAt, query.isFetching, dataUpdatedAt, pavilionId]);
  useEffect(() => { if (matches) recovery.current = null; }, [matches]);
  const previousInventory = useRef(dataUpdatedAt);
  useEffect(() => {
    if (previousInventory.current === dataUpdatedAt) return;
    previousInventory.current = dataUpdatedAt;
    void client.invalidateQueries({ queryKey: pavilionOccupancyKey(projectId, pavilionId) }, { cancelRefetch: false });
  }, [client, dataUpdatedAt, projectId, pavilionId]);
  // Keep a coherent displayed snapshot during the background check. Removing
  // labels on every check would resize the plan and reset inspection zoom.
  const ready = matches && !query.isError;
  return { payload: ready ? query.data : undefined, ready, isRefreshing: query.isFetching,
    message: query.isError ? 'Vínculos comerciais indisponíveis. Tente atualizar a consulta.' : !ready ? 'Sincronizando vínculos comerciais…' : null,
    retry: query.refetch };
}
