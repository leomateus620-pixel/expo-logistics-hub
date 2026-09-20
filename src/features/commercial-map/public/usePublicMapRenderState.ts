import { useEffect, useState } from 'react';
import {
  COMMERCIAL_MAP_RENDER_HEALTH_EVENT,
  COMMERCIAL_MAP_PREPARING_EVENT,
  readLatestCommercialMapRenderHealth,
} from '../utils/renderingHealth';

export type PublicMapRenderState = 'preparing' | 'slow' | 'ready' | 'failed';

/** Tempo máximo tolerado até a primeira imagem antes de oferecer alternativa. */
const SLOW_AFTER_MS = 12_000;

function publicCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>('.public-map-canvas canvas');
}

/**
 * Estado real de apresentação do mapa público: só vira `ready` depois que o
 * renderizador confirma quadros apresentados. Nenhuma tela preta silenciosa:
 * a demora vira `slow` e a falha do contexto gráfico vira `failed`.
 */
export function usePublicMapRenderState(enabled: boolean): PublicMapRenderState {
  const [state, setState] = useState<PublicMapRenderState>('preparing');

  useEffect(() => {
    if (!enabled) {
      setState('preparing');
      return undefined;
    }
    let slowTimer: number | null = window.setTimeout(() => {
      setState((current) => (current === 'preparing' ? 'slow' : current));
    }, SLOW_AFTER_MS);

    const read = () => {
      const health = readLatestCommercialMapRenderHealth(publicCanvas());
      if (!health) return;
      if (health.status === 'failed') {
        setState('failed');
        return;
      }
      if (health.presentedFrames > 0 && (health.status === 'ready' || health.status === 'degraded')) {
        if (slowTimer !== null) { window.clearTimeout(slowTimer); slowTimer = null; }
        setState('ready');
      } else if (health.status === 'context-lost' || health.status === 'recovering') {
        setState((current) => (current === 'ready' ? current : 'preparing'));
      }
    };

    window.addEventListener(COMMERCIAL_MAP_RENDER_HEALTH_EVENT, read);
    window.addEventListener(COMMERCIAL_MAP_PREPARING_EVENT, read);
    const poll = window.setInterval(read, 500);
    read();

    return () => {
      if (slowTimer !== null) window.clearTimeout(slowTimer);
      window.clearInterval(poll);
      window.removeEventListener(COMMERCIAL_MAP_RENDER_HEALTH_EVENT, read);
      window.removeEventListener(COMMERCIAL_MAP_PREPARING_EVENT, read);
    };
  }, [enabled]);

  return state;
}
