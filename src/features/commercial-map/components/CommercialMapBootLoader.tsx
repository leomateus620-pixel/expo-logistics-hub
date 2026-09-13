import { useSyncExternalStore } from 'react';
import { getCommercialMapBootSnapshot, subscribeCommercialMapBoot, type CommercialMapBootSnapshot } from '../utils/performanceDiagnostics';
import './commercial-map-boot-loader.css';

const milestones = [
  { label: 'Dados comerciais', weight: 23, keys: ['essential-data:end', 'essential-data:cached', 'fixture-data-ready'] },
  { label: 'Estrutura do parque', weight: 32, keys: ['critical-scene:end'] },
  { label: 'Preparando visualização', weight: 30, keys: ['first-draw'] },
  { label: 'Controles e navegação', weight: 15, keys: ['first-interactive'] },
] as const;

export function commercialMapBootProgress(boot: CommercialMapBootSnapshot) {
  const done = milestones.map((stage) => stage.keys.some((key) => boot.marks[key] !== undefined));
  const progress = milestones.reduce((total, stage, index) => total + (done[index] ? stage.weight : 0), 0);
  return { done, progress, current: Math.max(0, done.indexOf(false)) };
}

/** CSS/SVG only. Percentages advance exclusively when the renderer/data report completion. */
export function CommercialMapBootLoader({ force = false, error, onRetry }: { force?: boolean; error?: string; onRetry?: () => void }) {
  const boot = useSyncExternalStore(subscribeCommercialMapBoot, getCommercialMapBootSnapshot, getCommercialMapBootSnapshot);
  if (boot.interactive && !force && !error) return null;
  const { done, progress, current } = commercialMapBootProgress(boot);
  const failed = error || (boot.failed ? 'Não foi possível preparar o mapa. Tente novamente.' : null);
  return <section className="commercial-map-boot" aria-label="Carregamento do Mapa Comercial" data-map-boot={failed ? 'failed' : 'loading'}>
    <div className="commercial-map-boot__glow" aria-hidden="true" />
    <div className="commercial-map-boot__content">
      <span className="commercial-map-boot__brand">FENASOJA <b>2028</b></span>
      <svg className="commercial-map-boot__map" viewBox="0 0 360 148" fill="none" aria-hidden="true">
        <path d="M26 115 72 34 158 20 240 31 334 93 265 135 125 129Z" />
        <path d="m61 91 221 20M84 48l205 45M115 33l-15 80M169 29l-13 90M219 38l-9 86M261 63l-6 57" />
        <path d="m114 54 33-3-4 31-34-2Zm57-7 35 4-4 33-35-3Zm53 16 25 8-3 18-25-3Z" className="commercial-map-boot__plots" />
        <circle cx="74" cy="111" r="4" /><circle cx="279" cy="93" r="4" />
      </svg>
      <span className="commercial-map-boot__eyebrow">GESTÃO TERRITORIAL</span>
      <h1>{failed ? 'Vamos tentar novamente' : 'Preparando o Mapa Comercial'}</h1>
      <p role="status" aria-live="polite">{failed || milestones[current].label}</p>
      <div className="commercial-map-boot__meter" role="progressbar" aria-label="Preparação do mapa" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="commercial-map-boot__percentage">{progress}%</div>
      <ol>{milestones.map((stage, index) => <li key={stage.label} data-state={done[index] ? 'done' : current === index ? 'active' : 'pending'}>
        <span aria-hidden="true">{done[index] ? '✓' : current === index ? '●' : '○'}</span>{stage.label}
      </li>)}</ol>
      {failed && <button type="button" onClick={onRetry ?? (() => window.location.reload())}>Tentar novamente</button>}
      <small>O ambiente ganha detalhes enquanto você explora.</small>
    </div>
  </section>;
}
