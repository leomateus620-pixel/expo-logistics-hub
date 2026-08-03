export const FENASOJA_COUNTDOWN_ROUTE = '/cronograma-eventos/contagem-oficial';

const launchStorageKey = 'fenasoja-countdown-launch-context';

export interface FenasojaCountdownLaunchContext {
  focusId: string;
  scrollX: number;
  scrollY: number;
  originPath?: '/portal' | '/cronograma-eventos';
}

export function rememberFenasojaCountdownLaunch(
  focusId: string,
  originPath?: FenasojaCountdownLaunchContext['originPath'],
) {
  if (typeof window === 'undefined') return;

  const context: FenasojaCountdownLaunchContext = {
    focusId,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    ...(originPath ? { originPath } : {}),
  };

  try {
    window.sessionStorage.setItem(launchStorageKey, JSON.stringify(context));
  } catch {
    // Navigation remains functional when storage is blocked.
  }
}

export function peekFenasojaCountdownLaunch(): FenasojaCountdownLaunchContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const serialized = window.sessionStorage.getItem(launchStorageKey);
    if (!serialized) return null;

    const parsed = JSON.parse(serialized) as Partial<FenasojaCountdownLaunchContext>;
    if (
      typeof parsed.focusId !== 'string'
      || typeof parsed.scrollX !== 'number'
      || !Number.isFinite(parsed.scrollX)
      || typeof parsed.scrollY !== 'number'
      || !Number.isFinite(parsed.scrollY)
      || (
        parsed.originPath !== undefined
        && parsed.originPath !== '/portal'
        && parsed.originPath !== '/cronograma-eventos'
      )
    ) {
      return null;
    }

    return parsed as FenasojaCountdownLaunchContext;
  } catch {
    return null;
  }
}

export function consumeFenasojaCountdownLaunch(): FenasojaCountdownLaunchContext | null {
  const context = peekFenasojaCountdownLaunch();

  try {
    window.sessionStorage.removeItem(launchStorageKey);
  } catch {
    // A valid navigation context remains usable even if removal is blocked.
  }

  return context;
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
