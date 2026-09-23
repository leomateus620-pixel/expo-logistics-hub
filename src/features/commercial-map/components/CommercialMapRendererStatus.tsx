import { useEffect, useState, useSyncExternalStore } from 'react';
import { CommercialMapBootLoader } from './CommercialMapBootLoader';
import { getCommercialMapBootSnapshot, subscribeCommercialMapBoot } from '../utils/performanceDiagnostics';
import {
  COMMERCIAL_MAP_RENDER_HEALTH_EVENT,
  COMMERCIAL_MAP_PREPARING_EVENT,
  COMMERCIAL_MAP_RENDER_RETRY_EVENT,
  readCommercialMapRenderHealth,
  type RenderHealthStatus,
} from '../utils/renderingHealth';
import './commercial-map-renderer-status.css';

const RENDER_STATUS_MESSAGES: Record<Exclude<RenderHealthStatus, 'ready'>, string> = {
  degraded: 'Efeitos visuais reduzidos. A navegação continua disponível.',
  'context-lost': 'A conexão gráfica foi interrompida. Aguardando restauração…',
  recovering: 'Recuperando a imagem do mapa…',
  failed: 'Não foi possível recuperar a imagem do mapa.',
};

function currentMapCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>(
    '.commercial-map-canvas canvas, canvas.commercial-map-canvas, .public-map-canvas canvas',
  );
}

/** Boot cover until presentation; passive graphics notices after the map opens. */
export function CommercialMapRendererStatus({ active = true, onOpenList }: { active?: boolean; onOpenList?: () => void }) {
  const [status, setStatus] = useState<RenderHealthStatus>('ready');
  const boot = useSyncExternalStore(subscribeCommercialMapBoot, getCommercialMapBootSnapshot, getCommercialMapBootSnapshot);

  useEffect(() => {
    const updateStatus = () => {
      const health = readCommercialMapRenderHealth(currentMapCanvas());
      setStatus(health?.status ?? 'ready');
    };
    const onHealth = (event: Event) => {
      if (event.target === currentMapCanvas()) updateStatus();
    };
    window.addEventListener(COMMERCIAL_MAP_RENDER_HEALTH_EVENT, onHealth);
    window.addEventListener(COMMERCIAL_MAP_PREPARING_EVENT, onHealth);
    updateStatus();
    return () => {
      window.removeEventListener(COMMERCIAL_MAP_RENDER_HEALTH_EVENT, onHealth);
      window.removeEventListener(COMMERCIAL_MAP_PREPARING_EVENT, onHealth);
    };
  }, []);

  const retry = () => {
    const canvas = currentMapCanvas();
    // A stale notice must not retry a different/already recovered renderer.
    if (!canvas || readCommercialMapRenderHealth(canvas)?.status !== 'failed') return;
    canvas.dispatchEvent(new CustomEvent(COMMERCIAL_MAP_RENDER_RETRY_EVENT, { bubbles: true }));
  };

  // A degraded renderer must pass the same boot barrier as the normal path.
  // Keep recovery actions reachable while the initial cover is still present.
  if (!boot.commercialMapReady || status === 'ready') return <CommercialMapBootLoader active={active}
    onOpenList={onOpenList} error={status === 'failed' ? RENDER_STATUS_MESSAGES.failed : undefined}
    onRetry={() => {
      if (readCommercialMapRenderHealth(currentMapCanvas())?.status === 'failed') retry();
      else window.location.reload();
    }} />;

  return (
    <div
      className="commercial-map-renderer-status"
      data-render-status={status}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span>{RENDER_STATUS_MESSAGES[status]}</span>
      {status === 'failed' && (
        <button type="button" onClick={retry}>Recuperar mapa</button>
      )}
    </div>
  );
}
