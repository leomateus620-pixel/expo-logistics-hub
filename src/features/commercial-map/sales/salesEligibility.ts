import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSalesStore } from './useSalesSelection';

export interface SaleEligibilityRow {
  lotId: string;
  isSellable: boolean;
  ineligibleReason: string | null;
  statusOrigin: string | null;
}

/** Lê a decisão de elegibilidade do servidor; o cliente não recalcula regra. */
export async function fetchSaleEligibility(projectId: string): Promise<SaleEligibilityRow[]> {
  const rows: SaleEligibilityRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('commercial_sale_eligibility')
      .select('lot_id,is_sellable,ineligible_reason,status_origin')
      .eq('project_id', projectId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    page.forEach((row) => rows.push({
      lotId: String((row as Record<string, unknown>).lot_id),
      isSellable: Boolean((row as Record<string, unknown>).is_sellable),
      ineligibleReason: ((row as Record<string, unknown>).ineligible_reason as string) ?? null,
      statusOrigin: ((row as Record<string, unknown>).status_origin as string) ?? null,
    }));
    if (page.length < pageSize) break;
  }
  return rows;
}

export function buildEligibleLotIds(rows: SaleEligibilityRow[]): Set<string> {
  return new Set(rows.filter((row) => row.isSellable).map((row) => row.lotId));
}

/** Publica o conjunto elegível no store de Vendas para os handlers do canvas. */
export function useSalesEligibility(projectId: string | null, enabled: boolean) {
  const setEligibleLotIds = useSalesStore((state) => state.setEligibleLotIds);
  const query = useQuery({
    queryKey: ['commercial-map', 'sales-eligibility', projectId],
    queryFn: () => fetchSaleEligibility(projectId as string),
    enabled: Boolean(projectId) && enabled,
    staleTime: 60 * 1000,
  });

  const eligible = useMemo(() => (query.data ? buildEligibleLotIds(query.data) : null), [query.data]);

  useEffect(() => {
    setEligibleLotIds(eligible);
  }, [eligible, setEligibleLotIds]);

  return { eligible, loading: query.isLoading, error: query.isError };
}
