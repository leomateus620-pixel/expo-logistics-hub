import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchFinancialScenarios } from "./financialScenariosApi";
import type { ScenarioBasis } from "./financialScenariosTypes";

export const SCENARIO_REFRESH_MS = 600_000;
export const scenarioQueryKey = (
  orgId: string,
  editionId: string,
  basis: ScenarioBasis,
) =>
  [
    "financial-operational",
    "scenarios",
    orgId,
    editionId,
    basis,
    "2028.1",
  ] as const;
export function useFinancialScenarios(
  orgId: string,
  editionId: string,
  basis: ScenarioBasis,
) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: scenarioQueryKey(orgId, editionId, basis),
    queryFn: () => fetchFinancialScenarios(orgId, editionId, basis),
    staleTime: SCENARIO_REFRESH_MS,
    refetchInterval: SCENARIO_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          void client.invalidateQueries({
            queryKey: ["financial-operational", "scenarios", orgId, editionId],
          }),
        750,
      );
    };
    // RLS controls delivery. Commercial aggregate polling also covers users without table access.
    const channel = supabase.channel(
      `financial-scenarios:${orgId}:${editionId}`,
    );
    for (const table of [
      "financial_revenues",
      "financial_sponsorships",
      "financial_movements",
      "expenses",
      "financial_scenarios",
    ])
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `org_id=eq.${orgId}` },
        invalidate,
      );
    channel.subscribe();
    // TanStack's focusManager owns visibilitychange and refreshes a stale query once.
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [client, orgId, editionId, basis]);
  return query;
}
