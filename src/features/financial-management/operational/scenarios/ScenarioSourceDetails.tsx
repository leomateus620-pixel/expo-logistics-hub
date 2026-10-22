import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import {
  categoryLabels,
  basisLabels,
  type CategoryKey,
  type ScenarioOverview,
} from "../financialScenariosTypes";
import { money } from "../financialScenariosMath";
import { ScenarioRevenueMapping } from "./ScenarioRevenueMapping";
export const sourceLabels: Record<string, string> = {
  commercial: "Itens comerciais",
  commercial_fees: "Taxas a conciliar",
  commercial_legacy: "Legado sem comprovação",
  manual: "Receitas manuais",
  sponsorship: "Patrocínios",
  expense: "Despesas",
  cash_unclassified: "Movimentos sem classificação",
};
export const issueLabels: Record<string, string> = {
  CASH_SETTLEMENT_INCONSISTENT: "Liquidação pendente de conciliação",
  VALUE_UNPROVEN: "Valor não comprovado",
  LEGACY_UNVERIFIED: "Legado sem comprovação",
  SALE_ITEM_MISMATCH: "Venda e item não conciliados",
  FEES_TO_RECONCILE: "Taxas a conciliar",
  MANUAL_WITHOUT_CATEGORY: "Receita sem categoria de simulação",
  CASH_WITHOUT_CLASSIFICATION: "Caixa sem classificação de origem",
  PARENT_INVALID: "Vínculo pai inválido",
  PAVILION_UNREGISTERED: "Pavilhão sem registro canônico",
  INTERIOR_WITHOUT_PARENT: "Interior sem vínculo de pavilhão",
  BLOCK_CONFLICT: "Quadra divergente",
  SEGMENT_MISSING: "Segmento ausente",
  UNCLASSIFIED: "Categoria não comprovada",
};
const stageLabels: Record<string, string> = {
  confirmed: "Confirmado",
  pending: "Em andamento",
  projected: "Projetado",
  prospeccao: "Prospecção",
  negociacao: "Negociação",
  prevista: "Prevista",
  realizada: "Realizada",
  cash: "Caixa",
};
export function ScenarioSourceDetails({
  data,
  category,
  onClose,
}: {
  data: ScenarioOverview;
  category: CategoryKey | null;
  onClose: () => void;
}) {
  const row = category ? data.currentByCategory[category] : null;
  const hasCommercial =
    Boolean(row?.composition.some((c) => c.source.startsWith("commercial"))) ||
    BigInt(row?.commercialPortfolioCents ?? "0") !== 0n;
  return (
    <Dialog
      open={Boolean(row)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="fsc-details">
        <DialogHeader>
          <DialogTitle>{category ? categoryLabels[category] : ""}</DialogTitle>
          <DialogDescription>
            {basisLabels[data.basis]} · fotografia {data.generation.slice(0, 8)}{" "}
            ·{" "}
            {new Date(data.generatedAt).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}
          </DialogDescription>
        </DialogHeader>
        {row && (
          <>
            <dl className="fsc-detail-totals">
              <div>
                <dt>Principal</dt>
                <dd>{money(row.principalCents)}</dd>
              </div>
              <div>
                <dt>Taxas</dt>
                <dd>{money(row.feesCents)}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{money(row.amountCents)}</dd>
              </div>
            </dl>
            {row.composition.length === 0 ? (
              <p>Fonte preparada, sem registros elegíveis nesta base.</p>
            ) : (
              <div className="fsc-table-scroll">
                <table>
                  <caption>
                    Composição agregada, sem dados de compradores
                  </caption>
                  <thead>
                    <tr>
                      <th>Origem / estágio</th>
                      <th>Principal</th>
                      <th>Taxas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.composition.map((r, i) => (
                      <tr key={i}>
                        <th>
                          {sourceLabels[r.source] ?? r.source} ·{" "}
                          {stageLabels[r.stage] ?? r.stage}
                          {r.issue && (
                            <small>{issueLabels[r.issue] ?? r.issue}</small>
                          )}
                        </th>
                        <td>{money(r.principalCents)}</td>
                        <td>{money(r.feesCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {hasCommercial && (
              <>
                <p>
                  Carteira comercial: {money(row.commercialPortfolioCents)} ·
                  Confirmado comercial: {money(row.commercialConfirmedCents)} ·
                  Em andamento:{" "}
                  {money(
                    BigInt(row.commercialPortfolioCents) -
                      BigInt(row.commercialConfirmedCents),
                  )}
                  .
                </p>
                <p>
                  Taxas de pedido rateadas em centavos pelo principal vigente;
                  resíduos por ordem de UUID. Confirmado mantém apenas as
                  parcelas das taxas atribuídas aos itens assinados.
                </p>
              </>
            )}
            {category === "other_revenue" && (
              <ScenarioRevenueMapping
                orgId={data.orgId}
                editionId={data.editionId}
              />
            )}
            {(!hasCommercial ||
              row.composition.some((c) => c.source === "manual")) && (
              <Link
                to={`/comissoes/financeiro-gerencial/${category === "operating_execution" ? "despesas-previstas" : category?.startsWith("sponsorship") ? "patrocinios" : "receitas-projetadas"}?edicao=2028`}
              >
                Abrir{" "}
                {category === "operating_execution"
                  ? "despesas"
                  : category?.startsWith("sponsorship")
                    ? "patrocínios"
                    : "receitas manuais"}{" "}
                da edição
              </Link>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
