import {
  PiggyBank,
  ChartNoAxesCombined,
  Layers3,
  WalletCards,
} from "lucide-react";
import {
  categoryLabels,
  currentLabels,
  revenueKeys,
  scenarioLabels,
  type CategoryKey,
  type ScenarioKey,
  type ScenarioOverview,
} from "../financialScenariosTypes";
import {
  money,
  referenceCapacity,
  scenarioModel,
} from "../financialScenariosMath";
import {
  ScenarioInfo,
  ScenarioMetricRow,
  ScenarioProgress,
} from "./ScenarioMetricRow";
import { categoryIcons, scenarioVisuals } from "./scenarioVisuals";

export function ScenarioComparison({
  data,
  selected,
  onSelect,
  onCategory,
}: {
  data: ScenarioOverview;
  selected: ScenarioKey;
  onSelect: (key: ScenarioKey) => void;
  onCategory: (key: CategoryKey) => void;
}) {
  const current = currentLabels[data.basis];
  return (
    <div className="fsc-columns">
      {data.scenarios
        .filter((s) => s.key === selected)
        .map((s) => {
          const m = scenarioModel(data, s),
            target = s.targets;
          const { Icon, caption, index } = scenarioVisuals[s.key];
          return (
            <article
              className="fsc-scenario"
              key={s.key}
              data-selected={selected === s.key}
              data-scenario={s.key}
              aria-label={`Cenário ${scenarioLabels[s.key]}`}
            >
              <header className="fsc-scenario__header">
                <div className="fsc-scene-identity">
                  <span className="fsc-scene-symbol">
                    <Icon aria-hidden="true" />
                  </span>
                  <div>
                    <span className="fsc-scene-eyebrow">
                      {index} ·{" "}
                      {s.key === "pessimistic"
                        ? "Proteção e equilíbrio"
                        : s.key === "realistic"
                          ? "Plano de referência"
                          : "Expansão e investimento"}
                    </span>
                    <h2>{scenarioLabels[s.key]}</h2>
                    <p>{caption}</p>
                  </div>
                </div>
                <div className="fsc-scene-target">
                  <span>Meta oficial de receitas</span>
                  <strong>{money(target.revenue_total)}</strong>
                  <small>Referência v{s.version} · FENASOJA 2028</small>
                </div>
                <div className="fsc-scene-progress">
                  <div>
                    <strong>
                      {m.total.percentage?.toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}
                      %
                    </strong>
                    <span>{current}</span>
                  </div>
                  <ScenarioProgress
                    label={`Atingimento ${scenarioLabels[s.key]}`}
                    current={BigInt(data.totals.revenueCents)}
                    target={BigInt(target.revenue_total)}
                  />
                  <small>
                    {m.complete
                      ? "Cenário completo"
                      : m.total.achieved
                        ? "Meta de receitas atingida"
                        : `Faltam ${money(m.total.missing)}`}
                  </small>
                </div>
              </header>
              <div className="fsc-category-grid">
                {revenueKeys.map((k) => (
                  <div key={k}>
                    <ScenarioMetricRow
                      label={categoryLabels[k]}
                      Icon={categoryIcons[k]}
                      current={BigInt(data.currentByCategory[k].amountCents)}
                      target={BigInt(target[k])}
                      currentLabel={current}
                      status={data.currentByCategory[k].status}
                      onDetails={() => onCategory(k)}
                      info={
                        <>
                          <p>
                            {k === "pavilion_ics"
                              ? "Pavilhões físicos 1, 14, 12, 13, 8, 3 e 5. Identidade pelo pai persistido e registro canônico."
                              : k === "agroindustry"
                                ? "Pavilhão físico 7, entidade B10, pelo vínculo pai persistido."
                                : k.startsWith("sponsorship")
                                  ? "Confirmado substitui projetado. Declarado e contrapartida em bens/serviços não entram no dinheiro."
                                  : k === "parking"
                                    ? "Estrutura de classificação pronta. Antes do início da operação, sem previsão de arrecadação."
                                    : "Fonte explicitamente classificada, sem inferência pelo nome do cadastro."}
                          </p>
                          <p>
                            {current}: principal negociado e taxas elegíveis.
                            Meta fixa da planilha; preços atuais não a alteram.
                          </p>
                          <p>
                            {data.currentByCategory[k].count} fatos · taxas{" "}
                            {money(data.currentByCategory[k].feesCents)}.
                          </p>
                        </>
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="fsc-closing">
                <div className="fsc-subtotal">
                  <span className="fsc-closing-eyebrow">
                    SUBTOTAL · 7 CATEGORIAS
                  </span>
                  <span className="fsc-closing-label">
                    <Layers3 size={19} aria-hidden="true" />
                    Comercialização e operação
                    <ScenarioInfo label="Como compõe o subtotal comercial">
                      <p>
                        Soma das sete categorias de comercialização e operação.
                        O subtotal já integra o total e não é somado uma segunda
                        vez.
                      </p>
                    </ScenarioInfo>
                  </span>
                  <strong>{money(target.operating_subtotal)}</strong>
                  <small>
                    Meta oficial · {current}:{" "}
                    {money(data.totals.operatingRevenueCents)}
                  </small>
                </div>
                <div className="fsc-total">
                  <span className="fsc-closing-eyebrow">
                    CONSOLIDADO DE RECEITAS
                  </span>
                  <span className="fsc-closing-label">
                    <WalletCards size={19} aria-hidden="true" />
                    Total de receitas
                    <ScenarioInfo label="Como compõe o total de receitas">
                      <p>
                        Meta = subtotal comercial + patrocínios livres +
                        Rouanet. Atual inclui as receitas elegíveis e
                        deduplicadas da base, inclusive outras receitas sem
                        meta, identificadas separadamente.
                      </p>
                    </ScenarioInfo>
                  </span>
                  <strong>{money(target.revenue_total)}</strong>
                  <small>
                    Meta oficial · {current}: {money(data.totals.revenueCents)}
                  </small>
                </div>
              </div>
              <div className="fsc-scenario__derived">
                <ScenarioMetricRow
                  label="Execução Feira 2028"
                  Icon={categoryIcons.operating_execution}
                  current={BigInt(data.totals.expenseCents)}
                  target={BigInt(target.operating_execution)}
                  currentLabel={
                    data.basis === "portfolio"
                      ? "Despesas cadastradas"
                      : data.basis === "confirmed"
                        ? "Despesas comprometidas"
                        : "Pagamentos líquidos"
                  }
                  status={data.currentByCategory.operating_execution.status}
                  budget
                  onDetails={() => onCategory("operating_execution")}
                  info={
                    <>
                      <p>
                        {data.basis === "portfolio"
                          ? "Despesas cadastradas — previstas + realizadas. Realizado substitui previsto do mesmo fato."
                          : data.basis === "confirmed"
                            ? "Somente despesas realizadas/comprometidas."
                            : "Somente pagamentos e estornos líquidos alocados."}
                      </p>
                      <p>
                        Linhas orçamentárias e parcelas não são novas despesas.
                        Dinheiro gasto não mede execução física.
                      </p>
                    </>
                  }
                />
                <ScenarioMetricRow
                  label="Reserva de caixa"
                  Icon={PiggyBank}
                  current={m.reserveFormed}
                  target={BigInt(target.cash_reserve)}
                  currentLabel="Formação analítica"
                  status={
                    data.sourceCoverage.length === 0 ? "empty" : undefined
                  }
                  info={
                    <>
                      <p>
                        Saldo = receitas − despesas. Formação = menor valor
                        entre saldo positivo e alvo da reserva.
                      </p>
                      <p>
                        Alocação analítica; não cria despesa nem movimento
                        bancário. Não comprova reserva segregada.
                      </p>
                      <p>
                        Falta formar {money(m.reserveMissing)}. Texto original:{" "}
                        {s.provenance.originalReserveLabel}.
                      </p>
                    </>
                  }
                />
                <ScenarioMetricRow
                  label="Capacidade de investimentos"
                  Icon={ChartNoAxesCombined}
                  current={m.capacity}
                  target={BigInt(target.investment_capacity)}
                  currentLabel={
                    data.basis === "cash"
                      ? "Capacidade no recorte"
                      : "Capacidade indicativa"
                  }
                  status={
                    data.sourceCoverage.length === 0 ? "empty" : undefined
                  }
                  info={
                    <>
                      <p>
                        Máximo entre zero e receitas − despesas − reserva alvo.
                        A parcela Rouanet mantém sua vinculação; o total não
                        significa recurso livre para gastar.
                      </p>
                      <p>
                        Após reserva alvo: {money(m.afterReserve)}. Déficit
                        antes da reserva: {money(m.deficit)}.
                      </p>
                      <p>
                        Referência calculada: {money(referenceCapacity(s))}.
                        Informada: {money(target.investment_capacity)}.
                      </p>
                    </>
                  }
                />
              </div>
              {s.provenance.issues.length > 0 && (
                <div className="fsc-reference">
                  <span>
                    {s.key === "optimistic"
                      ? "Divergência na referência"
                      : "Valores absolutos preservados"}
                  </span>
                  <ScenarioInfo
                    label={`Proveniência do cenário ${scenarioLabels[s.key]}`}
                  >
                    <p>Fonte: {s.provenance.source}</p>
                    {s.provenance.issues.map((i) => (
                      <p key={i.code}>{i.message}</p>
                    ))}
                  </ScenarioInfo>
                </div>
              )}
            </article>
          );
        })}
    </div>
  );
}
