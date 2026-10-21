import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  analyticsPermissionError,
  fetchSalesAnalytics,
  type SalesAnalytics,
} from "./commercialSalesAnalytics";

interface AnalyticsState {
  data: SalesAnalytics | null;
  state: "restricted" | "loading" | "ready" | "stale" | "error";
  refresh: () => void;
}
const Context = createContext<AnalyticsState>({
  data: null,
  state: "restricted",
  refresh: () => {},
});
export const useCommercialSalesAnalytics = () => useContext(Context);
export const analyticsKey = (project: string, org: string | null) =>
  ["commercial-sale-orders", project, "analytics", org] as const;
export function CommercialSalesAnalyticsProvider({
  projectId,
  orgId,
  revision,
  inventoryRevision,
  children,
}: {
  projectId: string;
  orgId: string | null;
  revision: number;
  inventoryRevision?: string | null;
  children: ReactNode;
}) {
  const client = useQueryClient();
  const key = analyticsKey(projectId, orgId);
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      try {
        return {
          data: await fetchSalesAnalytics(projectId, signal),
          restricted: false,
        };
      } catch (error) {
        if (analyticsPermissionError(error))
          return { data: null, restricted: true };
        throw error;
      }
    },
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    meta: { persist: false },
    retry: (count, error) => !analyticsPermissionError(error) && count < 1,
  });
  useEffect(() => {
    void client.invalidateQueries({ queryKey: key }, { cancelRefetch: false });
  }, [client, projectId, orgId, revision]); // existing inventory generation, no new timer
  useEffect(
    () => () => {
      // Revocation/unmount also aborts in-flight details; nothing protected survives a scope change.
      void client.cancelQueries({ queryKey: key }, { revert: false });
      client.removeQueries({ queryKey: key });
    },
    [client, projectId, orgId],
  );
  useEffect(() => {
    if (query.data?.restricted) {
      void client.cancelQueries(
        { queryKey: [...key, "detail"] },
        { revert: false },
      );
      client.removeQueries({ queryKey: [...key, "detail"] });
    }
  }, [query.data?.restricted, client, projectId, orgId]);
  const data = query.data?.restricted ? null : (query.data?.data ?? null);
  return (
    <Context.Provider
      value={{
        data,
        state: query.data?.restricted
          ? "restricted"
          : data
            ? query.isError ||
              (inventoryRevision && data.generation !== inventoryRevision)
              ? "stale"
              : "ready"
            : query.isError
              ? "error"
              : "loading",
        refresh: () => {
          void client.invalidateQueries({ queryKey: key });
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
