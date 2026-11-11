import { memo } from 'react';
import { ArrowUpRight, FileText, LayoutGrid, Wallet } from 'lucide-react';
import { formatDashboardCurrency } from '../commercialDashboardFormatters';
import { paymentMethodLabel } from '../../sales/salesTypes';
import type { SaleOrderSummary } from './salesOrdersService';
import { documentSummary, fmtSaleDate, receiptSummary, saleName, saleStateLabel, signatureSummary } from './salesOrdersPresentation';

export const SaleOrderCard = memo(function SaleOrderCard({ record, onOpen }: { record: SaleOrderSummary; onOpen: (record: SaleOrderSummary) => void }) {
  const name = saleName(record);
  const stateLabel = saleStateLabel(record);
  const foodCount = record.activeCount > 0 ? (record.foodPoints?.length ?? 0) : 0;
  const lotCount = record.activeCount - foodCount;
  return <article className="cso-card" data-sale-record={record.recordId}>
    <header className="cso-card-heading">
      <h3>{name}</h3>
      <span className={`cso-sale-state ${stateLabel === 'Venda em aberto' ? 'is-open' : ''}`}>{stateLabel}</span>
    </header>
    <div className="cso-reference"><strong>{record.reference}</strong><span>{fmtSaleDate(record.createdAt)}</span></div>
    <div className="cso-card-value-row">
      <div className="cso-value"><span>Valor negociado</span><strong>{formatDashboardCurrency(record.negotiatedTotal)}</strong></div>
      <div className="cso-card-spaces"><LayoutGrid aria-hidden="true" /><strong>{record.activeCount}</strong>
        <span>{foodCount === record.activeCount && foodCount > 0 ? (foodCount === 1 ? 'ponto ativo' : 'pontos ativos') : 'espaços ativos'}</span>
      </div>
    </div>
    {Boolean(record.foodPoints?.length) && <p className="cso-card-signature">
      <span>Gastronomia{foodCount > 0 && lotCount > 0 && ` · ${foodCount} ${foodCount === 1 ? 'ponto' : 'pontos'}`}</span>
      {record.foodPoints?.map((point) => `${point.structure} · ${point.name}`).join(' / ')}
    </p>}
    <p className={`cso-card-signature ${record.pendingCount > 0 ? 'is-wait' : ''}`}><span>Assinatura</span>{signatureSummary(record)}</p>
    <div className="cso-card-support">
      <span><FileText aria-hidden="true" />{documentSummary(record)}</span>
      {record.kind === 'ORDER' && <span><Wallet aria-hidden="true" />{receiptSummary(record)}</span>}
    </div>
    <footer className="cso-card-footer">
      <span>{record.kind === 'LEGACY' ? 'Registro sem pedido' : <>{paymentMethodLabel(record.paymentMethod)}{record.installmentCount && record.installmentCount > 1 ? ` · ${record.installmentCount}x` : ''}</>}</span>
      <button type="button" className="cso-card-open" data-open-sale={record.recordId} aria-label={`Detalhes de ${name} · ${record.reference}`} onClick={() => onOpen(record)}>Detalhes<ArrowUpRight aria-hidden="true" /></button>
    </footer>
  </article>;
});
