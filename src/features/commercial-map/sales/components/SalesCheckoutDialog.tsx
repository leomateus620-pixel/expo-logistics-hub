import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { draftsToInstallments, initialSalesPayment, monthlyDueDates, redistributeAutomatic } from '../salesInstallments';
import { formatCents, toCents } from '../salesMoney';
import type { SalesCartSummary } from '../salesPricing';
import { useSalesCheckout } from '../useSalesCheckout';
import { useSalesStore } from '../useSalesSelection';
import { useExhibitorAutosave } from '../useExhibitorAutosave';
import type { SalesBuyerDraft, SalesFeesDraft, SalesOrderPayload, SalesPaymentDraft } from '../salesTypes';
import { feesTotalCents } from '../salesTypes';
import { SalesBuyerForm, buyerErrors } from './SalesBuyerForm';
import { SalesPaymentForm, paymentErrors } from './SalesPaymentForm';
import { SalesReview } from './SalesReview';
import { uploadSaleLogo } from '../saleLogo';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { scheduleCommercialMapRefresh } from '../../queries/commercialMapRefresh';
import { clearSaleAttempt, readUncertainSale, rememberUncertainSale, startSaleAttempt, subscribeToSaleAttempts, type SaleAttempt, type SaleAttemptOwner } from '../saleAttemptStore';
import { SalesOrderError } from '../salesErrors';
import { SaleAttemptCheck } from './SaleAttemptRecovery';

const STEPS = ['Expositor', 'Pagamento', 'Revisão'] as const;

const EMPTY_BUYER: SalesBuyerDraft = { buyerName: '', tradeName: '', documentNumber: '', phone: '', email: '', notes: '' };
const EMPTY_FEES: SalesFeesDraft = { adminCents: 0, ppciCents: 0, cleaningCents: 0 };

interface Props {
  summary: SalesCartSummary;
  owner: SaleAttemptOwner;
  availabilityNotices: string[];
  onOpenOrder: (orderId: string) => void;
}

