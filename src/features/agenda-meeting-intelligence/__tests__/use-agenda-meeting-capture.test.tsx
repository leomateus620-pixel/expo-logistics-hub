// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  AgendaMeetingEdgeError,
  type AgendaMeetingEdgeClient,
} from '../api/AgendaMeetingEdgeClient';
import type { CaptureSegmenter } from '../capture/CaptureSegmenter';
import { useAgendaMeetingCapture } from '../hooks/useAgendaMeetingCapture';
import type { EncryptedSegmentSpool } from '../spool/EncryptedSegmentSpool';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

const EVENT_ID = '10000000-0000-4000-8000-000000000001';
const ORG_ID = '20000000-0000-4000-8000-000000000001';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function fakeSpool(): EncryptedSegmentSpool {
  return {
    janitor: vi.fn().mockResolvedValue(0),
    cleanupOrphans: vi.fn().mockResolvedValue(0),
    purgeAll: vi.fn().mockResolvedValue(0),
    purgeSession: vi.fn().mockResolvedValue(0),
    list: vi.fn().mockResolvedValue([]),
  } as unknown as EncryptedSegmentSpool;
}

function fakeClient() {
  return {
    control: vi.fn(),
    detail: vi.fn(),
    markLost: vi.fn(),
  } as unknown as AgendaMeetingEdgeClient;
}

const startInput = {
  consentVersion: 'consent-v1',
  participantsInformed: true,
};

describe('useAgendaMeetingCapture startup safety', () => {
  it('prevents double initialization and cancels safely while permission is pending', async () => {
    let resolvePermission: ((value: {
      backend: 'media_recorder';
      mimeType: string;
      selectedDeviceId: string;
    }) => void) | null = null;
    const permission = new Promise<{
      backend: 'media_recorder';
      mimeType: string;
      selectedDeviceId: string;
    }>((resolve) => {
      resolvePermission = resolve;
    });
    const abort = vi.fn().mockResolvedValue(undefined);
    const segmenter = {
      prepare: vi.fn(() => permission),
      abort,
      stop: vi.fn().mockResolvedValue(undefined),
    } as unknown as CaptureSegmenter;
    const client = fakeClient();
    const { result } = renderHook(() => useAgendaMeetingCapture({
      eventId: EVENT_ID,
      orgId: ORG_ID,
      persistedEvent: true,
      client,
      spool: fakeSpool(),
      recoveryStorage: new MemoryStorage(),
      segmenterFactory: () => segmenter,
    }));

    let pendingStart: Promise<void> | null = null;
    act(() => {
      pendingStart = result.current.start(startInput);
      void pendingStart.catch(() => undefined);
    });
    await waitFor(() => expect(result.current.state.phase).toBe('requesting_permission'));
    const unloadEvent = new Event('beforeunload', { cancelable: true });
    expect(window.dispatchEvent(unloadEvent)).toBe(false);
    expect(unloadEvent.defaultPrevented).toBe(true);
    await expect(result.current.start(startInput)).rejects.toThrow('meeting_capture_already_started');

    await act(async () => {
      await result.current.cancel();
    });
    await act(async () => {
      resolvePermission?.({
        backend: 'media_recorder',
        mimeType: 'audio/webm;codecs=opus',
        selectedDeviceId: 'microphone-1',
      });
      await expect(pendingStart).rejects.toThrow('meeting_capture_cancelled');
    });
    await waitFor(() => expect(result.current.state.phase).toBe('idle'));

    expect(abort).toHaveBeenCalled();
    expect(client.control).not.toHaveBeenCalled();
  });

  it('normalizes browser permission denial into a stable UI error code', async () => {
    const segmenter = {
      prepare: vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')),
      abort: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    } as unknown as CaptureSegmenter;
    const { result } = renderHook(() => useAgendaMeetingCapture({
      eventId: EVENT_ID,
      orgId: ORG_ID,
      persistedEvent: true,
      client: fakeClient(),
      spool: fakeSpool(),
      recoveryStorage: new MemoryStorage(),
      segmenterFactory: () => segmenter,
    }));

    await act(async () => {
      await expect(result.current.start(startInput)).rejects.toThrow('Permission denied');
    });
    expect(result.current.state.phase).toBe('fatal_error');
    expect(result.current.state.error?.code).toBe('microphone_permission_denied');
  });

  it('cancels a server session if opening the recorder fails after creation', async () => {
    const segmenter = {
      prepare: vi.fn().mockResolvedValue({
        backend: 'media_recorder',
        mimeType: 'audio/webm;codecs=opus',
        selectedDeviceId: 'microphone-1',
      }),
      start: vi.fn().mockRejectedValue(new Error('media_recorder_start_failed')),
      abort: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    } as unknown as CaptureSegmenter;
    const client = fakeClient();
    vi.mocked(client.control).mockImplementation(async (request: { action: string }) => {
      if (request.action === 'start') {
        return {
          session: {
            id: '30000000-0000-4000-8000-000000000001',
            version: 1,
            startedAt: '2026-08-13T12:00:00.000Z',
          },
        };
      }
      return { session: { id: '30000000-0000-4000-8000-000000000001', version: 2 } };
    });
    const { result } = renderHook(() => useAgendaMeetingCapture({
      eventId: EVENT_ID,
      orgId: ORG_ID,
      persistedEvent: true,
      client,
      spool: fakeSpool(),
      recoveryStorage: new MemoryStorage(),
      segmenterFactory: () => segmenter,
    }));

    await act(async () => {
      await expect(result.current.start(startInput)).rejects.toThrow('media_recorder_start_failed');
    });

    expect(vi.mocked(client.control).mock.calls.map(([request]) => request.action)).toEqual([
      'start',
      'cancel',
    ]);
    expect(result.current.state.sessionId).toBeNull();
    expect(result.current.state.phase).toBe('fatal_error');
  });

  it('moves finalization failures to a recoverable state after stopping the microphone', async () => {
    const segmenter = {
      prepare: vi.fn().mockResolvedValue({
        backend: 'media_recorder',
        mimeType: 'audio/webm;codecs=opus',
        selectedDeviceId: 'microphone-1',
      }),
      start: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      currentMode: 'recording',
    } as unknown as CaptureSegmenter;
    const client = fakeClient();
    vi.mocked(client.control).mockImplementation(async (request: { action: string }) => {
      if (request.action === 'start') {
        return {
          session: {
            id: '30000000-0000-4000-8000-000000000001',
            version: 1,
            startedAt: '2026-08-13T12:00:00.000Z',
          },
        };
      }
      throw new AgendaMeetingEdgeError('network_error', true);
    });
    vi.mocked(client.detail).mockRejectedValue(new AgendaMeetingEdgeError('network_error', true));
    const { result } = renderHook(() => useAgendaMeetingCapture({
      eventId: EVENT_ID,
      orgId: ORG_ID,
      persistedEvent: true,
      client,
      spool: fakeSpool(),
      recoveryStorage: new MemoryStorage(),
      segmenterFactory: () => segmenter,
    }));

    await act(async () => {
      await result.current.start(startInput);
    });
    await act(async () => {
      await expect(result.current.finish({ allowPartial: false })).rejects.toMatchObject({
        code: 'network_error',
      });
    });

    expect(segmenter.stop).toHaveBeenCalledOnce();
    expect(result.current.state.phase).toBe('recoverable_error');
  });
});
