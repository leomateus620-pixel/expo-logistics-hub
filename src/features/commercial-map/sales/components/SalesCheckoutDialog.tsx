import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { draftsToInstallments, monthlyDueDates, redistribute } from '../salesInstallments';
import { formatCents, toCents } from '../salesMoney';
import type { SalesCartSummary } from '../salesPricing';
import { useSalesCheckout } from '../useSalesCheckout';
import { useSalesStore } from '../useSalesSelection';
import { useExhibitorAutosave } from '../useExhibitorAutosave';
import type { SalesBuyerDraft, SalesFeesDraft, SalesPaymentDraft } from '../salesTypes';
import { feesTotalCents } from '../salesTypes';
import { SalesBuyerForm, buyerErrors } from './SalesBuyerForm';
import { SalesPaymentForm, paymentErrors } from './SalesPaymentForm';
import { SalesReview } from './SalesReview';
import { uploadSaleLogo } from '../saleLogo';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

const STEPS = ['Expositor', 'Pagamento', 'Revisão'] as const;

const EMPTY_BUYER: SalesBuyerDraft = { buyerName: '', documentNumber: '', phone: '', email: '', notes: '' };
const EMPTY_FEES: SalesFeesDraft = { adminCents: 0, ppciCents: 0, cleaningCents: 0 };

function initialPayment(totalCents: number): SalesPaymentDraft {
  return { paymentMethod: 'PIX', countInput: '3', installments: [{ dueDate: monthlyDueDates(1)[0], amountCents: totalCents }], manualAmounts: false };
}

interface Props {
  summary: SalesCartSummary;
}

export function SalesCheckoutDialog({ summary }: Props) {
  const open = useSalesStore((state) => state.checkoutOpen);
  const setOpen = useSalesStore((state) => state.setCheckoutOpen);
  const stage = useSalesStore((state) => state.stage);
  const selection = useSalesStore((state) => state.selection);

  const spacesCents = toCents(summary.valueTotal);
  const [step, setStep] = useState(0);
  const queryClient = useQueryClient();
  const [logoImage, setLogoImage] = useState<Blob | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const changeLogo = (image: Blob | null, preview: string | null) => {
    setLogoImage(image);
    setLogoPreview(current => { if (current) URL.revokeObjectURL(current); return preview; });
  };
  const [showErrors, setShowErrors] = useState(false);
  const [buyer, setBuyer] = useState<SalesBuyerDraft>(EMPTY_BUYER);
  const [fees, setFees] = useState<SalesFeesDraft>(EMPTY_FEES);
  const totalCents = spacesCents + feesTotalCents(fees);
  const [payment, setPayment] = useState<SalesPaymentDraft>(() => initialPayment(totalCents));
  const [advancing, setAdvancing] = useState(false);
  // Chave de idempotência por tentativa de checkout: reenvio não duplica a venda.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const checkout = useSalesCheckout();
  const autosave = useExhibitorAutosave(buyer, selection[0]?.lotId ?? null, open);

  useEffect(() => {
    if (open) {
      setStep(0);
      setShowErrors(false);
      setIdempotencyKey(crypto.randomUUID());
    } else { changeLogo(null, null); }
  }, [open]);

  // Total mudou (taxas/etapa): recalcula apenas se os valores ainda são automáticos; datas preservadas.
  const lastTotal = useRef(totalCents);
  useEffect(() => {
    if (lastTotal.current === totalCents) return;
    lastTotal.current = totalCents;
    setPayment((current) => {
      if (current.paymentMethod !== 'BOLETO_PARCELADO') {
        return { ...current, installments: [{ dueDate: current.installments[0]?.dueDate ?? monthlyDueDates(1)[0], amountCents: totalCents }] };
      }
      return current.manualAmounts ? current : { ...current, installments: redistribute(totalCents, current.installments) };
    });
  }, [totalCents]);

  const stepValid = useMemo(() => {
    if (step === 0) return Object.values(buyerErrors(buyer)).every((error) => error === null);
    if (step === 1) return Object.values(paymentErrors(payment, totalCents)).every((error) => error === null);
    return summary.ready && Object.values(paymentErrors(payment, totalCents)).every((error) => error === null);
  }, [step, buyer, payment, totalCents, summary.ready]);

  const advance = async () => {
    if (!stepValid) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    if (step === 0) {
      setAdvancing(true);
      await autosave.flush(); // falha no cadastro não bloqueia a venda (dados vão como cópia na venda)
      setAdvancing(false);
    }
    setStep((current) => current + 1);
  };

  const confirm = () => {
    if (!stepValid || checkout.isPending) return;
    checkout.mutate({
      idempotencyKey,
      stage,
      lotIds: selection.map((item) => item.lotId),
      buyer,
      exhibitorId: autosave.exhibitorId,
      paymentMethod: payment.paymentMethod,
      fees,
      installments: draftsToInstallments(payment.installments),
      expectedTotal: totalCents / 100,
    }, {
      onSuccess: async (orderId) => {
        if (logoImage) {
          setLogoUploading(true);
          try { await uploadSaleLogo(orderId, idempotencyKey, logoImage); await queryClient.invalidateQueries({ queryKey: ['commercial-map'] }); }
          catch (error) { toast({ title: 'Venda registrada sem imagem', description: error instanceof Error ? error.message : 'Não foi possível associar a imagem.', variant: 'destructive' }); }
          finally { setLogoUploading(false); }
        }
        changeLogo(null, null);
        setBuyer(EMPTY_BUYER);
        setFees(EMPTY_FEES);
        setPayment(initialPayment(0));
        autosave.reset();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !checkout.isPending && !logoUploading && setOpen(next)}>
      <DialogContent className="sales-checkout-dialog sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Finalizar venda</DialogTitle>
          <DialogDescription>
            {selection.length} espaço{selection.length === 1 ? '' : 's'} · {formatCents(totalCents)}
          </DialogDescription>
        </DialogHeader>

        <ol className="sales-checkout-steps">
          {STEPS.map((label, index) => (
            <li key={label} className={index === step ? 'is-active' : index < step ? 'is-done' : ''} aria-current={index === step ? 'step' : undefined}>
              <span>{index + 1}</span>{label}
            </li>
          ))}
        </ol>

        <div className="sales-checkout-dialog__body">
          {step === 0 && (
            <SalesBuyerForm
              value={buyer}
              onChange={setBuyer}
              showErrors={showErrors}
               logoPreview={logoPreview}
               onLogoChange={changeLogo}
              saveStatus={autosave.status}
              onRetrySave={() => { void autosave.flush(); }}
            />
          )}
          {step === 1 && (
            <SalesPaymentForm
              value={payment}
              onChange={setPayment}
              fees={fees}
              onFeesChange={setFees}
              spacesCents={spacesCents}
              showErrors={showErrors}
            />
          )}
          {step === 2 && (
            <SalesReview summary={summary} stage={stage} buyer={buyer} payment={payment} fees={fees} spacesCents={spacesCents} />
          )}
        </div>

        <div className="sales-checkout-dialog__actions">
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
            <Button type="button" className="h-11 flex-1 rounded-xl" disabled={advancing} onClick={() => { void advance(); }}>
              {advancing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continuar
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11 flex-1 rounded-xl"
              disabled={!stepValid || checkout.isPending}
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
