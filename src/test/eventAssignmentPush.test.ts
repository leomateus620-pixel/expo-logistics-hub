import { describe, expect, it } from 'vitest';
import { buildAssignmentPushMessage } from '../../supabase/functions/_shared/pushMessage';

/**
 * Aviso no celular disparado quando alguém é vinculado a um evento.
 * Espelha a lógica da edge `event-assignment-push`.
 */
describe('buildAssignmentPushMessage', () => {
  it('monta título, corpo e caminho para vínculo direto', () => {
    const message = buildAssignmentPushMessage({
      eventTitle: '1ª REUNIÃO COMISSÃO CENTRAL',
      dateLabel: 'terça-feira, 8 de setembro',
      timeLabel: '18:30',
      location: 'AUDITÓRIO CENTRAL',
      eventId: 'evt-1',
      source: 'responsible',
    });
    expect(message.title).toBe('Você foi vinculado a um evento');
    expect(message.body).toBe('1ª REUNIÃO COMISSÃO CENTRAL · terça-feira, 8 de setembro · 18:30 · AUDITÓRIO CENTRAL');
    expect(message.path).toBe('/cronograma?event=evt-1');
  });

  it('diferencia vínculo por comissão e ignora local não informado', () => {
    const message = buildAssignmentPushMessage({
      eventTitle: 'REUNIÃO DE PAUTA',
      dateLabel: null,
      timeLabel: null,
      location: 'Não informado',
      eventId: 'evt-2',
      source: 'commission',
    });
    expect(message.title).toBe('Sua comissão foi vinculada a um evento');
    expect(message.body).toBe('REUNIÃO DE PAUTA');
  });
});

/** Regra de despacho: só envia para quem tem aparelho ativo; o resto vira "ignorado". */
function dispatchDecision(userId: string, activeDeviceUsers: Set<string>) {
  return activeDeviceUsers.has(userId) ? 'send' : 'skip';
}

describe('filtro por aparelho ativo', () => {
  it('envia apenas para quem ativou os avisos', () => {
    const active = new Set(['leo']);
    expect(dispatchDecision('leo', active)).toBe('send');
    expect(dispatchDecision('cleo', active)).toBe('skip');
  });
});
