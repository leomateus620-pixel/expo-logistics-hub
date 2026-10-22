import {
  categoryLabels,
  revenueKeys,
  type CategoryKey,
  type ScenarioOverview,
} from "../financialScenariosTypes";
import { money } from "../financialScenariosMath";
import { categoryIcons } from "./scenarioVisuals";

/** Content cards, without axes or bars. Percentage always describes monetary share,
 * never physical occupancy or target attainment; card area is not a quantitative scale. */
export function ScenarioRevenueMosaic({
  data,
  onCategory,
}: {
  data: ScenarioOverview;
  onCategory: (key: CategoryKey) => void;
}) {
  const total = BigInt(data.totals.revenueCents);
  const sources = [...revenueKeys, "other_revenue" as const]
    .map((key) => ({
      key,
      amount: BigInt(data.currentByCategory[key].amountCents),
    }))
    .sort((a, b) =>
      a.amount === b.amount
        ? a.key.localeCompare(b.key)
        : a.amount > b.amount
          ? -1
          : 1,
    );
  return (
    <article className="fsc-chart fsc-chart--wide fsc-revenue-mosaic">
      <div className="fsc-mosaic-heading">
        <div>
          <h2>Participação na receita atual</h2>
          <p>As fontes que compõem {money(total)}.</p>
        </div>
        <span>COMPOSIÇÃO DA BASE</span>
      </div>
      {total <= 0n ? (
        <p>
          Sem total positivo para calcular participação nesta base. Os valores
          de cada fonte permanecem nos detalhes.
        </p>
      ) : null}
      <div className="fsc-mosaic" aria-label="Participação monetária por fonte">
        {sources.map(({ key, amount }, index) => {
          const Icon = categoryIcons[key];
          const share =
            total > 0n ? Number((amount * 10000n) / total) / 100 : null;
          const formatted =
            share == null
              ? "—"
              : `${share.toLocaleString("pt-BR", { maximumFractionDigits: share > 0 && share < 0.1 ? 2 : 1 })}%`;
          return (
            <button
              type="button"
              key={key}
              data-source={key}
              data-leading={amount > 0n && index < 2}
              data-empty={amount === 0n}
              onClick={() => onCategory(key)}
              aria-label={`${categoryLabels[key]}: ${money(amount)}, ${formatted} do total atual. Ver composição.`}
            >
              <span className="fsc-mosaic-icon">
                <Icon size={19} aria-hidden="true" />
              </span>
              <strong>{formatted}</strong>
              <span className="fsc-mosaic-label">{categoryLabels[key]}</span>
              <small>{money(amount)}</small>
            </button>
          );
        })}
      </div>
    </article>
  );
}
