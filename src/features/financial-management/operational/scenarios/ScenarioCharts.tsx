import { useMemo } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  currentLabels,
  scenarioLabels,
  type CategoryKey,
  type ScenarioOverview,
  type ScenarioKey,
} from "../financialScenariosTypes";
import {
  civilToday,
  forecast,
  money,
  progress,
  scenarioModel,
} from "../financialScenariosMath";
import { FENASOJA_2028_COLORS } from "@/lib/fenasoja-brand";
import { ScenarioInfo } from "./ScenarioMetricRow";
import { ScenarioRevenueMosaic } from "./ScenarioRevenueMosaic";
import { ScenarioTargetComparison } from "./ScenarioTargetComparison";

function Magnitude({
  value,
  maximum,
  tone = "current",
}: {
  value: bigint;
  maximum: bigint;
  tone?: string;
}) {
  const width =
    maximum > 0n
      ? Number(((value < 0n ? -value : value) * 10000n) / maximum) / 100
      : 0;
  return (
    <div className="fsc-magnitude" data-tone={tone} aria-hidden="true">
      <span style={{ width: `${Math.min(100, width)}%` }} />
    </div>
  );
}
export function ScenarioCharts({
  data,
  selected,
  onCategory,
}: {
  data: ScenarioOverview;
  selected: ScenarioKey;
  onCategory: (key: CategoryKey) => void;
}) {
  const s = data.scenarios.find((s) => s.key === selected)!,
    m = scenarioModel(data, s),
    current = BigInt(data.totals.revenueCents);
  const max = [
    current,
    ...data.scenarios.map((s) => BigInt(s.targets.revenue_total)),
  ].reduce((a, b) => (a > b ? a : b), 0n);
  const bridge = [
    { label: "Receitas", value: current },
    { label: "Despesas", value: -BigInt(data.totals.expenseCents) },
    { label: "Saldo antes da reserva", value: m.balance },
    { label: "Reserva formada · alocação", value: -m.reserveFormed },
    { label: "Capacidade após reserva alvo", value: m.capacity },
  ];
  const bridgeMax = bridge.reduce(
    (a, b) =>
      a > (b.value < 0n ? -b.value : b.value)
        ? a
        : b.value < 0n
          ? -b.value
          : b.value,
    0n,
  );
  const history = useMemo<
    Array<{ date: string; observed: number | null; estimated: number | null }>
  >(
    () =>
      data.history.map((h) => ({
        date: h.date,
        observed: h.coverageComplete
          ? Number(BigInt(h.revenueCents)) / 100
          : null,
        estimated: null as number | null,
      })),
    [data.history],
  );
  const chartData = [...history];
  if (m.forecast.state === "estimated" && history.length) {
    chartData[chartData.length - 1] = {
      ...chartData.at(-1)!,
      estimated: Number(current) / 100,
    };
    chartData.push({
      date: m.forecast.estimatedOn,
      observed: null,
      estimated: Number(BigInt(s.targets.revenue_total)) / 100,
    });
  }
  const dateLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return (
    <section className="fsc-charts" aria-label="Análises da mesma fotografia">
      <article className="fsc-chart fsc-chart--wide fsc-evolution">
        <h2>Evolução geral por cenário</h2>
        <p>O acumulado é o mesmo. A meta muda.</p>
        {data.scenarios.map((s) => (
          <div className="fsc-chart-row" key={s.key}>
            <div>
              <strong>{scenarioLabels[s.key]}</strong>
              <span>
                {progress(
                  current,
                  BigInt(s.targets.revenue_total),
                ).percentage?.toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}
                % da meta
              </span>
            </div>
            <Magnitude
              value={BigInt(s.targets.revenue_total)}
              maximum={max}
              tone="target"
            />
            <Magnitude value={current} maximum={max} />
            <small>
              {currentLabels[data.basis]} {money(current)} · Meta{" "}
              {money(s.targets.revenue_total)}
            </small>
          </div>
        ))}
        <div className="fsc-chart-legend">
          <span>Azul: atual</span>
          <span>Dourado: meta · escala comum em BRL</span>
        </div>
      </article>
      <ScenarioRevenueMosaic data={data} onCategory={onCategory} />
      <ScenarioTargetComparison
        data={data}
        selected={selected}
        onCategory={onCategory}
      />
      <article className="fsc-chart">
        <div className="fsc-heading-info">
          <h2>Ponte financeira · {scenarioLabels[selected]}</h2>
          <ScenarioInfo label="Como interpretar a ponte financeira">
            <p>
              {data.basis === "cash"
                ? "Caixa formado no recorte financeiro."
                : "Saldo projetado da base; confirmação não comprova recebimento."}
            </p>
            <p>
              Saldo após reserva alvo: {money(m.afterReserve)}. Falta formar
              reserva: {money(m.reserveMissing)}.
            </p>
            <p>
              A reserva formada é alocação do saldo. A capacidade desconta o
              alvo completo. Recursos vinculados mantêm suas restrições.
            </p>
          </ScenarioInfo>
        </div>
        <ol className="fsc-bridge">
          {bridge.map((r, i) => (
            <li key={r.label}>
              <span>
                {i + 1}. {r.label}
              </span>
              <strong>{money(r.value)}</strong>
              <Magnitude
                value={r.value}
                maximum={bridgeMax}
                tone={r.value < 0n ? "negative" : "current"}
              />
            </li>
          ))}
        </ol>
      </article>
      <article className="fsc-chart">
        <div className="fsc-heading-info">
          <h2>Ritmo e projeção</h2>
          <ScenarioInfo label="Método de ritmo e projeção">
            <p>
              {m.forecast.state === "estimated"
                ? `Estimativa condicional: ${m.forecast.days} dias. ${m.forecast.confidence}.`
                : m.forecast.reason}
            </p>
            <p>
              {data.coverage.futureSources.length > 0
                ? "Conclusão do cenário indisponível: operação futura sem base de projeção."
                : "Estimativa condicionada ao ritmo e à cobertura."}
            </p>

            <p>
              Versão 2028.1 · datas civis America/Sao_Paulo. Janela de 30 dias,
              com comparações de 7 e 60 dias. Exige sete dias consecutivos
              observáveis e cobertura suficiente.
            </p>
            <p>
              Ritmo líquido = variação entre observações ÷ dias civis
              decorridos. Cancelamentos e revisões podem reduzir o total. Falhas
              de coleta não viram zero.
            </p>
            <p>
              Consultas a cada dez minutos não são novos eventos econômicos.
              Coleta independente no servidor, retenção de 90 dias.
            </p>
          </ScenarioInfo>
        </div>
        <p>
          {m.forecast.state === "estimated"
            ? `Estimativa de captação${m.forecast.partial ? " parcial" : ""}: ~${m.forecast.days} dias · ${dateLabel(m.forecast.estimatedOn)}/${m.forecast.estimatedOn.slice(0, 4)} · ${m.forecast.confidence}`
            : m.forecast.state === "achieved"
              ? "Atingido"
              : "Sem estimativa"}
        </p>
        {history.length > 1 ? (
          <div
            className="fsc-history"
            role="img"
            aria-label="Receita observada em linha contínua; estimativa condicional em linha pontilhada"
          >
            <ResponsiveContainer width="100%" height={190}>
              <LineChart
                data={chartData}
                margin={{ left: 8, right: 12, top: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={dateLabel} />
                <YAxis
                  tickFormatter={(v) =>
                    `${(v / 1000000).toLocaleString("pt-BR")} mi`
                  }
                  width={65}
                />
                <Line
                  dataKey="observed"
                  stroke={FENASOJA_2028_COLORS.indigo}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                <Line
                  dataKey="estimated"
                  stroke={FENASOJA_2028_COLORS.orange}
                  strokeDasharray="5 5"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            className="fsc-history-empty fsc-history-empty--compact"
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        )}
        <details>
          <summary>Histórico e janelas de comparação</summary>
          <div className="fsc-table-scroll">
            <table>
              <caption>Observações diárias da mesma base</caption>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Receitas</th>
                  <th>Despesas</th>
                  <th>Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.date}>
                    <th>{h.date}</th>
                    <td>{money(h.revenueCents)}</td>
                    <td>{money(h.expenseCents)}</td>
                    <td>{h.coverageComplete ? "Suficiente" : "Incompleta"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {[
            {
              label: "Formação da reserva",
              current: m.balance,
              target: BigInt(s.targets.cash_reserve),
              metric: "balance" as const,
            },
            {
              label: "Capacidade indicativa após reserva",
              current: m.balance,
              target:
                BigInt(s.targets.cash_reserve) +
                BigInt(s.targets.investment_capacity),
              metric: "balance" as const,
            },
            {
              label: "Dias de cobertura do orçamento",
              current: BigInt(data.totals.expenseCents),
              target: BigInt(s.targets.operating_execution),
              metric: "expenseCents" as const,
            },
          ].map((goal) => {
            const f = forecast(
              data.history,
              goal.current,
              goal.target,
              civilToday(data.generatedAt),
              goal.metric,
            );
            return (
              <p key={goal.label}>
                {goal.label}:{" "}
                {f.state === "estimated"
                  ? `~${f.days} dias · ${money(f.dailyCents)}/dia na mesma base`
                  : f.state === "achieved" && goal.metric === "expenseCents"
                    ? "Orçamento consumido"
                    : f.reason}
                .
              </p>
            );
          })}
          {[7, 30, 60].map((w) => {
            const f = forecast(
              data.history,
              current,
              BigInt(s.targets.revenue_total),
              civilToday(data.generatedAt),
              "revenueCents",
              w,
            );
            return (
              <p key={w}>
                {w} dias:{" "}
                {f.state === "estimated"
                  ? `~${f.days} dias · ${money(f.dailyCents)}/dia`
                  : f.reason}
              </p>
            );
          })}
        </details>
      </article>
    </section>
  );
}
