import { NavLink as RouterNavLink } from 'react-router-dom';
import {
  LayoutDashboard, Car, Zap, MapPin, CalendarDays, CheckSquare, Users, Hotel,
  PanelLeftClose, PanelLeftOpen, LogOut, Settings, ClipboardList, X,
} from 'lucide-react';
import logo from '@/assets/logofeira26.webp';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/vehicles', icon: Car, label: 'Veículos Botolli' },
  { to: '/electric-carts', icon: Zap, label: 'Carrinhos Elétricos' },
  { to: '/transports', icon: MapPin, label: 'Transportes' },
  { to: '/guests', icon: Hotel, label: 'Hóspedes' },
  { to: '/agenda', icon: CalendarDays, label: 'Agenda' },
  { to: '/ver-escala', icon: ClipboardList, label: 'Escala' },
  { to: '/checklist', icon: CheckSquare, label: 'Checklist' },
  { to: '/team', icon: Users, label: 'Equipe' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isMobile: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle, isMobile, mobileOpen, onMobileClose }: SidebarProps) {
  const { signOut } = useAuth();

  // On mobile: full-width overlay sidebar, always expanded
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={onMobileClose}
          />
        )}
        {/* Sidebar panel */}
        <aside
          className={cn(
            'fixed left-0 top-0 bottom-0 z-50 w-[280px] liquid-glass flex flex-col transition-transform duration-300 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
          style={{ background: 'hsl(var(--sidebar-background) / 0.92)' }}
        >
          <div className="p-3 flex items-center gap-3 border-b border-white/10 min-h-[56px]">
            <img src={logo} alt="Fenasoja" className="w-9 h-9 rounded-lg object-contain bg-white/10 p-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold text-sidebar-primary-foreground tracking-tight">Fenasoja</h1>
              <p className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest">Logística</p>
            </div>
            <button
              onClick={onMobileClose}
              aria-label="Fechar menu"
              className="p-2 rounded-lg hover:bg-white/10 text-sidebar-foreground/70 focus-ring"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-2 pt-3 space-y-0.5 overflow-y-auto" role="navigation" aria-label="Menu principal">
            {links.map(({ to, icon: Icon, label }) => (
              <RouterNavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={onMobileClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors focus-ring px-3 py-3',
                    isActive
                      ? 'bg-white/12 text-sidebar-primary backdrop-blur-sm'
                      : 'text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-white/8'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{label}</span>
                    {isActive && <span className="sr-only">(página atual)</span>}
                  </>
                )}
              </RouterNavLink>
            ))}
          </nav>

          <div className="p-2 border-t border-white/10">
            <button
              onClick={() => { onMobileClose(); signOut(); }}
              aria-label="Sair da conta"
              className="flex items-center gap-3 w-full rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/8 transition-colors focus-ring px-3 py-3"
            >
              <LogOut className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>Sair</span>
            </button>
          </div>
        </aside>
      </>
    );
  }

  // Desktop sidebar
  const width = collapsed ? 64 : 256;

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 liquid-glass flex flex-col z-50 transition-all duration-200 overflow-hidden"
      style={{ width, background: 'hsl(var(--sidebar-background) / 0.92)' }}
    >
      <div className="p-3 flex items-center gap-3 border-b border-white/10 min-h-[56px]">
        <img src={logo} alt="Fenasoja" className="w-9 h-9 rounded-lg object-contain bg-white/10 p-0.5 shrink-0" />
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-sidebar-primary-foreground tracking-tight">Fenasoja</h1>
            <p className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest">Logística</p>
          </div>
        )}
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
          className="p-1.5 rounded-lg hover:bg-white/10 text-sidebar-foreground/70 shrink-0 focus-ring"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 px-2 pt-3 space-y-0.5 overflow-y-auto" role="navigation" aria-label="Menu principal">
        {links.map(({ to, icon: Icon, label }) => (
          <RouterNavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors focus-ring',
                collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5',
                isActive
                  ? 'bg-white/12 text-sidebar-primary backdrop-blur-sm'
                  : 'text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-white/8'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                {!collapsed && <span className="truncate">{label}</span>}
                {isActive && <span className="sr-only">(página atual)</span>}
              </>
            )}
          </RouterNavLink>
        ))}
      </nav>

      <div className="p-2 border-t border-white/10">
        <button
          onClick={signOut}
          aria-label="Sair da conta"
          className={cn(
            'flex items-center gap-3 w-full rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/8 transition-colors focus-ring',
            collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
}
