import { CalendarDays, ReceiptText } from 'lucide-react';
import { formatBrl } from '../../utils/lotPricing2028';
import { paymentMethodLabel } from '../salesTypes';
import type { LotSaleHistory } from '../../services/commercialMapService';

const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' });
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function LotSaleHistoryCard({ sale, loading }: { sale: LotSaleHistory | null | undefined; loading: boolean }) {
  if (loading) return <p>Carregando dados da venda…</p>;
  if (!sale) return null;

  return (
    <section className="commercial-sale-history" aria-label="Resumo da venda e vencimentos">
      <header><ReceiptText aria-hidden="true" /><div><strong>Venda registrada</strong><span>{dateTime.format(new Date(sale.createdAt))}</span></div><b>{formatBrl(sale.itemTotal)}</b></header>
      <p className="commercial-sale-history__trace"><strong>Comprador:</strong> {sale.buyerName} · <strong>Etapa:</strong> {sale.stage === 'RENOVACAO' ? 'Renovação' : '2ª Etapa'}{sale.salespersonName ? <> · <strong>Responsável:</strong> {sale.salespersonName}</> : null}</p>
      <dl>
        <div><dt>Etapa</dt><dd>{sale.stage === 'RENOVACAO' ? 'Renovação' : '2ª Etapa'}</dd></div>
        <div><dt>Forma</dt><dd>{sale.paymentType === 'CASH' ? 'À vista' : `${sale.installments.length} parcelas`} · {paymentMethodLabel(sale.paymentMethod)}</dd></div>
        {(sale.feesTotal ?? 0) > 0 && <div><dt>Taxas da venda</dt><dd>{formatBrl(sale.feesTotal ?? 0)} (adm. {formatBrl(sale.fees?.admin ?? 0)} · PPCI {formatBrl(sale.fees?.ppci ?? 0)} · limpeza/licença {formatBrl(sale.fees?.cleaning ?? 0)})</dd></div>}
        {sale.orderTotal !== undefined && sale.orderTotal !== sale.itemTotal && <div><dt>Total da venda</dt><dd>{formatBrl(sale.orderTotal)} · espaços {formatBrl(sale.spacesSubtotal ?? 0)}</dd></div>}
        <div><dt>Área</dt><dd>{sale.officialArea.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</dd></div>
        {sale.contractNumber && <div><dt>Contrato</dt><dd>{sale.contractNumber}</dd></div>}
      </dl>
      <div className="commercial-sale-history__installments">
        {sale.installments.map((installment) => (
          <div key={installment.number}>
            <CalendarDays aria-hidden="true" />
            <span><strong>{String(installment.number).padStart(2, '0')} · {date.format(new Date(`${installment.dueDate}T12:00:00-03:00`))}</strong><small>{installment.status === 'PAID' ? 'Pago' : 'Pendente'}</small></span>
            <b>{formatBrl(installment.amount)}</b>
          </div>
        ))}
      </div>
    </section>
  );
}