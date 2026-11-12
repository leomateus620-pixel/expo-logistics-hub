import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import type { CommandResult } from "../api/store";
import { PendingCommandError } from "../api/store";
import { useStoreCommand } from "./useStoreCommand";

const transport = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("../api/store", () => ({
  executeStoreCommand: transport.execute,
  PendingCommandError: class PendingCommandError extends Error {},
}));

const scope = { _org_id: "org", _commission_id: "commission" };
const saved: CommandResult = { id: "item", version: 1, status: "active" };

function renderCommand(execute: (requestId: string, payload: string) => Promise<CommandResult>, success: (result: CommandResult) => void) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useStoreCommand(scope, execute, success), { wrapper });
}

it("ignora envios repetidos antes de o formulário renderizar o estado pendente", async () => {
  transport.execute.mockReset().mockImplementation((_scope, _requestId, execute) => execute());
  const execute = vi.fn(async (_requestId: string, _payload: string) => saved);
  const success = vi.fn();
  const { result } = renderCommand(execute, success);

  act(() => {
    result.current.mutate("primeiro");
    result.current.mutate("segundo");
  });

  await waitFor(() => expect(success).toHaveBeenCalledWith(saved));
  expect(execute).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledWith(expect.any(String), "primeiro");
  expect(success).toHaveBeenCalledTimes(1);
});

it("verifica um envio incerto com a mesma chave e os mesmos dados", async () => {
  transport.execute.mockReset()
    .mockRejectedValueOnce(new PendingCommandError())
    .mockImplementationOnce((_scope, _requestId, execute) => execute());
  const execute = vi.fn(async (_requestId: string, _payload: string) => saved);
  const success = vi.fn();
  const { result } = renderCommand(execute, success);
  act(() => result.current.mutate("original"));
  await waitFor(() => expect(result.current.isUncertain).toBe(true));

  const requestId = transport.execute.mock.calls[0][1];
  act(() => {
    result.current.retry();
    result.current.retry();
  });

  await waitFor(() => expect(success).toHaveBeenCalledWith(saved));
  expect(transport.execute).toHaveBeenCalledTimes(2);
  expect(transport.execute).toHaveBeenLastCalledWith(scope, requestId, expect.any(Function), true);
  expect(execute).toHaveBeenCalledWith(requestId, "original");
});
