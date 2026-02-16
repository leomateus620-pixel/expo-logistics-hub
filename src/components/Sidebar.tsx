import { NavLink as RouterNavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Car,
  MapPin,
  CalendarDays,
  CheckSquare,
  Users,
} from 'lucide-react';
import logo from '@/assets/logofeira26.webp';

const links = [
  { to: '/', icon: LayoutDashboard, label: 'Painel' },
  { to: '/vehicles', icon: Car, label: 'Veículos' },
  { to: '/transports', icon: MapPin, label: 'Transportes' },
  { to: '/agenda', icon: CalendarDays, label: 'Agenda' },
  { to: '/checklist', icon: CheckSquare, label: 'Checklist' },
  { to: '/team', icon: Users, label: 'Equipe' },
];

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-sidebar flex flex-col z-50">
      <div className="p-5 flex items-center gap-3 border-b border-sidebar-border">
        <img src={logo} alt="Fenasoja" className="w-10 h-10 rounded-lg object-contain bg-white/10 p-0.5" />
        <div>
          <h1 className="text-sm font-bold text-sidebar-primary-foreground tracking-tight">Fenasoja</h1>
          <p className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest">Logística</p>
        </div>
      </div>

      <nav className="flex-1 px-3 pt-4 space-y-1">
        {links.map(({ to, icon: Icon, label }) => (
          <RouterNavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </RouterNavLink>
        ))}
      </nav>

      <div className="p-4 mx-3 mb-4 rounded-lg bg-sidebar-accent/50">
        <p className="text-[10px] text-sidebar-foreground/50 uppercase tracking-wider mb-1">Equipe online</p>
        <div className="flex -space-x-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-7 h-7 rounded-full border-2 border-sidebar-accent flex items-center justify-center text-[10px] font-bold text-sidebar-primary-foreground"
              style={{ backgroundColor: `hsl(${120 + i * 30}, 45%, ${35 + i * 5}%)` }}
            >
              {String.fromCharCode(65 + i)}
            </div>
          ))}
          <div className="w-7 h-7 rounded-full border-2 border-sidebar-accent bg-sidebar-accent flex items-center justify-center text-[10px] font-medium text-sidebar-foreground/70">
            +4
          </div>
        </div>
      </div>
    </aside>
  );
}
