import { describe, expect, it } from 'vitest';
import { formatSaoPaulo, venuePushPath } from '../../supabase/functions/_shared/venueNotifications';

describe('venue notifications', () => {
  it('abre o evento na Agenda Restaurante e Arena', () => {
    expect(venuePushPath('abc')).toBe('/eventos-restaurante-arena?evento=abc');
  });

  it('formata no fuso de São Paulo (virada de dia em UTC)', () => {
    // 02:30 UTC de 5/out = 23:30 de 4/out em Brasília
    expect(formatSaoPaulo('2026-10-05T02:30:00Z')).toMatch(/04.*23:30/);
    expect(formatSaoPaulo(null)).toBe('');
  });
});
