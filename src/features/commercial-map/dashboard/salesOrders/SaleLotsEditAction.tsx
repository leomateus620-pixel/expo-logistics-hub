import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import type { CommercialMapData } from '../../types';
import { describeSalesError, fetchSaleOrderDetail } from './salesOrdersService';
import { ReviseSaleOrderDialog } from './ReviseSaleOrderDialog';
import { scheduleCommercialMapRefresh } from '../../queries/commercialMapRefresh';

export function makeLocationOf(data: Pick<CommercialMapData, 'lots' | 'entities'>) {
  const lots = new Map(data.lots.map((l) => [l.id, l]));
  const entities = new Map(data.entities.map((e) => [e.id, e]));
  return (lotId: string) => {
    const lot = lots.get(lotId);
    const entity = lot ? entities.get(lot.entityId) : undefined;
    if (!lot || !entity) return 'Fora do inventário carregado';
    const parent = entity.parentEntityId ? entities.get(entity.parentEntityId) : null;
    if (parent) return parent.name || parent.publicIdentifier;
    return lot.block ? `Quadra ${lot.block}` : 'Área externa';
  };
}

/** Botão "Editar lotes da venda" na lateral do mapa — mesma janela e RPC da Dashboard. */
export function SaleLotsEditAction({ lotId, orderId, mapData }: {
  lotId: string;
  orderId: string;
  mapData: Pick<CommercialMapData, 'lots' | 'entities'>;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const locationOf = useMemo(() => makeLocationOf(mapData), [mapData]);
  const detail = useQuery({
    queryKey: ['commercial-sale-order-detail', `order:${orderId}`],
    queryFn: () => fetchSaleOrderDetail({ orderId, saleId: null }),
    enabled: open,
    staleTime: 15_000,
  });

  if (detail.error && open) {
    toast({ title: 'Não foi possível abrir a venda', description: describeSalesError(detail.error) });
    setOpen(false);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="commercial-map-sale-edit-identity" onClick={() => setOpen(true)} disabled={open && detail.isLoading}>
        {open && detail.isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Pencil className="h-4 w-4" aria-hidden="true" />} Editar lotes da venda
      </Button>
      {open && detail.data && <ReviseSaleOrderDialog
        orderId={orderId}
        detail={detail.data}
        lots={mapData.lots}
        entities={mapData.entities}
        locationOf={locationOf}
        focusLotId={lotId}
        onClose={() => setOpen(false)}
        onSaved={async () => {
          await Promise.all([
            scheduleCommercialMapRefresh(queryClient),
            queryClient.invalidateQueries({ queryKey: ['commercial-sale-orders'] }),
            queryClient.invalidateQueries({ queryKey: ['commercial-sale-order-detail'] }),
          ]);
          toast({ title: 'Lotes da venda atualizados' });
        }}
      />}
    </>
  );
}
