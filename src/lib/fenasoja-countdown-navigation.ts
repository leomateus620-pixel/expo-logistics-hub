export const FENASOJA_COUNTDOWN_ROUTE = '/cronograma-eventos/contagem-oficial';

const launchStorageKey = 'fenasoja-countdown-launch-context';

export interface FenasojaCountdownLaunchContext {
  focusId: string;
  scrollX: number;
  scrollY: number;
}

export function rememberFenasojaCountdownLaunch(focusId: string) {
  if (typeof window === 'undefined') return;

  const context: FenasojaCountdownLaunchContext = {
    focusId,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };

  try {
    window.sessionStorage.setItem(launchStorageKey, JSON.stringify(context));
  } catch {
    // Navigation remains functional when storage is blocked.
  }
}

export function consumeFenasojaCountdownLaunch(): FenasojaCountdownLaunchContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const serialized = window.sessionStorage.getItem(launchStorageKey);
    window.sessionStorage.removeItem(launchStorageKey);
    if (!serialized) return null;

    const parsed = JSON.parse(serialized) as Partial<FenasojaCountdownLaunchContext>;
    if (
      typeof parsed.focusId !== 'string'
      || typeof parsed.scrollX !== 'number'
      || !Number.isFinite(parsed.scrollX)
      || typeof parsed.scrollY !== 'number'
      || !Number.isFinite(parsed.scrollY)
    ) {
      return null;
    }

    return parsed as FenasojaCountdownLaunchContext;
  } catch {
    return null;
  }
}

export function findFenasojaCountdownReturnFocus(
  focusId: string,
  root: Document = document,
) {
  const rememberedControl = root.getElementById(focusId);
  if (rememberedControl instanceof HTMLElement) return rememberedControl;

  const responsiveFallback = root.querySelector('[data-fenasoja-countdown-expand]');
  return responsiveFallback instanceof HTMLElement ? responsiveFallback : null;
}

export function runFenasojaCountdownViewTransition(action: () => void) {
  if (typeof document === 'undefined') {
    action();
    return;
  }

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const viewTransitionDocument = document as Document & {
    startViewTransition?: (callback: () => void) => unknown;
  };

  if (reducedMotion || !viewTransitionDocument.startViewTransition) {
    action();
    return;
  }

  viewTransitionDocument.startViewTransition(action);
}
