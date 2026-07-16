import { NavLink as RouterNavLink } from 'react-router-dom';
import {
  LayoutDashboard, Car, Zap, MapPin, CalendarDays, CheckSquare, Users, Hotel, Bike,
  PanelLeftClose, PanelLeftOpen, LogOut, Settings, ClipboardList, X, Gauge, FileText, Receipt, ShieldCheck, CalendarCheck2, MapPinned,
} from 'lucide-react';
import { useFenasojaEvents } from '@/hooks/useFenasojaEvents';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import { useAuth } from '@/hooks/useAuth';
import { useTransports } from '@/hooks/useTransports';
import { useEvents } from '@/hooks/useEvents';
import { useTasks } from '@/hooks/useTasks';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useCapabilities } from '@/hooks/useCapabilities';
import { cn } from '@/lib/utils';
import { isToday, parseISO } from 'date-fns';
import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/* ── Menu groups with required capability ── */
const operacao = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', cap: 'full_access' },
  { to: '/mapa-comercial', icon: MapPinned, label: 'Mapa Comercial', cap: 'map.view' },
  { to: '/transports', icon: MapPin, label: 'Transportes', cap: 'full_access' },
  { to: '/expenses', icon: Receipt, label: 'Despesas', cap: 'full_access' },
  { to: '/agenda', icon: CalendarDays, label: 'Agenda', cap: 'full_access' },
  { to: '/fenasoja-events', icon: CalendarCheck2, label: 'Eventos Fenasoja', cap: 'full_access' },
  { to: '/ver-escala', icon: ClipboardList, label: 'Escala', cap: 'full_access' },
  { to: '/checklist', icon: CheckSquare, label: 'Checklist', cap: 'full_access' },
  { to: '/km-emissoes', icon: Gauge, label: 'KM & Emissões', cap: 'full_access' },
  { to: '/mobility-auth', icon: ShieldCheck, label: 'Mobilidade', cap: 'mobility_access' },
];

const recursos = [
  { to: '/vehicles', icon: Car, label: 'Veículos Botolli', cap: 'full_access' },
  { to: '/electric-carts', icon: Zap, label: 'Carrinhos Elétricos', cap: 'full_access' },
  { to: '/scooters', icon: Bike, label: 'Patinetes', cap: 'full_access' },
  { to: '/guests', icon: Hotel, label: 'Hóspedes', cap: 'full_access' },
  { to: '/team', icon: Users, label: 'Equipe', cap: 'full_access' },
];

const sistema = [
  { to: '/settings', icon: Settings, label: 'Configurações', cap: 'full_access' },
  { to: '/system-report', icon: FileText, label: 'Relatório do Sistema', cap: 'full_access' },
];

const allGroups = [
  { title: 'Operação', links: operacao },
  { title: 'Recursos', links: recursos },
  { title: 'Sistema', links: sistema },
];

type StatusRecord = { status?: string | null };
type DateRecord = { inicio_em?: string | null };

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isMobile: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

