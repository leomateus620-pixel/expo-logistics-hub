import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatAreaSqmLabel } from '../../utils/lotPricing2028';
import type { SalesCartSummary } from '../salesPricing';
import { formatCents } from '../salesMoney';
import { formatIsoDateBr } from '../salesInstallments';
import type { SalesBuyerDraft, SalesFeesDraft, SalesPaymentDraft, SalesStage } from '../salesTypes';
import { SALES_PAYMENT_METHOD_LABELS, SALES_STAGE_LABELS, feesTotalCents } from '../salesTypes';

interface Props {
  summary: SalesCartSummary;
  stage: SalesStage;
  buyer: SalesBuyerDraft;
  payment: SalesPaymentDraft;
  fees: SalesFeesDraft;
  spacesCents: number;
}

export function SalesReview({ summary, stage, buyer, payment, fees, spacesCents }: Props) {
  const [showFees, setShowFees] = useState(true);
  const feesCents = feesTotalCents(fees);
  const totalCents = spacesCents + feesCents;
  const n = payment.installments.length;
  const segments = Array.from(new Set(summary.lines.map((line) => line.entry.context).filter(Boolean)));

  return (
    <div className="sales-sheet-body sales-review">
      <section className="sales-block">
        <h3>Expositor</h3>
        <dl className="sales-review__dl">
          <div><dt>Nome / razão social</dt><dd>{buyer.buyerName}</dd></div>
          <div><dt>CPF/CNPJ</dt><dd>{buyer.documentNumber}</dd></div>
          <div><dt>Celular</dt><dd>{buyer.phone}</dd></div>
          <div><dt>E-mail</dt><dd className={buyer.email.trim() ? 'sales-review__email' : 'is-muted'}>{buyer.email.trim() || 'Não informado'}</dd></div>
        </dl>
      </section>

      <section className="sales-block">
        <h3>Espaços</h3>
        <ul className="sales-review__lots">
          {summary.lines.map((line) => (
            <li key={line.entry.lotId}><span>{line.entry.publicIdentifier}</span><strong>{formatCents(Math.round(line.total * 100))}</strong></li>
          ))}
        </ul>
        <dl className="sales-review__dl">
          {segments.length > 0 && <div><dt>Segmento / pavilhão</dt><dd>{segments.join(', ')}</dd></div>}
          <div><dt>Quantidade</dt><dd>{summary.lines.length} espaço{summary.lines.length === 1 ? '' : 's'}</dd></div>
          <div><dt>Área total</dt><dd>{formatAreaSqmLabel(summary.areaTotal)}</dd></div>
          <div><dt>Modalidade</dt><dd>{SALES_STAGE_LABELS[stage]}</dd></div>
        </dl>
      </section>

      <section className="sales-block">
        <div className="sales-installments-header">
          <h3>Composição do valor</h3>
          <button type="button" className="sales-link" aria-expanded={showFees} onClick={() => setShowFees((v) => !v)}>
            Exibir detalhamento das taxas <ChevronDown className={`h-4 w-4 ${showFees ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <dl className="sales-totals">
          <div><dt>Subtotal dos espaços</dt><dd>{formatCents(spacesCents)}</dd></div>
          {showFees && (
            <>
              <div className="is-sub"><dt>Taxa administrativa</dt><dd>{formatCents(fees.adminCents)}</dd></div>
              <div className="is-sub"><dt>PPCI</dt><dd>{formatCents(fees.ppciCents)}</dd></div>
              <div className="is-sub"><dt>Limpeza ou licença</dt><dd>{formatCents(fees.cleaningCents)}</dd></div>
            </>
          )}
          <div><dt>Total das taxas</dt><dd>{formatCents(feesCents)}</dd></div>
          <div className="is-strong is-final"><dt>Total da venda</dt><dd>{formatCents(totalCents)}</dd></div>
        </dl>
        <p className="sales-block__hint">Total composto pelos espaços e pelas taxas discriminadas acima.</p>
      </section>

      <section className="sales-block">
        <h3>Pagamento</h3>
        <dl className="sales-review__dl">
          <div><dt>Método</dt><dd>{SALES_PAYMENT_METHOD_LABELS[payment.paymentMethod]}</dd></div>
          <div><dt>Parcelas</dt><dd>{n} parcela{n === 1 ? '' : 's'}</dd></div>
        </dl>
        <ol className="sales-review__lots" aria-label="Vencimentos finais">
          {payment.installments.map((item, index) => (
            <li key={index}><span>{String(index + 1).padStart(2, '0')} · {formatIsoDateBr(item.dueDate)}</span><strong>{formatCents(item.amountCents)}</strong></li>
          ))}
        </ol>
      </section>
    </div>
  );
}
