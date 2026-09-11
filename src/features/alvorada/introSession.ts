/**
 * Per-execution memory for the embedded Alvorada intro.
 *
 * "New access" means a fresh JavaScript execution of the app: the first portal
 * render after authentication, a new tab or a page reload. The flag therefore
 * lives only in module scope. It is intentionally not persisted (no storage),
 * so the intro returns on the next access while internal navigation, data
 * refreshes, resizes and re-renders within the same execution never replay it.
 */
let introStarted = false;

type DismissListener = () => void;
const dismissListeners = new Set<DismissListener>();

export function shouldAutoplayAlvoradaIntro() {
  return !introStarted;
}

export function markAlvoradaIntroStarted() {
  introStarted = true;
}

/**
 * Asks any embedded intro that is still playing to reveal the countdown now.
 * The portal calls this when a more important surface (the ecosystem) opens.
 */
export function dismissAlvoradaIntro() {
  introStarted = true;
  dismissListeners.forEach((listener) => listener());
}

export function subscribeAlvoradaIntroDismiss(listener: DismissListener) {
  dismissListeners.add(listener);
  return () => {
    dismissListeners.delete(listener);
  };
}

/** Test-only reset; production code never rewinds the execution flag. */
export function resetAlvoradaIntroSessionForTests() {
  introStarted = false;
  dismissListeners.clear();
}
