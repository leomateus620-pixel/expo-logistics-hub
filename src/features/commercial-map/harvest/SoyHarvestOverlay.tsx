import { useEffect, useState } from 'react';
import { SOY_HARVEST_DURATION, SOY_HARVEST_PHASES } from './soyHarvestTimeline';
import { useSoyHarvestStore } from './useSoyHarvestStore';
import './soyHarvest.css';

/** Recovery controls are intentionally light and remain available if the lazy chunk fails. */
export function SoyHarvestOverlay() {
  const status = useSoyHarvestStore(state => state.status);
  const enabled = useSoyHarvestStore(state => state.enabled);
  const seconds = useSoyHarvestStore(state => state.seconds);
  const phase = useSoyHarvestStore(state => state.phase);
  const error = useSoyHarvestStore(state => state.error);
  const reducedMotion = useSoyHarvestStore(state => state.reducedMotion);
  const [info, setInfo] = useState(false);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !useSoyHarvestStore.getState().enabled) return;
      event.preventDefault(); useSoyHarvestStore.getState().cancel();
    };
    const visibility = () => { if (document.hidden) useSoyHarvestStore.getState().pause(); };
    document.addEventListener('keydown', key); document.addEventListener('visibilitychange', visibility);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  if (status === 'idle' || status === 'restoring') return null;
  const actions = useSoyHarvestStore.getState();
  const completed = status === 'completed';
  const label = status === 'loading' ? 'Preparando ciclo da soja…'
    : status === 'error' ? 'Ciclo indisponível'
      : completed ? 'Colheita concluída' : SOY_HARVEST_PHASES.find(item => item.id === phase)?.label;
  return <aside className="soy-harvest-hud" aria-label="Ciclo da soja" data-soy-status={status} data-soy-camera-owned={enabled}>
    <div className="soy-harvest-hud__bar">
      <div className="soy-harvest-hud__stage"><strong aria-live="polite">{label}</strong>
        {status !== 'loading' && status !== 'error' && <progress max={SOY_HARVEST_DURATION} value={seconds} aria-label="Progresso do ciclo da soja" />}
      </div>
      {(status === 'running' || status === 'paused') && <button type="button" onClick={status === 'running' ? actions.pause : actions.resume} aria-label={status === 'running' ? 'Pausar ciclo da soja' : 'Continuar ciclo da soja'}>{status === 'running' ? 'Pausar' : 'Continuar'}</button>}
      {completed && <><button type="button" onClick={actions.replay}>Rever ciclo</button><button type="button" onClick={actions.restoreField}>Restaurar lavoura</button></>}
      {status === 'error' && <button type="button" onClick={actions.replay}>Tentar novamente</button>}
      {(enabled || status === 'error') && <button type="button" onClick={completed ? actions.returnToMap : actions.cancel}>{completed ? 'Voltar ao mapa' : 'Sair'}</button>}
      <button type="button" className="soy-harvest-hud__info" aria-label="Informações sobre o ciclo da soja" aria-expanded={info} onClick={() => setInfo(value => !value)}>i</button>
    </div>
    {reducedMotion && (status === 'running' || status === 'paused') && <div className="soy-harvest-hud__steps" role="group" aria-label="Navegar pelas etapas"><span>Câmera estável</span><button type="button" onClick={() => actions.seekStage(-1)}>Etapa anterior</button><button type="button" onClick={() => actions.seekStage(1)}>Próxima etapa</button></div>}
    {error && <p className="soy-harvest-hud__note" role="alert">{error}</p>}
    {info && <p className="soy-harvest-hud__note">Demonstração visual de 48 segundos, com breves dissoluções que resumem o tempo entre trechos de cada passada. As máquinas visíveis trabalham em velocidade moderada; o restante do percurso é condensado. O ciclo não representa duração de cultivo nem produtividade. Referências: Embrapa e John Deere. Esc encerra e restaura a lavoura.</p>}
  </aside>;
}
export default SoyHarvestOverlay;
