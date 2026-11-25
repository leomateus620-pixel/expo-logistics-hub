import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileSignature, Loader2, XCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  cancelSaleOrderItems,
  confirmSaleOrderItems,
  fetchLotOpenSaleOrder,
  type OpenSaleOrder,
} from '../salesService';
import { SaleExhibitorIdentity } from './SaleExhibitorEditDialog';
import type { CommercialMapData } from '../../types';
import { fetchSaleOrderDetail } from '../../dashboard/salesOrders/salesOrdersService';
import { scheduleCommercialMapRefresh } from '../../queries/commercialMapRefresh';

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function stageLabel(stage: string | null | undefined) {
  return stage === 'RENOVACAO' ? 'Renovação' : stage === 'SEGUNDA_ETAPA' ? '2ª Etapa' : null;
}

export function useLotOpenSaleOrder(lotId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['commercial-map', 'open-sale-order', lotId],
    queryFn: () => fetchLotOpenSaleOrder(lotId as string),
    enabled: Boolean(lotId && enabled && !lotId.startsWith('reference:')),
    staleTime: 15_000,
  });
}

/**
 * Painel da fase "Venda em aberto": mostra comprador, pedido e itens ainda
 * aguardando assinatura, com confirmação explícita ou cancelamento. Nenhuma
 * mudança otimista: o mapa só atualiza após a resposta do servidor.
 */
