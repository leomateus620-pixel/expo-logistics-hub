import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type CreateAction = (() => void) | null;

interface CronogramaShellContextValue {
  createAction: CreateAction;
  registerCreateAction: (action: CreateAction) => void;
}

const CronogramaShellContext = createContext<CronogramaShellContextValue | null>(null);

export function CronogramaShellProvider({ children }: { children: ReactNode }) {
  const [createAction, setCreateAction] = useState<CreateAction>(null);
  const registerCreateAction = useCallback((action: CreateAction) => {
    setCreateAction(() => action);
  }, []);
  const value = useMemo<CronogramaShellContextValue>(
    () => ({ createAction, registerCreateAction }),
    [createAction, registerCreateAction],
  );

  return <CronogramaShellContext.Provider value={value}>{children}</CronogramaShellContext.Provider>;
}


/** Returns null when rendered outside the cronograma module shell. */
export function useCronogramaShell() {
  return useContext(CronogramaShellContext);
}
