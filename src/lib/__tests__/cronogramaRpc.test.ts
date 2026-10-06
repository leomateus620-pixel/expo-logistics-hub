import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import {
  cronogramaSaveEvent,
  cronogramaSaveSubevent,
  cronogramaDeleteSubevent,
  cronogramaReorderSubevents,
  CronogramaRpcError,
  createCronogramaRequestRegistry,
  cronogramaSaveSuccessMessage,
} from '@/lib/cronograma-rpc';

describe('cronograma-rpc wrappers', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('cronogramaSaveEvent injects request_id and forwards expected_lock_version', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'evt-1', lock_version: 2 }, error: null });
    const data = await cronogramaSaveEvent(
      { org_id: 'org-1', title: 'X' },
      1,
    );
    expect(data).toEqual({ id: 'evt-1', lock_version: 2 });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('cronograma_save_event');
    expect(args.expected_lock_version).toBe(1);
    expect(typeof args.payload.request_id).toBe('string');
    expect(args.payload.request_id.length).toBeGreaterThan(6);
    expect(args.payload.title).toBe('X');
    expect(args.payload.org_id).toBe('org-1');
  });

  it('cronogramaSaveSubevent forwards payload and lock_version', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'sub-1' }, error: null });
    await cronogramaSaveSubevent(
      { parent_event_id: 'evt-1', title: 'Sub' },
      3,
    );
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('cronograma_save_subevent');
    expect(args.expected_lock_version).toBe(3);
    expect(args.payload.parent_event_id).toBe('evt-1');
  });

  it('cronogramaDeleteSubevent forwards id + version', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    await cronogramaDeleteSubevent('sub-1', 5);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('cronograma_delete_subevent');
    expect(args.subevent_id).toBe('sub-1');
    expect(args.expected_lock_version).toBe(5);
  });

  it('cronogramaReorderSubevents forwards ordered ids', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    await cronogramaReorderSubevents('evt-1', ['a', 'b', 'c']);
    const [fn, args] = rpcMock.mock.calls[0];
    expect(fn).toBe('cronograma_reorder_subevents');
    expect(args.event_id).toBe('evt-1');
    expect(args.ordered_ids).toEqual(['a', 'b', 'c']);
  });

  it('maps CRONOGRAMA_NOT_FOUND error to typed CronogramaRpcError', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'CRONOGRAMA_NOT_FOUND: evento inexistente' } });
    await expect(cronogramaSaveEvent({ org_id: 'o', title: 't' })).rejects.toMatchObject({
      code: 'CRONOGRAMA_NOT_FOUND',
      message: 'Registro do cronograma não encontrado.',
      details: 'evento inexistente',
    });
  });

  it('maps CRONOGRAMA_CONFLICT (optimistic lock)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'CRONOGRAMA_CONFLICT: stale lock_version' } });
    await expect(cronogramaSaveEvent({ org_id: 'o', title: 't' })).rejects.toMatchObject({
      code: 'CRONOGRAMA_CONFLICT',
    });
  });

  it('maps CRONOGRAMA_PERMISSION_DENIED', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'CRONOGRAMA_PERMISSION_DENIED: role=leitura' } });
    await expect(cronogramaDeleteSubevent('sub-1')).rejects.toMatchObject({
      code: 'CRONOGRAMA_PERMISSION_DENIED',
    });
  });

  it('maps CRONOGRAMA_VALIDATION_ERROR', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'CRONOGRAMA_VALIDATION_ERROR: title empty' } });
    await expect(cronogramaSaveSubevent({ parent_event_id: 'e', title: '' })).rejects.toMatchObject({
      code: 'CRONOGRAMA_VALIDATION_ERROR',
    });
  });

  it('maps CRONOGRAMA_RELATIONSHIP_INVALID', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'CRONOGRAMA_RELATIONSHIP_INVALID: commission org mismatch' } });
    await expect(cronogramaSaveEvent({ org_id: 'o', title: 't' })).rejects.toMatchObject({
      code: 'CRONOGRAMA_RELATIONSHIP_INVALID',
    });
  });

  it('falls back to CRONOGRAMA_UNKNOWN for unrecognized errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'random pg error' } });
    await expect(cronogramaReorderSubevents('e', [])).rejects.toBeInstanceOf(CronogramaRpcError);
    await expect(cronogramaReorderSubevents('e', [])).rejects.toMatchObject({
      code: 'CRONOGRAMA_UNKNOWN',
      details: 'random pg error',
    });
  });

  it('reuses a submission after an uncertain timeout without another source key', async () => {
    const payload = { org_id: 'org-retry', source_key: 'manual-stable-submission', title: 'Evento' };
    rpcMock.mockRejectedValueOnce(new Error('network timeout'));
    await expect(cronogramaSaveEvent(payload)).rejects.toMatchObject({ code: 'CRONOGRAMA_UNKNOWN', details: 'network timeout' });
    rpcMock.mockResolvedValueOnce({ data: { id: 'same-event' }, error: null });
    await cronogramaSaveEvent({ ...payload });
    expect(rpcMock.mock.calls[0][1].payload.request_id).toBe(rpcMock.mock.calls[1][1].payload.request_id);
    expect(rpcMock.mock.calls[1][1].payload.source_key).toBe(payload.source_key);
  });

  it('coalesces duplicate clicks while a save is in flight', async () => {
    let resolve!: (value: unknown) => void;
    rpcMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const payload = { org_id: 'org-click', source_key: 'manual-double-click', title: 'Evento' };
    const first = cronogramaSaveEvent(payload);
    const second = cronogramaSaveEvent({ ...payload });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    resolve({ data: { id: 'single-event' }, error: null });
    expect(await Promise.all([first, second])).toEqual([{ id: 'single-event' }, { id: 'single-event' }]);
  });

  it('rejects a different in-flight payload using an explicit submission identity', async () => {
    let resolve!: (value: unknown) => void;
    rpcMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const payload = { org_id: 'org-mismatch', source_key: 'manual-mismatch', request_id: 'stable-request', title: 'Evento' };
    const first = cronogramaSaveEvent(payload);
    await expect(cronogramaSaveEvent({ ...payload, title: 'Outro evento' })).rejects.toMatchObject({ code: 'CRONOGRAMA_IDEMPOTENCY_KEY_REUSED' });
    resolve({ data: { id: 'single-event' }, error: null });
    await first;
  });

  it('changes request identity when content, version or organization changes', () => {
    const prepare = createCronogramaRequestRegistry();
    const payload = { org_id: 'org-a', id: 'event-a', title: 'Evento' };
    const first = prepare(payload, 1).request_id;
    expect(prepare({ title: 'Evento', id: 'event-a', org_id: 'org-a' }, 1).request_id).toBe(first);
    const changed = prepare({ ...payload, title: 'Revisão' }, 1).request_id;
    expect(changed).not.toBe(first);
    expect(prepare({ ...payload, title: 'Revisão' }, 2).request_id).not.toBe(changed);
    expect(prepare({ ...payload, org_id: 'org-b' }, 1).request_id).not.toBe(first);
  });

  it('explains a missing restaurant configuration without exposing raw details', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'CRONOGRAMA_RESTAURANT_CONFIGURATION_REQUIRED: ambiguous auth ids' } });
    await expect(cronogramaSaveEvent({ org_id: 'o', title: 't' })).rejects.toMatchObject({ code: 'CRONOGRAMA_RESTAURANT_CONFIGURATION_REQUIRED' });
    try { await cronogramaSaveEvent({ org_id: 'o', title: 't' }); } catch (error) {
      expect((error as Error).message).toContain('campos foram preservados');
      expect((error as Error).message).not.toContain('auth ids');
    }
  });

  it('success copy distinguishes initial forwarding, update and preserved approval', () => {
    const restaurantForwarding = { event_id: 'venue-id', source_revision: 1, status: 'solicitado', approval_status: 'pendente', action: 'created' as const };
    expect(cronogramaSaveSuccessMessage({ restaurantForwarding })).toContain('encaminhado');
    expect(cronogramaSaveSuccessMessage({ restaurantForwarding: { ...restaurantForwarding, action: 'updated' } })).toContain('pedido existente');
    expect(cronogramaSaveSuccessMessage({ restaurantForwarding: { ...restaurantForwarding, approval_status: 'aprovado', action: 'updated' } })).not.toContain('aguardando');
    expect(cronogramaSaveSuccessMessage({})).toBe('Evento salvo.');
  });
});
