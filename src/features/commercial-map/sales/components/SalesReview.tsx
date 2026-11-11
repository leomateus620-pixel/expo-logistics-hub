import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { foodPointQuantityLabel, formatAreaSqmLabel } from '../../utils/lotPricing2028';
import type { SalesCartSummary } from '../salesPricing';
import { formatCents, toCents } from '../salesMoney';
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
  const lotCount = summary.lines.length - summary.foodPointCount;
  const areas = Array.from(new Set(summary.lines.map((line) => line.entry.area).filter(Boolean)));

  return (
    <div className="sales-sheet-body sales-review">
      <section className="sales-block">
        <h3>Expositor</h3>
        <dl className="sales-review__dl">
          <div className="is-wide"><dt>Nome / razão social</dt><dd>{buyer.buyerName}</dd></div>
          <div className="is-wide"><dt>Nome fantasia</dt><dd className={buyer.tradeName.trim() ? undefined : 'is-muted'}>{buyer.tradeName.trim() || 'Não informado · será exibida a razão social'}</dd></div>
          <div><dt>CPF/CNPJ</dt><dd>{buyer.documentNumber}</dd></div>
          <div><dt>Celular</dt><dd>{buyer.phone}</dd></div>
          <div className="is-email"><dt>E-mail</dt><dd className={buyer.email.trim() ? 'sales-review__email' : 'is-muted'}>{buyer.email.trim() || 'Não informado'}</dd></div>
        </dl>
      </section>

      <section className="sales-block">
        <h3>Espaços</h3>
        <ul className="sales-review__lots">
          {summary.lines.map((line) => (
            <li key={line.entry.lotId}>
              <span><b>{line.entry.title ?? line.entry.displayName}</b>
                <small>{[line.entry.location, line.entry.area,
                  line.entry.commercialUnit === 'FOOD_POINT' ? foodPointQuantityLabel(1) : formatAreaSqmLabel(line.areaSqm)]
                  .filter(Boolean).join(' · ')}</small></span>
              <strong>{formatCents(toCents(line.total ?? 0))}</strong>
            </li>
          ))}
        </ul>
        <dl className="sales-review__dl">
          {areas.length > 0 && <div><dt>{lotCount === 0 ? 'Segmento' : 'Área comercial'}</dt><dd>{areas.join(', ')}</dd></div>}
          <div><dt>Quantidade</dt><dd>{[
            lotCount > 0 ? `${lotCount} ${lotCount === 1 ? 'lote' : 'lotes'}` : '',
            summary.foodPointCount > 0 ? foodPointQuantityLabel(summary.foodPointCount) : '',
          ].filter(Boolean).join(' · ')}</dd></div>
          {lotCount > 0 && <div><dt>Área total</dt><dd>{formatAreaSqmLabel(summary.areaTotal)}</dd></div>}
          <div><dt>Modalidade</dt><dd>{SALES_STAGE_LABELS[stage]}</dd></div>
        </dl>
      </section>

      <section className="sales-block">
        <div className="sales-installments-header">
          <h3>Composição do valor</h3>
          {feesCents > 0 && <Button type="button" variant="ghost" size="sm" className="sales-link" aria-expanded={showFees} onClick={() => setShowFees((v) => !v)}>
            Exibir detalhamento das taxas <ChevronDown className={`h-4 w-4 ${showFees ? 'rotate-180' : ''}`} />
          </Button>}
        </div>
        <dl className="sales-totals">
          <div><dt>Subtotal dos espaços</dt><dd>{formatCents(spacesCents)}</dd></div>
          {showFees && (
            <>
              {fees.adminCents > 0 && <div className="is-sub"><dt>Taxa administrativa</dt><dd>{formatCents(fees.adminCents)}</dd></div>}
              {fees.ppciCents > 0 && <div className="is-sub"><dt>PPCI</dt><dd>{formatCents(fees.ppciCents)}</dd></div>}
              {fees.cleaningCents > 0 && <div className="is-sub"><dt>Limpeza ou licença</dt><dd>{formatCents(fees.cleaningCents)}</dd></div>}
            </>
          )}
          {feesCents > 0 && <div><dt>Total das taxas</dt><dd>{formatCents(feesCents)}</dd></div>}
          <div className="is-strong is-final"><dt>Total da venda</dt><dd>{formatCents(totalCents)}</dd></div>
        </dl>
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

      <section className="sales-block">
        <p className="sales-block__hint">
          Ao concluir, os espaços ficam como <strong>Venda em aberto</strong> (amarelo) no mapa.
          Eles passam a <strong>Vendido</strong> (azul) somente após a confirmação explícita da assinatura do contrato.
        </p>
      </section>
    </div>
  );
}
