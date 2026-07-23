import { describe, expect, it } from 'vitest';
import {
  buildGoogleCalendarReturnUrl,
  cleanGoogleCalendarCallbackUrl,
  getGoogleCalendarCallbackNext,
  parseGoogleCalendarCallbackFeedback,
} from '@/lib/google-calendar-callback';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';

describe('retorno OAuth do Google Agenda', () => {
  it('não aceita marcador de sucesso inserido antes da autorização', () => {
    expect(parseGoogleCalendarCallbackFeedback('?google=connected')).toEqual({
      kind: 'failed',
      code: 'invalid_callback',
      attemptId: null,
    });
  });

  it('trata cancelamento do usuário como estado recuperável', () => {
    expect(parseGoogleCalendarCallbackFeedback(`?attempt=${ATTEMPT_ID}&error=access_denied`)).toEqual({
      kind: 'cancelled',
      code: 'authorization_cancelled',
      attemptId: ATTEMPT_ID,
    });
  });

  it('aceita conclusão server-side por state ou por tentativa explícita', () => {
    expect(parseGoogleCalendarCallbackFeedback('?code=troca&state=ok')).toEqual({
      kind: 'completion_required',
      attemptId: null,
      code: 'troca',
      state: 'ok',
    });
    expect(parseGoogleCalendarCallbackFeedback(`?attempt=${ATTEMPT_ID}&code=troca`)).toEqual({
      kind: 'completion_required',
      attemptId: ATTEMPT_ID,
      code: 'troca',
      state: null,
    });
    expect(parseGoogleCalendarCallbackFeedback(`?attempt=${ATTEMPT_ID}&code=troca&state=ok`)).toEqual({
      kind: 'completion_required',
      attemptId: ATTEMPT_ID,
      code: 'troca',
      state: 'ok',
    });
  });

  it('remove códigos, state, tentativa e chaves legadas do histórico', () => {
    const cleaned = cleanGoogleCalendarCallbackUrl({
      pathname: '/google-calendar/callback',
      search: `?attempt=${ATTEMPT_ID}&next=%2Fcronograma-eventos&code=segredo&state=estado&connection_key=chave`,
      hash: '',
    } as Location);
    expect(cleaned).toBe('/google-calendar/callback');
  });

  it('constrói o retorno sem sinal prematuro e preserva somente o deep link seguro', () => {
    const result = buildGoogleCalendarReturnUrl(
      'https://fenasojagestao.com/cronograma-eventos?event=abc&code=antigo&state=antigo&google=connected',
    );
    expect(result).toBe(
      'https://fenasojagestao.com/google-calendar/callback?next=%2Fcronograma-eventos%3Fevent%3Dabc',
    );
    expect(result).not.toContain('google=connected');
  });

  it('rejeita destino externo ou rota pública diferente', () => {
    expect(getGoogleCalendarCallbackNext('?next=%2Fcronograma-eventos%3FtimelineYear%3D2026')).toBe(
      '/cronograma-eventos?timelineYear=2026',
    );
    expect(getGoogleCalendarCallbackNext('?next=https%3A%2F%2Fevil.test%2Fcronograma-eventos')).toBe(
      '/cronograma-eventos',
    );
    expect(getGoogleCalendarCallbackNext('?next=%2Fadmin')).toBe('/cronograma-eventos');
  });
});
