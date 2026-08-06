import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface CronogramaSearchContextValue {
  query: string;
  setQuery: (value: string) => void;
}

const CronogramaSearchContext = createContext<CronogramaSearchContextValue | null>(null);

export function CronogramaSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return <CronogramaSearchContext.Provider value={value}>{children}</CronogramaSearchContext.Provider>;
}

/** Returns null when rendered outside the cronograma module shell. */
export function useCronogramaSearch() {
  return useContext(CronogramaSearchContext);
}
