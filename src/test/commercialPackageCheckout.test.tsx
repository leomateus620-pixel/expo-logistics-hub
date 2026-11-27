import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SalesCartContents } from '@/features/commercial-map/sales/components/SalesCart';
import { SalesPaymentForm, paymentErrors } from '@/features/commercial-map/sales/components/SalesPaymentForm';
import { SalesReview } from '@/features/commercial-map/sales/components/SalesReview';
import { draftsToInstallments, initialSalesPayment } from '@/features/commercial-map/sales/salesInstallments';
import { summarizeCart } from '@/features/commercial-map/sales/salesPricing';
import type { SalesPaymentDraft, SalesSelectionEntry } from '@/features/commercial-map/sales/salesTypes';
import type { LotPricing2028 } from '@/features/commercial-map/utils/lotPricing2028';
import { AttachOrderContractDialog } from '@/features/commercial-map/dashboard/salesOrders/AttachOrderContractDialog';
import { useState } from 'react';

const attachOrderContract = vi.hoisted(() => vi.fn());
vi.mock('@/features/commercial-map/dashboard/salesOrders/salesOrdersService', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  attachOrderContract,
}));

const park: SalesSelectionEntry = {
  lotId: 'park',
  publicIdentifier: 'PARK-STALLONNE',
  displayName: 'Parque de Diversões Stallonne',
  context: 'Gastronomia',
  commercialUnit: 'FIXED_PACKAGE',
  includedPoints: [
    { id: 'popcorn', label: 'Pipoca e crepes' },
    { id: 'truck', label: 'Lanches e bebidas' },
    { id: 'ice-cream', label: 'Sorvete' },
  ],
};
const balloon: SalesSelectionEntry = {
  lotId: 'balloon', publicIdentifier: 'GAST-D1-03', displayName: 'Balão',
  context: 'Gastronomia', commercialUnit: 'FOOD_POINT',
};
const parkTotal = 252_280;
const pricing = new Map([park, balloon].map((entry): [string, LotPricing2028] => {
  const total = entry === park ? parkTotal : 2_815;
  return [entry.lotId, {
    lotId: entry.lotId, publicIdentifier: entry.publicIdentifier, pavilion: null, block: null, lotNumber: null,
    cornerConfirmed: false, cornerStatus: null, officialAreaSqm: null, areaValidationStatus: null,
    renovacaoPricePerSqm: null, renovacaoTotal: total, renovacaoRuleLabel: null,
    segundaPricePerSqm: null, segundaTotal: total, segundaRuleLabel: null,
    commercialUnit: entry.commercialUnit, unitQuantity: 1, resolutionStatus: 'OK',
  }];
}));
const fees = { adminCents: 0, ppciCents: 0, cleaningCents: 0 };
const buyer = { buyerName: 'Expositor QA', tradeName: '', documentNumber: '', phone: '', email: '', notes: '' };

