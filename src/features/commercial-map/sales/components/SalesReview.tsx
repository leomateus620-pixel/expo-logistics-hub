import { formatAreaSqmLabel, formatBrl } from '../../utils/lotPricing2028';
import type { SalesCartSummary } from '../salesPricing';
import type { SalesBuyerDraft, SalesInstallment, SalesPaymentDraft, SalesStage } from '../salesTypes';
import { SALES_PAYMENT_METHOD_LABELS, SALES_STAGE_LABELS } from '../salesTypes';

interface Props {
  summary: SalesCartSummary;
  stage: SalesStage;
  buyer: SalesBuyerDraft;
  payment: SalesPaymentDraft;
  installments: SalesInstallment[];
}

export function SalesReview({ summary, stage, buyer, payment, installments }: Props) {
  const paymentLabel = payment.paymentType === 'CASH'
    ? `À vista · ${SALES_PAYMENT_METHOD_LABELS[payment.paymentMethod]}`
    : `${installments.length}x · ${SALES_PAYMENT_METHOD_LABELS[payment.paymentMethod]}`;

  return (
    <div className="sales-sheet-body sales-review">
      <div className="sales-review__list">
        {summary.lines.map((line) => (
          <div key={line.entry.lotId}>
            <span>{line.entry.publicIdentifier}</span>
            <strong>{formatBrl(line.total)}</strong>
          </div>
        ))}
      </div>

      <dl>
        <dt>Expositor</dt>
        <dd>{buyer.buyerName}</dd>
        <dt>Documento</dt>
        <dd>{buyer.documentNumber}</dd>
        <dt>Celular</dt>
        <dd>{buyer.phone}</dd>
        <dt>Etapa</dt>
        <dd>{SALES_STAGE_LABELS[stage]}</dd>
        <dt>Pagamento</dt>
        <dd>{paymentLabel}</dd>
        <dt>Espaços</dt>
        <dd>{summary.lines.length}</dd>
        <dt>Área total</dt>
        <dd>{formatAreaSqmLabel(summary.areaTotal)}</dd>
        <dt>Total</dt>
        <dd className="sales-review__total">{formatBrl(summary.valueTotal)}</dd>
      </dl>

      <div className="sales-review__list" aria-label="Vencimentos finais">
        {installments.map((item) => (
          <div key={item.number}><span>{String(item.number).padStart(2, '0')} · {item.dueDate.split('-').reverse().join('/')}</span><strong>{formatBrl(item.amount)}</strong></div>
        ))}
      </div>

      <p className="sales-cart__empty">
        Valores do espaço por m², sem taxa administrativa, PPCI, limpeza ou licença.
      </p>
    </div>
  );
}
