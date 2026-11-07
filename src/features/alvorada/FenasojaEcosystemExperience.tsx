import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { OrganizationalEcosystem } from './organizational/components/OrganizationalEcosystem';
import { useOrganizationalEcosystemData } from './organizational';
import { ALVORADA_EXIT_DURATION_MS } from './timeline';
import { ECOSYSTEM_CLOSE_LABEL, ECOSYSTEM_DIALOG_LABEL } from './ecosystemLabels';
import type { OrganizationalEcosystemDataResult } from './organizational/types';
import type { EcosystemLocation } from './ecosystemNavigation';
import { AlvoradaErrorBoundary } from './AlvoradaErrorBoundary';
import './alvorada.css';

const MemorialExperience = lazy(() => import('@/features/memorial/MemorialExperience'));

interface FenasojaEcosystemExperienceProps {
  onComplete: () => void;
  navigation?: EcosystemLocation;
  onNavigate?: (target: EcosystemLocation) => void;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Fullscreen dialog that opens the organizational ecosystem directly. The
 * cinematic planet/dawn intro no longer runs here: it lives embedded in the
 * portal countdown card (`AlvoradaIntro`). No WebGL is created by this dialog.
 */
export function FenasojaEcosystemExperienceView({
  onComplete,
  organizationalData,
  navigation: externalNavigation,
  onNavigate,
}: FenasojaEcosystemExperienceProps & { organizationalData: OrganizationalEcosystemDataResult }) {
  const [localNavigation, setLocalNavigation] = useState<EcosystemLocation>({ view: 'organization' });
  const navigation = externalNavigation ?? localNavigation;
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;
  const callbackRef = useRef({ onComplete, onNavigate });
  callbackRef.current = { onComplete, onNavigate };
  const navigate = useCallback((target: EcosystemLocation) => {
    if (callbackRef.current.onNavigate) callbackRef.current.onNavigate(target);
    else setLocalNavigation(target);
  }, []);
  const wasMemorial = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const exitStarted = useRef(false);
  const exitTimer = useRef<number | null>(null);

  const finish = useCallback(() => {
    if (exitStarted.current) return;
    exitStarted.current = true;
    setLeaving(true);
    exitTimer.current = window.setTimeout(() => callbackRef.current.onComplete(), ALVORADA_EXIT_DURATION_MS);
  }, []);

  useLayoutEffect(() => {
    let focusFrame = 0;
    if (wasMemorial.current && navigation.view === 'organization') {
      // Wait for the organizational surface to become visible after its CSS
      // visibility transition; focusing a hidden button is ignored by browsers.
      focusFrame = requestAnimationFrame(() => {
        focusFrame = requestAnimationFrame(() => {
          const target = dialog.current?.querySelector<HTMLButtonElement>('.org-memorial-shortcut');
          target?.focus({ preventScroll: true });
        });
      });
    }
    wasMemorial.current = navigation.view === 'memorial';
    return () => cancelAnimationFrame(focusFrame);
  }, [navigation.view]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => closeButton.current?.focus({
      preventScroll: true,
    }));

    const containKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const activeDialog = dialog.current;
        if (!activeDialog) return;
        const focusable = Array.from(
          activeDialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((element) => (
          element.getAttribute('aria-hidden') !== 'true'
          && !element.closest('[aria-hidden="true"]')
          && element.getClientRects().length > 0
        ));
        const first = focusable[0];
        const last = focusable.at(-1);
        const activeElement = document.activeElement;

        if (!first || !last) {
          event.preventDefault();
          closeButton.current?.focus({ preventScroll: true });
          return;
        }

        if (event.shiftKey && (activeElement === first || !activeDialog.contains(activeElement))) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && (activeElement === last || !activeDialog.contains(activeElement))) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      }
      if (event.key === 'Escape') {
        if (navigationRef.current.view === 'memorial') {
          event.preventDefault(); event.stopImmediatePropagation();
          navigate(navigationRef.current.pieceId ? { view: 'memorial' } : { view: 'organization' });
          return;
        }
        const activeElement = document.activeElement;
        // An open detail panel closes before the dialog.
        const openDetail = dialog.current?.querySelector<HTMLElement>(
          '.org-ecosystem__ready[data-org-detail-open="true"]',
        );
        if (openDetail?.contains(activeElement)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        finish();
      }
    };
    window.addEventListener('keydown', containKeyboard, true);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', containKeyboard, true);
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    };
  }, [finish, navigate]);

  return createPortal(
    <section
      ref={dialog}
      className={`alvorada-overlay alvorada-overlay--ready alvorada-overlay--ecosystem${leaving ? ' alvorada-overlay--leaving' : ''}`}
      data-testid="ecosystem-experience"
      data-stage="org-ready"
      data-loading={organizationalData.isLoading || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={ECOSYSTEM_DIALOG_LABEL}
    >
      <div aria-hidden={navigation.view === 'memorial'} {...(navigation.view === 'memorial' ? { inert: '' } : {})}>
      <OrganizationalEcosystem
        active={navigation.view === 'organization'}
        error={organizationalData.error}
        graph={organizationalData.graph}
        loading={organizationalData.isLoading}
        onRetry={() => void organizationalData.refetch()}
        onOpenMemorial={() => navigate({ view: 'memorial' })}
      />
      </div>
      {navigation.view === 'memorial' && <AlvoradaErrorBoundary onError={() => undefined} fallback={<div className="ecosystem-memorial-preparing" role="status"><p>O Memorial não pôde ser aberto.</p><button type="button" onClick={() => navigate({ view: 'organization' })}>Voltar ao Ecossistema</button></div>}>
        <Suspense fallback={<div className="ecosystem-memorial-preparing" role="status"><p>Preparando o Memorial do Voluntariado…</p><button type="button" onClick={() => navigate({ view: 'organization' })}>Voltar ao Ecossistema</button></div>}><MemorialExperience navigation={navigation} onNavigate={navigate} /></Suspense>
      </AlvoradaErrorBoundary>}

      <button
        ref={closeButton}
        type="button"
        className="alvorada-overlay__close"
        aria-label={ECOSYSTEM_CLOSE_LABEL}
        onClick={finish}
      >
        <X aria-hidden="true" />
      </button>
    </section>,
    document.body,
  );
}

export default function FenasojaEcosystemExperience(props: FenasojaEcosystemExperienceProps) {
  const organizationalData = useOrganizationalEcosystemData();
  return <FenasojaEcosystemExperienceView {...props} organizationalData={organizationalData} />;
}
