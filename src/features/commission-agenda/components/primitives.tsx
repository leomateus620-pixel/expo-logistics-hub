import { useState, type ReactNode } from 'react';
import {
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileCheck2,
  MapPin,
  RefreshCw,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { getPersonPhoto } from '@/components/cronograma-eventos/personPhotos';
import { cn } from '@/lib/utils';
import type { EventStatus, PersonSummary, UnitSummary } from '../types';
import {
  EVENT_STATUS_LABELS,
  formatTimeRange,
  getDateParts,
  getInitials,
} from '../lib/agenda-presentation';

/* ────────────────────────────── Avatar / Pessoas ────────────────────────── */

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface PersonAvatarProps {
  person: PersonSummary;
  size?: AvatarSize;
  tone?: 'dark' | 'light';
  primary?: boolean;
  className?: string;
}

export function PersonAvatar({ person, size = 'md', tone = 'dark', primary = false, className }: PersonAvatarProps) {
  const [failed, setFailed] = useState(false);
  const photo = person.photoUrl ?? getPersonPhoto(person.name, person.userId);
  const label = person.role ? `${person.name} — ${person.role}` : person.name;

  return (
    <span
      className={cn('ws-avatar', className)}
      data-size={size}
      data-tone={tone}
      data-primary={primary || undefined}
      role="img"
      aria-label={label}
      title={label}
    >
      {photo && !failed ? (
        <img src={photo} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{getInitials(person.name)}</span>
      )}
    </span>
  );
}

interface AvatarStackProps {
  people: PersonSummary[];
  max?: number;
  size?: AvatarSize;
  tone?: 'dark' | 'light';
  className?: string;
}

export function AvatarStack({ people, max = 3, size = 'sm', tone = 'dark', className }: AvatarStackProps) {
  if (people.length === 0) return null;
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;
  return (
    <span className={cn('ws-avatar-stack', className)} data-tone={tone} aria-label={`Pessoas: ${people.map((p) => p.name).join(', ')}`} role="group">
      {visible.map((person, index) => (
        <PersonAvatar key={person.id} person={person} size={size} tone={tone} primary={index === 0 && people.length > 1} />
      ))}
      {overflow > 0 && <span className="ws-avatar-stack__more" aria-hidden="true">+{overflow}</span>}
    </span>
  );
}

interface EventPeopleProps {
  people: PersonSummary[];
  /** Show the first person's name next to the avatars. */
  showName?: boolean;
  size?: AvatarSize;
  className?: string;
}

/** Compact people strip: one name, multiple avatars with `+N` overflow. */
export function EventPeople({ people, showName = true, size = 'sm', className }: EventPeopleProps) {
  if (people.length === 0) {
    return <span className={cn('ua-people ws-meta-secondary', className)}>Responsável a definir</span>;
  }
  const [first, ...rest] = people;
  return (
    <span className={cn('ua-people', className)}>
      <AvatarStack people={people} max={3} size={size} tone="light" />
      {showName && (
        <span className="ua-people__name ws-meta">
          {first.name}
          {rest.length > 0 && <span className="ua-people__extra"> +{rest.length}</span>}
        </span>
      )}
    </span>
  );
}

/* ─────────────────────────────── Data e hora ─────────────────────────────── */

interface EventDateBadgeProps {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  endDate?: string | null;
  showYear?: boolean;
  size?: 'md' | 'lg';
  emphasis?: 'default' | 'gold';
  className?: string;
}

export function EventDateBadge({ date, endDate, showYear = false, size = 'md', emphasis = 'default', className }: EventDateBadgeProps) {
  const parts = getDateParts(date);
  const end = endDate && endDate !== date ? getDateParts(endDate) : null;
  return (
    <span className={cn('ua-event-date', className)} data-size={size} data-emphasis={emphasis} aria-hidden="true">
      <span className="ua-event-date__day">{String(parts.day).padStart(2, '0')}</span>
      <span className="ua-event-date__month">{parts.monthShort}</span>
      {end && (
        <span className="ua-event-date__range">
          → {String(end.day).padStart(2, '0')} {end.month !== parts.month ? end.monthShort : ''}
        </span>
      )}
      {showYear && <span className="ua-event-date__year">{parts.year}</span>}
    </span>
  );
}

interface EventTimeRangeProps {
  startTime?: string | null;
  endTime?: string | null;
  duration?: string | null;
  showIcon?: boolean;
  className?: string;
}

export function EventTimeRange({ startTime, endTime, duration, showIcon = false, className }: EventTimeRangeProps) {
  if (!startTime) {
    return <span className={cn('ua-time', className)}><span className="ua-time__pending">Horário a definir</span></span>;
  }
  return (
    <span className={cn('ua-time', className)} aria-label={`${formatTimeRange(startTime, endTime)}${duration ? `, duração ${duration}` : ''}`}>
      <span className="ua-time__range">
        {showIcon && <Clock3 aria-hidden="true" />}
        <span>{startTime}</span>
        {endTime && (
          <>
            <span className="ua-time__arrow" aria-hidden="true">→</span>
            <span>{endTime}</span>
          </>
        )}
      </span>
      {duration && <span className="ua-time__duration">{duration}</span>}
    </span>
  );
}

/* ──────────────────────────────── Status ─────────────────────────────────── */

const STATUS_ICONS: Record<EventStatus, LucideIcon> = {
  requested: CircleDashed,
  confirmed: CheckCircle2,
  draft: CircleDashed,
  completed: FileCheck2,
  cancelled: Ban,
  rescheduled: RefreshCw,
};

interface EventStatusBadgeProps {
  status: EventStatus;
  size?: 'sm' | 'md' | 'lg';
  withIcon?: boolean;
  className?: string;
}

export function EventStatusBadge({ status, size = 'md', withIcon = false, className }: EventStatusBadgeProps) {
  const Icon = STATUS_ICONS[status];
  return (
    <span className={cn('ua-status', className)} data-status={status} data-size={size}>
      {withIcon && <Icon aria-hidden="true" />}
      {EVENT_STATUS_LABELS[status]}
    </span>
  );
}

export function NextEventFlag({ className }: { className?: string }) {
  return (
    <span className={cn('ua-next-flag', className)}>
      <Sparkles aria-hidden="true" />
      Próximo
    </span>
  );
}

/* ─────────────────────────────── Unidades ────────────────────────────────── */

interface UnitBadgeProps {
  unit: UnitSummary;
  /** Marks the badge as the unit that owns the current workspace. */
  self?: boolean;
  className?: string;
}

export function UnitBadge({ unit, self = false, className }: UnitBadgeProps) {
  return (
    <span className={cn('ua-unit-badge', className)} data-type={unit.type} data-self={self || undefined} title={unit.name}>
      <span>{unit.shortName ?? unit.name}</span>
    </span>
  );
}

interface UnitBadgeListProps {
  units: UnitSummary[];
  selfId?: string;
  max?: number;
  className?: string;
}

export function UnitBadgeList({ units, selfId, max = 2, className }: UnitBadgeListProps) {
  if (units.length === 0) return null;
  const ordered = [...units].sort((a, b) => (a.id === selfId ? -1 : b.id === selfId ? 1 : 0));
  const visible = ordered.slice(0, max);
  const overflow = ordered.length - visible.length;
  return (
    <span className={cn('ua-units', className)} aria-label={`Frentes relacionadas: ${units.map((u) => u.name).join(', ')}`}>
      {visible.map((unit) => <UnitBadge key={unit.id} unit={unit} self={unit.id === selfId} />)}
      {overflow > 0 && (
        <span className="ua-unit-badge ua-unit-badge--more" title={ordered.slice(max).map((u) => u.name).join(', ')}>
          <span>+{overflow}</span>
        </span>
      )}
    </span>
  );
}

/* ──────────────────────────────── Local ──────────────────────────────────── */

export function EventLocation({ location, className }: { location?: string | null; className?: string }) {
  return (
    <span className={cn('ua-location ws-meta-secondary', className)}>
      <MapPin aria-hidden="true" />
      <span>{location || 'Local a definir'}</span>
    </span>
  );
}

/* ─────────────────────────── Botões utilitários ──────────────────────────── */

interface WorkspaceButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost';
  size?: 'md' | 'sm';
  icon?: LucideIcon;
  children?: ReactNode;
}

export function WorkspaceButton({ variant = 'default', size = 'md', icon: Icon, className, children, type = 'button', ...props }: WorkspaceButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'ua-button ws-focus',
        variant === 'primary' && 'ua-button--primary',
        variant === 'ghost' && 'ua-button--ghost',
        size === 'sm' && 'ua-button--sm',
        className,
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden="true" />}
      {children}
    </button>
  );
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
}

export function IconButton({ icon: Icon, label, className, type = 'button', ...props }: IconButtonProps) {
  return (
    <button type={type} className={cn('ua-icon-button ws-focus', className)} aria-label={label} title={label} {...props}>
      <Icon aria-hidden="true" />
    </button>
  );
}
