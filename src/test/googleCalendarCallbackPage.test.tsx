// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GoogleCalendarCallbackPage from '@/pages/GoogleCalendarCallbackPage';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
  },
}));

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } });
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, backfill: 3 }) });
  vi.stubGlobal('fetch', mocks.fetch);
  window.history.replaceState({}, '', `/google-calendar/callback?attempt=${ATTEMPT_ID}&code=one-time-code&state=expected-state&next=%2Fcronograma-eventos`);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'opener', { configurable: true, value: null });
});

describe('página de callback do Google Agenda', () => {
  it('conclui no backend antes de notificar e fechar a popup', async () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: { closed: false, postMessage },
    });
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    render(<GoogleCalendarCallbackPage />);
    expect(window.location.search).toBe('');
    expect(screen.getByRole('heading', { name: 'Validando autorização' })).toBeVisible();

    expect(await screen.findByRole('heading', { name: 'Google Agenda conectado' })).toBeVisible();
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining('/functions/v1/google-calendar-oauth'), expect.objectContaining({
      method: 'POST',
      keepalive: true,
      body: JSON.stringify({
        action: 'complete',
        attemptId: ATTEMPT_ID,
        code: 'one-time-code',
        state: 'expected-state',
        callbackPath: '/google-calendar/callback',
      }),
    }));
    expect(postMessage).toHaveBeenCalledWith({
      type: 'fenasoja:google-calendar-oauth',
      status: 'success',
      code: undefined,
      attemptId: ATTEMPT_ID,
    }, window.location.origin);
    expect(close).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1600));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('suporta retorno em página inteira sem declarar sucesso pelo query param', async () => {
    Object.defineProperty(window, 'opener', { configurable: true, value: null });
    render(<GoogleCalendarCallbackPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Google Agenda conectado' })).toBeVisible();
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(window.location.search).toBe('');
  });

  it('não chama complete para callback incompleto ou marcador legado', async () => {
    window.history.replaceState({}, '', '/google-calendar/callback?google=connected');
    render(<GoogleCalendarCallbackPage />);
    expect(await screen.findByRole('heading', { name: 'Autorização não confirmada' })).toBeVisible();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});
