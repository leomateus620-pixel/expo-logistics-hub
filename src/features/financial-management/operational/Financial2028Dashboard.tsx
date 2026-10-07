import { useQuery } from '@tanstack/react-query';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { formatCents } from '@/features/commercial-map/sales/salesMoney';
import { fetchEditionSummary, type FinancialEdition } from './financialOperationalApi';
import { Financial2028Composition, Financial2028Loading, Financial2028Metric, Financial2028Panel, Financial2028State } from './Financial2028Presentation';

export function DashboardView({ edition }: { edition: FinancialEdition }) {
  const { orgId } = useCurrentOrg();
  const query = useQuery({ queryKey: ['financial-operational', 'summary', edition.id], queryFn: () => fetchEditionSummary(orgId as string, edition.id), enabled: Boolean(orgId) });
  if (query.isLoading) return <Financial2028Loading label="Consolidando a edição…" />;
  if (!query.data) return <Financial2028State tone="error" title="Não foi possível consolidar os valores." retry={() => void query.refetch()}>Os totais ficam indisponíveis até a consulta responder.</Financial2028State>;
  const s = query.data;
  const hasExpenseExecution = s.expenses != null;
  // Preserve the original compatibility calculations using the server summary only.
  const exp = s.expenses ?? { count: 0, planned_cents: 0, committed_cents: 0, paid_cents: s.obligations.paid_cents, payable_open_cents: s.obligations.payable_open_cents, overdue_count: 0 };
  const rev = s.revenues ?? { projected_cents: s.revenue.projected_cents + s.sponsorship.projected_cents, confirmed_cents: s.revenue.confirmed_cents + s.sponsorship.confirmed_cents, received_cents: s.obligations.received_cents, receivable_open_cents: s.obligations.receivable_open_cents, overdue_count: 0 };
  return <div className="f28-stack" aria-label="Painel financeiro 2028" aria-busy={query.isFetching}>
    {query.isError && <Financial2028State tone="error" title="A atualização falhou. Os últimos valores consultados permanecem visíveis." retry={() => void query.refetch()} />}
    <div className="f28-executive">
      <section className="f28-executive__revenue" aria-labelledby="f28-revenue-heading">
        <h2 id="f28-revenue-heading" className="f28-group-label">Receitas e patrocínios</h2>
        <div className="f28-metrics f28-metrics--two">
          <Financial2028Metric label="Projetado" value={rev.projected_cents} hint="Expectativa de entrada" tone="indigo" priority />
          <Financial2028Metric label="Confirmado" value={rev.confirmed_cents} hint="Compromisso confirmado · ainda não é caixa" tone="success" priority />
          <Financial2028Metric label="Recebido" value={rev.received_cents} hint="Recebimentos registrados" tone="success" />
          <Financial2028Metric label="Saldo a receber" value={rev.receivable_open_cents} hint={`Confirmado − recebido${rev.overdue_count ? ` · ${rev.overdue_count} vencidas` : ''}`} tone="gold" />
        </div>
      </section>
      <section aria-labelledby="f28-expense-heading">
        <h2 id="f28-expense-heading" className="f28-group-label">Despesas</h2>
        <div className="f28-metrics f28-metrics--two">
          <Financial2028Metric label="Previsto" value={hasExpenseExecution ? exp.planned_cents : null} hint="Estimativa das despesas" tone="indigo" priority />
          <Financial2028Metric label="Realizado / comprometido" value={hasExpenseExecution ? exp.committed_cents : null} hint="Dívida existente · paga ou não" priority />
        </div>
      </section>
      <section aria-labelledby="f28-budget-heading">
        <h2 id="f28-budget-heading" className="f28-group-label">Orçamento</h2>
        <div className="f28-metrics f28-metrics--two">
          <Financial2028Metric label="Teto orçamentário" value={s.budget.cap_cents} hint={`${s.budget.count} comissões${s.budget.uncapped_count ? ` · ${s.budget.uncapped_count} sem teto` : ''}`} priority />
          <Financial2028Metric label="Planejado (linhas)" value={s.budget.planned_cents} hint={`${s.budget.line_count} linhas ativas`} tone="indigo" priority />
        </div>
      </section>
    </div>
    <section aria-labelledby="f28-followup-heading">
      <h2 id="f28-followup-heading" className="f28-group-label">Liquidação e acompanhamento orçamentário</h2>
      <div className="f28-metrics">
        <Financial2028Metric label="Pago" value={exp.paid_cents} hint="Caixa · pagamentos registrados" tone="success" />
        <Financial2028Metric label="Saldo a pagar" value={exp.payable_open_cents} hint={`Realizado − pago${exp.overdue_count ? ` · ${exp.overdue_count} vencidas` : ''}`} tone="gold" />
        <Financial2028Metric label="Orçamento executado" value={hasExpenseExecution ? exp.committed_cents : null} hint="Realizado, independente do pagamento" />
        <Financial2028Metric label="Folga do orçamento" value={hasExpenseExecution ? s.budget.planned_cents - exp.committed_cents : null} hint="Planejado − realizado · não é saldo a pagar" tone="gold" />
      </div>
    </section>
    {!hasExpenseExecution && <Financial2028State tone="info" title="Consolidação de despesas não fornecida pela fonte">Previsto, realizado e folga ficam indisponíveis. Pagamentos e saldo a pagar continuam usando os valores das obrigações consolidadas.</Financial2028State>}
    {s.obligations.inconsistent_count ? <Financial2028State tone="error" title={`${s.obligations.inconsistent_count} registro(s) cancelado(s) com valor já liquidado`}>Registre o estorno ou a devolução; o valor pago/recebido não é apagado.</Financial2028State> : null}
    <div className="f28-analytics">
      <Financial2028Composition title="Planejamento e execução" description="Mesma escala monetária. Planejado vem das linhas; realizado vem das despesas." items={[
        { label: 'Orçamento planejado', value: s.budget.planned_cents, tone: 'indigo' },
        ...(hasExpenseExecution ? [
          { label: 'Despesas previstas', value: exp.planned_cents, tone: 'gold' as const },
          { label: 'Despesas realizadas', value: exp.committed_cents, tone: 'neutral' as const },
        ] : []),
        { label: 'Despesas pagas', value: exp.paid_cents, tone: 'success' },
      ]} />
      <Financial2028Composition title="Da expectativa ao caixa" description="Etapas comparáveis, sem somar valores do mesmo compromisso." items={[
        { label: 'Receitas projetadas', value: rev.projected_cents, tone: 'indigo' },
        { label: 'Receitas confirmadas', value: rev.confirmed_cents, tone: 'gold' },
        { label: 'Receitas recebidas', value: rev.received_cents, tone: 'success' },
      ]} />
    </div>
    <Financial2028Panel title="Abrangência da consolidação" description="Totais canônicos da edição, calculados no servidor e independentes dos recortes das listas.">
      <dl className="f28-provenance">
        <div><dt>Receitas manuais</dt><dd>{s.revenue.count} registros</dd></div>
        <div><dt>Carteira de patrocínios</dt><dd>{s.sponsorship.count} registros</dd></div>
        <div><dt>Movimentos de caixa</dt><dd>{s.movements.count} registros</dd></div>
        <div><dt>Contrapartidas não financeiras</dt><dd>{formatCents(s.sponsorship.in_kind_cents)}</dd></div>
      </dl>
      <p className="f28-note">Contrapartidas em bens ou serviços ficam fora dos totais em dinheiro. A comercialização de lotes aparece pela Dashboard Comercial, com as mesmas regras de cálculo.</p>
    </Financial2028Panel>
  </div>;
}
