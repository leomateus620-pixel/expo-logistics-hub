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
} from '../salesService';

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
export function SaleOpenSection({ lotId, canManageSales }: { lotId: string; canManageSales: boolean }) {
  const queryClient = useQueryClient();
  const openSale = useLotOpenSaleOrder(lotId, true);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['commercial-map'] });
  };

  const confirmMutation = useMutation({
    mutationFn: (itemIds: string[]) => confirmSaleOrderItems(openSale.data!.orderId, itemIds),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Contrato confirmado', description: 'O espaço passou a constar como vendido no mapa.' });
    },
    onError: (error: Error) => {
      invalidate();
      toast({ title: 'Confirmação não concluída', description: error.message, variant: 'destructive' });
    },
    onSettled: () => setConfirming(false),
  });

  const cancelMutation = useMutation({
    mutationFn: (itemIds: string[]) => cancelSaleOrderItems(openSale.data!.orderId, itemIds),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Venda em aberto cancelada', description: 'O espaço voltou a ficar disponível no mapa.' });
    },
    onError: (error: Error) => {
      invalidate();
      toast({ title: 'Cancelamento não concluído', description: error.message, variant: 'destructive' });
    },
    onSettled: () => setCancelling(false),
  });

  if (openSale.isLoading) {
    return <p className="commercial-map-sale-open__loading"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando venda em aberto…</p>;
  }
  const order = openSale.data;
  if (!order) return null;

  const currentItem = order.items.find((item) => item.lotId === lotId);
  const busy = confirmMutation.isPending || cancelMutation.isPending;

  return (
    <section className="commercial-map-sale-open" aria-label="Venda em aberto">
      <header><FileSignature aria-hidden="true" /><span>Venda em aberto</span></header>
      <strong className="commercial-map-sale-open__buyer">{order.buyerName}</strong>
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
          <Button onClick={() => setConfirming(true)} disabled={busy}>
            <CheckCircle2 className="h-4 w-4" />Confirmar contrato assinado
          </Button>
          <Button variant="outline" onClick={() => setCancelling(true)} disabled={busy}>
            <XCircle className="h-4 w-4" />Cancelar venda em aberto
          </Button>
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar contrato assinado</AlertDialogTitle>
            <AlertDialogDescription>
              Confirme somente após receber o contrato assinado. Esta ação marca o espaço como vendido e fica registrada em auditoria.
              {order.items.length > 1 && ' Os demais espaços do pedido não são alterados automaticamente.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => confirmMutation.mutate([currentItem!.itemId])}>
              {confirmMutation.isPending ? 'Confirmando…' : 'Confirmar assinatura'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelling} onOpenChange={setCancelling}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar venda em aberto</AlertDialogTitle>
            <AlertDialogDescription>
              O espaço volta a ficar disponível para venda. O pedido, as parcelas e o histórico são preservados em auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => cancelMutation.mutate([currentItem!.itemId])}>
              {cancelMutation.isPending ? 'Cancelando…' : 'Cancelar venda'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
