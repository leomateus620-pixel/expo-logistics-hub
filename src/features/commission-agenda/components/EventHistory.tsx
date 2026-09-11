import { cn } from '@/lib/utils';
import type { EventHistoryEntry } from '../types';
import { formatDayMonth, getDateParts } from '../lib/agenda-presentation';
import { AgendaEmptyState } from './AgendaStates';
import { History } from 'lucide-react';

export interface EventHistoryProps {
  entries: EventHistoryEntry[];
  todayKey?: string;
  className?: string;
}

function dayLabel(dateKey: string, todayKey?: string) {
  if (dateKey === todayKey) return 'Hoje';
  if (todayKey) {
    const yesterday = new Date(`${todayKey}T12:00:00`);
    yesterday.setDate(yesterday.getDate() - 1);
    const key = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    if (dateKey === key) return 'Ontem';
  }
  return `${formatDayMonth(dateKey)} ${getDateParts(dateKey).year}`;
}

export function EventHistory({ entries, todayKey, className }: EventHistoryProps) {
  if (entries.length === 0) {
    return <AgendaEmptyState compact icon={History} title="Sem histórico registrado" detail="As alterações deste evento aparecerão aqui." />;
  }

  const days = new Map<string, EventHistoryEntry[]>();
  for (const entry of [...entries].sort((a, b) => `${b.date} ${b.time ?? ''}`.localeCompare(`${a.date} ${a.time ?? ''}`))) {
    const list = days.get(entry.date) ?? [];
    list.push(entry);
    days.set(entry.date, list);
  }

  return (
    <div className={cn('ua-history', className)}>
      {Array.from(days.entries()).map(([dateKey, dayEntries]) => (
        <section key={dateKey} className="ua-history__day" aria-label={dayLabel(dateKey, todayKey)}>
          <p className="ua-history__day-label ws-label">{dayLabel(dateKey, todayKey)}</p>
          <ol className="ua-history__list">
            {dayEntries.map((entry) => (
              <li key={entry.id} className="ua-history__entry" data-kind={entry.kind}>
                <span className="ua-history__time">{entry.time ?? '—'}</span>
                <div className="min-w-0">
                  <p className="ua-history__title ws-meta" style={{ fontWeight: 600 }}>{entry.title}</p>
                  {(entry.detail || entry.actor) && (
                    <p className="ua-history__detail ws-caption" style={{ fontWeight: 500 }}>
                      {entry.detail}
                      {entry.actor && <> {entry.detail ? '·' : ''} {entry.actor.name}</>}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
