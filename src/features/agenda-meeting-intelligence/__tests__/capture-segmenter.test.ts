import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureSegmenter } from '../capture/CaptureSegmenter';
import { blobToText } from '../capture/blob';
import type { CapturedAudioSegment, CaptureGapMarker, CaptureInterruptionReason } from '../types';

const cryptoApi = webcrypto as unknown as Crypto;
const SESSION_ID = '30000000-0000-4000-8000-000000000001';

class FakeTrack extends EventTarget {
  stopped = false;

  getSettings(): MediaTrackSettings {
    return { deviceId: 'microphone-1' };
  }

  stop(): void {
    this.stopped = true;
  }
}

class FakeMediaRecorder extends EventTarget {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(value: string): boolean {
    return value === 'audio/webm;codecs=opus';
  }

  readonly mimeType: string;
  state: RecordingState = 'inactive';

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    super();
    this.mimeType = options?.mimeType ?? 'audio/webm;codecs=opus';
    FakeMediaRecorder.instances.push(this);
  }

  start(): void {
    this.state = 'recording';
  }

  stop(): void {
    if (this.state === 'inactive') return;
    const payload = new Blob([`cycle-${FakeMediaRecorder.instances.indexOf(this)}`], {
      type: this.mimeType,
    });
    const dataEvent = new Event('dataavailable') as BlobEvent;
    Object.defineProperty(dataEvent, 'data', { value: payload });
    this.dispatchEvent(dataEvent);
    this.state = 'inactive';
    this.dispatchEvent(new Event('stop'));
  }

  pause(): void {
    this.state = 'paused';
  }

  resume(): void {
    this.state = 'recording';
  }

  requestData(): void {}
}

class FakeSpeechRecognition extends EventTarget {
  static instances: FakeSpeechRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    super();
    FakeSpeechRecognition.instances.push(this);
  }

  start(): void {
    const index = FakeSpeechRecognition.instances.indexOf(this);
    this.onresult?.({
      resultIndex: 0,
      results: {
        length: 1,
        0: { isFinal: true, length: 1, 0: { transcript: `fala-${index}`, confidence: 0.9 } },
      },
    });
  }

  stop(): void {}

  abort(): void {}
}

const speechRecognitionConstructor =
  FakeSpeechRecognition as unknown as new () => never;

