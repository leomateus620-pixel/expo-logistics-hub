import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

export type LogisticsCycleYear = 2026 | 2028;

interface LogisticsCycleContextValue {
  cycleYear: LogisticsCycleYear;
  setCycleYear: (year: LogisticsCycleYear) => void;
}

const LogisticsCycleContext = createContext<LogisticsCycleContextValue | undefined>(undefined);

function storageKey(userId?: string) {
  return `fenasoja-logistics-cycle:${userId ?? 'anonymous'}`;
}

export function LogisticsCycleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cycleYear, setCycleYearState] = useState<LogisticsCycleYear>(2028);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey(user?.id));
      setCycleYearState(stored === '2026' ? 2026 : 2028);
    } catch {
      setCycleYearState(2028);
    }
  }, [user?.id]);

  const setCycleYear = useCallback((year: LogisticsCycleYear) => {
    setCycleYearState(year);
    try {
      window.localStorage.setItem(storageKey(user?.id), String(year));
    } catch {}
  }, [user?.id]);

  const value = useMemo(() => ({ cycleYear, setCycleYear }), [cycleYear, setCycleYear]);
  return <LogisticsCycleContext.Provider value={value}>{children}</LogisticsCycleContext.Provider>;
}

export function useLogisticsCycle() {
  const context = useContext(LogisticsCycleContext);
  if (!context) throw new Error('useLogisticsCycle must be used within LogisticsCycleProvider');
  return context;
}