export function SalesCheckoutDialog({ summary, owner, availabilityNotices, onOpenOrder }: Props) {
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
    setLogoPreview(preview);
  };
  const [showErrors, setShowErrors] = useState(false);
  const [buyer, setBuyer] = useState<SalesBuyerDraft>(EMPTY_BUYER);
  const [fees, setFees] = useState<SalesFeesDraft>(EMPTY_FEES);
  const fixedPackage = summary.lines.some(({ entry }) => entry.commercialUnit === 'FIXED_PACKAGE');
  const effectiveFees = fixedPackage ? EMPTY_FEES : fees;
  const totalCents = spacesCents + feesTotalCents(effectiveFees);
  const [payment, setPayment] = useState<SalesPaymentDraft>(() => initialSalesPayment(totalCents));
  const [advancing, setAdvancing] = useState(false);
  const submitting = useRef(false);
  const [uncertain, setUncertain] = useState(() => readUncertainSale(owner));
  const [orderId, setOrderId] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [priceNotices, setPriceNotices] = useState<string[]>([]);
  const observedPrices = useRef({ stage, lines: summary.lines, open });
  const checkout = useSalesCheckout();
  const autosave = useExhibitorAutosave(buyer, selection[0]?.lotId ?? null, open);

  useEffect(() => subscribeToSaleAttempts(() => {
    setUncertain(readUncertainSale(owner));
  }), [owner.projectId, owner.operatorId]);

  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);

  useEffect(() => {
    const previous = observedPrices.current;
    observedPrices.current = { stage, lines: summary.lines, open };
    if (!open || !previous.open || previous.stage !== stage) {
      setPriceNotices([]);
      return;
    }
    const before = new Map(previous.lines.map(({ entry, total }) => [entry.lotId, total]));
    const changed = summary.lines.filter(({ entry, total, pending }) => !pending && before.get(entry.lotId) != null
      && before.get(entry.lotId) !== total);
    if (changed.length) setPriceNotices((notices) => [...new Set([...notices, ...changed.map(({ entry }) => entry.publicIdentifier)])]);
  }, [open, stage, summary.lines]);

  // Total mudou (taxas/etapa): recalcula apenas se os valores ainda são automáticos; datas preservadas.
  const lastTotal = useRef(totalCents);
  useEffect(() => {
    if (lastTotal.current === totalCents) return;
    lastTotal.current = totalCents;
    setPayment((current) => {
      if (current.paymentMethod !== 'BOLETO_PARCELADO') {
        return { ...current, installments: [{ dueDate: current.installments[0]?.dueDate ?? monthlyDueDates(1)[0], amountCents: totalCents }] };
      }
      return { ...current, installments: redistributeAutomatic(totalCents, current) };
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
      // Cadastro complementar: espera curta; a venda leva os dados do expositor como cópia.
      await autosave.flushWithin();
      setAdvancing(false);
    }
    setStep((current) => current + 1);
  };

  const submit = async (attempt: SaleAttempt, payload: SalesOrderPayload) => {
    if (submitting.current) return;
    submitting.current = true;
    setUncertain(null);
    setSubmissionError(null);
    try {
      const id = await checkout.mutateAsync(payload);
      clearSaleAttempt(attempt);
      setOrderId(id);
      const { removeLot } = useSalesStore.getState();
      attempt.lotIds.forEach(removeLot);
      if (logoImage) {
        setLogoUploading(true);
        try {
          await uploadSaleLogo(id, attempt.key, logoImage);
          void scheduleCommercialMapRefresh(queryClient);
        } catch (error) {
          toast({ title: 'Venda registrada sem imagem', description: error instanceof Error ? error.message : 'Não foi possível associar a imagem.', variant: 'destructive' });
        }
      }
      changeLogo(null, null);
      setBuyer(EMPTY_BUYER);
      setFees(EMPTY_FEES);
      setPayment(initialSalesPayment(0));
      autosave.reset();
    } catch (error) {
      if (!(error instanceof SalesOrderError) || error.indeterminate) {
        setUncertain(rememberUncertainSale(attempt, payload));
      } else {
        clearSaleAttempt(attempt);
        setSubmissionError(error.message);
      }
    } finally {
      setLogoUploading(false);
      submitting.current = false;
    }
  };

  const confirm = () => {
    if (!stepValid || submitting.current || uncertain) return;
    const lotIds = selection.map((item) => item.lotId);
    const attempt = startSaleAttempt(owner, stage, lotIds);
    void submit(attempt, {
      ...owner,
      idempotencyKey: attempt.key,
      stage,
      lotIds,
      expectedPrices: Object.fromEntries(summary.lines.flatMap(({ entry, total }) => total == null ? [] : [[entry.lotId, total]])),
      buyer,
      exhibitorId: autosave.exhibitorId,
      paymentMethod: payment.paymentMethod,
      fees: effectiveFees,
      installments: draftsToInstallments(payment.installments),
      expectedTotal: totalCents / 100,
    });
  };

  const close = () => {
    if (submitting.current) return;
    if (orderId) {
      setOrderId(null);
      setStep(0);
    }
    setOpen(false);
  };
  const openOrder = (id: string) => {
    setUncertain(null);
    setStep(0);
    close();
    onOpenOrder(id);
  };

  const displayedCount = uncertain?.attempt.lotIds.length ?? selection.length;
  const displayedTotal = uncertain ? toCents(uncertain.payload.expectedTotal) : totalCents;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="sales-checkout-dialog bg-card backdrop-blur-none sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{orderId ? 'Venda em aberto registrada' : 'Finalizar venda'}</DialogTitle>
          <DialogDescription>
            {orderId ? `Pedido PV-${orderId.slice(0, 8).toUpperCase()}`
              : `${displayedCount} espaço${displayedCount === 1 ? '' : 's'} · ${formatCents(displayedTotal)}`}
          </DialogDescription>
        </DialogHeader>

        {orderId ? <>
          <p className="text-sm">Os espaços aguardam a confirmação da assinatura.</p>
          <div className="sales-checkout-dialog__actions">
            <Button type="button" variant="outline" disabled={logoUploading} onClick={close}>Voltar ao mapa</Button>
            <Button type="button" disabled={logoUploading} onClick={() => openOrder(orderId)}>Abrir pedido</Button>
          </div>
        </> : <>
          {!uncertain && <>
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
                  fees={effectiveFees}
                  onFeesChange={setFees}
                  spacesCents={spacesCents}
                  showErrors={showErrors}
                  fixedPackage={fixedPackage}
                />
              )}
              {step === 2 && (
                <SalesReview summary={summary} stage={stage} buyer={buyer} payment={payment} fees={effectiveFees} spacesCents={spacesCents} />
              )}
            </div>
          </>}
          {(availabilityNotices.length > 0 || priceNotices.length > 0 || submissionError) && <div className="text-sm text-destructive" role="alert">
            {submissionError && <p>{submissionError}</p>}
            {priceNotices.length > 0 && <p>Confira os valores de tabela atualizados de {priceNotices.join(', ')}.</p>}
            {availabilityNotices.map((message) => <p key={message}>{message}</p>)}
          </div>}
          {uncertain && <SaleAttemptCheck key={uncertain.attempt.key} attempt={uncertain.attempt} onOpenOrder={openOrder}
            onRetry={() => { void submit(uncertain.attempt, uncertain.payload); }} />}
          <div className="sales-checkout-dialog__actions">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-xl"
              disabled={checkout.isPending || logoUploading}
              onClick={() => {
                if (uncertain || step === 0) close();
                else setStep((current) => current - 1);
              }}
            >
              {uncertain ? 'Voltar ao carrinho' : step === 0 ? 'Cancelar' : 'Voltar'}
            </Button>
            {!uncertain && (step < 2 ? (
               <Button type="button" className="h-11 flex-1 rounded-xl" disabled={advancing || logoUploading} onClick={() => { void advance(); }}>
                {advancing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continuar
              </Button>
            ) : (
              <Button
                type="button"
                className="h-11 flex-1 rounded-xl"
                 disabled={!stepValid || checkout.isPending || logoUploading}
                onClick={confirm}
              >
                {checkout.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar venda em aberto
              </Button>
            ))}
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}
