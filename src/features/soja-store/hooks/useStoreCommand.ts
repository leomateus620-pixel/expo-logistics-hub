import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { executeStoreCommand, PendingCommandError, type CommandResult, type StoreScope } from "../api/store";

export function useStoreCommand<Payload>(
  scope: StoreScope,
  execute: (requestId: string, payload: Payload) => Promise<CommandResult>,
  onSuccess: (result: CommandResult) => void,
) {
  const attempt = useRef<{ requestId: string; payload: Payload } | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const mutation = useMutation({
    // Keep an interrupted request in the explicit verification flow.
    networkMode: "always",
    mutationFn: async (payload: Payload) => {
      const previous = attempt.current;
      const requestId = previous?.requestId ?? crypto.randomUUID();
      attempt.current = { requestId, payload: previous ? previous.payload : payload };
      return executeStoreCommand(scope, requestId, () => execute(requestId, previous ? previous.payload : payload), !!previous);
    },
    onSuccess: (result) => {
      attempt.current = null;
      if (mounted.current) onSuccess(result);
    },
    onError: (error) => {
      if (!(error instanceof PendingCommandError)) attempt.current = null;
    },
    onSettled: () => { submitting.current = false; },
  });

  const submit: typeof mutation.mutate = (payload, options) => {
    if (submitting.current) return;
    submitting.current = true;
    mutation.mutate(payload, options);
  };

  return {
    mutate: submit,
    reset: mutation.reset,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    isUncertain: mutation.error instanceof PendingCommandError,
    retry: () => {
      if (attempt.current && !mutation.isPending) submit(attempt.current.payload);
    },
  };
}
