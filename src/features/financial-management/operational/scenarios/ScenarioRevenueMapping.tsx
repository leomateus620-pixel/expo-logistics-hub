import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useFinancialExpenseCapabilities } from "../useFinancialExpenseCapabilities";
import {
  categoryLabels,
  centsSchema,
  revenueKeys,
} from "../financialScenariosTypes";
import { money } from "../financialScenariosMath";

const pageSchema = z.object({
  total: z.number(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      description: z.string(),
      amountCents: centsSchema,
      category: z.string().nullable(),
      version: z.number(),
    }),
  ),
});
export function ScenarioRevenueMapping({
  orgId,
  editionId,
}: {
  orgId: string;
  editionId: string;
}) {
  const [page, setPage] = useState(0),
    [all, setAll] = useState(false),
    [choices, setChoices] = useState<Record<string, string>>({});
  const requests = useRef(new Map<string, string>());
  const permissions = useFinancialExpenseCapabilities(orgId),
    client = useQueryClient();
  const query = useQuery({
    queryKey: [
      "financial-operational",
      "scenario-revenue-links",
      orgId,
      editionId,
      page,
      all,
    ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "financial_scenario_revenue_sources",
        {
          _org_id: orgId,
          _edition_id: editionId,
          _offset: page * 25,
          _unmapped_only: !all,
        },
      );
      if (error) throw Error("Não foi possível consultar os vínculos.");
      return pageSchema.parse(data);
    },
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: async (row: z.infer<typeof pageSchema>["items"][number]) => {
      const key = JSON.stringify([row.id, row.version, choices[row.id]]);
      if (!requests.current.has(key))
        requests.current.set(key, crypto.randomUUID());
      const { error } = await supabase.rpc("financial_link_scenario_revenue", {
        _org_id: orgId,
        _edition_id: editionId,
        _revenue_id: row.id,
        _category: choices[row.id],
        _origin_kind: "manual",
        _origin_id: null,
        _expected_version: row.version,
        _request_id: requests.current.get(key)!,
      });
      if (error)
        throw Error(
          error.message.includes("CONFLICT")
            ? "Este vínculo mudou. Atualize a consulta."
            : "Não foi possível salvar o vínculo.",
        );
    },
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["financial-operational"] }),
  });
  return (
    <section className="fsc-mapping">
      <h3>Vínculos das receitas manuais</h3>
      <p>
        Escolha a categoria de acompanhamento. O valor da receita e as metas
        oficiais são preservados. Registros que representam outra origem exigem
        vínculo de deduplicação validado.
      </p>
      <label>
        <input
          type="checkbox"
          checked={all}
          onChange={(e) => {
            setAll(e.target.checked);
            setPage(0);
          }}
        />{" "}
        Mostrar também receitas já classificadas
      </label>
      {query.isPending ? (
        <p role="status">Consultando fontes…</p>
      ) : query.isError ? (
        <p role="alert">{query.error.message}</p>
      ) : query.data.items.length === 0 ? (
        <p>Nenhuma receita manual pendente neste recorte.</p>
      ) : (
        <ul>
          {query.data.items.map((row) => (
            <li key={row.id}>
              <strong>{row.description}</strong>
              <span>{money(row.amountCents)}</span>
              <label className="sr-only" htmlFor={`scenario-source-${row.id}`}>
                Categoria de {row.description}
              </label>
              <select
                id={`scenario-source-${row.id}`}
                disabled={!permissions.canEdit || mutation.isPending}
                value={choices[row.id] ?? row.category ?? ""}
                onChange={(e) =>
                  setChoices((c) => ({ ...c, [row.id]: e.target.value }))
                }
              >
                <option value="">Selecione uma categoria</option>
                {[...revenueKeys, "other_revenue" as const].map((k) => (
                  <option key={k} value={k}>
                    {categoryLabels[k]}
                  </option>
                ))}
              </select>
              {permissions.canEdit && (
                <button
                  type="button"
                  disabled={!choices[row.id] || mutation.isPending}
                  onClick={() => mutation.mutate(row)}
                >
                  Vincular categoria
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {mutation.isError && <p role="alert">{mutation.error.message}</p>}
      {mutation.isSuccess && (
        <p role="status">Vínculo salvo. A fotografia foi atualizada.</p>
      )}
      {query.data && query.data.total > 25 && (
        <div className="fsc-mapping-pages">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <span>
            Página {page + 1} · {query.data.total} registros
          </span>
          <button
            disabled={(page + 1) * 25 >= query.data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      )}
    </section>
  );
}
