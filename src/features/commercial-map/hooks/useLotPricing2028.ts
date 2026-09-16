import { useQuery } from '@tanstack/react-query';
import { fetchLotPricing2028 } from '../services/lotPricing2028Service';

/** Valores oficiais 2028 (Renovação e 2ª Etapa) do lote selecionado. */
export function useLotPricing2028(lotId: string | null) {
  return useQuery({
    queryKey: ['commercial-map', 'lot-pricing-2028', lotId],
    queryFn: () => fetchLotPricing2028(lotId as string),
    enabled: Boolean(lotId) && !lotId?.startsWith('reference:'),
    staleTime: 5 * 60 * 1000,
  });
}
