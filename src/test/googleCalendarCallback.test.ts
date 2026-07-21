import { describe, expect, it } from 'vitest';
import {
  buildGoogleCalendarReturnUrl,
  cleanGoogleCalendarCallbackUrl,
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

  it('constrói o retorno na mesma rota sem carregar códigos antigos', () => {
    const result = buildGoogleCalendarReturnUrl(
      'https://fenasojagestao.com/cronograma-eventos?event=abc&code=antigo&state=antigo',
    );
    expect(result).toBe('https://fenasojagestao.com/cronograma-eventos?event=abc&google=connected');
  });
});
