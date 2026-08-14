import { webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AgendaMeetingEdgeError } from '../api/AgendaMeetingEdgeClient';
import {
  EncryptedSegmentSpool,
  MemorySegmentSpoolStore,
} from '../spool/EncryptedSegmentSpool';
import {
  SegmentUploadCoordinator,
  type AgendaMeetingSegmentTransport,
} from '../upload/SegmentUploadCoordinator';
import type { CapturedAudioSegment, SegmentTranscriptionReceipt } from '../types';

const cryptoApi = webcrypto as unknown as Crypto;
const EVENT_ID = '10000000-0000-4000-8000-000000000001';
const ORG_ID = '20000000-0000-4000-8000-000000000001';
const SESSION_ID = '30000000-0000-4000-8000-000000000001';
const SEGMENT_ID = '40000000-0000-4000-8000-000000000001';

function segment(now: number): CapturedAudioSegment {
  const audio = new Blob(['meeting audio'], { type: 'audio/webm;codecs=opus' });
  return {
    audio,
    metadata: {
      id: SEGMENT_ID,
      sessionId: SESSION_ID,
      sequence: 0,
      captureStartMs: 0,
      captureEndMs: 30_000,
      durationMs: 30_000,
      capturedAtIso: new Date(now).toISOString(),
      mimeType: 'audio/webm;codecs=opus',
      bytes: audio.size,
      sha256: 'c'.repeat(64),
      backend: 'media_recorder',
    },
  };
}

function receipt(status: SegmentTranscriptionReceipt['status']): SegmentTranscriptionReceipt {
  return {
    segmentId: SEGMENT_ID,
    sequence: 0,
    status,
    canonicalReceiptId: status === 'transcribed' ? 'canonical-receipt' : null,
    retryAfterMs: null,
    errorCode: status.endsWith('error') ? 'provider_error' : null,
  };
}

function baseTransport(
  uploadSegment: AgendaMeetingSegmentTransport['uploadSegment'],
  getSegmentReceipt: AgendaMeetingSegmentTransport['getSegmentReceipt'] = async () => ({
    receipt: null,
  }),
): AgendaMeetingSegmentTransport {
  return {
    uploadSegment,
    getSegmentReceipt,
    markLost: vi.fn(async () => ({ session: { id: SESSION_ID, version: 2 } })),
  };
}

function setup(
  now: () => number,
  transport: AgendaMeetingSegmentTransport,
  options: { maxAttempts?: number; retryWindowMs?: number } = {},
) {
  const store = new MemorySegmentSpoolStore();
  const spool = new EncryptedSegmentSpool({ store, crypto: cryptoApi, now });
  const changes: string[] = [];
  const deleted: string[] = [];
  const coordinator = new SegmentUploadCoordinator({
    eventId: EVENT_ID,
    orgId: ORG_ID,
    sessionId: SESSION_ID,
    transport,
    spool,
    crypto: cryptoApi,
    now,
    delay: async () => undefined,
    pollIntervalMs: 1,
    maxAttempts: options.maxAttempts,
    retryWindowMs: options.retryWindowMs,
    onSegmentChange: (value) => changes.push(value.status),
    onSegmentDeleted: (value) => deleted.push(value),
  });
  return { coordinator, spool, store, changes, deleted };
}

