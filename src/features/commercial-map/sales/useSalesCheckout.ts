import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import type { LotPricing2028 } from '../utils/lotPricing2028';
import { fetchSalesPricing, registerSaleOrder } from './salesService';
import { summarizeCart, type SalesCartSummary } from './salesPricing';
import { useSalesStore } from './useSalesSelection';
import type { SalesOrderPayload } from './salesTypes';

/** Valores oficiais dos espaços no carrinho, recalculados ao trocar de etapa. */
export function useSalesCart(): { summary: SalesCartSummary; loading: boolean; error: boolean } {
  const selection = useSalesStore((state) => state.selection);
  const stage = useSalesStore((state) => state.stage);
  const lotIds = useMemo(() => selection.map((item) => item.lotId).sort(), [selection]);

  const query = useQuery({
    queryKey: ['commercial-map', 'sales-pricing', lotIds],
    queryFn: () => fetchSalesPricing(lotIds),
    enabled: lotIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const summary = useMemo(() => {
    const index = new Map<string, LotPricing2028>();
    (query.data ?? []).forEach((row) => index.set(row.lotId, row));
    return summarizeCart(selection, index, stage);
  }, [query.data, selection, stage]);

  return { summary, loading: query.isLoading, error: query.isError };
}

export function useSalesCheckout() {
  const queryClient = useQueryClient();
  const clearSelection = useSalesStore((state) => state.clearSelection);
  const setCheckoutOpen = useSalesStore((state) => state.setCheckoutOpen);

  return useMutation({
    mutationFn: (payload: SalesOrderPayload) => registerSaleOrder(payload),
    onSuccess: () => {
      clearSelection();
      setCheckoutOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['commercial-map'] });
      toast({ title: 'Venda registrada', description: 'Os espaços já constam como vendidos no mapa.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Venda não concluída', description: error.message, variant: 'destructive' });
    },
  });
}
