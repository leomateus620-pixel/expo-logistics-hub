import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { SalesPaymentForm, paymentErrors } from '../../sales/components/SalesPaymentForm';
import type { SalesPaymentDraft } from '../../sales/salesTypes';
import { registerPrivateContractUpload } from '../../services/contractUpload';
import { validateContractFile } from '../../utils/contracts';
import { describeSalesError, fetchPackageRevisionReview, type SaleOrderDetail } from './salesOrdersService';

const totalCents = 25_228_000;
const fees = { adminCents: 0, ppciCents: 0, cleaningCents: 0 };

export function PackageOrderRevision({ orgId, orderId, detail, onClose, onSaved }: {
  orgId: string; orderId: string; detail: SaleOrderDetail; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const [payment, setPayment] = useState<SalesPaymentDraft>(() => ({
    paymentMethod: 'BOLETO_PARCELADO', countInput: '17', manualAmounts: true,
    installments: Array.from({ length: 17 }, (_, i) => ({
      dueDate: detail.installments[i - 2]?.dueDate ?? '', amountCents: 0, manualAmount: true,
    })),
  }));
  const version = useQuery({ queryKey: ['commercial-package-revision-review', orderId], queryFn: () => fetchPackageRevisionReview(orderId), staleTime: 0 });
  const fileError = file ? validateContractFile(file) || (file.type !== 'application/pdf' ? 'Selecione o original em PDF.' : '') : '';
  const scheduleReady = !Object.values(paymentErrors(payment, totalCents)).some(Boolean)
    && payment.installments.every((entry, i, all) => i === 0 || entry.dueDate > all[i - 1].dueDate);
  const existingConflict = (version.data?.possibleOverlaps ?? 0) > 0 || detail.contracts?.length !== 0 || detail.installments.length !== 15
    || detail.installments.some((row) => row.paymentStatus !== 'PENDING' || row.paidAt);
  const ready = !existingConflict && file && !fileError && checked && scheduleReady && version.data?.updatedAt;
  const submit = async () => {
    if (!ready || !file || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await registerPrivateContractUpload({
        dir: orgId + '/orders/' + orderId, file, operation: 'revise_sale_order_items',
        args: { p_order_id: orderId, p_expected_updated_at: version.data.updatedAt,
          p_installments: payment.installments.map((line) => ({ due_date: line.dueDate, amount: line.amountCents / 100 })),
          p_reconciliation_checked: checked },
      });
      await onSaved();
      onClose();
    } catch (cause) {
      const message = describeSalesError(cause);
      setError(/PACKAGE_FINANCIAL_CONFLICT|PACKAGE_ORIGIN_CHANGED|ORDER_CHANGED|ORDER_ALREADY_RECONCILED/.test(message)
        ? 'A venda ou o histórico financeiro diverge da revisão. Reabra o pedido e confira a situação atual.' : message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <Dialog.Portal><Dialog.Overlay className="cso-attach-overlay" /><div className="cso-attach-viewport">
      <Dialog.Content className="cso-attach-dialog" onKeyDown={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}>
        <header className="cso-attach-header"><div>
          <Dialog.Title className="cso-attach-title">Conciliar contrato do Parque Stallonne</Dialog.Title>
          <Dialog.Description className="cso-attach-description">Os três pontos passam a integrar uma única locação de Gastronomia neste pedido.</Dialog.Description>
        </div></header>
        <form className="cso-attach-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="cso-attach-body">
            {version.data && <p className="cso-note">Responsável nesta sessão: <strong>{version.data.operator}</strong>.
              {' '}{version.data.possibleOverlaps} possível(is) registro(s) sobreposto(s) nas vendas e no Financeiro 2028.</p>}
            <fieldset disabled={busy || existingConflict}>
              <label className="cso-attach-field">Contrato original assinado
                <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              {fileError && <p role="alert">{fileError}</p>}
              <SalesPaymentForm value={payment} onChange={setPayment} spacesCents={totalCents}
                fixedPackage manualScheduleOnly fees={fees} onFeesChange={() => {}} showErrors={false} />
              <label className="cso-attach-field"><span><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
                {' '}Conferi o locatário, a assinatura e os 17 vencimentos no PDF. Conferi a origem dos valores e a ausência de cobrança emitida, faturamento, baixa ou outra receita para esta locação.</span></label>
            </fieldset>
            {existingConflict && <p role="alert">Há documento, lançamento relacionado ou divergência no plano deste pedido. Confira a origem antes de converter.</p>}
            {version.error && <p role="alert">{describeSalesError(version.error)}</p>}
            {error && <p role="alert">{error}</p>}
          </div>
          <footer className="cso-attach-footer"><button type="button" disabled={busy} onClick={onClose}>Fechar</button>
            <button className="cso-attach-submit" disabled={busy || !ready} type="submit">
              {busy ? 'Registrando…' : 'Anexar contrato e confirmar assinatura'}
            </button></footer>
        </form>
      </Dialog.Content></div></Dialog.Portal>
  </Dialog.Root>;
}
