import { Link, NavLink } from 'react-router-dom';
import { ChevronLeft, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  getModuleRoute,
  statusLabels,
  type CommissionModule,
} from '@/modules/commissions/commissionRegistry';
import logo from '@/assets/logofeira26.webp';

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
    <aside className="flex h-full w-[306px] flex-col overflow-hidden border-r border-gold/10 bg-sidebar/95 text-sidebar-foreground shadow-2xl shadow-black/20 backdrop-blur-2xl">
      <div className="flex min-h-[84px] items-center gap-3 border-b border-gold/10 p-4">
        <img src={logo} alt="Fenasoja" className="h-10 w-10 rounded-xl bg-white/10 object-contain p-1" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold/70">
            Comissão
          </p>
          <h2 className="truncate text-base font-bold text-gold">{module.shortName}</h2>
        </div>
        <button
          type="button"
          onClick={onMobileClose}
          className="rounded-xl p-2 text-sidebar-foreground/70 hover:bg-white/10 md:hidden"
          aria-label="Fechar menu"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="border-b border-white/[0.06] p-4">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-3 shadow-inner">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gold/15 text-gold ring-1 ring-gold/20">
            <ModuleIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground">{module.name}</p>
            <p className="text-xs text-sidebar-foreground/50">{statusLabels[module.status]}</p>
          </div>
        </div>
      </div>

      <nav className="premium-sidebar-scrollbar flex-1 space-y-1.5 overflow-y-auto px-3 py-4" aria-label={`Menu ${module.name}`}>
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
                  'group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition focus-ring active:scale-[0.99]',
                  isActive
                    ? 'bg-gold/[0.14] text-gold shadow-lg shadow-gold/5 ring-1 ring-gold/20 sidebar-gold-bar'
                    : 'text-sidebar-foreground/70 hover:bg-white/[0.07] hover:text-sidebar-foreground'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0 transition group-hover:scale-110" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-white/[0.06] p-4">
        <Link
          to="/portal" aria-label="Voltar ao portal de comissões"
          onClick={onMobileClose}
          className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/60 transition hover:bg-white/[0.06] hover:text-sidebar-foreground focus-ring"
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
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-sidebar-foreground/40 transition hover:bg-red-500/10 hover:text-red-300 focus-ring"
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
        className="fixed left-3 top-3 z-30 rounded-xl bg-card/80 p-2.5 text-foreground shadow-lg backdrop-blur-xl ring-1 ring-border/40 focus-ring md:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="fixed inset-y-0 left-0 z-40 hidden md:block">{nav}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden" onClick={onMobileClose} />
      )}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 transition-transform duration-300 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {nav}
      </div>
    </>
  );
}
