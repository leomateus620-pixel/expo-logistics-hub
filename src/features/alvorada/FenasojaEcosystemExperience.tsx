import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { OrganizationalEcosystem } from './organizational/components/OrganizationalEcosystem';
import { useOrganizationalEcosystemData } from './organizational';
import { ALVORADA_EXIT_DURATION_MS } from './timeline';
import { ECOSYSTEM_CLOSE_LABEL, ECOSYSTEM_DIALOG_LABEL } from './ecosystemLabels';
import type { OrganizationalEcosystemDataResult } from './organizational/types';
import './alvorada.css';

interface FenasojaEcosystemExperienceProps {
  onComplete: () => void;
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
}: FenasojaEcosystemExperienceProps & { organizationalData: OrganizationalEcosystemDataResult }) {
  const [leaving, setLeaving] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const exitStarted = useRef(false);
  const exitTimer = useRef<number | null>(null);

  const finish = useCallback(() => {
    if (exitStarted.current) return;
    exitStarted.current = true;
    setLeaving(true);
    exitTimer.current = window.setTimeout(onComplete, ALVORADA_EXIT_DURATION_MS);
  }, [onComplete]);

  useEffect(() => {
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
        const activeElement = document.activeElement;
        // A typed search is cleared by the field itself; an open detail panel
        // closes itself before the dialog does.
        if (
          activeElement instanceof HTMLInputElement
          && activeElement.closest('.org-search')
          && activeElement.value
        ) return;
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
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', containKeyboard, true);
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    };
  }, [finish]);

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
      <OrganizationalEcosystem
        active
        error={organizationalData.error}
        graph={organizationalData.graph}
        loading={organizationalData.isLoading}
        onRetry={() => void organizationalData.refetch()}
      />

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
