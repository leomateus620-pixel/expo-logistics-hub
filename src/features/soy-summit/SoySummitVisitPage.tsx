import { Component, Suspense, lazy, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Expand, Home, X, Eye, RotateCcw } from 'lucide-react';
import { SoySummitCountdown } from '@/components/countdown/SoySummitCountdown';
import { SOY_SUMMIT, SOY_SUMMIT_HOME } from '@/config/soy-summit';
import { neighbors, VISIT_NODES, type VisitNode } from './venue-layout';
import type { VenueRenderer, Quality, ResolvedQuality } from './scene/venue-renderer';
import './soy-visit.css';

const VenueScene = lazy(() => import('./VenueScene'));
class SceneBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onError(error.message); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function SoySummitVisitPage() {
  const host = useRef<HTMLDivElement>(null);
  const control = useRef<VenueRenderer | null>(null);
  const [node, setNode] = useState<VisitNode>('exterior');
  const [moving, setMoving] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [ready, setReady] = useState(false);
  const [quality, setQuality] = useState<Quality>('auto');
  const [resolved, setResolved] = useState<ResolvedQuality>('balanced');
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState('Preparando o exterior…');
  const [light, setLight] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [help, setHelp] = useState(true);
  const [previous, setPrevious] = useState<VisitNode>('exterior');
  const [fullscreenError, setFullscreenError] = useState('');
  const current = VISIT_NODES[node];
  const go = (target: VisitNode) => { setPrevious(node);control.current?.resume();void control.current?.go(target); };
  const retry = () => { setError('');setLight(false);setReady(false);setNode('exterior');setMoving(false);setPresenting(false);setPreparing('Preparando o exterior…');setAttempt(a => a + 1); };
  const fallback = light || Boolean(error);
  return <div ref={host} className="soy-visit" data-node={node} data-ready={ready && !fallback}>
    <header className="soy-visit__header">
      <Link to={SOY_SUMMIT_HOME} className="soy-visit__back"><ArrowLeft aria-hidden="true" /><span>Voltar ao Soy Summit</span></Link>
      <div className="soy-visit__identity"><span>SOY SUMMIT 2027</span><h1>Centro Cívico 3D</h1><p>{SOY_SUMMIT.venue} · {SOY_SUMMIT.city}</p></div>
      <div className="soy-visit__header-actions">
        <button onClick={() => fallback ? retry() : setLight(true)} aria-pressed={fallback} title="Apresentação leve"><Eye aria-hidden="true" /><span>{fallback ? 'Visita 3D' : 'Versão leve'}</span></button>
        {typeof document !== 'undefined' && document.fullscreenEnabled && <button aria-label="Alternar tela cheia" onClick={() => {
          const action = document.fullscreenElement ? document.exitFullscreen() : host.current?.requestFullscreen();
          void action?.catch(() => setFullscreenError('Tela cheia indisponível neste navegador.'));
        }}><Expand aria-hidden="true" /></button>}
      </div>
    </header>
    <div className="soy-visit__viewport">
      {fallback ? <div className="soy-visit__fallback">
        <div><p className="soy-visit__eyebrow">APRESENTAÇÃO LEVE · SEM NAVEGAÇÃO 3D</p>
          <h2>{error ? 'Vamos tentar novamente?' : 'Um encontro marcado para 2027'}</h2>
          <p>{error ? 'A visita 3D não pôde continuar neste dispositivo. A contagem permanece disponível.' : 'A contagem oficial continua disponível nesta apresentação.'}</p>
          {error && <details><summary>Detalhes técnicos</summary><p>{error}</p></details>}
          <button onClick={retry}><RotateCcw aria-hidden="true" />{error ? 'Tentar novamente' : 'Abrir visita 3D'}</button>
        </div>
        <SoySummitCountdown />
        <figure><img src="/soy-summit/exterior-preview.webp" alt="Vista ilustrativa da reconstrução do Centro Cívico, com volumes brancos, marquise e banner do Soy Summit" onError={e => { e.currentTarget.hidden = true; }} /><figcaption>Reconstrução visual baseada nas referências fornecidas.</figcaption></figure>
      </div> : <SceneBoundary key={attempt} onError={setError}>
        <Suspense fallback={<div className="soy-visit__loading" role="status">Preparando a visita 3D…</div>}>
          <VenueScene quality={quality} controlRef={control} onReady={() => { setReady(true);setPreparing(''); }}
            onMove={(next, inMotion) => { setNode(next);setMoving(inMotion); }} onQuality={setResolved} onError={setError} onPreparing={setPreparing} onPresentation={setPresenting} />
        </Suspense>
      </SceneBoundary>}
      {!fallback && !ready && <div className="soy-visit__loading" role="status"><span className="soy-visit__loader" />{preparing || 'Preparando a visita…'}</div>}
      {!fallback && ready && <>
        <div className="soy-visit__location"><span>{current.room === 'exterior' ? '01 / EXTERIOR' : current.room === 'hall' ? '02 / HALL' : '03 / AUDITÓRIO'}</span><strong>{current.label}</strong></div>
        <div className="soy-visit__quick"><button disabled={moving || presenting || node === 'exterior'} onClick={() => go('exterior')}><Home aria-hidden="true" /><span>Visão inicial</span></button><button disabled={moving || presenting || node === 'panel'} onClick={() => go('panel')}>Ver contagem<ArrowRight aria-hidden="true" /></button></div>
        {presenting && <div className="soy-visit__presentation"><span role="status">Abertura do Soy Summit 2027</span><button onClick={() => control.current?.skipPresentation()}>Pular apresentação<ArrowRight aria-hidden="true" /></button></div>}
        {!presenting && !moving && current.room === 'auditorium' && <button className="soy-visit__replay" onClick={() => control.current?.replayPresentation()}><RotateCcw aria-hidden="true" />Rever abertura</button>}
        {help && !presenting && <div className="soy-visit__help"><p>{node === 'panel' ? 'Toque nos cards para destacá-los. No teclado, use as teclas 1 a 4.' : 'Arraste para olhar. Siga os acessos para visitar o Centro Cívico.'}</p><button aria-label="Dispensar instrução" onClick={() => setHelp(false)}><X aria-hidden="true" /></button></div>}
        {moving && <p className="soy-visit__moving" role="status">{preparing || 'Percorrendo o acesso…'}</p>}
      </>}
    </div>
    {!fallback && <footer className="soy-visit__controls">
      <nav aria-label="Percurso da visita" className="soy-visit__paths">
        {node === 'panel' && <button disabled={moving || presenting} onClick={() => go(previous)}><ArrowLeft aria-hidden="true" />Voltar pelo acesso</button>}
        {neighbors(node).map(target => <button key={target} disabled={!ready || moving || presenting} onClick={() => go(target)}><span>{VISIT_NODES[target].label}</span><ArrowRight aria-hidden="true" /></button>)}
      </nav>
      <div className="soy-visit__tools"><div className="soy-visit__look" aria-label="Olhar ao redor">
        <button disabled={moving || !ready} aria-label="Olhar à esquerda" onClick={() => control.current?.look(.28)}><ChevronLeft /></button>
        <button disabled={moving || !ready} aria-label="Olhar para cima" onClick={() => control.current?.look(0, .15)}><ChevronUp /></button>
        <button disabled={moving || !ready} aria-label="Olhar para baixo" onClick={() => control.current?.look(0, -.15)}><ChevronDown /></button>
        <button disabled={moving || !ready} aria-label="Olhar à direita" onClick={() => control.current?.look(-.28)}><ChevronRight /></button>
      </div><label className="soy-visit__quality"><span>Qualidade</span><select value={quality} onChange={e => setQuality(e.target.value as Quality)}>
        <option value="auto">Automático</option><option value="high">Alta qualidade</option><option value="balanced">Equilibrado</option><option value="economy">Econômico</option>
      </select><small>{quality === 'auto' ? `Em uso: ${resolved === 'economy' ? 'econômico' : resolved === 'balanced' ? 'equilibrado' : 'alta'}` : 'Seleção manual'}</small></label></div>
    </footer>}
    <p className="soy-visit__note">Reconstrução visual a partir de fotografias. Proporções e distribuição interna estimadas.</p>
    {fullscreenError && <p role="status" className="soy-visit__note">{fullscreenError}</p>}
  </div>;
}
