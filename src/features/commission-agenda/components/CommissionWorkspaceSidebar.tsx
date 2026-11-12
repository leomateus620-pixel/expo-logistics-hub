import { useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ChevronLeft, Ellipsis, LogOut, Menu } from 'lucide-react';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { getModuleRoute, type CommissionMenuItem, type CommissionModule } from '@/modules/commissions/commissionRegistry';
import '@/styles/commission-workspace-refinement.css';
import '@/features/soja-store/components/store-navigation.css';

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
  const items = menuItems ?? module.menus;
  const groups = new Map<string | undefined, CommissionMenuItem[]>();
  for (const item of items) {
    const groupItems = groups.get(item.group) ?? [];
    groupItems.push(item);
    groups.set(item.group, groupItems);
  }
  const quickLinks = items.filter((item) => item.quickLabel);
  const grouped = quickLinks.length > 0;

  const renderLink = (item: CommissionMenuItem, className: string, label = item.label) => {
    const Icon = item.icon;
    const target = item.path.startsWith('/') ? item.path : getModuleRoute(module, item.path);
    return (
      <NavLink key={item.path} to={target} onClick={onMobileClose} className={className}>
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </NavLink>
    );
  };

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
        {[...groups].map(([group, groupItems]) => group ? (
          <div key={group} className="cw-sidebar__group" role="group" aria-label={group}>
            <p aria-hidden="true">{group}</p>
            {groupItems.map((item) => renderLink(item, 'cw-sidebar__link'))}
          </div>
        ) : groupItems.map((item) => renderLink(item, 'cw-sidebar__link')))}
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
      <aside className={cn('cw-sidebar cw-sidebar--desktop', grouped && 'cw-sidebar--grouped')}>{contents}</aside>
      <Sheet open={mobileOpen} onOpenChange={(open) => open ? onMobileOpen() : onMobileClose()}>
        {grouped ? (
          <nav className="cw-soja-quick-nav" aria-label="Atalhos da Soja Store">
            {quickLinks.map((item) => renderLink(item, 'cw-soja-quick-nav__item', item.quickLabel))}
            <SheetTrigger asChild>
              <button type="button" className="cw-soja-quick-nav__item" data-commission-menu-open aria-label="Mais seções">
                <Ellipsis aria-hidden="true" />
                <span>Mais</span>
              </button>
            </SheetTrigger>
          </nav>
        ) : (
          <SheetTrigger asChild>
            <button type="button" className="cw-mobile-menu" data-commission-menu-open aria-label="Abrir menu">
              <Menu aria-hidden="true" />
            </button>
          </SheetTrigger>
        )}
        <SheetContent side="left" className={cn('cw-sidebar cw-sidebar--mobile', grouped && 'cw-sidebar--grouped')} overlayClassName="cw-sidebar-overlay" closeLabel="Fechar menu">
          <SheetTitle className="sr-only">Navegação da frente</SheetTitle>
          <SheetDescription className="cw-sidebar__context">{module.name}</SheetDescription>
          {contents}
        </SheetContent>
      </Sheet>
    </>
  );
}
