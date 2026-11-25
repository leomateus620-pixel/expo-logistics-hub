import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { scheduleCommercialMapRefresh } from '../../queries/commercialMapRefresh';
import { adoptVerifiedSessionAttempt, clearSaleAttempt, listSaleAttempts, previousSessionAttempt, subscribeToSaleAttempts, type SaleAttempt, type SaleAttemptOwner } from '../saleAttemptStore';
import { fetchSaleAttemptResult, type RegisteredSaleAttempt } from '../salesService';
import { SALES_STAGE_LABELS } from '../salesTypes';

const attemptTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export function SaleAttemptCheck({ attempt, onOpenOrder, onRetry, onDismiss }: {
  attempt: SaleAttempt;
  onOpenOrder: (orderId: string) => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<RegisteredSaleAttempt | null>(null);
  const [message, setMessage] = useState('Venda aguardando verificação.');
  const [canRetry, setCanRetry] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const checkingRef = useRef(false);

  async function verify(): Promise<RegisteredSaleAttempt | null | undefined> {
    if (checkingRef.current) return undefined;
    checkingRef.current = true;
    setChecking(true);
    setCanRetry(false);
    try {
      const found = await fetchSaleAttemptResult(attempt);
      setResult(found);
      if (found) {
        void scheduleCommercialMapRefresh(queryClient);
      } else {
        setMessage('O servidor ainda não encontrou um pedido para esta tentativa.');
        setCanRetry(true);
      }
      return found;
    } catch {
      setMessage('Não foi possível consultar a tentativa. Confira sua sessão e tente a verificação novamente.');
      return undefined;
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }

  if (result) return <div className="grid gap-2">
    <p role="status">Pedido <strong>{result.reference}</strong> localizado.</p>
    <Button type="button" onClick={() => {
      clearSaleAttempt(attempt);
      onOpenOrder(result.orderId);
    }}>Abrir pedido</Button>
  </div>;

  return <div className="grid gap-2 text-sm">
    <p role="status">{checking ? 'Consultando o servidor…' : message}</p>
    <Button type="button" variant="outline" disabled={checking} onClick={() => { void verify(); }}>Verificar resultado</Button>
    {canRetry && onRetry && <Button type="button" variant="ghost" disabled={checking} onClick={onRetry}>Reenviar tentativa original</Button>}
    {canRetry && <Button type="button" variant="ghost" disabled={checking} onClick={() => setConfirmDismiss(true)}>Remover aviso</Button>}
    <AlertDialog open={confirmDismiss} onOpenChange={setConfirmDismiss}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover aviso desta tentativa?</AlertDialogTitle>
          <AlertDialogDescription>
            Nenhum pedido foi encontrado na última consulta. A tentativa ainda pode ser concluída pelo servidor.
            Isso remove apenas o aviso deste navegador; não cancela vendas, contratos nem libera espaços.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={checking}>Manter aviso</AlertDialogCancel>
          <AlertDialogAction disabled={checking} onClick={(event) => {
            event.preventDefault();
            void (async () => {
              const found = await verify();
              setConfirmDismiss(false);
              if (found === null) {
                clearSaleAttempt(attempt);
                onDismiss?.();
              }
            })();
          }}>{checking ? 'Consultando…' : 'Confirmar remoção'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

export function SaleAttemptsRecovery({ owner, labelOf, onOpenOrder }: {
  owner: SaleAttemptOwner;
  labelOf: (id: string) => string;
  onOpenOrder: (orderId: string) => void;
}) {
  const { operatorId, projectId } = owner;
  const [attempts, setAttempts] = useState(() => listSaleAttempts(owner));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const read = () => {
      const next = listSaleAttempts({ projectId, operatorId });
      setAttempts(next);
      if (!next.length) setOpen(false);
    };
    const unsubscribe = subscribeToSaleAttempts(read);
    read();
    const previous = previousSessionAttempt({ projectId, operatorId });
    if (previous) {
      void fetchSaleAttemptResult(previous).then((found) => {
        if (found) adoptVerifiedSessionAttempt(previous);
      }).catch(() => undefined);
    }
    return unsubscribe;
  }, [operatorId, projectId]);

  if (!attempts.length) return null;

  return <>
    <Button type="button" variant="outline" className="sales-recovery-trigger shadow-md" onClick={() => setOpen(true)}>
      Recuperar venda{attempts.length > 1 ? 's' : ''} ({attempts.length})
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tentativas de venda</DialogTitle>
          <DialogDescription>Consulte cada tentativa com os pontos e a etapa do envio original.</DialogDescription>
        </DialogHeader>
        {attempts.map((attempt) => <section key={attempt.key} className="grid gap-2 rounded-lg border p-3">
          <p className="text-sm font-medium">{SALES_STAGE_LABELS[attempt.stage]} · {attemptTime.format(attempt.startedAt)}</p>
          <p className="break-words text-sm">{attempt.lotIds.map(labelOf).join(', ')}</p>
          <SaleAttemptCheck attempt={attempt} onOpenOrder={(orderId) => { setOpen(false); onOpenOrder(orderId); }} />
        </section>)}
      </DialogContent>
    </Dialog>
  </>;
}
