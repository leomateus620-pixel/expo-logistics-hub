import { useState } from 'react';
import { ChevronDown, ChevronUp, Star, UserPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CronogramaEvent } from './types';

export interface EventRelationItem {
  key: string;
  label: string;
  isPrimary: boolean;
  isExternal?: boolean;
  hint?: string | null;
}

/** All commissions linked to the event (primary first), with legacy fallback. */
export function getEventCommissionItems(event: CronogramaEvent): EventRelationItem[] {
  const links = event.commissionsRel ?? [];
  if (links.length === 0) {
    return event.commission
      ? [{ key: 'legacy-commission', label: event.commission, isPrimary: true }]
      : [];
  }
  return links
    .map((link, index) => ({
      key: link.commissionId ?? link.commissionSlug ?? `commission-${index}`,
      label: link.commissionName?.trim() || link.commissionSlug?.trim() || 'Comissão',
      isPrimary: Boolean(link.isPrimary),
    }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

/** All responsibles linked to the event (primary first), with legacy fallback. */
export function getEventResponsibleItems(event: CronogramaEvent): EventRelationItem[] {
  const links = event.responsiblesRel ?? [];
  if (links.length === 0) {
    return event.owner
      ? [{ key: 'legacy-responsible', label: event.owner, isPrimary: true }]
      : [];
  }
  return links
    .map((link, index) => ({
      key: link.userId ?? `external-${index}`,
      label: link.name?.trim() || 'Responsável',
      isPrimary: Boolean(link.isPrimary),
      isExternal: link.responsibleType === 'external' || !link.userId,
      hint: link.role ?? null,
    }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

interface EventRelationListProps {
  items: EventRelationItem[];
  emptyLabel: string;
  icon: LucideIcon;
  /** When > 0 and the list is longer, collapse behind a "Mostrar todas" toggle. */
  collapseAfter?: number;
  className?: string;
}

export function EventRelationList({
  items,
  emptyLabel,
  icon: Icon,
  collapseAfter = 0,
  className,
}: EventRelationListProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return <p className="cronograma-relation-empty">{emptyLabel}</p>;
  }

  const collapsible = collapseAfter > 0 && items.length > collapseAfter;
  const visible = collapsible && !expanded ? items.slice(0, collapseAfter) : items;

  return (
    <div className={cn('cronograma-relation-list', className)}>
      <ul>
        {visible.map((item) => {
          const ItemIcon = item.isExternal ? UserPlus : Icon;
          return (
            <li
              key={item.key}
              className="cronograma-relation-item"
              data-primary={item.isPrimary || undefined}
            >
              <span className="cronograma-relation-item-icon" aria-hidden="true">
                <ItemIcon />
              </span>
              <span className="cronograma-relation-item-label" title={item.hint ?? undefined}>
                {item.label}
              </span>
              {item.isPrimary && (
                <span className="cronograma-relation-primary-badge">
                  <Star aria-hidden="true" />
                  Principal
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {collapsible && (
        <button
          type="button"
          className="cronograma-relation-toggle"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <>Mostrar menos <ChevronUp aria-hidden="true" /></>
          ) : (
            <>Mostrar todas ({items.length}) <ChevronDown aria-hidden="true" /></>
          )}
        </button>
      )}
    </div>
  );
}
