import { Component, lazy, Suspense, type ReactNode } from 'react';
import { useVisitStore } from './useVisitStore';
import './visit.css';

const VisitHUD = lazy(() => import('./VisitHUD'));

/** Eager recovery chrome must work even when the HUD chunk cannot load. */
function VisitRecoveryControls() {
  const phase = useVisitStore(state => state.phase);
  const error = useVisitStore(state => state.error);
  const exit = useVisitStore(state => state.exit);
  return <div className="visit-hud" data-visit-hud data-visit-recovery data-visit-phase={phase}>
    <div className="visit-hud__bar" role="group" aria-label="Modo Visita">
      <span className="visit-hud__title">Modo Visita</span>
      <span role="status" style={{ fontSize: 11 }}>{error ? 'Controles indisponíveis' : 'Carregando controles…'}</span>
      <button className="visit-hud__exit" type="button" onClick={exit} aria-label="Sair do Modo Visita">Sair</button>
    </div>
    {error && <p className="visit-hud__error" role="alert">{error}</p>}
  </div>;
}

class VisitOverlayBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) {
    console.error('Visit controls failed', error);
    if (document.pointerLockElement) document.exitPointerLock?.();
    useVisitStore.setState({ error: 'Não foi possível carregar os controles da visita. Use Sair para restaurar a vista anterior.' });
  }
  render() { return this.state.failed ? <VisitRecoveryControls /> : this.props.children; }
}

/** Boundary resets per visit without replacing the map, renderer or controls. */
export function VisitOverlayFrame({ children }: { children: ReactNode }) {
  const enabled = useVisitStore(state => state.enabled);
  const session = useVisitStore(state => state.session);
  if (!enabled) return null;
  return <VisitOverlayBoundary key={session}>
    <Suspense fallback={<VisitRecoveryControls />}>{children}</Suspense>
  </VisitOverlayBoundary>;
}

export function VisitOverlay() {
  return <VisitOverlayFrame><VisitHUD /></VisitOverlayFrame>;
}
