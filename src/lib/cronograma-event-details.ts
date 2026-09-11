import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import { toDisplayUpper } from '@/lib/textNormalize';

export interface EventDetailLine {
  /** Short origin label, e.g. "PROGRAMAÇÃO" or the subevent title. */
  source: string;
  text: string;
}

function clean(value?: string | null): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Operational information surfaced on cards and detail views.
 * Reads the parent event description plus subevent actions/provisions,
 * without flattening or duplicating the subevent structure itself.
 */
export function getEventOperationalLines(event: CronogramaEvent, limit = 6): EventDetailLine[] {
  const lines: EventDetailLine[] = [];
  const push = (source: string, text?: string | null) => {
    const value = clean(text);
    if (!value) return;
    if (lines.some((line) => line.text.toLowerCase() === value.toLowerCase())) return;
    lines.push({ source: toDisplayUpper(source), text: value });
  };

  push('Descrição', event.summary);
  push('Pendência', event.pendingReason);
  push('Decisão', event.decisionNeeded);

  for (const subevent of event.subevents ?? []) {
    const label = clean(subevent.title) || 'Subevento';
    push(label, subevent.description);
    for (const action of subevent.actions ?? []) {
      push(label, [action.startTime, action.title].filter(Boolean).join(' · '));
    }
    for (const provision of subevent.provisions ?? []) {
      push(label, provision.description);
    }
    if (lines.length >= limit) break;
  }

  return lines.slice(0, limit);
}

/** One-line teaser used on compact cards. */
export function getEventDetailTeaser(event: CronogramaEvent): string | null {
  const [first] = getEventOperationalLines(event, 1);
  return first?.text ?? null;
}
