import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clearLotPriceOverride,
  fetchLotPricing2028,
  setLotPriceOverride,
  type LotPriceOverrideStage,
} from '../services/lotPricing2028Service';

/** Valores oficiais 2028 (Renovação e 2ª Etapa) do lote selecionado. */
export function useLotPricing2028(lotId: string | null) {
  return useQuery({
    queryKey: ['commercial-map', 'lot-pricing-2028', lotId],
    queryFn: () => fetchLotPricing2028(lotId as string),
    enabled: Boolean(lotId) && !lotId?.startsWith('reference:'),
    staleTime: 5 * 60 * 1000,
  });
}

/** Edita/restaura o valor de uma etapa e atualiza todas as leituras do mapa. */
export function useLotPriceOverride(lotId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ stage, total }: { stage: LotPriceOverrideStage; total: number | null }) => {
      if (!lotId) throw new Error('Lote não selecionado.');
      if (total === null) await clearLotPriceOverride(lotId, stage);
      else await setLotPriceOverride(lotId, stage, total);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['commercial-map'] }),
  });
}
