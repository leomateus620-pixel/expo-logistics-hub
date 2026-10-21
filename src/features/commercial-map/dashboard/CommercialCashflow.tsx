import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OverviewInfo } from "./CommercialDashboardOverviewInfo";
import {
  useCommercialSalesAnalytics,
  analyticsKey,
} from "./salesOrders/useCommercialSalesAnalytics";
import {
  analyticsPermissionError,
  fetchCashflowMonth,
  fetchSignatureDetails,
  moneyCents,
  monthLabel,
  signatureDuration,
  totalsFor,
  type CashflowBasis,
  type CashflowValues,
  type AnalyticsPage,
  type CashflowDetail,
  type SignatureDetail,
} from "./salesOrders/commercialSalesAnalytics";
import { signatureExclusionLabel } from "./CommercialSalesAnalyticsCards";

export interface CashflowMemory {
  month: string | null;
  basis: CashflowBasis;
  allDates: boolean;
  year: string | null;
  page: number;
}
const defaultRange = (month: string) =>
  month >= "2026-12-01" && month <= "2028-04-01";
const dateLabel = (date: string) =>
  date.slice(0, 10).split("-").reverse().join("/");
const methodLabel = (method: string) =>
  (
    ({
      PIX: "Pix",
      BOLETO: "Boleto",
      BANK_SLIP: "Boleto",
      CASH: "Dinheiro",
      TRANSFER: "Transferência",
    }) as Record<string, string>
  )[method] ?? method;
