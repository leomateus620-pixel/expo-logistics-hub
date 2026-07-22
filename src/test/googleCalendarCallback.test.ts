import { describe, expect, it } from 'vitest';
import {
  appendGoogleCalendarCallbackSignal,
  buildGoogleCalendarReturnUrl,
  cleanGoogleCalendarCallbackUrl,
  getGoogleCalendarCallbackNext,
  parseGoogleCalendarCallbackFeedback,
} from '@/lib/google-calendar-callback';

describe('retorno OAuth do Google Agenda', () => {
  it('aceita apenas o sinal de retorno conhecido', () => {
    expect(parseGoogleCalendarCallbackFeedback('?google=connected')).toEqual({ kind: 'success' });
  });

  it('trata cancelamento do usuário como estado recuperável', () => {
    expect(parseGoogleCalendarCallbackFeedback('?error=access_denied')).toEqual({
      kind: 'cancelled',
      code: 'authorization_cancelled',
    });
  });

  it('rejeita state inválido, código ausente e callback direto no frontend', () => {
    expect(parseGoogleCalendarCallbackFeedback('?google_error=invalid_state')).toEqual({
      kind: 'failed',
      code: 'invalid_callback',
    });
    expect(parseGoogleCalendarCallbackFeedback('?google_error=missing_code')).toEqual({
      kind: 'failed',
      code: 'invalid_callback',
    });
    expect(parseGoogleCalendarCallbackFeedback('?code=segredo&state=replay')).toEqual({
      kind: 'failed',
      code: 'invalid_callback',
    });
  });

  it('remove somente parâmetros OAuth e preserva o deep link consolidado', () => {
    const cleaned = cleanGoogleCalendarCallbackUrl({
      pathname: '/cronograma-eventos',
      search: '?event=abc&mode=view&google=connected&code=segredo&state=replay',
      hash: '#detalhes',
    } as Location);
    expect(cleaned).toBe('/cronograma-eventos?event=abc&mode=view#detalhes');
  });

  it('constrói o retorno público sem carregar códigos antigos e preserva a rota em next', () => {
    const result = buildGoogleCalendarReturnUrl(
      'https://fenasojagestao.com/cronograma-eventos?event=abc&code=antigo&state=antigo',
    );
    expect(result).toBe('https://fenasojagestao.com/google-calendar/callback?google=connected&next=%2Fcronograma-eventos%3Fevent%3Dabc');
  });

  it('valida o destino de retorno público e adiciona o sinal somente nele', () => {
    expect(getGoogleCalendarCallbackNext('?next=%2Fcronograma-eventos%3FtimelineYear%3D2026')).toBe('/cronograma-eventos?timelineYear=2026');
    expect(getGoogleCalendarCallbackNext('?next=https%3A%2F%2Fevil.test%2Fcronograma-eventos')).toBe('/cronograma-eventos');
    expect(appendGoogleCalendarCallbackSignal('/cronograma-eventos?timelineMonth=2026-06')).toBe('/cronograma-eventos?timelineMonth=2026-06&google=connected');
  });
});