describe('SegmentUploadCoordinator', () => {
  it('deletes ciphertext only after the canonical transcribed receipt', async () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z');
    const transport = baseTransport(vi.fn(async () => ({ receipt: receipt('transcribed') })));
    const { coordinator, spool, changes, deleted } = setup(() => now, transport);

    await coordinator.enqueue(segment(now));
    await coordinator.waitForIdle();

    expect(changes).toEqual(expect.arrayContaining(['queued', 'uploading', 'transcribed']));
    expect(deleted).toEqual([SEGMENT_ID]);
    expect(await spool.list(SESSION_ID)).toEqual([]);
  });

  it('keeps encrypted audio after accepted/processing and deletes it when polling sees transcribed', async () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z');
    const poll = vi
      .fn<AgendaMeetingSegmentTransport['getSegmentReceipt']>()
      .mockResolvedValueOnce({ receipt: receipt('processing') })
      .mockResolvedValueOnce({ receipt: receipt('transcribed') });
    const transport = baseTransport(
      vi.fn(async () => ({ receipt: receipt('accepted') })),
      poll,
    );
    const { coordinator, spool, changes } = setup(() => now, transport);

    await coordinator.enqueue(segment(now));
    await coordinator.waitForIdle();

    expect(poll).toHaveBeenCalledTimes(2);
    expect(changes).toEqual(expect.arrayContaining(['accepted', 'processing', 'transcribed']));
    expect(await spool.list(SESSION_ID)).toEqual([]);
  });

  it('retries transient submission failures at most five times inside the window', async () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z');
    const upload = vi
      .fn<AgendaMeetingSegmentTransport['uploadSegment']>()
      .mockRejectedValueOnce(new AgendaMeetingEdgeError('provider_unavailable', true, 503))
      .mockRejectedValueOnce(new AgendaMeetingEdgeError('provider_rate_limited', true, 429))
      .mockResolvedValueOnce({ receipt: receipt('transcribed') });
    const { coordinator, spool, changes } = setup(() => now, baseTransport(upload));

    await coordinator.enqueue(segment(now));
    await coordinator.waitForIdle();

    expect(upload).toHaveBeenCalledTimes(3);
    expect(changes.filter((status) => status === 'retry_wait')).toHaveLength(2);
    expect(await spool.list(SESSION_ID)).toEqual([]);
  });

  it('registers a canonical gap and discards ciphertext after an acknowledged terminal failure', async () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z');
    const transport = baseTransport(vi.fn(async () => ({ receipt: receipt('terminal_error') })));
    const { coordinator, spool, deleted } = setup(() => now, transport);

    await coordinator.enqueue(segment(now));
    await coordinator.waitForIdle();

    expect(transport.markLost).toHaveBeenCalledOnce();
    expect(deleted).toEqual([SEGMENT_ID]);
    expect(await spool.list(SESSION_ID)).toEqual([]);
  });

  it('keeps terminal ciphertext encrypted when mark_lost cannot be acknowledged offline', async () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z');
    const transport = baseTransport(vi.fn(async () => ({ receipt: receipt('terminal_error') })));
    transport.markLost = vi.fn(async () => {
      throw new AgendaMeetingEdgeError('network_unavailable', true);
    });
    const { coordinator, spool } = setup(() => now, transport);

    await coordinator.enqueue(segment(now));
    await coordinator.waitForIdle();

    expect((await spool.list(SESSION_ID))[0]?.metadata).toMatchObject({
      status: 'terminal_error',
      errorCode: 'provider_error',
    });
    expect((await spool.get(SEGMENT_ID)).audio.size).toBeGreaterThan(0);
  });

  it('replays an offline terminal gap on rehydration and purges only after acknowledgement', async () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z');
    const offlineTransport = baseTransport(
      vi.fn(async () => ({ receipt: receipt('terminal_error') })),
    );
    offlineTransport.markLost = vi.fn(async () => {
      throw new AgendaMeetingEdgeError('network_unavailable', true);
    });
    const first = setup(() => now, offlineTransport);
    await first.coordinator.enqueue(segment(now));
    await first.coordinator.waitForIdle();
    first.coordinator.stop();

    const onlineTransport = baseTransport(
      vi.fn(async () => ({ receipt: receipt('terminal_error') })),
    );
    const recovered = new SegmentUploadCoordinator({
      eventId: EVENT_ID,
      orgId: ORG_ID,
      sessionId: SESSION_ID,
      transport: onlineTransport,
      spool: first.spool,
      crypto: cryptoApi,
    });

    await recovered.rehydrate();
    await vi.waitFor(() => expect(onlineTransport.markLost).toHaveBeenCalledOnce());
    await vi.waitFor(async () => expect(await first.spool.list(SESSION_ID)).toEqual([]));
    recovered.stop();
  });

  it('marks a segment lost if ciphertext/key is actually unavailable during rehydration', async () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z');
    const transport = baseTransport(vi.fn(async () => ({ receipt: receipt('accepted') })));
    const { coordinator, spool, store } = setup(() => now, transport);
    await spool.put(segment(now));
    await store.deleteKey(`session:${SESSION_ID}`);

    await coordinator.rehydrate();
    await coordinator.waitForIdle();

    expect(transport.markLost).toHaveBeenCalledOnce();
    expect(await spool.list(SESSION_ID)).toEqual([]);
  });

  it('stops after five retryable attempts and records the resulting gap', async () => {
    const now = Date.parse('2026-08-13T12:00:00.000Z');
    const upload = vi.fn(async () => {
      throw new AgendaMeetingEdgeError('provider_unavailable', true, 503);
    });
    const { coordinator, spool } = setup(() => now, baseTransport(upload), { maxAttempts: 5 });

    await coordinator.enqueue(segment(now));
    await coordinator.waitForIdle();

    expect(upload).toHaveBeenCalledTimes(5);
    expect(await spool.list(SESSION_ID)).toEqual([]);
  });
});