function mediaEnvironment() {
  const track = new FakeTrack();
  const stream = {
    getAudioTracks: () => [track as unknown as MediaStreamTrack],
    getTracks: () => [track as unknown as MediaStreamTrack],
  } as unknown as MediaStream;
  const devices = {
    getUserMedia: vi.fn(async () => stream),
    enumerateDevices: vi.fn(async () => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaDevices;
  return { track, stream, devices };
}

describe('CaptureSegmenter', () => {
  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    FakeSpeechRecognition.instances = [];
  });

  it('rotates by stop/start and emits self-contained transcript segments with UUID IDs/hash', async () => {
    const { devices } = mediaEnvironment();
    let monotonic = 0;
    const segments: CapturedAudioSegment[] = [];
    let firstSegment: (() => void) | null = null;
    const firstSegmentPromise = new Promise<void>((resolve) => {
      firstSegment = resolve;
    });
    const segmenter = new CaptureSegmenter({
      mediaDevices: devices,
      mediaRecorderConstructor: FakeMediaRecorder as unknown as typeof MediaRecorder,
      speechRecognitionConstructor,
      audioContextConstructor: undefined,
      crypto: cryptoApi,
      monotonicNow: () => monotonic,
      wallClockNow: () => Date.parse('2026-08-13T12:00:00.000Z') + monotonic,
      segmentDurationMs: 10,
      onSegment: (value) => {
        segments.push(value);
        firstSegment?.();
        firstSegment = null;
      },
    });

    expect(await segmenter.prepare()).toMatchObject({
      backend: 'media_recorder',
      mimeType: 'audio/webm;codecs=opus',
      selectedDeviceId: 'microphone-1',
    });
    await segmenter.start({ sessionId: SESSION_ID });
    monotonic = 30_000;
    await firstSegmentPromise;
    await Promise.resolve();
    await Promise.resolve();
    monotonic = 45_000;
    await segmenter.stop();

    expect(FakeMediaRecorder.instances).toHaveLength(2);
    expect(segments).toHaveLength(2);
    expect(segments.map((value) => value.metadata.sequence)).toEqual([0, 1]);
    expect(segments[0]?.metadata).toMatchObject({
      captureStartMs: 0,
      captureEndMs: 30_000,
      durationMs: 30_000,
      backend: 'media_recorder',
      mimeType: 'text/plain;charset=utf-8',
    });
    expect(segments[0]?.metadata.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(segments[0]?.metadata.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await blobToText(segments[0]?.audio as Blob)).toBe('fala-0');
    expect(await blobToText(segments[1]?.audio as Blob)).toBe('fala-1');
  });

  it('counts only active time across pause/resume', async () => {
    const { devices } = mediaEnvironment();
    let monotonic = 0;
    const segmenter = new CaptureSegmenter({
      mediaDevices: devices,
      mediaRecorderConstructor: FakeMediaRecorder as unknown as typeof MediaRecorder,
      speechRecognitionConstructor,
      audioContextConstructor: undefined,
      crypto: cryptoApi,
      monotonicNow: () => monotonic,
      segmentDurationMs: 120_000,
      onSegment: () => undefined,
    });
    await segmenter.prepare();
    await segmenter.start({ sessionId: SESSION_ID });
    monotonic = 1_000;
    await segmenter.pause();
    expect(segmenter.activeDurationMs).toBe(1_000);

    monotonic = 61_000;
    await segmenter.resume();
    monotonic = 62_000;
    await segmenter.stop();
    expect(segmenter.activeDurationMs).toBe(2_000);
  });

  it('marks pagehide and ended tracks as real interruptions rather than claiming continuous capture', async () => {
    const first = mediaEnvironment();
    const reasons: CaptureInterruptionReason[] = [];
    const gaps: CaptureGapMarker[] = [];
    let interrupted: (() => void) | null = null;
    const interruptionPromise = new Promise<void>((resolve) => {
      interrupted = resolve;
    });
    const segmenter = new CaptureSegmenter({
      mediaDevices: first.devices,
      mediaRecorderConstructor: FakeMediaRecorder as unknown as typeof MediaRecorder,
      speechRecognitionConstructor,
      audioContextConstructor: undefined,
      crypto: cryptoApi,
      segmentDurationMs: 120_000,
      onSegment: () => undefined,
      onGap: (gap) => {
        gaps.push(gap);
      },
      onInterruption: (reason) => {
        reasons.push(reason);
        interrupted?.();
      },
    });
    await segmenter.prepare();
    await segmenter.start({ sessionId: SESSION_ID });
    window.dispatchEvent(new Event('pagehide'));
    await interruptionPromise;
    expect(reasons).toEqual(['pagehide']);
    expect(first.track.stopped).toBe(true);

    const second = mediaEnvironment();
    let trackInterrupted: (() => void) | null = null;
    const trackPromise = new Promise<void>((resolve) => {
      trackInterrupted = resolve;
    });
    const trackSegmenter = new CaptureSegmenter({
      mediaDevices: second.devices,
      mediaRecorderConstructor: FakeMediaRecorder as unknown as typeof MediaRecorder,
      speechRecognitionConstructor,
      audioContextConstructor: undefined,
      crypto: cryptoApi,
      segmentDurationMs: 120_000,
      onSegment: () => undefined,
      onGap: (gap) => {
        gaps.push(gap);
      },
      onInterruption: (reason) => {
        reasons.push(reason);
        trackInterrupted?.();
      },
    });
    await trackSegmenter.prepare();
    await trackSegmenter.start({ sessionId: SESSION_ID });
    second.track.dispatchEvent(new Event('ended'));
    await trackPromise;
    expect(reasons).toEqual(['pagehide', 'track_ended']);
    expect(gaps.map((gap) => ({ sequence: gap.sequence,reason: gap.reason }))).toEqual([
      { sequence: 1,reason: 'pagehide' },
      { sequence: 1,reason: 'track_ended' },
    ]);
  });

  it('enforces the active-duration cap independently of pause time', async () => {
    const { devices } = mediaEnvironment();
    let monotonic = 0;
    let resolveInterruption: (() => void) | null = null;
    const interrupted = new Promise<void>((resolve) => {
      resolveInterruption = resolve;
    });
    const reasons: CaptureInterruptionReason[] = [];
    const segmenter = new CaptureSegmenter({
      mediaDevices: devices,
      mediaRecorderConstructor: FakeMediaRecorder as unknown as typeof MediaRecorder,
      speechRecognitionConstructor,
      audioContextConstructor: undefined,
      crypto: cryptoApi,
      monotonicNow: () => monotonic,
      maxActiveDurationMs: 1_000,
      segmentDurationMs: 120_000,
      onSegment: () => undefined,
      onInterruption: (reason) => {
        reasons.push(reason);
        resolveInterruption?.();
      },
    });
    await segmenter.prepare();
    await segmenter.start({ sessionId: SESSION_ID });
    monotonic = 1_000;
    await new Promise((resolve) => setTimeout(resolve, 275));
    await interrupted;
    expect(segmenter.activeDurationMs).toBe(1_000);
    expect(reasons).toEqual(['max_duration']);
  });
});
