import { useQuery } from '@tanstack/react-query';
import { Loader2, ShieldAlert } from 'lucide-react';
import { formatDashboardCurrency } from '../commercialDashboardFormatters';
import { describeSalesError, fetchSaleOrderRevisions } from './salesOrdersService';

export function SaleOrderHistory({ orderId }: { orderId: string }) {
  const q = useQuery({ queryKey: ['commercial-sale-order-revisions', orderId], queryFn: () => fetchSaleOrderRevisions(orderId), staleTime: 30_000 });
  if (q.isLoading) return <p className="cso-state" role="status"><Loader2 className="is-spinning" aria-hidden="true" />Carregando histórico…</p>;
  if (q.error) return <p className="cso-state is-error" role="alert"><ShieldAlert aria-hidden="true" />{describeSalesError(q.error)}<button type="button" className="cso-link" onClick={() => q.refetch()}>Tentar novamente</button></p>;
  const revisions = q.data?.revisions ?? [];
  const lots = (values?: string[]) => values?.length ? values.join(', ') : '—';
  return <section className="cso-block">
    <h3>Alterações da venda <span className="cso-count">{revisions.length}</span></h3>
    {revisions.length === 0 ? <p className="cso-state">Nenhuma revisão registrada nesta venda.</p> : <ul className="cso-revisions">{revisions.map((r) => <li key={r.id}>
      <header><strong>{r.reason}</strong><time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</time></header>
      <p>{r.actorName || 'Responsável não informado'}</p>
      <dl>
        <div><dt>Referências técnicas anteriores</dt><dd>{lots(r.before.lots)}</dd></div>
        <div><dt>Referências técnicas após a revisão</dt><dd>{lots(r.after.lots)}</dd></div>
        <div><dt>Valor negociado</dt><dd>{formatDashboardCurrency(r.before.negotiated_total ?? null)} → {formatDashboardCurrency(r.after.negotiated_total ?? null)}</dd></div>
        {(r.before.installment_count != null || r.after.installment_count != null) && <div><dt>Parcelas</dt><dd>{r.before.installment_count ?? '—'} → {r.after.installment_count ?? '—'}</dd></div>}
      </dl>
    </li>)}</ul>}
  </section>;
}
