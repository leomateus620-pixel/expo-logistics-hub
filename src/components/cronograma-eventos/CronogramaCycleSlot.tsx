import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface CycleSlotValue {
  node: HTMLElement | null;
  setNode: (node: HTMLElement | null) => void;
}

const CronogramaCycleSlotContext = createContext<CycleSlotValue | null>(null);

/** Allows the timeline board to publish its cycle selector into the top workbench bar. */
export function CronogramaCycleSlotProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  return (
    <CronogramaCycleSlotContext.Provider value={{ node, setNode }}>
      {children}
    </CronogramaCycleSlotContext.Provider>
  );
}

/** Mount point rendered by the shell where the cycle selector should appear. */
export function CronogramaCycleSlotTarget({ className }: { className?: string }) {
  const context = useContext(CronogramaCycleSlotContext);
  if (!context) return null;
  return <div ref={context.setNode} className={className} />;
}

/**
 * Renders children inside the registered slot when available.
 * Falls back to inline rendering so secondary views keep working.
 */
export function CronogramaCyclePortal({ children }: { children: ReactNode }) {
  const context = useContext(CronogramaCycleSlotContext);
  if (!context?.node) return <>{children}</>;
  return createPortal(children, context.node);
}

export function useCronogramaCycleSlotAvailable() {
  return Boolean(useContext(CronogramaCycleSlotContext)?.node);
}
