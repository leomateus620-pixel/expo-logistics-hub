import { useCallback, useSyncExternalStore } from 'react';

/**
 * Tiny cross-tree store that guarantees only one mobile expansion
 * (busca, navegação, ciclo, filtros, resumo) stays open at a time.
 */
let current: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function closeMobileOverlays() {
  if (current === null) return;
  current = null;
  emit();
}

export function useExclusiveMobileOverlay(id: string): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(
    subscribe,
    () => current === id,
    () => false,
  );

  const setOpen = useCallback((next: boolean) => {
    if (next) {
      if (current === id) return;
      current = id;
    } else if (current === id) {
      current = null;
    } else {
      return;
    }
    emit();
  }, [id]);

  return [open, setOpen];
}
