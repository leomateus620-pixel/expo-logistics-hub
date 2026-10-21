import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const SESSION_STARTED_AT = Date.now();
/** The server roster is authoritative, including for general administrators. */
export function useFinancialModuleAccess(
  orgId: string | null | undefined,
  enabled = true,
) {
  const { user, loading } = useAuth();
  const query = useQuery({
    queryKey: ["financial-operational", "module-access", orgId, user?.id],
    enabled: enabled && Boolean(orgId && user) && !loading,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "financial_can" as never,
        { _org_id: orgId, _capability: "financial_access" } as never,
      );
      if (error) throw new Error(error.message);
      return data === true;
    },
    staleTime: 30_000,
    retry: false,
    refetchOnMount: "always",
  });
  const verified =
    enabled &&
    Boolean(orgId && user) &&
    !loading &&
    !query.isError &&
    query.dataUpdatedAt >= SESSION_STARTED_AT;
  return {
    canAccess: verified && query.data === true,
    isLoading:
      enabled &&
      (loading || (Boolean(orgId && user) && !query.isError && !verified)),
    isError: query.isError,
  };
}
