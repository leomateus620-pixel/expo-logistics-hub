import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  categoryLabels,
  currentLabels,
  revenueKeys,
  scenarioLabels,
  type CategoryKey,
  type ScenarioOverview,
  type ScenarioKey,
} from "../financialScenariosTypes";
import { money, progress } from "../financialScenariosMath";
import { categoryIcons } from "./scenarioVisuals";
export function ScenarioTargetComparison({
  data,
  selected,
  onCategory,
}: {
  data: ScenarioOverview;
  selected: ScenarioKey;
  onCategory: (key: CategoryKey) => void;
}) {
  const [category, setCategory] =
    useState<(typeof revenueKeys)[number]>("pavilion_ics");
  const s = data.scenarios.find((s) => s.key === selected)!;
  const value = BigInt(data.currentByCategory[category].amountCents),
    target = BigInt(s.targets[category]),
    p = progress(value, target),
    Icon = categoryIcons[category];
  const index = revenueKeys.indexOf(category);
  const move = (by: number) =>
    setCategory(
      revenueKeys[(index + by + revenueKeys.length) % revenueKeys.length],
    );
  return (
    <article className="fsc-chart fsc-chart--wide fsc-target-comparison">
      <div className="fsc-comparator-heading">
        <div>
          <h2>Atual versus meta · {scenarioLabels[selected]}</h2>
          <p>Uma categoria em foco. Valores completos, leitura direta.</p>
        </div>
        <label>
          Categoria
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
          >
            {revenueKeys.map((k) => (
              <option key={k} value={k}>
                {categoryLabels[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="fsc-comparator-category">
        <button
          type="button"
          aria-label="Categoria anterior"
          onClick={() => move(-1)}
        >
          <ArrowLeft size={17} />
        </button>
        <Icon size={21} aria-hidden="true" />
        <button
          className="fsc-comparator-detail"
          onClick={() => onCategory(category)}
        >
          {categoryLabels[category]}
        </button>
        <button
          type="button"
          aria-label="Próxima categoria"
          onClick={() => move(1)}
        >
          <ArrowRight size={17} />
        </button>
      </div>
      <div className="fsc-value-pair">
        <div>
          <span>{currentLabels[data.basis]}</span>
          <strong>{money(value)}</strong>
          <small>Fotografia atual da operação</small>
        </div>
        <div>
          <span>Meta oficial · {scenarioLabels[selected]}</span>
          <strong>{money(target)}</strong>
          <small>Referência fixa · versão {s.version}</small>
        </div>
      </div>
      <div className="fsc-comparator-result" data-achieved={p.achieved}>
        {p.achieved ? (
          <CheckCircle2 size={19} aria-hidden="true" />
        ) : (
          <ArrowRight size={19} aria-hidden="true" />
        )}
        <strong>
          {p.achieved
            ? `${money(p.excess)} acima da meta`
            : `Faltam ${money(p.missing)}`}
        </strong>
        <span>
          {p.percentage?.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
          de atingimento
        </span>
        {data.currentByCategory[category].status !== "ready" && (
          <small>
            {
              {
                empty: "Aguardando dados",
                future: "Operação futura",
                incomplete: "Cobertura parcial",
              }[
                data.currentByCategory[category].status as
                  | "empty"
                  | "future"
                  | "incomplete"
              ]
            }
          </small>
        )}
      </div>
    </article>
  );
}
