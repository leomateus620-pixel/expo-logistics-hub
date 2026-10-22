import { supabase } from "@/integrations/supabase/client";
import { overviewSchema, type ScenarioBasis } from "./financialScenariosTypes";
import { validateReconciliation } from "./financialScenariosMath";

export class ScenarioReadError extends Error {
  constructor(
    public kind:
      | "not_activated"
      | "forbidden"
      | "scope"
      | "network"
      | "invalid",
    message: string,
  ) {
    super(message);
  }
}
export async function fetchFinancialScenarios(
  orgId: string,
  editionId: string,
  basis: ScenarioBasis,
) {
  const { data, error } = await Promise.resolve(
    supabase.rpc("financial_scenario_overview", {
      _org_id: orgId,
      _edition_id: editionId,
      _basis: basis,
    }),
  ).catch(() => {
    throw new ScenarioReadError(
      "network",
      "Não foi possível atualizar os dados. Tente novamente.",
    );
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883")
      throw new ScenarioReadError(
        "not_activated",
        "A consulta de Simulações ainda não foi aplicada neste ambiente.",
      );
    if (error.code === "42501")
      throw new ScenarioReadError(
        "forbidden",
        "Sua conta não tem acesso financeiro a esta consulta.",
      );
    if (error.message.includes("SCOPE_INVALID"))
      throw new ScenarioReadError(
        "scope",
        "A edição e o projeto comercial ainda não têm um vínculo válido.",
      );
    throw new ScenarioReadError(
      "network",
      "Não foi possível atualizar os dados. Tente novamente.",
    );
  }
  try {
    const parsed = overviewSchema.parse(data);
    if (
      parsed.orgId !== orgId ||
      parsed.editionId !== editionId ||
      parsed.basis !== basis
    )
      throw Error("Escopo divergente");
    return validateReconciliation(parsed);
  } catch {
    throw new ScenarioReadError(
      "invalid",
      "A fotografia recebida não conciliou. A última consulta válida foi preservada.",
    );
  }
}
