import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CronogramaAgendaMode } from '@/lib/cronograma-agenda-mode';

interface CronogramaAgendaModeContextValue {
  mode: CronogramaAgendaMode;
  setMode: (mode: CronogramaAgendaMode) => void;
}

const CronogramaAgendaModeContext = createContext<CronogramaAgendaModeContextValue | null>(null);

export function CronogramaAgendaModeProvider({ children }: { children: ReactNode }) {
  // A fresh visit always opens the established general agenda.
  const [mode, setMode] = useState<CronogramaAgendaMode>('general');
  const value = useMemo(() => ({ mode, setMode }), [mode]);
  return <CronogramaAgendaModeContext.Provider value={value}>{children}</CronogramaAgendaModeContext.Provider>;
}

export function useCronogramaAgendaMode() {
  return useContext(CronogramaAgendaModeContext);
}
