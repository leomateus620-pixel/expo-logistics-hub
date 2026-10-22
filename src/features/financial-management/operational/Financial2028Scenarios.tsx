import { useMemo, useState } from "react";
import {
  AlertTriangle,
  RefreshCw,
  Target,
  ArrowRight,
  WalletCards,
  ReceiptText,
  Scale,
} from "lucide-react";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import type { FinancialEdition } from "./financialOperationalApi";
import { useFinancialScenarios } from "./useFinancialScenarios";
import { ScenarioReadError } from "./financialScenariosApi";
import {
  basisLabels,
  scenarioLabels,
  currentLabels,
  type ScenarioBasis,
  type ScenarioKey,
  type CategoryKey,
} from "./financialScenariosTypes";
import { money, progress, scenarioModel } from "./financialScenariosMath";
import {
  Financial2028Loading,
  Financial2028State,
} from "./Financial2028Presentation";
import { ScenarioComparison } from "./scenarios/ScenarioComparison";
import { ScenarioCharts } from "./scenarios/ScenarioCharts";
import { ScenarioInfo, ScenarioProgress } from "./scenarios/ScenarioMetricRow";
import {
  issueLabels,
  ScenarioSourceDetails,
  sourceLabels,
} from "./scenarios/ScenarioSourceDetails";
import "@/styles/financial-operational-2028-scenarios.css";
import { scenarioVisuals } from "./scenarios/scenarioVisuals";
import { ScenarioEmblem } from "./scenarios/ScenarioEmblem";

