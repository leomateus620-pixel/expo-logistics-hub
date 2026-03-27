import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Car, CalendarDays, CheckSquare, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { MapPin, Hotel, Zap, Users, Settings, LogOut, ClipboardList, Gauge, FileText } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const mainTabs = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/vehicles', icon: Car, label: 'Frota' },
  { to: '/agenda', icon: CalendarDays, label: 'Agenda' },
  { to: '/checklist', icon: CheckSquare, label: 'Checklist' },
];

const moreLinks = [
  { to: '/ver-escala', icon: ClipboardList, label: 'Escala' },
  { to: '/transports', icon: MapPin, label: 'Transportes' },
  { to: '/guests', icon: Hotel, label: 'Hóspedes' },
  { to: '/electric-carts', icon: Zap, label: 'Carrinhos Elétricos' },
  { to: '/team', icon: Users, label: 'Equipe' },
  { to: '/km-emissoes', icon: Gauge, label: 'KM & Emissões' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
  { to: '/system-report', icon: FileText, label: 'Relatório do Sistema' },
];

export default function BottomTabs() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { signOut } = useAuth();
  const location = useLocation();

  const isMoreActive = moreLinks.some(l => location.pathname === l.to);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-pb" role="navigation" aria-label="Navegação principal">
        <div className="flex items-center justify-around h-16">
          {mainTabs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-colors focus-ring min-w-[44px] min-h-[44px]',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  <span>{label}</span>
                  {isActive && <span className="sr-only">(página atual)</span>}
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            aria-label="Abrir mais opções de menu"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-colors focus-ring min-w-[44px] min-h-[44px]',
              isMoreActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
            <span>Mais</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-3 py-4">
            {moreLinks.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-2 p-4 rounded-xl transition-colors',
                    isActive ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  )
                }
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-medium">{label}</span>
              </NavLink>
            ))}
          </div>
          <button
            onClick={() => { setMoreOpen(false); signOut(); }}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors mt-2"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
}
