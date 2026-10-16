import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkersSessionRunner from '../WorkersSessionRunner';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../workspace-api', () => ({ callWorkerWorkspace: mock.call }));
const orgId = '10000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000001';
const snapshot = (canRunNow: boolean) => ({ serverNow: '2026-10-16T12:00:00Z', routines: [{ state: 'active', canRunNow, nextScheduledAt: '2026-10-17T11:00:00Z' }] });
beforeEach(() => { vi.clearAllMocks(); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('JWT active-session routine trigger', () => {
  it('recovers an expired lease when the server marks it due even if the next schedule is tomorrow', async () => {
    mock.call.mockResolvedValueOnce(snapshot(true)).mockResolvedValueOnce({ results: [], serverNow: '2026-10-16T12:00:00Z' });
    const notified = vi.fn(); window.addEventListener('workers-workspace-updated', notified);
    render(<WorkersSessionRunner orgId={orgId} userId={userId} />);
    await waitFor(() => expect(mock.call).toHaveBeenCalledTimes(2));
    expect(mock.call.mock.calls[1][0]).toMatchObject({ command: 'executeDue', orgId, requestId: expect.any(String) });
    expect((notified.mock.calls[0][0] as CustomEvent).detail).toEqual({ orgId });
    window.removeEventListener('workers-workspace-updated', notified);
  });
  it('does not execute future/unauthorized routines or poll while the tab is hidden', async () => {
    mock.call.mockResolvedValue(snapshot(false));
    render(<WorkersSessionRunner orgId={orgId} userId={userId} />);
    await waitFor(() => expect(mock.call).toHaveBeenCalledTimes(1));
    expect(mock.call.mock.calls[0][0].command).toBe('snapshot');
    cleanup(); mock.call.mockClear();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    render(<WorkersSessionRunner orgId={orgId} userId={userId} />);
    await act(async () => undefined); expect(mock.call).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(mock.call).toHaveBeenCalledTimes(1));
  });
  it('aborts the old scope and never runs a stale due snapshot after organization changes', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mock.call.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValue(snapshot(false));
    const { rerender } = render(<WorkersSessionRunner orgId={orgId} userId={userId} />);
    const signal = mock.call.mock.calls[0][1] as AbortSignal;
    rerender(<WorkersSessionRunner orgId={userId} userId={userId} />);
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(snapshot(true)));
    expect(mock.call.mock.calls.some(([command]) => command.command === 'executeDue')).toBe(false);
  });
});
