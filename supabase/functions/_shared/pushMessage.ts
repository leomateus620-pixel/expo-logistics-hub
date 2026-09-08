// Conteúdo do aviso no celular para lembretes de evento.
// Espelha o e-mail: mesmos destinatários, mesmos offsets, só muda o canal.

export interface EventPushInput {
  offsetMinutes: number;
  eventTitle: string;
  dateLabel: string;
  timeLabel: string;
  location?: string | null;
  eventId: string;
}

export interface EventPushMessage {
  title: string;
  body: string;
  path: string;
}

export const PUSH_ICON_PATH = '/push-icon.png';

export function reminderHorizonLabel(offsetMinutes: number): string {
  if (offsetMinutes >= 1440) return 'amanhã';
  if (offsetMinutes >= 120) return 'em 2 horas';
  return 'em 1 hora';
}

export function buildEventPushMessage(input: EventPushInput): EventPushMessage {
  const parts = [input.dateLabel, input.timeLabel];
  const location = (input.location ?? '').trim();
  if (location && location.toLowerCase() !== 'não informado') parts.push(location);

  return {
    title: `Evento ${reminderHorizonLabel(input.offsetMinutes)}: ${input.eventTitle}`,
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
