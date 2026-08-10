import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface VenueSearchContextValue {
  query: string;
  setQuery: (value: string) => void;
}

const VenueSearchContext = createContext<VenueSearchContextValue | null>(null);

export function VenueSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return (
    <VenueSearchContext.Provider value={value}>
      {children}
    </VenueSearchContext.Provider>
  );
}

export function useVenueSearch() {
  return useContext(VenueSearchContext);
}
