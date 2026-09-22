import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, DoorOpen, Footprints, Moon, Sun, X } from 'lucide-react';
import { STATUS_CONFIG } from '../constants';
import { resolveCommercialMapSegment } from '../data/commercialMapSegments';
import { useLotPricing2028 } from '../hooks/useLotPricing2028';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import { formatAreaSqmLabel, formatBrl, formatPricePerSqm } from '../utils/lotPricing2028';
import { normalizeMapEntityMetadata } from '../utils/mapMetadata';
import { useVisitStore } from './useVisitStore';
import { clearTouch, getTouchRun, setTouchMove, setTouchRun, subscribeTouchRun } from './VisitInputManager';
import type { VisitPOI } from './VisitPOIManager';
import './visit.css';

/** One query for the observed lot. It shares the official panel's cache and service. */
const VisitLotInformation = memo(function VisitLotInformation({ poi, expanded }: { poi: VisitPOI; expanded: boolean }) {
  const lot = poi.lot!;
  const query = useLotPricing2028(lot.id);
  const pricing = query.data;
  const metadata = normalizeMapEntityMetadata(poi.entity, lot);
  const segment = expanded ? resolveCommercialMapSegment(poi.entity, lot) : null;
  const area = pricing?.officialAreaSqm ?? lot.officialAreaSqm;
  const ready = pricing?.resolutionStatus === 'OK';
  const secondTotal = ready ? formatBrl(pricing.segundaTotal) : null;
  return <>
    <div className="visit-poi__facts">
      <span>{formatAreaSqmLabel(area) ?? 'Área não informada'}</span>
      <span>{STATUS_CONFIG[lot.status].label}</span>
    </div>
    {secondTotal && <p className="visit-poi__price"><strong>{secondTotal}</strong><small>2ª Etapa</small></p>}
    {!secondTotal && <small className="visit-poi__pending">{query.isLoading ? 'Consultando valor oficial…'
      : query.isError ? 'Valor oficial indisponível no momento'
        : pricing && pricing.resolutionStatus !== 'EXCLUIDO' && pricing.resolutionStatus !== 'OK'
          ? 'Valor pendente de conferência' : 'Valor oficial ainda não definido'}</small>}
    {expanded && <div className="visit-poi__details">
      {segment && <p>Segmento: {segment.name}</p>}
      <p>{[metadata.block ? `Quadra ${metadata.block}` : null, pricing?.pavilion, lot.levelLabel].filter(Boolean).join(' · ')}</p>
      {ready && <dl>
        <div><dt>Renovação</dt><dd>{formatBrl(pricing.renovacaoTotal) ?? 'Não definido'}</dd></div>
        <div><dt>Valor/m²</dt><dd>{formatPricePerSqm(pricing.renovacaoPricePerSqm) ?? 'Não definido'}</dd></div>
        <div><dt>2ª Etapa</dt><dd>{secondTotal ?? 'Não definido'}</dd></div>
        <div><dt>Valor/m²</dt><dd>{formatPricePerSqm(pricing.segundaPricePerSqm) ?? 'Não definido'}</dd></div>
      </dl>}
      {(pricing?.cornerConfirmed || lot.isCorner) && <small>Lote de esquina</small>}
    </div>}
  </>;
});

