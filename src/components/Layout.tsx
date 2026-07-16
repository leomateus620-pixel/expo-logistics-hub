import { type ReactNode, useMemo, useState } from 'react';
import { Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import OfflineBanner from './OfflineBanner';
import DriverGpsBanner from './DriverGpsBanner';
import PageTransition from './PageTransition';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDriverAutoArm } from '@/hooks/useDriverAutoArm';

const routeLabels: Array<[string, string]> = [
  ['/mapa-comercial', 'Mapa Comercial'],
  ['/transports', 'Transportes'],
  ['/vehicles', 'Veículos'],
  ['/electric-carts', 'Carrinhos Elétricos'],
  ['/scooters', 'Patinetes'],
  ['/expenses', 'Despesas'],
  ['/agenda', 'Agenda'],
  ['/fenasoja-events', 'Eventos Fenasoja'],
  ['/ver-escala', 'Escala'],
  ['/checklist', 'Checklist'],
  ['/km-emissoes', 'KM e Emissões'],
  ['/mobility-auth', 'Mobilidade'],
  ['/guests', 'Hóspedes'],
  ['/team', 'Equipe'],
  ['/settings', 'Configurações'],
  ['/system-report', 'Relatório do Sistema'],
];

export default function Layout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useDriverAutoArm();

  const sidebarWidth = isMobile ? 0 : collapsed ? 72 : 272;
  const routeLabel = useMemo(() => {
    const match = routeLabels.find(([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`));
    return match?.[1] ?? 'Painel Operacional';
  }, [location.pathname]);

  return (
    <div className="command-grid-bg min-h-screen bg-background">
      <a href="#main-content" className="skip-to-content">Pular para conteúdo</a>
      <OfflineBanner />
      <DriverGpsBanner />

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((current) => !current)}
        isMobile={isMobile}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main
        id="main-content"
        className="premium-structural-motion min-h-screen p-4 transition-[margin] duration-300 md:p-6"
        style={{ marginLeft: sidebarWidth }}
      >
        <header className="premium-app-header sticky top-0 z-30 -mx-4 -mt-4 mb-4 flex min-h-14 items-center gap-3 border-x-0 border-t-0 px-4 py-2.5 md:-mx-6 md:-mt-6 md:mb-6 md:px-6">
          {isMobile && (
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-[var(--shadow-xs)] transition-colors duration-150 hover:bg-accent focus-ring"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Comissão de Logística</p>
            <h1 className="truncate text-sm font-bold text-foreground sm:text-base">{routeLabel}</h1>
          </div>
          <span className="rounded-md border border-primary/10 bg-accent px-2 py-1 text-[10px] font-black tracking-[0.08em] text-accent-foreground shadow-[var(--elevation-1)]">FENASOJA 2028</span>
        </header>

        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