function Values({ value }: { value: CashflowValues }) {
  return (
    <dl className="commercial-dashboard-cashflow-values">
      <div>
        <dt>Previsto coberto</dt>
        <dd>{moneyCents(value.scheduledCents)}</dd>
      </div>
      <div data-tone="paid">
        <dt>Baixas registradas</dt>
        <dd>{moneyCents(value.paidCents)}</dd>
      </div>
      <div>
        <dt>A receber</dt>
        <dd>{moneyCents(value.outstandingCents)}</dd>
      </div>
      <div data-tone="overdue">
        <dt>Vencido em aberto</dt>
        <dd>{moneyCents(value.overdueCents)}</dd>
      </div>
    </dl>
  );
}
export function CommercialAnalyticsView({
  projectId,
  orgId,
  signature,
  memory,
  setMemory,
  onBack,
  onOpenSale,
}: {
  projectId: string;
  orgId: string | null;
  signature: boolean;
  memory: CashflowMemory;
  setMemory: (m: CashflowMemory) => void;
  onBack: () => void;
  onOpenSale: (id: string) => void;
}) {
  const { data, state, refresh } = useCommercialSalesAnalytics();
  const client = useQueryClient();
  const head = useRef<HTMLHeadingElement>(null);
  const [signaturePage, setSignaturePage] = useState(0);
  useEffect(() => {
    head.current?.focus({ preventScroll: true });
  }, [signature]);
  const months =
    data?.months.filter((m) => memory.allDates || defaultRange(m.month)) ?? [];
  const years = [...new Set(months.map((m) => m.month.slice(0, 4)))];
  const year =
    memory.year && years.includes(memory.year) ? memory.year : years[0];
  const current =
    months.find((m) => m.month === memory.month) ??
    months.find((m) => m.month.startsWith(year ?? ""));
  const page = signature ? signaturePage : memory.page;
  const query = useQuery<AnalyticsPage<CashflowDetail | SignatureDetail>>({
    queryKey: [
      ...analyticsKey(projectId, orgId),
      "detail",
      signature ? "signature" : current?.month,
      data?.generation,
      page,
    ],
    queryFn: ({ signal }) =>
      signature
        ? fetchSignatureDetails(projectId, data!.generation, page, signal)
        : fetchCashflowMonth(
            projectId,
            current!.month,
            data!.generation,
            page,
            signal,
          ),
    enabled: Boolean(data && state !== "restricted" && (signature || current)),
    staleTime: 30_000,
    retry: false,
    meta: { persist: false },
  });
  useEffect(() => {
    if (analyticsPermissionError(query.error)) {
      // A denial in any protected detail invalidates the whole cached generation.
      client.setQueryData(analyticsKey(projectId, orgId), {
        data: null,
        restricted: true,
      });
    } else if ((query.error as Error)?.message?.includes("ANALYTICS_CHANGED"))
      refresh();
  }, [query.error, client, projectId, orgId]);
  const setPage = (page: number) =>
    signature ? setSignaturePage(page) : setMemory({ ...memory, page });
  const selected = current?.[memory.basis];
  return (
    <section
      className="commercial-dashboard-overview commercial-dashboard-cashflow"
      aria-label={
        signature
          ? "Detalhamento do tempo de assinatura"
          : "Fluxo de caixa comercial"
      }
    >
      <header className="commercial-dashboard-cashflow__header">
        <button
          type="button"
          aria-label="Voltar à visão geral"
          onClick={onBack}
        >
          ← Voltar à visão geral
        </button>
        <div>
          <span className="commercial-dashboard-eyebrow">
            Fenasoja 2028 · gestão de vendas
          </span>
          <h2 ref={head} tabIndex={-1}>
            {signature
              ? "Tempo médio de assinatura"
              : "Fluxo de caixa comercial"}
          </h2>
          <p>
            {signature
              ? "Do registro da venda à confirmação da assinatura no sistema"
              : "Entradas previstas das vendas confirmadas"}
          </p>
        </div>
        <OverviewInfo
          label="Ajuda sobre os cálculos comerciais"
          title={signature ? "Uma amostra por venda" : "Bases e reconciliação"}
          lead={
            signature
              ? "A média usa segundos corridos, calculados antes do arredondamento. O pedido conclui quando todos os itens aplicáveis têm assinatura comprovada."
              : "Principal dos lotes mantém a base negociada do card. Cobrança com taxas inclui somente taxas comprovadas de pedidos totalmente assinados."
          }
          note={
            signature
              ? "Revisões com assinatura herdada, cancelamentos, legado e timestamps inválidos não fabricam conclusões."
              : "Rateio analítico: cada parcela distribui centavos proporcionalmente aos saldos dos componentes, com maiores restos e desempate por ID; a última consome o saldo. Conserva margens de parcelas e itens. Pedido parcial inclui só itens assinados e exclui taxas sem atribuição comprovada. Baixas integrais usam o estado da parcela; não há quitação parcial comprovada nessa fonte."
          }
        />
      </header>
      {state === "restricted" ? (
        <p role="alert">Acesso restrito à gestão de vendas.</p>
      ) : !data ? (
        <p role="status">
          {state === "loading"
            ? "Carregando dados persistidos…"
            : "Não foi possível consultar os dados."}
        </p>
      ) : (
        <>
          <p className="commercial-dashboard-cashflow__updated">
            Dados de{" "}
            {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
            }).format(new Date(data.generatedAt))}{" "}
            · Referência {dateLabel(data.referenceDate)}
          </p>
          {state === "stale" && (
            <p role="status" className="commercial-dashboard-analytics-notice">
              Atualização pendente. Exibindo a última geração conciliada.
            </p>
          )}
          {signature ? (
            <>
              <div className="commercial-dashboard-cashflow__signature-total">
                <strong>
                  {signatureDuration(data.signature.averageSeconds)}
                </strong>
                <span>
                  {data.signature.count
                    ? `Calculado com ${data.signature.count} vendas`
                    : "Sem histórico suficiente"}
                </span>
              </div>
              <dl className="commercial-dashboard-cashflow__exclusions">
                {Object.entries(data.signature.exclusions).map(
                  ([reason, count]) => (
                    <div key={reason}>
                      <dt>{signatureExclusionLabel(reason)}</dt>
                      <dd>{count}</dd>
                    </div>
                  ),
                )}
              </dl>
            </>
          ) : (
            <>
              <fieldset className="commercial-dashboard-cashflow__basis">
                <legend>Base dos valores</legend>
                {(["principal", "charge"] as const).map((basis) => (
                  <button
                    type="button"
                    key={basis}
                    aria-pressed={memory.basis === basis}
                    onClick={() => setMemory({ ...memory, basis })}
                  >
                    {basis === "principal"
                      ? "Principal dos lotes"
                      : "Cobrança com taxas"}
                  </button>
                ))}
              </fieldset>
              <Values value={totalsFor(months, memory.basis)} />
              <details className="commercial-dashboard-cashflow__reconciliation">
                <summary>Reconciliação e cobertura</summary>
                <dl>
                  <div>
                    <dt>Principal confirmado conhecido</dt>
                    <dd>{moneyCents(data.reconciliation.confirmedCents)}</dd>
                  </div>
                  <div>
                    <dt>Principal com distribuição mensal</dt>
                    <dd>{moneyCents(data.reconciliation.coveredCents)}</dd>
                  </div>
                  <div>
                    <dt>Sem distribuição mensal</dt>
                    <dd>
                      {moneyCents(data.reconciliation.undistributedCents)} ·{" "}
                      {data.reconciliation.undistributedOrders} pedidos com
                      pendência
                    </dd>
                  </div>
                  <div>
                    <dt>Taxas incluídas / excluídas</dt>
                    <dd>
                      {moneyCents(data.reconciliation.includedFeesCents)} /{" "}
                      {moneyCents(data.reconciliation.excludedFeesCents)}
                    </dd>
                  </div>
                  <div>
                    <dt>Vendas sem valor conhecido</dt>
                    <dd>{data.reconciliation.unknownSaleValues}</dd>
                  </div>
                  <div>
                    <dt>Baixas sem data de ocorrência</dt>
                    <dd>{data.reconciliation.paidWithoutDate}</dd>
                  </div>
                </dl>
                <p>
                  Vencido é parte do saldo a receber. Esta visão acompanha
                  entradas comerciais; não calcula saldo líquido de caixa.
                  Baixas abaixo são agrupadas pelo vencimento da parcela; a
                  ocorrência real aparece no detalhamento.
                </p>
                {data.receiptsByOccurrence.length > 0 && (
                  <ul>
                    {data.receiptsByOccurrence.map((r) => (
                      <li key={r.month}>
                        Baixas ocorridas em {monthLabel(r.month)}:{" "}
                        {moneyCents(
                          memory.basis === "principal"
                            ? r.principalCents
                            : r.chargeCents,
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {data.issues.map((i) => (
                  <p key={i.orderId}>
                    Venda {i.orderId.slice(0, 8).toUpperCase()} ·{" "}
                    {i.reason
                      ? `Distribuição pendente (${i.reason})`
                      : "Pedido parcialmente assinado · rateio analítico"}
                  </p>
                ))}
              </details>
              {data.months.some((m) => !defaultRange(m.month)) && (
                <button
                  type="button"
                  aria-pressed={memory.allDates}
                  onClick={() =>
                    setMemory({
                      ...memory,
                      allDates: !memory.allDates,
                      year: null,
                      month: null,
                      page: 0,
                    })
                  }
                >
                  {memory.allDates
                    ? "Mostrar dezembro/2026 a abril/2028"
                    : "Há parcelas fora do período padrão · Ver toda a série"}
                </button>
              )}
              <nav
                aria-label="Anos do fluxo comercial"
                className="commercial-dashboard-cashflow__years"
              >
                {years.map((y) => (
                  <button
                    type="button"
                    key={y}
                    aria-pressed={y === year}
                    onClick={() =>
                      setMemory({
                        ...memory,
                        year: y,
                        month:
                          months.find((m) => m.month.startsWith(y))?.month ??
                          null,
                        page: 0,
                      })
                    }
                  >
                    {y}
                    <small>
                      {moneyCents(
                        totalsFor(
                          months.filter((m) => m.month.startsWith(y)),
                          memory.basis,
                        ).outstandingCents,
                      )}
                    </small>
                  </button>
                ))}
              </nav>
              <h3 className="commercial-dashboard-cashflow__year">
                {year} <small>A receber</small>
              </h3>
              <div className="commercial-dashboard-cashflow__months">
                {months
                  .filter((m) => m.month.startsWith(year ?? ""))
                  .map((m) => (
                    <button
                      type="button"
                      key={m.month}
                      aria-pressed={current?.month === m.month}
                      onClick={() =>
                        setMemory({
                          ...memory,
                          month: m.month,
                          year: m.month.slice(0, 4),
                          page: 0,
                        })
                      }
                    >
                      <span>{monthLabel(m.month).split(" de ")[0]}</span>
                      <strong>
                        {moneyCents(m[memory.basis].outstandingCents)}
                      </strong>
                      <small>
                        {m.installments} parcelas
                        {m.analyticInstallments ? " · rateio analítico" : ""}
                      </small>
                      {m[memory.basis].overdueCents > 0 && (
                        <small data-tone="overdue">
                          Vencido: {moneyCents(m[memory.basis].overdueCents)}
                        </small>
                      )}
                    </button>
                  ))}
              </div>
              <h3>
                {current ? monthLabel(current.month) : "Detalhamento mensal"}
              </h3>
              {selected && <Values value={selected} />}
            </>
          )}
          {query.isError ? (
            <p role="alert">
              {(query.error as Error)?.message?.includes("ANALYTICS_CHANGED")
                ? "Os dados mudaram. Atualizando a geração…"
                : "Não foi possível consultar o detalhamento."}{" "}
              <button
                type="button"
                onClick={() => {
                  refresh();
                  void query.refetch();
                }}
              >
                Tentar novamente
              </button>
            </p>
          ) : query.isPending ? (
            <p role="status">Carregando detalhamento…</p>
          ) : (
            <>
              <div className="commercial-dashboard-cashflow__details">
                {query.data?.rows.map((row) =>
                  "order_id" in row ? (
                    <article key={row.order_id}>
                      <button
                        type="button"
                        data-analytics-sale={row.order_id}
                        onClick={() => onOpenSale(row.order_id)}
                      >
                        {row.reference} ↗
                      </button>
                      <dl>
                        <div>
                          <dt>Registro</dt>
                          <dd>
                            {new Date(row.registered_at).toLocaleString(
                              "pt-BR",
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Confirmação</dt>
                          <dd>
                            {new Date(row.completed_at).toLocaleString("pt-BR")}
                          </dd>
                        </div>
                        <div>
                          <dt>Duração</dt>
                          <dd>{signatureDuration(row.seconds)}</dd>
                        </div>
                      </dl>
                    </article>
                  ) : (
                    <article key={row.id}>
                      <div>
                        <button
                          type="button"
                          data-analytics-sale={row.orderId}
                          onClick={() => onOpenSale(row.orderId)}
                        >
                          {row.reference} ↗
                        </button>
                        <span>
                          Parcela {row.number} · {methodLabel(row.method)}
                        </span>
                      </div>
                      <dl>
                        <div>
                          <dt>Vencimento</dt>
                          <dd>{dateLabel(row.dueDate)}</dd>
                        </div>
                        <div>
                          <dt>Previsto</dt>
                          <dd>
                            {moneyCents(
                              memory.basis === "principal"
                                ? row.principalCents
                                : row.chargeCents,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Situação</dt>
                          <dd>
                            {row.status === "PAID"
                              ? `Baixa registrada${row.paidAt ? ` em ${new Date(row.paidAt).toLocaleDateString("pt-BR")}` : " · sem data"}`
                              : row.dueDate < data.referenceDate
                                ? "Vencida em aberto"
                                : "A receber"}
                          </dd>
                        </div>
                      </dl>
                      {row.analytic && (
                        <small>
                          Rateio analítico de pedido parcialmente assinado
                        </small>
                      )}
                    </article>
                  ),
                )}
              </div>
              {query.data?.total === 0 && (
                <p>Nenhum registro elegível neste recorte.</p>
              )}
              <nav
                aria-label="Paginação do detalhamento"
                className="commercial-dashboard-cashflow__pagination"
              >
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </button>
                <span>
                  Página {page + 1} · {query.data?.total ?? 0} registros
                </span>
                <button
                  type="button"
                  disabled={(page + 1) * 20 >= (query.data?.total ?? 0)}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                </button>
              </nav>
            </>
          )}
        </>
      )}
    </section>
  );
}
