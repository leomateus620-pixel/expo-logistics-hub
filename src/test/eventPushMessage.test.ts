import { describe, expect, it } from 'vitest';
import {
  buildEventPushMessage,
  reminderHorizonLabel,
} from '../../supabase/functions/_shared/pushMessage';

const base = {
  eventTitle: 'Reunião da Comissão Central',
  dateLabel: 'Quarta-feira, 22 de julho de 2026',
  timeLabel: '13h30–15h',
  eventId: 'event-123',
};

describe('aviso no celular do lembrete de evento', () => {
  it('usa o mesmo horizonte dos lembretes por e-mail', () => {
    expect(reminderHorizonLabel(1440)).toBe('amanhã');
    expect(reminderHorizonLabel(120)).toBe('em 2 horas');
    expect(reminderHorizonLabel(60)).toBe('em 1 hora');
  });

  it('monta título, corpo e link direto do evento', () => {
    const message = buildEventPushMessage({
      ...base,
      offsetMinutes: 1440,
      location: 'Sede FENASOJA',
    });
    expect(message.title).toBe('Evento amanhã: Reunião da Comissão Central');
    expect(message.body).toBe('Quarta-feira, 22 de julho de 2026 · 13h30–15h · Sede FENASOJA');
    expect(message.path).toBe('/cronograma?event=event-123');
  });

  it('não cria separador vazio quando não há local', () => {
    const message = buildEventPushMessage({ ...base, offsetMinutes: 60, location: null });
    expect(message.body).toBe('Quarta-feira, 22 de julho de 2026 · 13h30–15h');
    expect(message.body).not.toMatch(/·\s*$/);
  });

  it('ignora local sentinela "Não informado"', () => {
    const message = buildEventPushMessage({
      ...base,
      offsetMinutes: 120,
      location: 'Não informado',
    });
    expect(message.body).not.toMatch(/informado/i);
    expect(message.title).toContain('em 2 horas');
  });
});
