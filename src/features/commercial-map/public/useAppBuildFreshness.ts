import { useEffect, useState } from 'react';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const ASSET_PATTERN = /\/assets\/[^"']*-[A-Za-z0-9_-]{8,}\.js/g;

function loadedAssets(): Set<string> {
  if (typeof document === 'undefined') return new Set();
  const found = new Set<string>();
  document.querySelectorAll('script[src]').forEach((node) => {
    const src = (node as HTMLScriptElement).getAttribute('src') ?? '';
    const match = src.match(ASSET_PATTERN);
    if (match) match.forEach((item) => found.add(item));
  });
  return found;
}

/** Compare executable entry scripts only. Modulepreload links and inline text
 * do not identify a different application build. */
export function servedEntryAssets(html: string): string[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return [...parsed.querySelectorAll('script[src]')].flatMap(node => (node.getAttribute('src') ?? '').match(ASSET_PATTERN) ?? []);
}

/**
 * Detecta publicação de código/assets novos (modelos, texturas, componentes):
 * o servidor passa a apontar para bundles diferentes dos que estão carregados.
 */
export function useAppBuildFreshness(): boolean {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch(`${window.location.origin}/index.html`, { cache: 'no-store' });
        if (!response.ok) return;
        const html = await response.text();
        const served = servedEntryAssets(html);
        if (served.length === 0) return;
        const current = loadedAssets();
        if (current.size === 0) return;
        const stale = served.some((asset) => !current.has(asset));
        if (!cancelled && stale) setOutdated(true);
      } catch {
        /* sem conexão: tenta de novo no próximo ciclo */
      }
    };

    void check();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, CHECK_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, []);

  return outdated;
}
