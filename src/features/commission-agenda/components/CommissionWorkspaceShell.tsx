import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommissionUnitViewModel, CommissionWorkspaceNavItem, CommissionWorkspaceSection } from '../types';
import { WORKSPACE_SECTION_PATHS, unitTypeLabel } from '../lib/workspace-navigation';
import { PersonAvatar } from './primitives';

const UNIT_STATUS_LABELS: Record<CommissionUnitViewModel['status'], string> = {
  active: 'Ativo',
  structuring: 'Em estruturação',
  restricted: 'Acesso restrito',
};

export interface WorkspacePrimaryAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

/* ───────────────────────────── Cabeçalho ─────────────────────────────────── */

export interface CommissionHeaderProps {
  unit: CommissionUnitViewModel;
  action?: WorkspacePrimaryAction;
  /** Rendered below the identity (usually the navigation). */
  children?: ReactNode;
  className?: string;
}

export function CommissionHeader({ unit, action, children, className }: CommissionHeaderProps) {
  const Icon = unit.icon;
  const ActionIcon = action?.icon;
  const leads = unit.leads.length > 0 ? unit.leads : unit.principal ? [unit.principal] : [];

  return (
    <header
      className={cn('cw-header', leads.length === 0 && action && 'cw-header--without-leads', className)}
      style={{ '--cw-accent': unit.accentColor } as CSSProperties}
      aria-label={`${unitTypeLabel(unit.type)} ${unit.name}`}
    >
      <div className="cw-header__identity">
        <span className="cw-header__icon" aria-hidden="true"><Icon /></span>
        <div className="min-w-0">
          <div className="cw-header__title-row">
            <h1 className="cw-header__name ws-display">{unit.name}</h1>
            <div className="cw-header__eyebrow">
              <span className="ws-label">{unitTypeLabel(unit.type)}</span>
              <span className="cw-unit-status" data-status={unit.status}>{UNIT_STATUS_LABELS[unit.status]}</span>
            </div>
          </div>
        </div>
        {action && ActionIcon && (
          <div className="cw-header__actions">
            <button type="button" className="cw-primary-action ws-focus" onClick={action.onClick} aria-label={action.label}>
              <ActionIcon aria-hidden="true" />
              <span>{action.label}</span>
            </button>
          </div>
        )}
      </div>

      {(leads.length > 0 || unit.description) && (
        <div className="cw-header__people">
          {leads.slice(0, 1).map((person) => (
            <span key={person.id} className="cw-person">
              <PersonAvatar person={person} size="xs" tone="light" />
              <span className="min-w-0">
                <span className="cw-person__name ws-meta">{person.name}</span>
                <span className="cw-person__role ws-caption" style={{ fontWeight: 500 }}>{person.role ?? 'Principal'}</span>
              </span>
            </span>
          ))}
          {leads.length > 1 && (
            <Link to={`${unit.basePath}/${WORKSPACE_SECTION_PATHS.team}`} className="cw-header__more-leads ws-focus" aria-label={`Ver os ${leads.length} responsáveis na equipe`}>+{leads.length - 1}</Link>
          )}
          {unit.description && (
            <details className="cw-header__about">
              <summary className="ws-focus" aria-label={`Sobre ${unit.name}`}>
                <span className="cw-header__about-full">Sobre a frente</span>
                <span className="cw-header__about-short">Sobre</span>
              </summary>
              <p>{unit.description}</p>
            </details>
          )}
        </div>
      )}

      {children}
    </header>
  );
}

/* ───────────────────────────── Navegação ─────────────────────────────────── */

export interface CommissionNavigationProps {
  items: CommissionWorkspaceNavItem[];
  active: CommissionWorkspaceSection;
  className?: string;
}

export function CommissionNavigation({ items, active, className }: CommissionNavigationProps) {
  const railRef = useRef<HTMLDivElement>(null);

  // Keep the active tab visible on narrow rails.
  useEffect(() => {
    const rail = railRef.current;
    const current = rail?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!rail || !current) return;
    const left = current.offsetLeft - 16;
    const right = current.offsetLeft + current.offsetWidth + 16;
    if (left < rail.scrollLeft || right > rail.scrollLeft + rail.clientWidth) {
      rail.scrollTo({ left: Math.max(0, left), behavior: 'auto' });
    }
  }, [active]);

  return (
    <nav className={cn('cw-nav', className)} aria-label="Seções da frente">
      <div ref={railRef} className="cw-nav__rail" role="tablist">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          return (
            <Link
              key={item.id}
              to={item.path}
              className="cw-nav__item ws-focus"
              aria-current={isActive ? 'page' : undefined}
              role="tab"
              aria-selected={isActive}
            >
              <Icon aria-hidden="true" />
              <span className="cw-nav__label--full">{item.label}</span>
              <span className="cw-nav__label--short">{item.shortLabel}</span>
              {typeof item.count === 'number' && item.count > 0 && <span className="cw-nav__count">{item.count}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ─────────────────────────────── Shell ───────────────────────────────────── */

export interface CommissionWorkspaceShellProps {
  unit: CommissionUnitViewModel;
  navigation: CommissionWorkspaceNavItem[];
  section: CommissionWorkspaceSection;
  action?: WorkspacePrimaryAction;
  children: ReactNode;
  className?: string;
}

export function CommissionWorkspaceShell({ unit, section, action, children, className }: CommissionWorkspaceShellProps) {
  return (
    <div className={cn('unit-workspace', className)} data-unit={unit.id} data-section={section}>
      <CommissionHeader unit={unit} action={action} />
      <div className="unit-workspace__content">{children}</div>
    </div>
  );
}
