import { Link, NavLink } from 'react-router-dom';
import { ChevronLeft, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  getModuleRoute,
  statusLabels,
  type CommissionModule,
} from '@/modules/commissions/commissionRegistry';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';

interface CommissionSidebarProps {
  module: CommissionModule;
  mobileOpen: boolean;
  onMobileOpen: () => void;
  onMobileClose: () => void;
}

export default function CommissionSidebar({ module, mobileOpen, onMobileOpen, onMobileClose }: CommissionSidebarProps) {
  const { signOut } = useAuth();
  const ModuleIcon = module.icon;

  const nav = (
    <aside className="flex h-full w-[288px] flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex min-h-[76px] items-center gap-3 border-b border-sidebar-border p-4">
        <FenasojaBrand compact markOnly tone="dark" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/50">
            Comissão
          </p>
          <h2 className="truncate text-base font-bold text-sidebar-foreground">{module.shortName}</h2>
        </div>
        <button
          type="button"
          onClick={onMobileClose}
          className="rounded-lg p-2 text-sidebar-foreground/70 transition-colors hover:bg-white/10 md:hidden"
          aria-label="Fechar menu"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-action text-action-foreground">
            <ModuleIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground">{module.name}</p>
            <p className="text-xs text-sidebar-foreground/50">{statusLabels[module.status]}</p>
          </div>
        </div>
      </div>

      <nav className="premium-sidebar-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label={`Menu ${module.name}`}>
        {module.menus.map((item) => {
          const Icon = item.icon;
          const target = getModuleRoute(module, item.path);
          return (
            <NavLink
              key={item.path}
              to={target}
              onClick={onMobileClose}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition-colors duration-150 focus-ring',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-white/[0.07] hover:text-sidebar-foreground'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0 group-aria-[current=page]:text-action" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-sidebar-border p-4">
        <Link
          to="/portal" aria-label="Voltar ao portal de comissões"
          onClick={onMobileClose}
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/60 transition-colors hover:bg-white/[0.06] hover:text-sidebar-foreground focus-ring"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Portal de Comissões
        </Link>
        <button
          type="button"
          onClick={() => {
            onMobileClose();
            signOut();
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-sidebar-foreground/45 transition-colors hover:bg-red-500/10 hover:text-red-300 focus-ring"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sair
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <button
        type="button"
        onClick={onMobileOpen}
        className="fixed left-3 top-3 z-30 rounded-lg border border-border bg-card p-2.5 text-foreground shadow-[var(--shadow-xs)] focus-ring md:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="fixed inset-y-0 left-0 z-40 hidden md:block">{nav}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-[oklch(var(--overlay)/0.70)] md:hidden" onClick={onMobileClose} />
      )}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {nav}
      </div>
    </>
  );
}
