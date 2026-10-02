import { useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ChevronLeft, LogOut, Menu } from 'lucide-react';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { getModuleRoute, type CommissionMenuItem, type CommissionModule } from '@/modules/commissions/commissionRegistry';
import '@/styles/commission-workspace-refinement.css';

interface WorkspaceSidebarProps {
  module: CommissionModule;
  menuItems?: CommissionMenuItem[];
  mobileOpen: boolean;
  onMobileOpen: () => void;
  onMobileClose: () => void;
}

/** Exclusive workspace navigation. The sidebar used by operational/map modules is untouched. */
export default function CommissionWorkspaceSidebar({ module, menuItems, mobileOpen, onMobileOpen, onMobileClose }: WorkspaceSidebarProps) {
  const { signOut } = useAuth();

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const viewport = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => { if (viewport.matches) onMobileClose(); };
    viewport.addEventListener('change', closeOnDesktop);
    closeOnDesktop();
    return () => viewport.removeEventListener('change', closeOnDesktop);
  }, [onMobileClose]);

  const contents = (
    <>
      <div className="cw-sidebar__brand">
        <FenasojaBrand compact tone="dark" />
        <p>Comissões e assessorias</p>
      </div>
      <nav className="cw-sidebar__nav" aria-label="Seções da frente">
        {(menuItems ?? module.menus).map((item) => {
          const Icon = item.icon;
          const target = item.path.startsWith('/') ? item.path : getModuleRoute(module, item.path);
          return (
            <NavLink key={item.path} to={target} onClick={onMobileClose} className="cw-sidebar__link">
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="cw-sidebar__footer">
        <Link to="/portal" onClick={onMobileClose} className="cw-sidebar__link">
          <ChevronLeft aria-hidden="true" />Portal de Comissões
        </Link>
        <button type="button" className="cw-sidebar__link" onClick={() => { onMobileClose(); void signOut(); }}>
          <LogOut aria-hidden="true" />Sair
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside className="cw-sidebar cw-sidebar--desktop">{contents}</aside>
      <Sheet open={mobileOpen} onOpenChange={(open) => open ? onMobileOpen() : onMobileClose()}>
        <SheetTrigger asChild>
          <button type="button" className="cw-mobile-menu" data-commission-menu-open aria-label="Abrir menu">
            <Menu aria-hidden="true" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="cw-sidebar cw-sidebar--mobile" overlayClassName="cw-sidebar-overlay" closeLabel="Fechar menu">
          <SheetTitle className="sr-only">Navegação da frente</SheetTitle>
          <SheetDescription className="cw-sidebar__context">{module.name}</SheetDescription>
          {contents}
        </SheetContent>
      </Sheet>
    </>
  );
}
