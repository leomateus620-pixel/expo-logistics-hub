import { describe, expect, it } from 'vitest';
import { normalizeEventDateTime } from '../../supabase/functions/_shared/eventDateTime';

describe('normalização de data e hora dos eventos', () => {
  it('aceita o formato SQL time com segundos que causava Invalid Date', () => {
    const result = normalizeEventDateTime({
      date: '2026-07-22',
      startTime: '13:30:00',
      endTime: '15:00:00',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.dateLong).toBe('Quarta-feira, 22 de julho de 2026');
    expect(result.value.timeLabel).toBe('13h30–15h');
    expect(result.value.absoluteLabel).toBe('Quarta-feira, 22 de julho de 2026, às 13h30');
    expect(result.value.scheduleAt.toISOString()).toBe('2026-07-22T16:30:00.000Z');
  });

  it('mantém data-only sem deslocar o dia e marca evento de dia inteiro', () => {
    const result = normalizeEventDateTime({ date: '2026-07-22' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.allDay).toBe(true);
    expect(result.value.timeLabel).toBe('Dia inteiro');
    expect(result.value.googleStart).toEqual({ date: '2026-07-22' });
    expect(result.value.googleEnd).toEqual({ date: '2026-07-23' });
  });

  it('cria duração segura de uma hora quando não há horário final', () => {
    const result = normalizeEventDateTime({ date: '2026-07-22', startTime: '23:30:00' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.timeLabel).toBe('23h30');
    expect(result.value.googleEnd).toEqual({
      dateTime: '2026-07-23T00:30:00',
      timeZone: 'America/Sao_Paulo',
    });
  });

  it('aceita frações de segundo sem concatenar fragmentos', () => {
    const result = normalizeEventDateTime({ date: '2026-07-22', startTime: '09:05:30.123456' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.startTime).toBe('09:05:30');
    expect(result.value.timeLabel).toBe('9h05');
  });

  it('rejeita datas, horas e pares inválidos antes de construir Date', () => {
    expect(normalizeEventDateTime({ date: '2026-02-30', startTime: '13:30' })).toEqual({
      ok: false,
      error: 'invalid_date',
    });
    expect(normalizeEventDateTime({ date: '2026-07-22', startTime: '25:00' })).toEqual({
      ok: false,
      error: 'invalid_start_time',
    });
    expect(normalizeEventDateTime({ date: '2026-07-22', endTime: '14:00' })).toEqual({
      ok: false,
      error: 'invalid_time_pair',
    });
    expect(normalizeEventDateTime({ date: '2026-07-22', allDay: false })).toEqual({
      ok: false,
      error: 'invalid_time_pair',
    });
    expect(normalizeEventDateTime({ date: '2026-07-22', endDate: '2026-07-21' })).toEqual({
      ok: false,
      error: 'end_before_start',
    });
  });

  it('rejeita uma hora civil inexistente em fronteira histórica de horário de verão', () => {
    expect(normalizeEventDateTime({ date: '2018-11-04', startTime: '00:30:00' })).toEqual({
      ok: false,
      error: 'nonexistent_local_time',
    });
  });
});
