import { useEffect, useState } from 'react';
import {
  Eye,
  LocateFixed,
  MapPin,
  Route,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { EXECUTIVE_CHARACTER_PROFILES } from '../../data/executiveCharacters';
import { EXECUTIVE_WALKING_ROUTE } from '../../data/executiveRoute';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { ExecutiveInteractionPhase } from '../../utils/executiveInteraction';
import './executive-character-controls.css';

const interactionCopy: Record<ExecutiveInteractionPhase, { label: string; detail: string }> = {
  walking: {
    label: 'Em caminhada pelo parque',
    detail: 'Percurso executivo em andamento',
  },
  orienting: {
    label: 'Perceberam sua aproximação',
    detail: 'Orientando-se de forma natural',
  },
  waving: {
    label: 'Acenando para você',
    detail: 'Interação discreta de boas-vindas',
  },
  cooldown: {
    label: 'Retomando o percurso',
    detail: 'Voltando suavemente à caminhada',
  },
};

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined'
    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  ));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);

    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  return reducedMotion;
}

export function ExecutiveCharacterControls() {
  const executiveFocusActive = useCommercialMapStore((state) => state.executiveFocusActive);
  const executiveInteractionPhase = useCommercialMapStore((state) => state.executiveInteractionPhase);
  const executiveInteractionEnabled = useCommercialMapStore((state) => state.executiveInteractionEnabled);
  const executiveExperienceAvailable = useCommercialMapStore((state) => state.executiveExperienceAvailable);
  const activeSegmentId = useCommercialMapStore((state) => state.activeSegmentId);
  const reducedGraphics = useCommercialMapStore((state) => state.reducedGraphics);
  const setExecutiveFocusActive = useCommercialMapStore((state) => state.setExecutiveFocusActive);
  const requestCameraPreset = useCommercialMapStore((state) => state.requestCameraPreset);
  const reducedMotion = usePrefersReducedMotion();
  const phaseCopy = interactionCopy[executiveInteractionPhase];

  const handleCameraMode = () => {
    if (!executiveExperienceAvailable) return;
    if (executiveFocusActive) {
      requestCameraPreset(activeSegmentId === 'exporural' ? 'exporural' : 'overview');
      return;
    }

    setExecutiveFocusActive(true);
  };

  return (
    <section
      className={`commercial-map-executive-controls${executiveFocusActive ? ' is-following' : ''}`}
      aria-labelledby="commercial-map-executive-title"
    >
      <header className="commercial-map-executive-header">
        <span className="commercial-map-executive-symbol" aria-hidden="true">
          <UsersRound />
        </span>
        <span className="commercial-map-executive-heading">
          <small>Presidência em movimento</small>
          <strong id="commercial-map-executive-title">Circuito executivo</strong>
        </span>
        <span className="commercial-map-executive-live-dot" aria-hidden="true" />
      </header>

      <ul className="commercial-map-executive-people" aria-label="Executivos no percurso">
        {Object.values(EXECUTIVE_CHARACTER_PROFILES).map((profile) => (
          <li key={profile.id}>
            <span className={`commercial-map-executive-avatar is-${profile.id}`} aria-hidden="true">
              {profile.displayName.split(' ').map((part) => part[0]).join('')}
            </span>
            <span>
              <strong>{profile.displayName}</strong>
              <small>{profile.role}</small>
            </span>
          </li>
        ))}
      </ul>

      <div className="commercial-map-executive-route">
        <MapPin aria-hidden="true" />
        <span>
          <small>Origem do percurso</small>
          <strong>{EXECUTIVE_WALKING_ROUTE.anchor.experienceName}</strong>
        </span>
        <Route aria-hidden="true" />
      </div>

      <div
        className="commercial-map-executive-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span aria-hidden="true"><Sparkles /></span>
        <span>
          <strong>{!executiveExperienceAvailable
            ? 'Personagens indisponíveis'
            : reducedMotion
              ? 'Movimento reduzido ativo'
            : executiveInteractionEnabled
              ? phaseCopy.label
              : 'Caminhada natural pelo parque'}</strong>
          <small>
            {!executiveExperienceAvailable
              ? 'O mapa continua disponível; tente novamente após recarregar'
              : reducedMotion
                ? 'Acenos automáticos pausados conforme sua preferência'
              : executiveInteractionEnabled
                ? phaseCopy.detail
                : 'Aproxime ou acompanhe para interagir'}
          </small>
        </span>
      </div>

      <button
        type="button"
        className="commercial-map-executive-action"
        onClick={handleCameraMode}
        disabled={!executiveExperienceAvailable}
        aria-pressed={executiveFocusActive}
        aria-label={!executiveExperienceAvailable
          ? 'Personagens executivos indisponíveis'
          : executiveFocusActive
          ? 'Voltar à visão geral do mapa comercial'
          : 'Acompanhar Fabiano Soltis e Djeison Drey no mapa'}
      >
        {executiveFocusActive ? <LocateFixed aria-hidden="true" /> : <Eye aria-hidden="true" />}
        <span>
          <strong>{!executiveExperienceAvailable
            ? 'Acompanhamento indisponível'
            : executiveFocusActive
              ? 'Voltar à visão geral'
              : 'Acompanhar no mapa'}</strong>
          <small>
            {!executiveExperienceAvailable
              ? 'A camada 3D não pôde ser carregada'
              : executiveFocusActive
              ? 'Encerrar acompanhamento de câmera'
              : 'Câmera suave junto ao percurso'}
          </small>
        </span>
      </button>

      {(reducedGraphics || reducedMotion) && (
        <p className="commercial-map-executive-preference-note">
          {reducedGraphics && reducedMotion
            ? 'Qualidade e movimento adaptados às suas preferências.'
            : reducedGraphics
              ? 'Qualidade visual adaptada ao dispositivo.'
              : 'Transições visuais não essenciais foram removidas.'}
        </p>
      )}
    </section>
  );
}
