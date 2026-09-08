import { describe, expect, it } from 'vitest';
import {
  buildEventPushMessage,
  PUSH_ICON_PATH,
  reminderHorizonLabel,
} from '../../supabase/functions/_shared/pushMessage.ts';

/**
 * Regras de token inválido usadas pelo envio de push.
 * Espelha o comportamento da edge `send-push-notification`.
 */
export function isStaleTokenResponse(status: number, body: string): boolean {
  return status === 404 || (status === 400 && body.includes('INVALID_ARGUMENT'));
}

describe('revogação de token de aparelho', () => {
  it('trata 404 (UNREGISTERED) como token vencido', () => {
    expect(isStaleTokenResponse(404, '{"error":{"status":"UNREGISTERED"}}')).toBe(true);
  });

  it('trata 400 INVALID_ARGUMENT como token vencido', () => {
    expect(isStaleTokenResponse(400, '{"error":{"status":"INVALID_ARGUMENT"}}')).toBe(true);
  });

  it('não revoga em falhas temporárias', () => {
    expect(isStaleTokenResponse(429, 'RESOURCE_EXHAUSTED')).toBe(false);
    expect(isStaleTokenResponse(500, 'INTERNAL')).toBe(false);
    expect(isStaleTokenResponse(400, 'SENDER_ID_MISMATCH')).toBe(false);
  });
});

describe('payload do aviso', () => {
  it('usa o logo oficial e leva ao evento certo', () => {
    const message = buildEventPushMessage({
      offsetMinutes: 120,
      eventTitle: 'Reunião da Comissão Central',
      dateLabel: '28 de abril de 2026',
      timeLabel: '19h30',
      location: 'Centro de Eventos',
      eventId: 'abc-123',
    });

    expect(PUSH_ICON_PATH).toBe('/push-icon.png');
    expect(message.title).toContain('Reunião da Comissão Central');
    expect(message.title).toContain(reminderHorizonLabel(120));
    expect(message.path).toBe('/cronograma?event=abc-123');
    expect(message.body).toBe('28 de abril de 2026 · 19h30 · Centro de Eventos');
  });
});
