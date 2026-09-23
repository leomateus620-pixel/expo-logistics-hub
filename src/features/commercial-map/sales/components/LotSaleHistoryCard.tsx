import { CalendarDays, ReceiptText } from 'lucide-react';
import { formatBrl } from '../../utils/lotPricing2028';
import type { LotSaleHistory } from '../../services/commercialMapService';

const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' });

export function LotSaleHistoryCard({ sale, loading }: { sale: LotSaleHistory | null | undefined; loading: boolean }) {
  if (loading) return <p>Carregando dados da venda…</p>;
  if (!sale) return null;

  return (
    <section className="commercial-sale-history" aria-label="Resumo da venda e vencimentos">
      <header><ReceiptText aria-hidden="true" /><div><strong>Venda confirmada</strong><span>{sale.buyerName}</span></div><b>{formatBrl(sale.itemTotal)}</b></header>
      <dl>
        <div><dt>Etapa</dt><dd>{sale.stage === 'RENOVACAO' ? 'Renovação' : '2ª Etapa'}</dd></div>
        <div><dt>Forma</dt><dd>{sale.paymentType === 'CASH' ? 'À vista' : `${sale.installments.length} parcelas`} · {sale.paymentMethod}</dd></div>
        <div><dt>Área</dt><dd>{sale.officialArea.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</dd></div>
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