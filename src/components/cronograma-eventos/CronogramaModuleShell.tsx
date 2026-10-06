import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { CronogramaGoogleStatusButton } from '@/components/cronograma-eventos/CronogramaGoogleStatusButton';
import { CronogramaHeaderSearch } from '@/components/cronograma-eventos/CronogramaHeaderSearch';
import { CronogramaPreparationPill } from '@/components/cronograma-eventos/CronogramaPreparationPill';
import { CronogramaPushStatusButton } from '@/components/cronograma-eventos/CronogramaPushStatusButton';
import { CronogramaSearchProvider } from '@/components/cronograma-eventos/CronogramaSearchContext';
import { CronogramaAgendaModeProvider } from '@/components/cronograma-eventos/CronogramaAgendaModeContext';
import { CronogramaAgendaModeControls } from '@/components/cronograma-eventos/CronogramaAgendaModeControls';
import { CronogramaTemporalControls } from '@/components/cronograma-eventos/CronogramaTemporalControls';
import { CronogramaShellProvider } from '@/components/cronograma-eventos/CronogramaShellContext';
import { WeeklySummaryPill } from '@/components/cronograma-eventos/WeeklySummaryPill';
import { MobileSearchToggle } from '@/components/cronograma-eventos/mobile/MobileSearchToggle';
import { useExclusiveMobileOverlay } from '@/components/cronograma-eventos/mobile/mobileOverlayStore';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import '@/styles/cronograma-command-layer.css';

function CronogramaCommandBar() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [searchFieldContainer, setSearchFieldContainer] = useState<HTMLDivElement | null>(null);
  const [searchOpen] = useExclusiveMobileOverlay('mobile-search');
  const [mobileModeContainer, setMobileModeContainer] = useState<HTMLDivElement | null>(null);
  const [mobileSignOutContainer, setMobileSignOutContainer] = useState<HTMLDivElement | null>(null);
  const [compactHeader, setCompactHeader] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  );
  const headerRef = useRef<HTMLElement>(null);
  const transferredFocus = useRef<string | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const update = () => {
      const active = document.activeElement;
      transferredFocus.current = active?.matches('.cronograma-agenda-mode, .cronograma-module-signout')
        && headerRef.current?.contains(active) ? active.getAttribute('aria-label') : null;
      setCompactHeader(media.matches);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useLayoutEffect(() => {
    if (!transferredFocus.current) return;
    const target = [...(headerRef.current?.querySelectorAll<HTMLElement>(
      '.cronograma-agenda-mode, .cronograma-module-signout',
    ) ?? [])].find(control => control.getAttribute('aria-label') === transferredFocus.current);
    target?.focus({ preventScroll: true });
    transferredFocus.current = null;
  }, [compactHeader]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/portal', { replace: true });
  };

  const modes = <CronogramaAgendaModeControls />;
  const signOutButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleSignOut}
      className="cronograma-module-signout h-10 min-w-10 rounded-lg px-2.5 text-xs"
      aria-label="Sair do sistema"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
    </Button>
  );

  return (
    <header ref={headerRef} className="cronograma-module-bar" data-layout="command">
      <div className="cronograma-command-layer">
        <div className="cronograma-command-layer__left">
          <Link
            to="/portal"
            className="cronograma-module-back focus-ring"
            aria-label="Voltar ao portal de acesso"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span>Portal</span>
          </Link>

          <MobileSearchToggle className="lg:hidden" fieldContainer={searchFieldContainer} />
          <div ref={setMobileSignOutContainer} className="cronograma-command-layer__mobile-signout" />
          {compactHeader && mobileModeContainer ? createPortal(modes, mobileModeContainer) : modes}

          <CronogramaHeaderSearch className="cronograma-command-search hidden lg:flex" />
        </div>

        <div className="cronograma-command-layer__right">
          <div ref={setMobileModeContainer} className="cronograma-command-layer__mobile-modes" />
          <div className="hidden lg:block">
            <WeeklySummaryPill />
          </div>
          <CronogramaPreparationPill />
          <div className="cronograma-command-layer__google">
            <CronogramaGoogleStatusButton />
          </div>

          <CronogramaPushStatusButton />

          <CronogramaTemporalControls className="cronograma-command-temporal--desktop hidden lg:inline-flex" />
          {compactHeader && mobileSignOutContainer ? createPortal(signOutButton, mobileSignOutContainer) : signOutButton}
          <CronogramaTemporalControls className="cronograma-command-temporal--intermediate" />
        </div>
      </div>

      <div className="cronograma-command-layer__mobile lg:hidden">
        <div
          ref={setSearchFieldContainer}
          className="cronograma-command-summary-slot"
          data-search-open={searchOpen || undefined}
        >
          <div className="cronograma-command-summary-slot__summary" aria-hidden={searchOpen || undefined}>
            <WeeklySummaryPill presentation="mobile" />
          </div>
        </div>
      </div>
    </header>
  );
}

export function CronogramaModuleShell({ children }: { children: ReactNode }) {
  return (
    <CronogramaAgendaModeProvider>
    <CronogramaSearchProvider>
      <CronogramaShellProvider>
        <div className="cronograma-module-shell min-h-screen">
          <a href="#cronograma-main" className="skip-to-content">
            Ir para o conteúdo do cronograma
          </a>

          <CronogramaCommandBar />

          {children}
        </div>
      </CronogramaShellProvider>
    </CronogramaSearchProvider>
    </CronogramaAgendaModeProvider>
  );
}
