import { renderHook, waitFor, cleanup } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
} from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({ userId: "u1", orgId: "o1", allowed: true }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: state.userId } }),
}));
vi.mock("@/hooks/useCurrentOrg", () => ({
  useCurrentOrg: () => ({ orgId: state.orgId }),
}));
const api = vi.hoisted(() => ({ contacts: vi.fn(), rpc: vi.fn() }));
vi.mock("./api", () => ({
  teamRpc: api.rpc,
  listTeamContacts: api.contacts,
  saveVolunteer: vi.fn(),
}));
import { useTeamManagement } from "./useTeamManagement";
afterEach(() => {
  cleanup();
  state.allowed = true;
  state.orgId = "o1";
  state.userId = "u1";
  vi.clearAllMocks();
});
it("partitions contacts, excludes them from persistence, and erases them on scope loss", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.rpc.mockImplementation(async () => (state.allowed ? ["c1"] : []));
  api.contacts.mockResolvedValue([
    { person_id: "p1", email: "private@example.invalid" },
  ]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result, rerender, unmount } = renderHook(
    () => useTeamManagement("c1"),
    { wrapper },
  );
  await waitFor(() => expect(result.current.contacts).toHaveLength(1));
  expect(
    qc.getQueryData(["team-private", "o1", "u1", "c1", "contacts"]),
  ).toBeDefined();
  expect(
    JSON.stringify(
      dehydrate(qc, { shouldDehydrateQuery: (q) => q.meta?.persist !== false }),
    ),
  ).not.toContain("private@example.invalid");
  state.allowed = false;
  await qc.invalidateQueries({
    queryKey: ["team-private", "o1", "u1", "c1", "permission"],
  });
  await waitFor(() => expect(result.current.canManage).toBe(false));
  expect(result.current.contacts).toHaveLength(0);
  await waitFor(() =>
    expect(
      JSON.stringify(
        qc
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain("private@example.invalid"),
  );
  state.orgId = "o2";
  state.userId = "u2";
  rerender();
  expect(result.current.contacts).toHaveLength(0);
  expect(
    qc.getQueryCache().findAll({ queryKey: ["team-private", "o1", "u1"] }),
  ).toHaveLength(0);
  unmount();
  qc.clear();
});
it("does not request contacts for an ordinary member", async () => {
  state.allowed = false;
  api.rpc.mockResolvedValue([]);
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  renderHook(() => useTeamManagement("c1"), { wrapper });
  await waitFor(() => expect(api.rpc).toHaveBeenCalled());
  expect(api.contacts).not.toHaveBeenCalled();
  qc.clear();
});
