import type { Ref } from 'react';
import { ArrowUpRight, FileCheck2 } from 'lucide-react';
import { OverviewInfo } from './CommercialDashboardOverviewInfo';
import { ConfirmedSealGlyph, PendingSignatureGlyph } from './CommercialDashboardOverviewIcons';
import { formatDashboardInteger } from './commercialDashboardFormatters';
import { useCommercialSalesSummary, type CommercialSalesSummaryAccess } from './salesOrders/useCommercialSalesSummary';

export interface CommercialDashboardSalesSummaryProps extends CommercialSalesSummaryAccess {
  entryRef?: Ref<HTMLButtonElement>;
  onAccess: () => void;
}

export function CommercialDashboardSalesSummary({ entryRef, onAccess, ...access }: CommercialDashboardSalesSummaryProps) {
  const { totals, state, isFetching, errorText } = useCommercialSalesSummary(access);
  const value = (count: number | undefined) => count === undefined ? '—' : formatDashboardInteger(count);
  const status = state === 'restricted' ? 'Acesso restrito'
    : state === 'unavailable' ? 'Consulta indisponível'
      : state === 'stale' ? 'Últimos dados válidos · atualização indisponível'
        : !totals ? 'Consultando registros…'
          : isFetching ? 'Atualizando' : null;

  return <section className="commercial-dashboard-sales-summary" aria-labelledby="commercial-dashboard-sales-summary-title"
    data-summary-state={state} aria-busy={isFetching}>
    <header className="commercial-dashboard-sales-summary__heading">
      <span className="commercial-dashboard-sales-summary__document" aria-hidden="true"><FileCheck2 /></span>
      <h2 id="commercial-dashboard-sales-summary-title">Vendas e contratos</h2>
      <OverviewInfo label="Informações sobre os registros de venda" title="Vendas e contratos"
        lead="Resumo global de registros do módulo, independente dos filtros de áreas e da lista de vendas."
        facts={[
          ['Registros de venda', 'Total informado pela consulta global, incluindo registros legados e outras situações.'],
          ['Aguardando assinatura', 'Classificação PENDING da API, que já inclui assinatura parcial (PARTIAL).'],
          ['Assinatura confirmada', 'Classificação SIGNED do fluxo existente.'],
        ]}
        note={<>{'Os dois subtotais não compõem, necessariamente, o total global. Anexar um arquivo não confirma assinatura nem pagamento. Registros de venda não são documentos de contrato.'}
          {errorText && <span className="commercial-dashboard-sales-summary__error-detail"> {errorText}</span>}</>} />
      <button type="button" ref={entryRef} onClick={onAccess} className="commercial-dashboard-sales-summary__access"
        aria-label="Acessar vendas e contratos">Acessar<ArrowUpRight aria-hidden="true" /></button>
    </header>
    <div className="commercial-dashboard-sales-summary__metrics">
      <div className="commercial-dashboard-sales-summary__total">
        <strong key={totals?.total ?? 'unavailable'} className="commercial-dashboard-sales-summary__value">{value(totals?.total)}</strong>
        <span>Registros de venda</span>
      </div>
      <div className="commercial-dashboard-sales-summary__signature commercial-dashboard-sales-summary__signature--pending">
        <PendingSignatureGlyph className="commercial-dashboard-sales-summary__signature-icon" />
        <strong key={totals?.pending ?? 'unavailable'} className="commercial-dashboard-sales-summary__value">{value(totals?.pending)}</strong>
        <span>Aguardando assinatura</span>
      </div>
      <div className="commercial-dashboard-sales-summary__signature commercial-dashboard-sales-summary__signature--signed">
        <ConfirmedSealGlyph className="commercial-dashboard-sales-summary__signature-icon" />
        <strong key={totals?.signed ?? 'unavailable'} className="commercial-dashboard-sales-summary__value">{value(totals?.signed)}</strong>
        <span>Assinatura confirmada</span>
      </div>
    </div>
    <p className="commercial-dashboard-sales-summary__status" role="status" data-visible={status ? 'true' : 'false'}>{status ?? '\u00a0'}</p>
  </section>;
}