const VisitContextCard = memo(function VisitContextCard({ poi, visible }: { poi: VisitPOI; visible: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const card = useRef<HTMLElement>(null);
  const enterInterior = useVisitStore(state => state.enterInterior);
  const metadata = normalizeMapEntityMetadata(poi.entity, poi.lot ?? undefined);
  const title = poi.lot && metadata.lotNumber ? `Lote ${metadata.lotNumber}` : poi.name;
  useLayoutEffect(() => {
    const element = card.current;
    if (!element) return;
    const measure = () => element.style.setProperty('--visit-poi-height', `${element.getBoundingClientRect().height}px`);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <section ref={card} className={`visit-poi${visible ? ' is-visible' : ''}`} data-visit-poi-card
    data-visit-poi-id={poi.id} aria-label={`Informações de ${title}`} aria-hidden={!visible}>
    <small className="visit-poi__identifier">{poi.entity.publicIdentifier}</small>
    <h2>{title}</h2>
    {poi.lot ? <VisitLotInformation poi={poi} expanded={expanded} />
      : <p className={`visit-poi__description${expanded ? ' is-expanded' : ''}`}>{poi.description || 'Estrutura do Parque de Exposições da Fenasoja.'}</p>}
    <div className="visit-poi__actions">
      <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} tabIndex={visible ? 0 : -1}>
        {expanded ? 'Resumir' : poi.lot ? 'Valores e detalhes' : 'Conhecer'}
      </button>
      {poi.interiorAvailable && <button type="button" onClick={() => enterInterior(poi.entity.id)}
        data-visit-enter-interior tabIndex={visible ? 0 : -1}>
        <DoorOpen aria-hidden="true" />Acessar interior
      </button>}
    </div>
  </section>;
});

function VisitTouchControls() {
  const pointers = useRef(new Set<number>());
  const runSelected = useSyncExternalStore(subscribeTouchRun, getTouchRun, getTouchRun);
  const enabled = useVisitStore(state => state.phase === 'active');
  const clear = (event: PointerEvent<HTMLButtonElement>) => {
    clearTouch(event.pointerId);
    pointers.current.delete(event.pointerId);
  };
  useEffect(() => {
    const ownedPointers = pointers.current;
    return () => {
      for (const id of ownedPointers) clearTouch(id);
      ownedPointers.clear(); setTouchRun(false);
    };
  }, []);
  useEffect(() => { if (!enabled) setTouchRun(false); }, [enabled]);
  const press = (event: PointerEvent<HTMLButtonElement>, direction: number) => {
    event.preventDefault(); event.stopPropagation();
    if (!enabled) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.add(event.pointerId);
    setTouchMove(event.pointerId, direction);
  };
  return <div className="visit-touch" data-visit-touch-controls aria-label="Controles de caminhada">
    <div className="visit-touch__movement">
      <button type="button" aria-label="Avançar" data-visit-forward disabled={!enabled}
        onPointerDown={event => press(event, 1)} onPointerUp={clear} onPointerCancel={clear} onLostPointerCapture={clear}>
        <ArrowUp aria-hidden="true" /><span>Avançar</span>
      </button>
      <button type="button" aria-label="Voltar" data-visit-backward disabled={!enabled}
        onPointerDown={event => press(event, -1)} onPointerUp={clear} onPointerCancel={clear} onLostPointerCapture={clear}>
        <ArrowDown aria-hidden="true" /><span>Voltar</span>
      </button>
    </div>
    <div className="visit-touch__look"><span>Arraste para olhar</span>
      <button type="button" aria-label="Correr" aria-pressed={runSelected} disabled={!enabled}
        onClick={event => { event.stopPropagation(); if (enabled) setTouchRun(!getTouchRun()); }}>
        <Footprints aria-hidden="true" /><span>Correr</span>
      </button>
    </div>
  </div>;
}

export function VisitHUD() {
  const enabled = useVisitStore(state => state.enabled);
  const cameraMode = useVisitStore(state => state.cameraMode);
  const phase = useVisitStore(state => state.phase);
  const activePOI = useVisitStore(state => state.activePOI);
  const activeInterior = useVisitStore(state => state.activeInterior);
  const error = useVisitStore(state => state.error);
  const exit = useVisitStore(state => state.exit);
  const leaveInterior = useVisitStore(state => state.leaveInterior);
  const setCameraMode = useVisitStore(state => state.setCameraMode);
  const night = useCommercialMapStore(state => state.nightModeActive);
  const toggleNight = useCommercialMapStore(state => state.toggleNightMode);
  const [displayedPOI, setDisplayedPOI] = useState<VisitPOI | null>(null);
  useEffect(() => {
    if (activePOI) { setDisplayedPOI(activePOI); return; }
    const timeout = window.setTimeout(() => setDisplayedPOI(null), 160);
    return () => window.clearTimeout(timeout);
  }, [activePOI]);
  if (!enabled) return null;
  const interior = Boolean(activeInterior) || phase === 'interior';
  return <div className="visit-hud" data-visit-hud data-visit-phase={phase}>
    <div className="visit-hud__bar" role="group" aria-label="Modo Visita">
      <span className="visit-hud__title">Modo Visita</span>
      {!interior && <div className="visit-hud__cameras" role="group" aria-label="Câmera da visita">
        <button type="button" aria-pressed={cameraMode === 'first'} onClick={() => setCameraMode('first')}>1ª pessoa</button>
        <button type="button" aria-pressed={cameraMode === 'third'} onClick={() => setCameraMode('third')}>3ª pessoa</button>
      </div>}
      {!interior && <button className="visit-hud__icon" type="button" onClick={toggleNight}
        aria-label={night ? 'Ativar dia na visita' : 'Ativar noite na visita'}>{night ? <Sun /> : <Moon />}</button>}
      {interior && <button type="button" onClick={leaveInterior} data-visit-leave-interior><ArrowLeft />Continuar visita</button>}
      <button className="visit-hud__exit" type="button" onClick={exit} aria-label="Sair do Modo Visita"><X /><span>Sair</span></button>
    </div>
    {(phase === 'loading' || phase === 'entering') && <div className="visit-hud__intro" role="status">
      <strong>Modo Visita</strong><span>Caminhe pelo parque e conheça os espaços disponíveis.</span>
    </div>}
    {error && <p className="visit-hud__error" role="alert">{error}</p>}
    {!interior && displayedPOI && <VisitContextCard key={displayedPOI.id} poi={displayedPOI}
      visible={activePOI?.id === displayedPOI.id && phase === 'active'} />}
    {!interior && <>
      <p className="visit-hud__desktop-help">W / ↑ avançar · S / ↓ voltar · Shift correr<br /><span>Arraste para olhar · clique no mapa para olhar com o mouse · Esc libera o mouse</span></p>
      <VisitTouchControls />
    </>}
  </div>;
}

export default VisitHUD;
