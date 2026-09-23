import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CarFront, DoorOpen, Footprints, Moon, RotateCcw, RotateCw, Sun, X } from 'lucide-react';
import { STATUS_CONFIG } from '../constants';
import { resolveCommercialMapSegment } from '../data/commercialMapSegments';
import { useLotPricing2028 } from '../hooks/useLotPricing2028';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import { formatAreaSqmLabel, formatBrl, formatPricePerSqm } from '../utils/lotPricing2028';
import { normalizeMapEntityMetadata } from '../utils/mapMetadata';
import { useVisitStore } from './useVisitStore';
import { clearTouch, getTouchRun, setTouchMove, setTouchRun, setTouchVehicle, subscribeTouchRun } from './VisitInputManager';
import type { VisitPOI } from './VisitPOIManager';
import './visit.css';

function HelicopterGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 3h18M12 3v3M6 10h12a4 4 0 0 1 4 4v1H8a5 5 0 0 1-5-5h3Z" />
    <path d="M8 15l-2 4h11l-2-4M2 12H1m20 2h2" />
  </svg>;
}

/** One query for the observed lot. It shares the official panel's cache and service. */
const VisitLotInformation = memo(function VisitLotInformation({ poi, expanded }: { poi: VisitPOI; expanded: boolean }) {
  const lot = poi.lot!;
  const query = useLotPricing2028(lot.id);
  const pricing = query.data;
  const metadata = normalizeMapEntityMetadata(poi.entity, lot);
  const segment = resolveCommercialMapSegment(poi.entity, lot);
  const area = pricing?.officialAreaSqm ?? lot.officialAreaSqm;
  const ready = pricing?.resolutionStatus === 'OK';
  const secondTotal = ready ? formatBrl(pricing.segundaTotal) : null;
  return <>
    <div className="visit-poi__facts">
      <span>{formatAreaSqmLabel(area) ?? 'Área não informada'}</span>
      <span>{STATUS_CONFIG[lot.status].label}</span>
    </div>
    {segment && <p className="visit-poi__segment">{segment.name}</p>}
    {secondTotal && <p className="visit-poi__price"><strong>{secondTotal}</strong><small>2ª Etapa</small></p>}
    {!secondTotal && <small className="visit-poi__pending">{query.isLoading ? 'Consultando valor oficial…'
      : query.isError ? 'Valor oficial indisponível no momento'
        : pricing && pricing.resolutionStatus !== 'EXCLUIDO' && pricing.resolutionStatus !== 'OK'
          ? 'Valor pendente de conferência' : 'Valor oficial ainda não definido'}</small>}
    {expanded && <div className="visit-poi__details">
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
  const mobilityMode = useVisitStore(state => state.mobilityMode);
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
      {mobilityMode === 'walk' && poi.interiorAvailable && <button type="button" onClick={() => enterInterior(poi.entity.id)}
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

function VisitVehicleTouchControls({ kind }: { kind: 'cart' | 'helicopter' }) {
  const pointers = useRef(new Set<number>());
  useEffect(() => {
    const owned = pointers.current;
    return () => { for (const id of owned) clearTouch(id); owned.clear(); };
  }, []);
  const control = (label: string, axis: 'forward' | 'strafe' | 'yaw' | 'vertical', value: number, icon: ReactNode) =>
    <button key={label} type="button" aria-label={label}
      onPointerDown={event => {
        event.preventDefault(); event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        pointers.current.add(event.pointerId); setTouchVehicle(event.pointerId, axis, value);
      }}
      onPointerUp={event => { clearTouch(event.pointerId); pointers.current.delete(event.pointerId); }}
      onPointerCancel={event => { clearTouch(event.pointerId); pointers.current.delete(event.pointerId); }}
      onLostPointerCapture={event => { clearTouch(event.pointerId); pointers.current.delete(event.pointerId); }}>
      {icon}<span>{label}</span>
    </button>;
  return <div className="visit-touch visit-touch--vehicle" data-visit-vehicle-touch aria-label={kind === 'cart' ? 'Controles do carrinho' : 'Controles do helicóptero'}>
    <div className="visit-touch__vehicle-pad">
      {control('Avançar', 'forward', 1, <ArrowUp aria-hidden="true" />)}
      {control('Voltar', 'forward', -1, <ArrowDown aria-hidden="true" />)}
      {control(kind === 'cart' ? 'Virar à esquerda' : 'Deslocar à esquerda', 'strafe', -1, <ArrowLeft aria-hidden="true" />)}
      {control(kind === 'cart' ? 'Virar à direita' : 'Deslocar à direita', 'strafe', 1, <ArrowRight aria-hidden="true" />)}
    </div>
    {kind === 'helicopter' && <div className="visit-touch__vehicle-pad visit-touch__vehicle-pad--flight">
      {control('Subir', 'vertical', 1, <ArrowUp aria-hidden="true" />)}
      {control('Descer', 'vertical', -1, <ArrowDown aria-hidden="true" />)}
      {control('Girar à esquerda', 'yaw', -1, <RotateCcw aria-hidden="true" />)}
      {control('Girar à direita', 'yaw', 1, <RotateCw aria-hidden="true" />)}
    </div>}
  </div>;
}

export function VisitHUD() {
  const enabled = useVisitStore(state => state.enabled);
  const cameraMode = useVisitStore(state => state.cameraMode);
  const mobilityMode = useVisitStore(state => state.mobilityMode);
  const mobilityPhase = useVisitStore(state => state.mobilityPhase);
  const canBoardHelicopter = useVisitStore(state => state.canBoardHelicopter);
  const vehicleNotice = useVisitStore(state => state.vehicleNotice);
  const phase = useVisitStore(state => state.phase);
  const activePOI = useVisitStore(state => state.activePOI);
  const activeInterior = useVisitStore(state => state.activeInterior);
  const error = useVisitStore(state => state.error);
  const exit = useVisitStore(state => state.exit);
  const leaveInterior = useVisitStore(state => state.leaveInterior);
  const setCameraMode = useVisitStore(state => state.setCameraMode);
  const requestCart = useVisitStore(state => state.requestCart);
  const requestHelicopter = useVisitStore(state => state.requestHelicopter);
  const enterHelicopter = useVisitStore(state => state.enterHelicopter);
  const requestHelicopterLanding = useVisitStore(state => state.requestHelicopterLanding);
  const exitVehicle = useVisitStore(state => state.exitVehicle);
  const cancelHelicopter = useVisitStore(state => state.cancelHelicopter);
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
  const walking = mobilityPhase === 'walk' || mobilityPhase === 'helicopter-requested' || mobilityPhase === 'helicopter-arriving' || mobilityPhase === 'helicopter-landed';
  const cartDriving = mobilityPhase === 'cart-driving';
  const helicopterOccupied = ['helicopter-entering', 'helicopter-flying', 'helicopter-landing', 'helicopter-grounded'].includes(mobilityPhase);
  return <div className="visit-hud" data-visit-hud data-visit-phase={phase} data-visit-mobility={mobilityPhase}>
    <div className="visit-hud__bar" role="group" aria-label="Modo Visita">
      <span className="visit-hud__title">Modo Visita</span>
      {!interior && <div className="visit-hud__mobility" role="group" aria-label="Mobilidade da visita">
        <button type="button" className="visit-hud__icon" aria-label="Caminhada" aria-pressed={mobilityPhase === 'walk'}
          disabled={helicopterOccupied && mobilityPhase !== 'helicopter-grounded'}
          onClick={() => { if (mobilityPhase === 'helicopter-landed' || mobilityPhase === 'helicopter-arriving' || mobilityPhase === 'helicopter-requested') cancelHelicopter(); else exitVehicle(); }}><Footprints /></button>
        <button type="button" className="visit-hud__icon" aria-label="Carrinho elétrico Fenasoja" aria-pressed={mobilityMode === 'cart'}
          disabled={mobilityPhase !== 'walk' || phase !== 'active'} onClick={requestCart}><CarFront /></button>
        <button type="button" className="visit-hud__icon" aria-label="Helicóptero Fenasoja" aria-pressed={mobilityMode === 'helicopter'}
          disabled={mobilityPhase !== 'walk' || phase !== 'active'} onClick={requestHelicopter}><HelicopterGlyph /></button>
      </div>}
      {!interior && <div className="visit-hud__cameras" role="group" aria-label="Câmera da visita">
        <button type="button" aria-pressed={cameraMode === 'first'} onClick={() => setCameraMode('first')}>1ª pessoa</button>
        <button type="button" aria-pressed={cameraMode === 'third'} onClick={() => setCameraMode('third')}>3ª pessoa</button>
      </div>}
      {!interior && <button className="visit-hud__icon" type="button" onClick={toggleNight}
        aria-label={night ? 'Ativar dia na visita' : 'Ativar noite na visita'}>{night ? <Sun /> : <Moon />}</button>}
      {!interior && (cartDriving || mobilityPhase === 'helicopter-grounded') && <button type="button" className="visit-hud__vehicle-action" onClick={exitVehicle}>Sair do {cartDriving ? 'carrinho' : 'helicóptero'}</button>}
      {!interior && mobilityPhase === 'helicopter-landed' && canBoardHelicopter && <button type="button" className="visit-hud__vehicle-action" onClick={enterHelicopter}>Entrar no helicóptero</button>}
      {!interior && mobilityPhase === 'helicopter-flying' && <button type="button" className="visit-hud__vehicle-action" onClick={requestHelicopterLanding}>Pousar</button>}
      {interior && <button type="button" onClick={leaveInterior} data-visit-leave-interior><ArrowLeft />Continuar visita</button>}
      <button className="visit-hud__exit" type="button" onClick={exit} aria-label="Sair do Modo Visita"><X /><span>Sair</span></button>
    </div>
    {(phase === 'loading' || phase === 'entering') && <div className="visit-hud__intro" role="status">
      <strong>Modo Visita</strong><span>Caminhe pelo parque e conheça os espaços disponíveis.</span>
    </div>}
    {error && <p className="visit-hud__error" role="alert">{error}</p>}
    {(vehicleNotice || mobilityPhase === 'cart-entering' || mobilityPhase === 'helicopter-requested')
      && <p className="visit-hud__vehicle-notice" role="status">{vehicleNotice ?? (mobilityPhase === 'cart-entering' ? 'Preparando carrinho…' : 'Preparando helicóptero…')}</p>}
    {!interior && displayedPOI && <VisitContextCard key={displayedPOI.id} poi={displayedPOI}
      visible={activePOI?.id === displayedPOI.id && phase === 'active'} />}
    {!interior && <>
      <p className="visit-hud__desktop-help">{cartDriving ? 'W/S acelerar, frear e dar ré · A/D esterçar · Espaço frear' : helicopterOccupied ? 'W/S avançar e recuar · A/D lateral · Q/E girar · Espaço/Ctrl subir e descer' : 'W / ↑ avançar · S / ↓ voltar · Shift correr'}<br /><span>{walking ? 'Arraste para olhar · clique no mapa para olhar com o mouse · Esc libera o mouse' : 'Clique ou toque em um lote ou estrutura para ver detalhes'}</span></p>
      {walking ? <VisitTouchControls /> : cartDriving ? <VisitVehicleTouchControls kind="cart" /> : helicopterOccupied ? <VisitVehicleTouchControls kind="helicopter" /> : null}
    </>}
  </div>;
}

export default VisitHUD;
