// Conteúdo do aviso no celular para lembretes de evento.
// Espelha o e-mail: mesmos destinatários, mesmos offsets, só muda o canal.

import type { EventLifecycleState } from './eventLifecycle.ts';

export interface EventPushInput {
  offsetMinutes: number;
  eventTitle: string;
  dateLabel: string;
  timeLabel: string;
  location?: string | null;
  eventId: string;
  /** Eventos de vários dias: "até 15 SET · 18h" no primeiro dia. */
  multiDayEndLabel?: string | null;
}

export interface EventPushMessage {
  title: string;
  body: string;
  path: string;
}

export const PUSH_ICON_PATH = '/push-icon.png';

// Mesma regra de maiúsculas da Agenda (src/lib/textNormalize.ts): preserva
// acentos e nunca altera valores técnicos (e-mails, URLs, ids).
const TECHNICAL_VALUE =
  /^(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|www\.)|^[^\s@]+@[^\s@]+\.[^\s@]+$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function displayUpper(raw: string | null | undefined): string {
  if (raw == null) return '';
  const value = String(raw);
  if (!value.trim()) return value;
  if (TECHNICAL_VALUE.test(value.trim())) return value;
  return value.toLocaleUpperCase('pt-BR');
}

function meaningfulLocation(location?: string | null) {
  const value = (location ?? '').trim();
  if (!value || value.toLowerCase() === 'não informado') return null;
  return value;
}

export function reminderHorizonLabel(offsetMinutes: number): string {
  if (offsetMinutes >= 1440) return 'amanhã';
  if (offsetMinutes >= 120) return 'em 2 horas';
  return 'em 1 hora';
}

export function buildEventPushMessage(input: EventPushInput): EventPushMessage {
  const parts = [input.dateLabel, input.timeLabel];
  const location = meaningfulLocation(input.location);
  if (location) parts.push(location);
  const endLabel = (input.multiDayEndLabel ?? '').trim();
  if (endLabel) parts.push(`Segue até ${endLabel}`);

  return {
    title: `Evento ${reminderHorizonLabel(input.offsetMinutes)}: ${input.eventTitle}`,
    body: parts.filter(Boolean).join(' · '),
    path: `/cronograma?event=${input.eventId}`,
  };
}

export interface EventLifecycleMessageInput {
  state: EventLifecycleState;
  eventTitle: string;
  eventId: string;
  dayIndex: number;
  totalDays: number;
  /** Ex.: "15 SET". */
  endDateLabel?: string | null;
  /** Ex.: "18h" ou "18h30". */
  endTimeLabel?: string | null;
  location?: string | null;
}

/**
 * Gerador único do conteúdo dos avisos de ciclo de eventos de vários dias.
 * Regras determinísticas — nada de geração por IA em push de rotina.
 */
export function buildEventLifecycleMessage(input: EventLifecycleMessageInput): EventPushMessage {
  const title = displayUpper(input.eventTitle);
  const endTime = (input.endTimeLabel ?? '').trim();
  const endDate = (input.endDateLabel ?? '').trim();
  const isLastDay = input.state === 'FINAL_DAY';
  const isEveOfLastDay = !isLastDay && input.dayIndex === input.totalDays - 1;

  const parts: string[] = [];
  if (!isLastDay) parts.push(`Dia ${input.dayIndex} de ${input.totalDays}`);

  if (isLastDay) {
    parts.push(endTime ? `Encerra hoje às ${endTime}` : 'Encerra hoje');
  } else if (isEveOfLastDay) {
    parts.push(endTime ? `Encerra amanhã às ${endTime}` : 'Encerra amanhã');
  } else if (endDate) {
    parts.push(endTime ? `Encerra em ${endDate} · ${endTime}` : `Encerra em ${endDate}`);
  }

  const location = meaningfulLocation(input.location);
  if (location) parts.push(location);

  const headline = input.state === 'START'
    ? 'Evento começa hoje'
    : isLastDay
      ? 'Último dia'
      : 'Evento em andamento';

  return {
    title: `${headline}: ${title}`,
    body: parts.filter(Boolean).join(' · '),
    path: `/cronograma?event=${input.eventId}`,
  };
}


export interface AssignmentPushInput {
  eventTitle: string;
  dateLabel?: string | null;
  timeLabel?: string | null;
  location?: string | null;
  eventId: string;
  /** 'responsible' quando a pessoa foi vinculada diretamente; 'commission' via comissão. */
  source?: 'responsible' | 'commission';
}

export function buildAssignmentPushMessage(input: AssignmentPushInput): EventPushMessage {
  const parts: string[] = [input.eventTitle.trim()];
  const date = (input.dateLabel ?? '').trim();
  const time = (input.timeLabel ?? '').trim();
  const location = (input.location ?? '').trim();
  if (date) parts.push(date);
  if (time) parts.push(time);
  if (location && location.toLowerCase() !== 'não informado') parts.push(location);

  return {
    title: input.source === 'commission'
      ? 'Sua comissão foi vinculada a um evento'
      : 'Você foi vinculado a um evento',
    body: parts.filter(Boolean).join(' · '),
    path: `/cronograma?event=${input.eventId}`,
  };
}
