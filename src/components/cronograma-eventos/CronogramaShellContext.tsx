import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type CreateAction = (() => void) | null;

export interface CronogramaTemporalNav {
  goToToday: () => void;
  goToPrevious: (() => void) | null;
  goToNext: (() => void) | null;
}

interface CronogramaShellContextValue {
  createAction: CreateAction;
  registerCreateAction: (action: CreateAction) => void;
  temporalNav: CronogramaTemporalNav | null;
  registerTemporalNav: (nav: CronogramaTemporalNav | null) => void;
}

const CronogramaShellContext = createContext<CronogramaShellContextValue | null>(null);

export function CronogramaShellProvider({ children }: { children: ReactNode }) {
  const [createAction, setCreateAction] = useState<CreateAction>(null);
  const [temporalNav, setTemporalNav] = useState<CronogramaTemporalNav | null>(null);
  const registerCreateAction = useCallback((action: CreateAction) => {
    setCreateAction(() => action);
  }, []);
  const registerTemporalNav = useCallback((nav: CronogramaTemporalNav | null) => {
    setTemporalNav(nav);
  }, []);
  const value = useMemo<CronogramaShellContextValue>(
    () => ({ createAction, registerCreateAction, temporalNav, registerTemporalNav }),
    [createAction, registerCreateAction, temporalNav, registerTemporalNav],
  );

  return <CronogramaShellContext.Provider value={value}>{children}</CronogramaShellContext.Provider>;
}


/** Returns null when rendered outside the cronograma module shell. */
export function useCronogramaShell() {
  return useContext(CronogramaShellContext);
}
