import { NavLink as RouterNavLink } from 'react-router-dom';
import {
  LayoutDashboard, Car, Zap, MapPin, CalendarDays, CheckSquare, Users, Hotel,
  PanelLeftClose, PanelLeftOpen, LogOut, Settings,
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
  { to: '/checklist', icon: CheckSquare, label: 'Checklist' },
  { to: '/team', icon: Users, label: 'Equipe' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { signOut } = useAuth();
  const width = collapsed ? 64 : 256;

  return (
    <aside className="fixed left-0 top-0 bottom-0 bg-sidebar flex flex-col z-50 transition-all duration-200 overflow-hidden" style={{ width }}>
      <div className="p-3 flex items-center gap-3 border-b border-sidebar-border min-h-[56px]">
        <img src={logo} alt="Fenasoja" className="w-9 h-9 rounded-lg object-contain bg-white/10 p-0.5 shrink-0" />
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-sidebar-primary-foreground tracking-tight">Fenasoja</h1>
            <p className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest">Logística</p>
          </div>
        )}
        <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/70 shrink-0">
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 px-2 pt-3 space-y-0.5 overflow-y-auto">
        {links.map(({ to, icon: Icon, label }) => (
          <RouterNavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </RouterNavLink>
        ))}
      </nav>

      <div className="p-2 border-t border-sidebar-border">
        <button
          onClick={signOut}
          className={cn(
            'flex items-center gap-3 w-full rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors',
            collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
}
