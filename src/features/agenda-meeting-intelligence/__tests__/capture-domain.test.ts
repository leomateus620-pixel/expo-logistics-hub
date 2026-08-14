import { describe, expect, it } from 'vitest';
import { computeCaptureBacklog, wouldExceedCaptureBacklog } from '../capture/backlog';
import { blobToArrayBuffer } from '../capture/blob';
import {
  AGENDA_MEETING_ALLOWED_MIME_TYPES,
  isAllowedAudioMimeType,
  normalizeAudioMimeType,
  selectMediaRecorderMimeType,
} from '../capture/mime';
import {
  INITIAL_AGENDA_MEETING_CAPTURE_STATE,
  agendaMeetingCaptureReducer,
} from '../capture/reducer';
import { encodePcm16Wav } from '../capture/wav';
import type { CaptureSegmentState } from '../types';

function segment(overrides: Partial<CaptureSegmentState> = {}): CaptureSegmentState {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    sessionId: '20000000-0000-4000-8000-000000000001',
    sequence: 0,
    captureStartMs: 0,
    captureEndMs: 30_000,
    durationMs: 30_000,
    capturedAtIso: '2026-08-13T12:00:00.000Z',
    mimeType: 'audio/webm;codecs=opus',
    bytes: 256_000,
    sha256: 'a'.repeat(64),
    backend: 'media_recorder',
    status: 'queued',
    attempts: 0,
    retryWindowStartedAtMs: 1,
    nextRetryAtMs: null,
    canonicalReceiptId: null,
    errorCode: null,
    ...overrides,
  };
}

describe('meeting capture MIME negotiation', () => {
  it('normalizes and accepts only the explicit audio allowlist', () => {
    expect(normalizeAudioMimeType(' Audio/WebM ; codecs = Opus ')).toBe('audio/webm;codecs=opus');
    for (const mimeType of AGENDA_MEETING_ALLOWED_MIME_TYPES) {
      expect(isAllowedAudioMimeType(mimeType)).toBe(true);
    }
    expect(isAllowedAudioMimeType('audio/mpeg')).toBe(false);
    expect(isAllowedAudioMimeType('video/webm;codecs=opus')).toBe(false);
  });

  it('selects the first browser-supported canonical MIME', () => {
    const supported = new Set(['audio/mp4', 'audio/ogg;codecs=opus']);
    expect(
      selectMediaRecorderMimeType({ isTypeSupported: (value) => supported.has(value) }),
    ).toBe('audio/mp4');
    expect(selectMediaRecorderMimeType({ isTypeSupported: () => false })).toBeNull();
  });
});

describe('meeting capture reducer and backlog', () => {
  it('updates segments idempotently and excludes canonical receipts from backlog', () => {
    const queued = segment();
    const first = agendaMeetingCaptureReducer(INITIAL_AGENDA_MEETING_CAPTURE_STATE, {
      type: 'segment_upsert',
      segment: queued,
    });
    expect(first.backlog).toMatchObject({ segments: 1, bytes: 256_000, durationMs: 30_000 });

    const transcribed = { ...queued, status: 'transcribed' as const, canonicalReceiptId: 'receipt-1' };
    const second = agendaMeetingCaptureReducer(first, {
      type: 'segment_upsert',
      segment: transcribed,
    });
    expect(second.segments).toHaveLength(1);
    expect(second.backlog).toMatchObject({ segments: 0, bytes: 0, durationMs: 0 });
  });

  it('pauses at the exact cap and predicts a segment that would cross it', () => {
    const twentyMinutes = Array.from({ length: 40 }, (_, index) =>
      segment({ id: `segment-${index}`, sequence: index }),
    );
    const backlog = computeCaptureBacklog(twentyMinutes);
    expect(backlog).toMatchObject({
      segments: 40,
      durationMs: 20 * 60_000,
      isAtCapacity: true,
      limitedBy: 'duration',
    });

    const below = computeCaptureBacklog(twentyMinutes.slice(0, 39));
    expect(wouldExceedCaptureBacklog(below, segment({ durationMs: 60_001 }))).toMatchObject({
      isAtCapacity: true,
      limitedBy: 'duration',
    });
  });

  it('keeps terminal audio in backlog until its TTL janitor discards it', () => {
    const backlog = computeCaptureBacklog([
      segment({ status: 'terminal_error', errorCode: 'provider_rejected' }),
    ]);
    expect(backlog.segments).toBe(1);
  });
});

describe('AudioWorklet PCM fallback', () => {
  it('produces a self-contained 16 kHz mono PCM WAV below the 2 MB Edge cap for 30 seconds', async () => {
    const sourceSamples = new Float32Array(48_000 * 30);
    sourceSamples.fill(0.25);
    const wav = encodePcm16Wav([sourceSamples], 48_000, 16_000);
    const bytes = new Uint8Array(await blobToArrayBuffer(wav));
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE');
    expect(wav.type).toBe('audio/wav');
    expect(wav.size).toBe(44 + 16_000 * 30 * 2);
    expect(wav.size).toBeLessThanOrEqual(2 * 1_024 * 1_024);
  });
});
