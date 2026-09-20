import { useEffect } from 'react';
import { useAppBuildFreshness } from './useAppBuildFreshness';

const LAST_RELOAD_KEY = 'fenasoja-public-map-auto-reload';
const MIN_INTERVAL_MS = 10 * 60 * 1000;
const SETTLE_MS = 1500;

/**
 * Publicação de código/recursos é aplicada sozinha, sem aviso e sem laço de
 * recarregamento: só recarrega quando não há ficha aberta e no máximo uma vez
 * a cada dez minutos. A posição atual (endereço do link) é preservada porque a
 * própria URL já identifica a área.
 */
export function usePublicAutoRefresh(blocked: boolean): void {
  const outdated = useAppBuildFreshness();

  useEffect(() => {
    if (!outdated || blocked) return undefined;
    let last = 0;
    try {
      last = Number(window.sessionStorage.getItem(LAST_RELOAD_KEY) ?? '0');
    } catch { last = 0; }
    if (Date.now() - last < MIN_INTERVAL_MS) return undefined;

    const timer = window.setTimeout(() => {
      try { window.sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now())); } catch { /* sessão indisponível */ }
      window.location.reload();
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [blocked, outdated]);
}
