import { describe, expect, it } from 'vitest';
import {
  deriveGoogleCalendarState,
  type DeriveGoogleCalendarStateInput,
  type GoogleCalendarConnectionSnapshot,
  type GoogleCalendarUiStateId,
} from '@/lib/google-calendar-state';

const connected: GoogleCalendarConnectionSnapshot = {
  status: 'connected',
  secondary_calendar_id: 'calendar-id',
  verified_at: '2026-07-22T20:00:00.000Z',
  backfill_total: 0,
  backfill_done: 0,
  error_code: null,
};

function derive(input: Partial<DeriveGoogleCalendarStateInput> = {}) {
  return deriveGoogleCalendarState({
    connection: null,
    pending: 0,
    ...input,
  });
}

describe('máquina de estados do Google Agenda', () => {
  const cases: Array<[GoogleCalendarUiStateId, Partial<DeriveGoogleCalendarStateInput>]> = [
    ['checking', { isLoading: true }],
    ['disconnected', {}],
    ['starting_connection', { flowPhase: 'starting' }],
    ['waiting_oauth', { flowPhase: 'waiting_oauth' }],
    ['returning_from_oauth', { flowPhase: 'returning' }],
    ['preparing_calendar', { connection: { ...connected, status: 'preparing_calendar' } }],
    ['connection_success', { flowPhase: 'success' }],
    ['initial_sync_queued', {
      connection: { ...connected, backfill_total: 10, backfill_done: 0 },
      pending: 10,
    }],
    ['initial_sync_in_progress', {
      connection: { ...connected, backfill_total: 10, backfill_done: 4 },
      pending: 6,
    }],
    ['connected', { connection: connected }],
    ['pending_updates', { connection: connected, pending: 2 }],
    ['partial_failure', {
      connection: connected,
      outbox: { failed: 2, deadLetter: 1 },
    }],
    ['temporary_failure', { statusErrorCode: 'request_failed' }],
    ['authorization_cancelled', { flowPhase: 'cancelled' }],
    ['authorization_not_confirmed', {
      connection: { ...connected, status: 'waiting_authorization', error_code: 'authorization_not_confirmed' },
    }],
    ['authorization_revoked', {
      connection: { ...connected, status: 'reconnect_required', error_code: 'authorization_revoked' },
    }],
    ['reconnect_required', {
      connection: { ...connected, status: 'reconnect_required' },
    }],
    ['retry_in_progress', { connection: connected, retrying: true }],
    ['disconnect_confirmation', { connection: connected, confirmingDisconnect: true }],
    ['disconnecting', { connection: connected, disconnecting: true }],
    ['disconnected_success', { flowPhase: 'disconnected_success' }],
    ['fallback', { connection: { ...connected, status: 'unexpected-provider-state' } }],
  ];

  it.each(cases)('deriva %s sem ambiguidade', (expected, input) => {
    const state = derive(input);
    expect(state.id).toBe(expected);
    expect(state.title).toBeTruthy();
    expect(state.description).toBeTruthy();
    expect(state.announce).toContain(state.title);
  });

  it('oferece ações coerentes para conexão, retry, reconexão e estado estável', () => {
    expect(derive().primaryAction).toBe('connect');
    expect(derive({ connection: connected, outbox: { failed: 1 } }).primaryAction).toBe('retry_sync');
    expect(derive({ connection: { ...connected, status: 'reconnect_required' } }).primaryAction).toBe('reconnect');
    expect(derive({ connection: connected }).primaryAction).toBe('open_calendar');
  });

  it('prioriza falhas parciais sobre progresso para não ocultar eventos com erro', () => {
    const state = derive({
      connection: { ...connected, backfill_total: 20, backfill_done: 8 },
      pending: 12,
      outbox: { failed: 1, queued: 11 },
    });
    expect(state.id).toBe('partial_failure');
  });

  it('diferencia cancelamento, revogação e falha temporária no status de backend', () => {
    expect(derive({
      connection: { ...connected, status: 'error', error_code: 'authorization_not_confirmed' },
    }).id).toBe('authorization_not_confirmed');
    expect(derive({
      connection: { ...connected, status: 'error', error_code: 'authorization_revoked' },
    }).id).toBe('authorization_revoked');
    expect(derive({
      connection: { ...connected, status: 'error', error_code: 'sync_failed' },
    }).id).toBe('temporary_failure');
  });

  it('não inclui exceções técnicas na cópia apresentada', () => {
    const copy = Object.values(
      derive({ connection: connected, outbox: { failed: 1 } }),
    ).join(' ');
    expect(copy).not.toMatch(/stack|oauth code|provider payload|exception/i);
  });

  it('não apresenta conexão sem calendário e verificação confirmados pelo backend', () => {
    expect(derive({
      connection: { ...connected, secondary_calendar_id: null },
    }).id).toBe('authorization_not_confirmed');
    expect(derive({
      connection: { ...connected, verified_at: null },
    }).id).toBe('authorization_not_confirmed');
  });
});
