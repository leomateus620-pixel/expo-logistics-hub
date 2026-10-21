import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useFinancialModuleAccess } from "@/hooks/useFinancialModuleAccess";
import { deserializeQueryCache } from "@/lib/queryPersistence";
const state = vi.hoisted(() => ({
  user: { id: "approved-uuid", name: "Administrador duplicado" },
  rpc: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: state.user, loading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: state.rpc },
}));
const wrapper =
  (client: QueryClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
beforeEach(() => {
  state.user = { id: "approved-uuid", name: "Administrador duplicado" };
  state.rpc.mockReset().mockResolvedValue({ data: false, error: null });
});
afterEach(cleanup);
it("does not authorize a new page from a persisted financial grant", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let finish!: (data: unknown) => void;
  client.setQueryData(
    ["financial-operational", "module-access", "org", "approved-uuid"],
    true,
    { updatedAt: 1 },
  );
  state.rpc.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(() => useFinancialModuleAccess("org"), {
    wrapper: wrapper(client),
  });
  expect(hook.result.current.canAccess).toBe(false);
  expect(hook.result.current.isLoading).toBe(true);
  finish({ data: false, error: null });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  expect(hook.result.current.canAccess).toBe(false);
  client.clear();
});
it("keys authorization by UUID even when display names match and fails closed on refresh error", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  state.rpc.mockResolvedValue({ data: true, error: null });
  const hook = renderHook(() => useFinancialModuleAccess("org"), {
    wrapper: wrapper(client),
  });
  await waitFor(() => expect(hook.result.current.canAccess).toBe(true));
  state.user = { ...state.user, id: "duplicate-uuid" };
  state.rpc.mockResolvedValue({ data: false, error: null });
  hook.rerender();
  expect(hook.result.current.canAccess).toBe(false);
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  state.rpc.mockResolvedValue({
    data: null,
    error: { message: "Conexão indisponível" },
  });
  await client.refetchQueries({
    queryKey: [
      "financial-operational",
      "module-access",
      "org",
      "duplicate-uuid",
    ],
  });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.canAccess).toBe(false);
  client.clear();
});
it("discards confidential financial records from older persisted caches", () => {
  const cache = {
    timestamp: Date.now(),
    buster: "test",
    clientState: {
      mutations: [],
      queries: [
        {
          queryKey: ["financial-operational", "revenues", "org"],
          state: { data: [{ private: "financial record" }] },
        },
        { queryKey: ["commercial-map", "entities"], state: { data: [] } },
        { queryKey: ["other-module"], state: { data: ["retained"] } },
      ],
    },
  };
  const restored = deserializeQueryCache(JSON.stringify(cache));
  expect(restored.clientState.queries.map((q) => q.queryKey)).toEqual([
    ["other-module"],
  ]);
});
