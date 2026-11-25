import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LotPricing2028 } from '../utils/lotPricing2028';
import { fetchProjectSalesPricing, fetchSalesPricing, registerSaleOrder } from './salesService';
import { summarizeCart, type SalesCartSummary } from './salesPricing';
import { useSalesStore } from './useSalesSelection';
import type { SalesOrderPayload } from './salesTypes';
import { scheduleCommercialMapRefresh } from '../queries/commercialMapRefresh';

export const salesPricingProjectKey = (projectId: string | null) => ['commercial-map', 'sales-pricing-project', projectId] as const;

/**
 * Valores oficiais dos espaços no carrinho. Os preços do projeto são lidos uma
 * única vez ao entrar no modo Vendas; selecionar/remover lotes só consulta o
 * índice local. Lotes ausentes do índice são buscados isoladamente.
 */
export function useSalesCart(projectId: string | null = null, active = true): { summary: SalesCartSummary; loading: boolean; error: boolean } {
  const selection = useSalesStore((state) => state.selection);
  const stage = useSalesStore((state) => state.stage);

  const project = useQuery({
    queryKey: salesPricingProjectKey(projectId),
    queryFn: () => fetchProjectSalesPricing(projectId as string),
    enabled: Boolean(projectId) && active,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const index = useMemo(() => {
    const map = new Map<string, LotPricing2028>();
    (project.data ?? []).forEach((row) => map.set(row.lotId, row));
    return map;
  }, [project.data]);

  const missingIds = useMemo(() => {
    if (projectId && !project.isFetched) return [];
    return selection.map((item) => item.lotId).filter((id) => !index.has(id)).sort();
  }, [index, project.isFetched, projectId, selection]);

  const missing = useQuery({
    queryKey: ['commercial-map', 'sales-pricing', missingIds],
    queryFn: () => fetchSalesPricing(missingIds),
    enabled: missingIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const summary = useMemo(() => {
    const merged = new Map(index);
    (missing.data ?? []).forEach((row) => merged.set(row.lotId, row));
    const pendingIds = new Set<string>();
    if (projectId && !project.isFetched) selection.forEach((s) => { if (!merged.has(s.lotId)) pendingIds.add(s.lotId); });
    if (missing.isLoading) missingIds.forEach((id) => { if (!merged.has(id)) pendingIds.add(id); });
    return summarizeCart(selection, merged, stage, pendingIds);
  }, [index, missing.data, missing.isLoading, missingIds, project.isFetched, projectId, selection, stage]);

  const loading = summary.pendingCount > 0;
  return { summary, loading, error: project.isError || missing.isError };
}

export function useSalesCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SalesOrderPayload) => registerSaleOrder(payload),
    onSettled: () => { void scheduleCommercialMapRefresh(queryClient); },
  });
}
