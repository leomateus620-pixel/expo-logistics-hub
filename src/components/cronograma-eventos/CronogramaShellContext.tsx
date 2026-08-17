import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type CreateAction = (() => void) | null;

interface CronogramaShellContextValue {
  createAction: CreateAction;
  registerCreateAction: (action: CreateAction) => void;
}

const CronogramaShellContext = createContext<CronogramaShellContextValue | null>(null);

export function CronogramaShellProvider({ children }: { children: ReactNode }) {
  const [createAction, setCreateAction] = useState<CreateAction>(null);
  const value = useMemo<CronogramaShellContextValue>(() => ({
    createAction,
    registerCreateAction: (action: CreateAction) => setCreateAction(() => action),
  }), [createAction]);

  return <CronogramaShellContext.Provider value={value}>{children}</CronogramaShellContext.Provider>;
}

/** Returns null when rendered outside the cronograma module shell. */
export function useCronogramaShell() {
  return useContext(CronogramaShellContext);
}