export function Financial2028Scenarios({
  edition,
}: {
  edition: FinancialEdition;
}) {
  const { orgId } = useCurrentOrg();
  const [emblemActive, setEmblemActive] = useState(true);
  const [basis, setBasis] = useState<ScenarioBasis>("portfolio"),
    [focus, setFocus] = useState<ScenarioKey | null>(null),
    [category, setCategory] = useState<CategoryKey | null>(null);
  const query = useFinancialScenarios(orgId!, edition.id, basis),
    data = query.data;
  const models = useMemo(
    () => data?.scenarios.map((s) => scenarioModel(data, s)) ?? [],
    [data],
  );
  const next = models.find((m) => !m.total.achieved),
    selected = focus ?? next?.s.key ?? "optimistic";
  const error = query.error instanceof ScenarioReadError ? query.error : null;
  return (
    <section className="fsc" data-active-scenario={selected}>
      <header className="fsc-hero">
        <ScenarioEmblem active={emblemActive} />
        <div className="fsc-hero__identity">
          <p>
            FINANCEIRO <span>/ 2028</span>
          </p>
          <div className="fsc-hero__title">
            <h1>
              Simulações<span className="fsc-title-stop">.</span>
            </h1>
            <ScenarioInfo
              label="Sobre as Simulações e as bases de acompanhamento"
              hover
            >
              <h2>Uma referência fixa. A operação em movimento.</h2>
              <p>
                Compare as metas oficiais dos três cenários com os registros
                atuais. Vendas, preços e atualizações não alteram as metas.
              </p>
              <p>
                <strong>Carteira:</strong> confirmadas e em andamento.{" "}
                <strong>Confirmado:</strong> compromissos comprovados.{" "}
                <strong>Caixa:</strong> movimentos financeiros líquidos, com a
                cobertura informada.
              </p>
              <p>
                As três notas ilustrativas (US$ 10, US$ 20 e US$ 100)
                representam os cenários. Não são metas em dólar nem uma
                conversão cambial. Todos os valores operacionais continuam em
                reais.
              </p>
              <p>
                Todos os indicadores compartilham a mesma fotografia.
                Atualização a cada dez minutos enquanto a tela está visível.
              </p>
              <button
                type="button"
                className="fsc-motion-toggle"
                aria-pressed={emblemActive}
                onClick={() => setEmblemActive((a) => !a)}
              >
                {emblemActive
                  ? "Pausar movimento do emblema"
                  : "Ativar movimento do emblema"}
              </button>
            </ScenarioInfo>
          </div>
        </div>
        <div className="fsc-hero__tools">
          <label>
            Base de acompanhamento
            <select
              value={basis}
              onChange={(e) => setBasis(e.target.value as ScenarioBasis)}
            >
              {Object.entries(basisLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {k === "portfolio"
                    ? "Carteira"
                    : k === "cash"
                      ? "Caixa registrado"
                      : v}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span>
              {data
                ? `Atualizado ${new Date(data.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`
                : "Aguardando consulta"}
            </span>
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              aria-label="Atualizar fotografia financeira"
            >
              <RefreshCw size={16} aria-hidden="true" />
              {query.isFetching ? "Atualizando…" : "Atualizar"}
            </button>
          </div>
        </div>
      </header>
      {query.isPending ? (
        <Financial2028Loading label="Consultando metas e operação na mesma fotografia…" />
      ) : !data ? (
        <Financial2028State
          tone={error?.kind === "forbidden" ? "locked" : "error"}
          title={
            error?.kind === "forbidden"
              ? "Acesso financeiro restrito"
              : error?.kind === "not_activated"
                ? "Consulta ainda não ativada"
                : error?.kind === "scope"
                  ? "Vínculo de fontes pendente"
                  : "Não foi possível abrir Simulações"
          }
          retry={() => void query.refetch()}
        >
          {query.error?.message}
        </Financial2028State>
      ) : (
        <>
          {query.isError && (
            <div className="fsc-warning" role="alert">
              <AlertTriangle size={18} />
              <span>
                <strong>Desatualizado.</strong> Última fotografia válida
                preservada. {query.error.message}
              </span>
            </div>
          )}
          <div className="fsc-context">
            <span>
              <Target size={17} /> Próximo marco de captação
            </span>
            <strong>
              {next
                ? `${scenarioLabels[next.s.key]} · faltam ${money(next.total.missing)}`
                : "Todas as metas globais de receitas atingidas"}
            </strong>
            <ScenarioInfo label="Como funciona a progressão dos cenários">
              <p>
                O próximo marco é o primeiro alvo global de receitas ainda não
                atingido. A seleção manual é preservada nas atualizações.
              </p>
              <p>
                Cenário completo também exige cada categoria obrigatória,
                orçamento respeitado, reserva e cobertura suficientes. Despesas
                não precisam chegar a 100%.
              </p>
            </ScenarioInfo>
          </div>
          <div
            className="fsc-milestones"
            role="group"
            aria-label="Selecionar cenário em foco"
          >
            {models.map((m, i) => (
              <button
                type="button"
                key={m.s.key}
                data-scenario={m.s.key}
                aria-pressed={selected === m.s.key}
                onClick={() => setFocus(m.s.key)}
              >
                <span>
                  <i className="fsc-milestone-icon">
                    {(() => {
                      const Icon = scenarioVisuals[m.s.key].Icon;
                      return <Icon size={20} aria-hidden="true" />;
                    })()}
                  </i>
                  <strong>{scenarioLabels[m.s.key]}</strong>
                  <ArrowRight size={16} />
                </span>
                <b aria-label={money(m.s.targets.revenue_total)}>
                  <span className="fsc-amount-full">
                    {money(m.s.targets.revenue_total)}
                  </span>
                  <span className="fsc-amount-compact" aria-hidden="true">
                    R${" "}
                    {(
                      Number(m.s.targets.revenue_total) / 100000000
                    ).toLocaleString("pt-BR", {
                      maximumFractionDigits: 2,
                    })}{" "}
                    mi
                  </span>
                </b>
                <ScenarioProgress
                  label={`Captação ${scenarioLabels[m.s.key]}`}
                  current={BigInt(data.totals.revenueCents)}
                  target={BigInt(m.s.targets.revenue_total)}
                  tone={m.total.achieved ? "success" : "neutral"}
                />
                <small>
                  {m.total.achieved
                    ? "Meta de receitas atingida"
                    : `${progress(BigInt(data.totals.revenueCents), BigInt(m.s.targets.revenue_total)).percentage?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da meta`}
                </small>
              </button>
            ))}
          </div>

          <ScenarioComparison
            data={data}
            selected={selected}
            onSelect={setFocus}
            onCategory={setCategory}
          />
          <div className="fsc-summary">
            <div data-summary="revenue">
              <WalletCards className="fsc-summary-icon" aria-hidden="true" />
              <span>{currentLabels[basis]}</span>
              <strong>{money(data.totals.revenueCents)}</strong>
              <small>Receitas elegíveis e deduplicadas</small>
            </div>
            <div data-summary="expense">
              <ReceiptText className="fsc-summary-icon" aria-hidden="true" />
              <span>
                {basis === "portfolio"
                  ? "Despesas cadastradas — previstas + realizadas"
                  : basis === "confirmed"
                    ? "Despesas comprometidas"
                    : "Pagamentos líquidos"}
              </span>
              <strong>{money(data.totals.expenseCents)}</strong>
              <small>Um valor vigente por fato</small>
            </div>
            <div data-summary="balance">
              <Scale className="fsc-summary-icon" aria-hidden="true" />
              <span>
                {basis === "cash"
                  ? "Caixa formado no recorte"
                  : "Saldo projetado da base"}
              </span>
              <strong>{money(data.totals.balanceBeforeReserveCents)}</strong>
              <small>Receitas − despesas · antes da reserva</small>
            </div>
          </div>

          {BigInt(data.totals.otherRevenueCents) !== 0n && (
            <div className="fsc-other">
              <button onClick={() => setCategory("other_revenue")}>
                Outras receitas sem meta
              </button>
              <strong>{money(data.totals.otherRevenueCents)}</strong>
              <span>
                Incluídas no consolidado; classificação pendente não é
                redistribuída.
              </span>
            </div>
          )}
          <ScenarioCharts
            data={data}
            selected={selected}
            onCategory={setCategory}
          />
          <details className="fsc-coverage">
            <summary>
              Fontes, cobertura e proveniência{" "}
              <span>
                {data.coverage.complete
                  ? "Recorte conciliado"
                  : "Dados incompletos"}
              </span>
            </summary>
            <p>
              Geração {data.generation} · cálculo {data.calculationVersion} ·
              atualização da interface a cada dez minutos enquanto visível.
              Coleta histórica independente no servidor.
            </p>
            <p>
              {data.coverage.issueCount} componentes com pendências de cobertura
              · {data.coverage.unreconciledCommercialPayments} baixas comerciais
              sem conciliação financeira.{" "}
              {basis === "cash"
                ? "Caixa financeiro registrado, sem saldo inicial comprovado; não representa o saldo bancário completo."
                : ""}
            </p>
            <p>
              Não classificados, fora das metas e do consolidado comercial:{" "}
              {money(data.totals.unclassifiedCents)}. Taxas sem rateio confiável
              aparecem separadamente.
            </p>
            <div className="fsc-table-scroll">
              <table>
                <caption>Cobertura integral das fontes</caption>
                <thead>
                  <tr>
                    <th>Fonte</th>
                    <th>Fatos</th>
                    <th>Valor</th>
                    <th>Limitação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sourceCoverage.map((s, i) => (
                    <tr key={i}>
                      <th>{sourceLabels[s.source] ?? s.source}</th>
                      <td>{s.count}</td>
                      <td>{money(s.amountCents)}</td>
                      <td>
                        {s.issue
                          ? (issueLabels[s.issue] ?? s.issue)
                          : "Conciliado"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Referência: WhatsApp Image 2026-10-21 at 17.30.11 (1).jpeg. As
              metas não mudam com vendas, preços ou refresh. Futuras revisões
              exigem nova versão autorizada e auditada.
            </p>
          </details>
          <ScenarioSourceDetails
            data={data}
            category={category}
            onClose={() => setCategory(null)}
          />
        </>
      )}
    </section>
  );
}
