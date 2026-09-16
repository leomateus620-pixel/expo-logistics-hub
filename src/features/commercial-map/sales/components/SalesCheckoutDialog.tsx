import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatBrl } from '../../utils/lotPricing2028';
import { buildInstallmentSchedule } from '../salesInstallments';
import type { SalesCartSummary } from '../salesPricing';
import { useSalesCheckout } from '../useSalesCheckout';
import { useSalesStore } from '../useSalesSelection';
import type { SalesBuyerDraft, SalesPaymentDraft } from '../salesTypes';
import { SalesBuyerForm, buyerErrors } from './SalesBuyerForm';
import { SalesPaymentForm, paymentErrors } from './SalesPaymentForm';
import { SalesReview } from './SalesReview';

const STEPS = ['Expositor', 'Pagamento', 'Revisão'] as const;

const EMPTY_BUYER: SalesBuyerDraft = { buyerName: '', documentNumber: '', phone: '', email: '', notes: '' };

function defaultDueDate(): string {
  const today = new Date();
  today.setDate(today.getDate() + 30);
  return today.toISOString().slice(0, 10);
}

interface Props {
  summary: SalesCartSummary;
}

export function SalesCheckoutDialog({ summary }: Props) {
  const open = useSalesStore((state) => state.checkoutOpen);
  const setOpen = useSalesStore((state) => state.setCheckoutOpen);
  const stage = useSalesStore((state) => state.stage);
  const selection = useSalesStore((state) => state.selection);

  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [buyer, setBuyer] = useState<SalesBuyerDraft>(EMPTY_BUYER);
  const [payment, setPayment] = useState<SalesPaymentDraft>({
    paymentType: 'CASH',
    installmentCount: 1,
    paymentMethod: 'PIX',
    firstDueDate: defaultDueDate(),
  });
  // Chave de idempotência por tentativa de checkout: reenvio não duplica a venda.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const checkout = useSalesCheckout();

  useEffect(() => {
    if (open) {
      setStep(0);
      setShowErrors(false);
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [open]);

  const installments = useMemo(
    () => buildInstallmentSchedule(
      summary.valueTotal,
      payment.paymentType === 'CASH' ? 1 : payment.installmentCount,
      payment.firstDueDate,
    ),
    [summary.valueTotal, payment.paymentType, payment.installmentCount, payment.firstDueDate],
  );

  const stepValid = useMemo(() => {
    if (step === 0) return Object.values(buyerErrors(buyer)).every((error) => error === null);
    if (step === 1) return Object.values(paymentErrors(payment)).every((error) => error === null);
    return summary.ready;
  }, [step, buyer, payment, summary.ready]);

  const advance = () => {
    if (!stepValid) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((current) => current + 1);
  };

  const confirm = () => {
    if (!summary.ready || checkout.isPending) return;
    checkout.mutate({
      idempotencyKey,
      stage,
      lotIds: selection.map((item) => item.lotId),
      buyer,
      payment,
      installments,
      expectedTotal: summary.valueTotal,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !checkout.isPending && setOpen(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Finalizar venda</DialogTitle>
          <DialogDescription>
            {selection.length} espaço{selection.length === 1 ? '' : 's'} · {formatBrl(summary.valueTotal)}
          </DialogDescription>
        </DialogHeader>

        <div className="sales-checkout-steps">
          {STEPS.map((label, index) => (
            <span key={label} className={index === step ? 'is-active' : ''}>
              {index + 1}. {label}
              {index < STEPS.length - 1 ? ' ›' : ''}
            </span>
          ))}
        </div>

        {step === 0 && <SalesBuyerForm value={buyer} onChange={setBuyer} showErrors={showErrors} />}
        {step === 1 && (
          <SalesPaymentForm value={payment} onChange={setPayment} installments={installments} showErrors={showErrors} />
        )}
        {step === 2 && (
          <SalesReview summary={summary} stage={stage} buyer={buyer} payment={payment} installments={installments} />
        )}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 rounded-xl"
            disabled={checkout.isPending}
            onClick={() => (step === 0 ? setOpen(false) : setStep((current) => current - 1))}
          >
            {step === 0 ? 'Cancelar' : 'Voltar'}
          </Button>
          {step < 2 ? (
            <Button type="button" className="h-11 flex-1 rounded-xl" onClick={advance}>
              Continuar
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11 flex-1 rounded-xl"
              disabled={!summary.ready || checkout.isPending}
              onClick={confirm}
            >
              {checkout.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar venda
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
