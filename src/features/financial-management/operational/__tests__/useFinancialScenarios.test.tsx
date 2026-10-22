import { readFileSync } from "node:fs";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { overviewSchema } from "../financialScenariosTypes";
import {
  useFinancialScenarios,
  SCENARIO_REFRESH_MS,
} from "../useFinancialScenarios";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  listeners: [] as Array<() => void>,
}));
vi.mock("../financialScenariosApi", () => ({
  fetchFinancialScenarios: mocks.fetch,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => {
      const channel = {
        on: (_event: string, _filter: object, fn: () => void) => {
          mocks.listeners.push(fn);
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));
const data = overviewSchema.parse(
  JSON.parse(
    readFileSync(
      "docs/financial-scenarios/evidence/synthetic-overview.json",
      "utf8",
    ),
  ),
);
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  mocks.fetch.mockReset().mockResolvedValue(data);
  mocks.listeners.length = 0;
  focusManager.setFocused(true);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
it("one shared photograph; a 600000ms timer refreshes once and hidden tabs pause it", async () => {
  vi.useFakeTimers();
  const h = renderHook(
    () => ({
      ...useFinancialScenarios(data.orgId, data.editionId, "portfolio"),
    }),
    { wrapper },
  );
  await tick(1);
  expect(h.result.current.data).toBeDefined();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  await tick(SCENARIO_REFRESH_MS - 2);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  await tick(2);
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  act(() => focusManager.setFocused(false));
  await tick(SCENARIO_REFRESH_MS * 2);
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  act(() => focusManager.setFocused(true));
  await tick(5);
  expect(mocks.fetch).toHaveBeenCalledTimes(3);
});
it("financial mutation invalidation updates the single object used by all charts", async () => {
  const h = renderHook(
    () => ({
      ...useFinancialScenarios(data.orgId, data.editionId, "portfolio"),
    }),
    { wrapper },
  );
  await waitFor(() => expect(h.result.current.data).toBeDefined());
  mocks.fetch.mockResolvedValue({ ...data, generation: "next" });
  await act(() =>
    client.invalidateQueries({ queryKey: ["financial-operational"] }),
  );
  await waitFor(() => expect(h.result.current.data?.generation).toBe("next"));
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});
it("debounces source events and preserves last valid data when a refresh fails", async () => {
  const h = renderHook(
    () => ({
      ...useFinancialScenarios(data.orgId, data.editionId, "portfolio"),
    }),
    { wrapper },
  );
  await waitFor(() => expect(h.result.current.data).toBeDefined());
  mocks.fetch.mockRejectedValue(new Error("falha de rede"));
  vi.useFakeTimers();
  mocks.listeners.forEach((fn) => fn());
  await tick(749);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  await tick(5);
  await tick(5);
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  expect(h.result.current.isError).toBe(true);
  expect(h.result.current.data?.generation).toBe(data.generation);
});
it("basis changes use separate keys and cannot display portfolio as received cash", async () => {
  const h = renderHook(
    ({ basis }: { basis: "portfolio" | "cash" }) =>
      useFinancialScenarios(data.orgId, data.editionId, basis),
    { wrapper, initialProps: { basis: "portfolio" } },
  );
  await waitFor(() => expect(h.result.current.data).toBeDefined());
  mocks.fetch.mockResolvedValue({ ...data, basis: "cash" });
  h.rerender({ basis: "cash" });
  await waitFor(() => expect(h.result.current.data?.basis).toBe("cash"));
  expect(mocks.fetch).toHaveBeenLastCalledWith(
    data.orgId,
    data.editionId,
    "cash",
  );
});