export function SaleOpenSection({ lotId, canManageSales, mapData }: {
  lotId: string;
  canManageSales: boolean;
  mapData: Pick<CommercialMapData, 'lots' | 'entities'>;
}) {
  const queryClient = useQueryClient();
  const openSale = useLotOpenSaleOrder(lotId, true);
  const [confirmation, setConfirmation] = useState<{ order: OpenSaleOrder; all: boolean; changed: boolean } | null>(null);
  const [cancellation, setCancellation] = useState<{ orderId: string; itemId: string; label: string } | null>(null);

  const invalidate = () => { void scheduleCommercialMapRefresh(queryClient); };

  const confirmMutation = useMutation({
    mutationFn: async ({ order, all }: NonNullable<typeof confirmation>) => {
      const ids = order.items.filter((item) => all || item.lotId === lotId).map((item) => item.itemId);
      const result = await confirmSaleOrderItems(order.orderId, ids, all);
      if (result === 'confirmed') return { count: ids.length };
      const detail = await fetchSaleOrderDetail({ orderId: order.orderId, saleId: null });
      return { order: { ...order, items: detail.items.flatMap((item) =>
        item.itemId && item.contractState === 'PENDING_SIGNATURE' ? [{
          itemId: item.itemId, orderId: order.orderId, lotId: item.lotId, publicIdentifier: item.publicIdentifier,
          itemTotal: item.itemTotal, pricingStage: item.pricingStage ?? null,
        }] : []) } };
    },
    onSuccess: (result) => {
      if (result.order) {
        setConfirmation({ order: result.order, all: true, changed: true });
        return;
      }
      setConfirmation(null);
      invalidate();
      toast({ title: 'Assinatura confirmada', description: result.count === 1 ? 'O espaço passou a constar como vendido no mapa.' : `${result.count} espaços da venda passaram a constar como vendidos no mapa.` });
    },
    onError: (error: Error) => {
      setConfirmation(null);
      invalidate();
      toast({ title: 'Confira a situação da assinatura', description: error.message, variant: 'destructive' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ orderId, itemId }: NonNullable<typeof cancellation>) => cancelSaleOrderItems(orderId, [itemId]),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Venda em aberto cancelada', description: 'O espaço voltou a ficar disponível no mapa.' });
    },
    onError: (error: Error) => {
      invalidate();
      toast({ title: 'Confira a situação do cancelamento', description: error.message, variant: 'destructive' });
    },
    onSettled: () => setCancellation(null),
  });

  if (openSale.isLoading) {
    return <p className="commercial-map-sale-open__loading"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando venda em aberto…</p>;
  }
  const order = openSale.data ?? confirmation?.order;
  if (!order) return null;

  const currentItem = order.items.find((item) => item.lotId === lotId);
  const busy = confirmMutation.isPending || cancelMutation.isPending;
  const reviewedItems = confirmation?.order.items.filter((item) => confirmation.all || item.lotId === lotId) ?? [];

  return (
    <section className="commercial-map-sale-open" aria-label="Venda em aberto">
      <header><FileSignature aria-hidden="true" /><span>Venda em aberto</span></header>
      <strong className="commercial-map-sale-open__buyer">{order.buyerName}</strong>
      <SaleExhibitorIdentity lotId={lotId} canManageSales={canManageSales} mapData={mapData} />
      <p>
        {order.createdAt ? `Registrada em ${dateTime.format(new Date(order.createdAt))}` : 'Data de registro não informada'}
        {' · aguardando confirmação da assinatura do contrato.'}
      </p>
      <div>
        {stageLabel(order.stage) && <span>{stageLabel(order.stage)}</span>}
        {order.negotiatedTotal !== null && <span>Total do pedido: {currency.format(order.negotiatedTotal)}</span>}
        <span>{order.items.length} {order.items.length === 1 ? 'espaço aguardando assinatura' : 'espaços aguardando assinatura'}</span>
      </div>
      {canManageSales && currentItem && (
        <div className="commercial-map-sale-open__actions">
          <Button onClick={() => setConfirmation({ order, all: false, changed: false })} disabled={busy}>
            <CheckCircle2 className="h-4 w-4" />Confirmar contrato assinado
          </Button>
          <Button variant="outline" onClick={() => setCancellation({ orderId: order.orderId, itemId: currentItem.itemId, label: currentItem.publicIdentifier })} disabled={busy}>
            <XCircle className="h-4 w-4" />Cancelar venda em aberto
          </Button>
        </div>
      )}

      <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => {
        if (!open && !busy) {
          if (confirmation?.changed) invalidate();
          setConfirmation(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar contrato assinado</AlertDialogTitle>
            <AlertDialogDescription>
              Confirme após receber o contrato assinado. Os espaços listados serão marcados como vendidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmation && <>
            {!confirmation.changed && confirmation.order.items.length > 1 && <fieldset className="grid gap-2 text-sm" disabled={busy}>
              <legend className="font-medium">Abrangência da confirmação</legend>
              <label className="flex gap-2"><input type="radio" name="signature-scope" checked={!confirmation.all}
                onChange={() => setConfirmation({ ...confirmation, all: false })} />Somente este ponto</label>
              <label className="flex gap-2"><input type="radio" name="signature-scope" checked={confirmation.all}
                onChange={() => setConfirmation({ ...confirmation, all: true })} />Todos os pendentes do pedido</label>
            </fieldset>}
            {confirmation.changed && <p role="status" className="text-sm font-medium">
              A lista de pendentes mudou. Confira os pontos atuais antes de confirmar.
            </p>}
            {reviewedItems.length > 0 ? <ul aria-label="Espaços que serão confirmados" className="list-inside list-disc text-sm">
              {reviewedItems.map(({ itemId, publicIdentifier }) => <li key={itemId}>{publicIdentifier}</li>)}
            </ul> : <p className="text-sm">Nenhum espaço aguarda assinatura neste pedido.</p>}
          </>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={busy || reviewedItems.length === 0} onClick={(event) => {
              event.preventDefault();
              if (confirmation && reviewedItems.length) confirmMutation.mutate(confirmation);
            }}>
              {confirmMutation.isPending ? 'Confirmando…' : reviewedItems.length > 1 ? `Confirmar ${reviewedItems.length} espaços` : 'Confirmar assinatura'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(cancellation)} onOpenChange={(open) => { if (!open && !busy) setCancellation(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar venda em aberto</AlertDialogTitle>
            <AlertDialogDescription>
              Somente {cancellation?.label} voltará a ficar disponível. O pedido e a alteração das parcelas ficam no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(event) => {
              event.preventDefault();
              if (cancellation) cancelMutation.mutate(cancellation);
            }}>
              {cancelMutation.isPending ? 'Cancelando…' : 'Cancelar venda'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