describe('locação integral no checkout comercial', () => {
  it('mostra um único item com valor fixo e os três pontos incluídos em ambas as etapas', () => {
    const summary = summarizeCart([park], pricing, 'RENOVACAO');
    expect(summary).toMatchObject({ valueTotal: parkTotal, foodPointCount: 0, ready: true });
    expect(summarizeCart([park], pricing, 'SEGUNDA_ETAPA').valueTotal).toBe(parkTotal);
    render(<SalesCartContents summary={summary} loading={false} />);

    expect(screen.getAllByRole('article')).toHaveLength(1);
    const line = within(screen.getByRole('article'));
    expect(line.getByText('Parque de Diversões Stallonne')).toBeVisible();
    expect(line.getByText(/252\.280,00/)).toBeVisible();
    expect(line.getAllByRole('listitem')).toHaveLength(3);
    expect(line.getByText('Sorvete')).toBeVisible();
    expect(screen.queryByText('Área total')).toBeNull();
    expect(screen.getByRole('button', { name: 'Finalizar venda' })).toBeEnabled();
  });

  it('exige finalizar a locação separadamente e mantém Balão vendável pelo fluxo normal', () => {
    const mixed = summarizeCart([park, balloon], pricing, 'RENOVACAO');
    const standalone = summarizeCart([balloon], pricing, 'RENOVACAO');
    expect(standalone).toMatchObject({ valueTotal: 2_815, foodPointCount: 1, ready: true });
    const { rerender } = render(<SalesCartContents summary={mixed} loading={false} />);
    expect(screen.getByRole('button', { name: 'Finalizar venda' })).toBeDisabled();
    expect(screen.getByText(/pedido separado/)).toBeVisible();
    rerender(<SalesCartContents summary={standalone} loading={false} />);
    expect(screen.getByRole('button', { name: 'Finalizar venda' })).toBeEnabled();
    expect(screen.queryByRole('list', { name: 'Pontos incluídos na locação' })).toBeNull();
  });

  it('mantém o editor de pagamento, aceita datas e valores manuais e revisa a composição sem taxas', () => {
    const cents = parkTotal * 100;
    const summary = summarizeCart([park], pricing, 'RENOVACAO');
    let edited: SalesPaymentDraft = initialSalesPayment(cents);

    function PaymentEditor() {
      const [draft, setDraft] = useState(edited);
      return <SalesPaymentForm value={draft} onChange={(next) => { edited = next; setDraft(next); }}
        fees={fees} onFeesChange={() => { throw new Error('Locação com valor fixo'); }}
        spacesCents={cents} fixedPackage showErrors />;
    }

    const { rerender } = render(<PaymentEditor />);
    expect(screen.queryByText('Taxas da venda')).toBeNull();
    const schedule = screen.getByRole('list', { name: 'Cronograma de parcelas' });
    const dates = within(schedule).getAllByLabelText('Vencimento');
    const amounts = within(schedule).getAllByLabelText('Valor');
    expect(dates).toHaveLength(17);

    const firstCents = edited.installments[0].amountCents;
    const secondCents = edited.installments[1].amountCents;
    fireEvent.change(dates[0], { target: { value: '2026-11-30' } });
    fireEvent.change(dates[1], { target: { value: '2026-12-30' } });
    fireEvent.change(amounts[0], { target: { value: String(firstCents - 500) } });
    fireEvent.change(amounts[1], { target: { value: String(secondCents + 500) } });
    expect(Object.values(paymentErrors(edited, cents))).toEqual([null, null, null, null]);
    expect(draftsToInstallments(edited.installments).slice(0, 2)).toEqual([
      { number: 1, dueDate: '2026-11-30', amount: (firstCents - 500) / 100 },
      { number: 2, dueDate: '2026-12-30', amount: (secondCents + 500) / 100 },
    ]);

    rerender(<SalesReview summary={summary} stage="RENOVACAO" buyer={buyer} payment={edited} fees={fees} spacesCents={cents} />);
    expect(screen.getByText('1 locação integral')).toBeVisible();
    expect(within(screen.getByRole('list', { name: 'Vencimentos finais' })).getAllByRole('listitem')).toHaveLength(17);
    expect(within(screen.getByRole('list', { name: 'Pontos incluídos na locação' })).getAllByRole('listitem')).toHaveLength(3);
  });

  it('anexa um PDF ao pedido com cobertura integral e envia só o ID da unidade vendida', async () => {
    const onClose = vi.fn();
    attachOrderContract.mockResolvedValue({ contractId: 'qa-contract', version: 1 });
    render(<AttachOrderContractDialog orgId="org-qa" orderId="order-qa" contract={null}
      items={[{ lotId: park.lotId, label: park.displayName, commercialUnit: park.commercialUnit, includedPoints: park.includedPoints }]}
      onClose={onClose} onAttached={async () => {}} />);

    const coverage = screen.getByRole('group', { name: /Abrangência do documento/ });
    expect(within(coverage).getAllByRole('listitem')).toHaveLength(4);
    expect(within(coverage).queryByRole('radio')).toBeNull();
    const fileInput = screen.getByLabelText('Selecionar arquivo do contrato');
    const submit = screen.getByRole('button', { name: 'Anexar contrato' });
    const docx = new File(['fixture'], 'rascunho.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    fireEvent.change(fileInput, { target: { files: [docx] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Envie o PDF assinado');
    fireEvent.click(submit);
    expect(attachOrderContract).not.toHaveBeenCalled();

    const pdf = new File(['%PDF-1.5 fixture QA'], 'contrato-ficticio.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [pdf] } });
    fireEvent.click(submit);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(attachOrderContract).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      orgId: 'org-qa', orderId: 'order-qa', lotIds: [park.lotId], file: pdf, contractId: null,
    }));
  });
});
