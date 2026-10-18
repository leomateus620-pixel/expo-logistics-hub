import { Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCalendarDateParts } from './dateUtils';
import type { CronogramaStatus } from './types';
import '@/styles/cronograma-date-badge.css';

export type CronogramaDateBadgeTone = 'default' | 'today' | 'next' | 'completed' | 'muted' | 'alert';

export function getDateBadgeTone({
  status,
  isToday,
  isNext,
  archived,
}: {
  status: CronogramaStatus;
  isToday: boolean;
  isNext: boolean;
  archived?: boolean;
}): CronogramaDateBadgeTone {
  if (status === 'completed') return 'completed';
  if (status === 'cancelled' || archived) return 'muted';
  if (isToday) return 'today';
  if (isNext) return 'next';
  if (status === 'overdue' || status === 'blocked') return 'alert';
  return 'default';
}

interface CronogramaDateBadgeProps {
  date: string;
  startTime?: string | null;
  size?: 'regular' | 'compact';
  tone?: CronogramaDateBadgeTone;
  emptyTimeLabel?: string;
  className?: string;
}

export function CronogramaDateBadge({
  date,
  startTime,
  size = 'regular',
  tone = 'default',
  emptyTimeLabel = 'A definir',
  className,
}: CronogramaDateBadgeProps) {
  const parts = getCalendarDateParts(date);
  if (!parts) return null;
  const time = startTime?.trim() || null;

  return (
    <span
      className={cn('cronograma-date-badge', className)}
      data-size={size}
      data-tone={tone}
      data-weekend={parts.isWeekend || undefined}
      data-weekday={parts.weekdayIndex}
    >
      <time className="cronograma-date-badge__weekday" dateTime={parts.iso}>
        {parts.weekdayShort}
      </time>
      <span className="cronograma-date-badge__sheet">
        <strong className="cronograma-date-badge__day">{parts.day}</strong>
        <span className="cronograma-date-badge__month">{parts.monthShort}</span>
        <span className="cronograma-date-badge__time" data-empty={time ? undefined : 'true'}>
          {time && <Clock3 aria-hidden="true" />}
          <span>{time ?? emptyTimeLabel}</span>
        </span>
      </span>
    </span>
  );
}
