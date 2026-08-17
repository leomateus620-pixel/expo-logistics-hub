import type { ReactNode } from 'react';
import { CalendarRange, ChevronLeft, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { CronogramaGoogleStatusButton } from '@/components/cronograma-eventos/CronogramaGoogleStatusButton';
import { CronogramaHeaderSearch } from '@/components/cronograma-eventos/CronogramaHeaderSearch';
import { CronogramaPreparationPill } from '@/components/cronograma-eventos/CronogramaPreparationPill';
import { CronogramaSearchProvider } from '@/components/cronograma-eventos/CronogramaSearchContext';
import { CronogramaTemporalControls } from '@/components/cronograma-eventos/CronogramaTemporalControls';
import { CronogramaShellProvider } from '@/components/cronograma-eventos/CronogramaShellContext';
import { WeeklySummaryPill } from '@/components/cronograma-eventos/WeeklySummaryPill';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import '@/styles/cronograma-command-layer.css';

function CronogramaCommandBar() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/portal', { replace: true });
  };

  return (
    <header className="cronograma-module-bar" data-layout="command">
      <div className="cronograma-command-layer">
        <div className="cronograma-command-layer__left">
          <Link
            to="/portal"
            className="cronograma-module-back focus-ring"
            aria-label="Voltar ao portal de acesso"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden xl:inline">Portal</span>
          </Link>

          <span className="cronograma-module-tile-3d" aria-hidden="true">
            <CalendarRange className="h-4 w-4" />
          </span>

          <CronogramaHeaderSearch className="cronograma-command-search hidden md:flex" />
        </div>

        <div className="cronograma-command-layer__right">
          <div className="hidden lg:block">
            <WeeklySummaryPill />
          </div>
          <CronogramaPreparationPill />
          <div className="cronograma-command-layer__google">
            <CronogramaGoogleStatusButton />
          </div>

          <CronogramaTemporalControls className="hidden sm:inline-flex" />





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
        </div>
      </div>

      <div className="cronograma-command-layer__mobile md:hidden">
        <CronogramaHeaderSearch className="w-full" />
        <div className="flex items-center justify-between gap-2">
          <div className="lg:hidden min-w-0 flex-1">
            <WeeklySummaryPill presentation="mobile" />
          </div>
          <CronogramaTemporalControls />
        </div>
      </div>
    </header>
  );
}

export function CronogramaModuleShell({ children }: { children: ReactNode }) {
  return (
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
  );
}
