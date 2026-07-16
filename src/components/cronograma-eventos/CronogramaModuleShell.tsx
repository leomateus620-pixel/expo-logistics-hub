import type { ReactNode } from 'react';
import { CalendarRange, ChevronLeft, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { presentFenasojaProductName } from '@/lib/fenasoja-brand';

export function CronogramaModuleShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const { orgName } = useCurrentOrg();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/portal', { replace: true });
  };

  return (
    <div className="cronograma-module-shell min-h-screen">
      <a href="#cronograma-main" className="skip-to-content">
        Ir para o conteúdo do cronograma
      </a>

      <header className="cronograma-module-bar">
        <div className="mx-auto flex min-h-[68px] w-full max-w-[1760px] items-center justify-between gap-3 px-3 sm:px-5 2xl:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/portal"
              className="cronograma-module-back focus-ring"
              aria-label="Voltar ao portal de acesso"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Portal</span>
            </Link>

            <span className="h-8 w-px bg-white/14" aria-hidden="true" />

            <div className="flex min-w-0 items-center gap-3">
              <FenasojaBrand compact markOnly tone="dark" className="hidden sm:inline-flex" />
              <span className="cronograma-module-mark" aria-hidden="true">
                <CalendarRange className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-white/48">
                  Central temporal independente
                </p>
                <p className="truncate text-sm font-bold text-white">Cronograma e Eventos</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden text-right lg:block">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/42">Ciclo oficial</p>
              <p className="text-xs font-semibold text-white/76">{presentFenasojaProductName(orgName)} · 2026—2028</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="cronograma-module-signout h-11 min-w-11 rounded-lg px-2.5 text-xs sm:h-9 sm:min-w-0"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <div id="cronograma-main">{children}</div>
    </div>
  );
}