/* ── Badge pill component ── */
function SidebarBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-md bg-action px-1 text-[10px] font-black leading-none text-action-foreground shadow-[0_5px_12px_-7px_oklch(var(--action)/0.8),inset_0_1px_0_rgb(255_255_255/0.34)]">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function Sidebar({ collapsed, onToggle, isMobile, mobileOpen, onMobileClose }: SidebarProps) {
  const { signOut } = useAuth();
  const { hasFullAccess, capSet, isLoading: capsLoading } = useCapabilities();
  const { transports } = useTransports();
  const { events } = useEvents();
  const { events: fenasojaEvents } = useFenasojaEvents();
  const { tasks } = useTasks();
  const { members } = useOrgMembers();

  // Filter groups based on capabilities. Use primitive deps so memo is stable.
  const groups = useMemo(() => {
    if (capsLoading) return [];
    return allGroups
      .map(group => ({
        ...group,
        links: group.links.filter(link => hasFullAccess || capSet.has(link.cap)),
      }))
      .filter(group => group.links.length > 0);
  }, [hasFullAccess, capSet, capsLoading]);

  const badges = useMemo(() => {
    const activeTransports = (transports as StatusRecord[]).filter((t) => t.status === 'em_andamento').length;
    const todayEvents = (events as DateRecord[]).filter((e) => {
      try { return typeof e.inicio_em === 'string' && isToday(parseISO(e.inicio_em)); } catch { return false; }
    }).length;
    const todayFenasoja = (fenasojaEvents as DateRecord[]).filter((e) => {
      try { return typeof e.inicio_em === 'string' && isToday(parseISO(e.inicio_em)); } catch { return false; }
    }).length;
    const pendingTasks = (tasks as StatusRecord[]).filter((t) => t.status === 'pendente').length;
    const availableMembers = (members as StatusRecord[]).filter((m) => m.status === 'disponivel').length;

    return new Map<string, number>([
      ['/transports', activeTransports],
      ['/agenda', todayEvents],
      ['/fenasoja-events', todayFenasoja],
      ['/checklist', pendingTasks],
      ['/team', availableMembers],
    ]);
  }, [transports, events, fenasojaEvents, tasks, members]);

  const contextLine = useMemo(() => {
    const parts: string[] = [];
    const at = badges.get('/transports') || 0;
    const ev = badges.get('/agenda') || 0;
    const tk = badges.get('/checklist') || 0;
    if (at > 0) parts.push(`${at} ativo${at > 1 ? 's' : ''}`);
    if (ev > 0) parts.push(`${ev} evento${ev > 1 ? 's' : ''}`);
    if (tk > 0) parts.push(`${tk} tarefa${tk > 1 ? 's' : ''}`);
    return parts.length > 0 ? parts.join(' · ') : null;
  }, [badges]);

  const sidebarBg = 'oklch(var(--sidebar-background))';

  /* ── Shared nav renderer ── */
  const renderNav = (mobile: boolean) => (
    <nav className="flex-1 px-2 pt-1 overflow-y-auto" role="navigation" aria-label="Menu principal">
      {capsLoading && (
        <div className="space-y-2 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full bg-white/5" />
          ))}
        </div>
      )}
      {!capsLoading && groups.map((group) => (
        <div key={group.title}>
          {!collapsed && (
            <p className="select-none px-3 pb-1.5 pt-5 text-[9px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/45">
              {group.title}
            </p>
          )}
          {collapsed && <div className="pt-2" />}
          <div className="space-y-0.5">
            {group.links.map(({ to, icon: Icon, label }) => (
              <RouterNavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={mobile ? onMobileClose : undefined}
                className={({ isActive }) =>
                  cn(
                    'premium-nav-link relative flex items-center gap-3 rounded-lg text-sm font-medium transition-[background-color,color,transform,box-shadow] duration-200 focus-ring',
                    collapsed ? 'justify-center px-2' : 'px-3',
                    mobile ? 'gap-3.5 py-3 active:bg-white/10' : 'py-2.5',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                      : 'text-sidebar-foreground/68 hover:bg-white/[0.06] hover:text-sidebar-foreground'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={cn(
                      'shrink-0',
                      mobile ? 'w-5 h-5' : 'w-4 h-4',
                      isActive ? 'text-action' : ''
                    )} aria-hidden="true" />
                    {!collapsed && <span className="truncate">{label}</span>}
                    {!collapsed && <SidebarBadge count={badges.get(to) || 0} />}
                    {isActive && <span className="sr-only">(página atual)</span>}
                  </>
                )}
              </RouterNavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  /* ── Header renderer ── */
  const renderHeader = (mobile: boolean) => (
    <div className={cn('flex min-h-[64px] items-center border-b border-sidebar-border p-3', collapsed ? 'flex-col gap-2' : 'gap-3')}>
      <FenasojaBrand compact markOnly={collapsed} subtitle="Logística" tone="dark" className={cn('min-w-0', !collapsed && 'flex-1')} />
      {!collapsed && contextLine && <span className="sr-only">{contextLine}</span>}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expandir menu' : 'Retrair menu'}
          className="rounded-lg p-2 text-sidebar-foreground/60 transition-colors duration-150 hover:bg-white/[0.08] hover:text-sidebar-foreground focus-ring"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
        {mobile && (
          <button
            onClick={onMobileClose}
            aria-label="Fechar menu"
            className="rounded-lg p-2 text-sidebar-foreground/60 transition-colors duration-150 hover:bg-white/[0.08] hover:text-sidebar-foreground focus-ring"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  /* ── Footer renderer ── */
  const renderFooter = (mobile: boolean) => (
    <div className="mx-2 border-t border-sidebar-border p-3">
      <button
        onClick={() => { if (mobile) onMobileClose(); signOut(); }}
        aria-label="Sair da conta"
        className={cn(
          'flex w-full items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150 focus-ring',
          'text-sidebar-foreground/40 hover:text-red-400 hover:bg-red-500/10',
          collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
        )}
      >
        <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
        {!collapsed && <span>Sair</span>}
      </button>
    </div>
  );

  // ── Mobile sidebar ──
  if (isMobile) {
    return (
      <>
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-[oklch(var(--overlay)/0.66)] backdrop-blur-sm transition-opacity"
            onClick={onMobileClose}
          />
        )}
        <aside
          className={cn(
            'premium-app-sidebar fixed left-0 top-0 bottom-0 z-50 flex flex-col',
            'border-r border-sidebar-border',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
            collapsed ? 'w-[72px]' : 'w-[288px]'
          )}
          style={{
            background: sidebarBg,
            transition: 'transform var(--motion-slow) var(--ease-spring)',
          }}
        >
          {renderHeader(true)}
          {renderNav(true)}
          {renderFooter(true)}
        </aside>
      </>
    );
  }

  // ── Desktop sidebar ──
  const width = collapsed ? 72 : 272;

  return (
    <aside
      className="premium-app-sidebar premium-structural-motion fixed bottom-0 left-0 top-0 z-50 flex flex-col overflow-hidden border-r border-sidebar-border transition-[width] duration-300"
      style={{ width, background: sidebarBg }}
    >
      {renderHeader(false)}
      {renderNav(false)}
      {renderFooter(false)}
    </aside>
  );
}
