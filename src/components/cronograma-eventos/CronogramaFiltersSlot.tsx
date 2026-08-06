import { createContext, useContext, type ReactNode } from 'react';

const CronogramaFiltersSlotContext = createContext<ReactNode>(null);

export function CronogramaFiltersSlotProvider({ slot, children }: { slot: ReactNode; children: ReactNode }) {
  return <CronogramaFiltersSlotContext.Provider value={slot}>{children}</CronogramaFiltersSlotContext.Provider>;
}

/** Returns the filters trigger element rendered inside the navy cycle surfaces. */
export function useCronogramaFiltersSlot() {
  return useContext(CronogramaFiltersSlotContext);
}
