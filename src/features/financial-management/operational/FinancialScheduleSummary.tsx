import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { Button } from "@/components/ui/button";
import {
  fetchFinancialSchedule,
  financialEntryRpc,
  PAYMENT_METHODS,
  type PaymentPlan,
} from "./financialEntryApi";
import {
  FUNDING_TYPE_LABELS,
  type FundingTypeKey,
} from "./financialOperationalApi";
import { centsToInput } from "./financialExpensesApi";
import { FinancialInfo } from "./FinancialEntryFields";
import "@/styles/financial-entry-composer.css";

interface ExportEntry {
  id: string;
  source_type: string;
  description: string;
  status: string;
  projected_cents: number | null;
  executed_cents: number | null;
  settled_cents: number;
  competence_date: string | null;
  due_date: string | null;
  related_name: string | null;
  funding_source: string | null;
  funding_type: FundingTypeKey | null;
  category_name: string | null;
  related_reference_id: string | null;
  funding_source_reference_id: string | null;
  plan: PaymentPlan | null;
}
const csvCell = (value: unknown) => {
  let text = value == null ? "" : String(value);
  if (/^[=+@-]/.test(text) && !/^-[0-9]+([,.][0-9]+)?$/.test(text))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};
/** Fact amounts occur only on ENTRY lines. INSTALLMENT lines carry separate schedule columns. */
export function financialEntriesCsv(entries: ExportEntry[]) {
  const header = [
    "Tipo de linha",
    "UUID da origem",
    "Descrição",
    "Situação",
    "Contrapartida / fornecedor",
    "UUID da referência",
    "Origem do recurso",
    "UUID da origem do recurso",
    "Classificação",
    "Categoria",
    "Projetado (R$)",
    "Confirmado / realizado (R$)",
    "Liquidado líquido (R$)",
    "Competência",
    "Vencimento legado",
    "UUID do plano",
    "Versão do plano",
    "Condição",
    "Meio padrão",
    "UUID da parcela",
    "Parcela",
    "Vencimento da parcela",
    "Meio previsto da parcela",
    "Valor da parcela (R$)",
    "Liquidado na parcela (R$)",
  ];
  const rows: unknown[][] = [header];
  for (const e of entries) {
    const p = e.plan;
    rows.push([
      "CADASTRO",
      e.id,
      e.description,
      e.status,
      e.related_name,
      e.related_reference_id,
      e.funding_source,
      e.funding_source_reference_id,
      e.funding_type ? FUNDING_TYPE_LABELS[e.funding_type] : "",
      e.category_name,
      e.projected_cents == null ? "" : centsToInput(e.projected_cents),
      e.executed_cents == null ? "" : centsToInput(e.executed_cents),
      centsToInput(e.settled_cents),
      e.competence_date,
      e.due_date,
      p?.id,
      p?.version,
      p?.condition,
      p?.default_method ? PAYMENT_METHODS[p.default_method] : "Não informado",
    ]);
    for (const i of p?.installments || [])
      rows.push([
        "PARCELA",
        e.id,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        p!.id,
        p!.version,
        "",
        "",
        i.id,
        i.sequence,
        i.due_date,
        i.method ? PAYMENT_METHODS[i.method] : "Não informado",
        centsToInput(i.amount_cents),
        centsToInput(i.settled_cents || 0),
      ]);
  }
  return "\ufeff" + rows.map((r) => r.map(csvCell).join(";")).join("\n");
}
export function FinancialScheduleSummary({ editionId }: { editionId: string }) {
  const { orgId } = useCurrentOrg();
  const [exporting, setExporting] = useState(false),
    [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["financial-operational", "schedule-summary", orgId, editionId],
    queryFn: () => fetchFinancialSchedule(orgId!, editionId),
    enabled: Boolean(orgId),
    retry: false,
  });
  const exportCsv = async (type: "receita" | "despesa") => {
    setExporting(true);
    setError("");
    try {
      const data = await financialEntryRpc<ExportEntry[]>(
        "financial_export_entries",
        { _org_id: orgId, _edition_id: editionId, _kind: type },
      );
      const blob = new Blob([financialEntriesCsv(data)], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fenasoja-2028-${type}s-cronogramas.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <section className="f28-schedule-summary">
      <header>
        <div>
          <h2>Vencimentos, competência e caixa</h2>
          <p>Edição 2028 · consolidação completa do servidor</p>
        </div>
        <FinancialInfo label="Bases temporais">
          Vencimentos distribuem o total aplicável por parcelas. Competência
          registra o compromisso uma vez; caixa usa a data do movimento.
          Registros antigos com vencimento e sem plano conservam sua previsão
          única.
        </FinancialInfo>
      </header>
      <details>
        <summary>Consultar distribuição mensal</summary>
        {query.isLoading ? (
          <p role="status">Consolidando vencimentos…</p>
        ) : query.isError ? (
          <p role="alert">
            Não foi possível consultar a distribuição.{" "}
            <button onClick={() => void query.refetch()}>
              Tentar novamente
            </button>
          </p>
        ) : (
          <>
            <div className="f28-schedule-months">
              {query.data?.months.map((row) => (
                <article key={`${row.month}-${row.source_type}`}>
                  <header>
                    <strong>
                      {row.month
                        ? `${row.month.slice(5, 7)}/${row.month.slice(0, 4)}`
                        : "Competência não informada"}
                    </strong>
                    <span>
                      {row.source_type === "receita" ? "Receitas" : "Despesas"}
                    </span>
                  </header>
                  <dl>
                    <div>
                      <dt>Por vencimento</dt>
                      <dd>R$ {centsToInput(row.scheduled_cents)}</dd>
                    </div>
                    <div>
                      <dt>Por competência</dt>
                      <dd>R$ {centsToInput(row.executed_cents)}</dd>
                    </div>
                    <div>
                      <dt>Caixa líquido</dt>
                      <dd>R$ {centsToInput(row.cash_cents)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            {query.data?.unscheduled_sources ? (
              <p>
                {query.data.unscheduled_sources} registro(s) sem plano de
                parcelas. Vencimentos legados disponíveis foram preservados na
                distribuição.
              </p>
            ) : null}
          </>
        )}
      </details>
      <div className="f28-schedule-exports">
        <span>Exportar cadastros e parcelas da edição</span>
        <Button
          type="button"
          variant="outline"
          disabled={exporting}
          onClick={() => void exportCsv("receita")}
        >
          <Download size={15} />
          Receitas
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={exporting}
          onClick={() => void exportCsv("despesa")}
        >
          <Download size={15} />
          Despesas
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
