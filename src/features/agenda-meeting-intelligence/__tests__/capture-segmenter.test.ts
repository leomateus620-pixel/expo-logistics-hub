import { webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { blobToArrayBuffer } from '../capture/blob';
import { CaptureSegmenter, type CaptureSegmenterOptions } from '../capture/CaptureSegmenter';
import { StreamingDownsampler } from '../capture/downsampler';
import { encodeInt16Wav, PcmChunker } from '../capture/pcmChunker';
import type { CapturedAudioSegment, CaptureGapMarker, CaptureInterruptionReason } from '../types';

const cryptoApi = webcrypto as unknown as Crypto;
const SESSION_ID = '30000000-0000-4000-8000-000000000001';
const RATE = 16_000;

function tone(seconds: number, amplitude = 0.3, rate = RATE) {
  const samples = new Float32Array(Math.round(seconds * rate));
  for (let index = 0; index < samples.length; index += 1) samples[index] = amplitude * Math.sin((2 * Math.PI * 220 * index) / rate);
  return samples;
}

function concat(...parts: Float32Array[]) {
  const output = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

describe('PcmChunker', () => {
  it('cuts in a silence after the minimum length and keeps parts contiguous', () => {
    const chunker = new PcmChunker({ minChunkMs: 2_000, maxChunkMs: 6_000 });
    const chunks = chunker.push(concat(tone(2.5), new Float32Array(RATE * 0.6), tone(2)));
    expect(chunks).toHaveLength(1);
    const [first] = chunks;
    // Cut lands inside the silent stretch (2.5 s .. 3.1 s), never in speech.
    expect(first.endSample).toBeGreaterThan(2.5 * RATE);
    expect(first.endSample).toBeLessThan(3.1 * RATE);
    const rest = chunker.flush();
    expect(rest?.startSample).toBe(first.endSample);
    expect(first.samples.length + (rest?.samples.length ?? 0)).toBe(Math.round(5.1 * RATE));
    expect(first.stats.voicedRatio).toBeGreaterThan(0.5);
  });

  it('forces a cut at the maximum length without dropping or duplicating samples', () => {
    const chunker = new PcmChunker({ minChunkMs: 2_000, maxChunkMs: 4_000 });
    const chunks = chunker.push(tone(10));
    const tail = chunker.flush();
    const all = tail ? [...chunks, tail] : chunks;
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (let index = 1; index < all.length; index += 1) expect(all[index].startSample).toBe(all[index - 1].endSample);
    expect(all.reduce((sum, chunk) => sum + chunk.samples.length, 0)).toBe(10 * RATE);
    expect(Math.max(...all.map((chunk) => chunk.samples.length))).toBeLessThanOrEqual(4 * RATE + 320);
  });

  it('starts offsets after an earlier capture when resuming a recovered session', () => {
    const chunker = new PcmChunker({ minChunkMs: 1_000, maxChunkMs: 2_000, startSample: 90 * RATE });
    chunker.push(tone(0.5));
    expect(chunker.flush()?.startSample).toBe(90 * RATE);
  });
});

describe('StreamingDownsampler and WAV', () => {
  it('converts 48 kHz to 16 kHz across calls without losing samples', () => {
    const downsampler = new StreamingDownsampler(48_000, RATE);
    const first = downsampler.process(tone(0.5, 0.3, 48_000));
    const second = downsampler.process(tone(0.5, 0.3, 48_000));
    expect(first.length + second.length).toBe(RATE);
  });

  it('writes a canonical 16-bit mono PCM header', async () => {
    const wav = encodeInt16Wav(new Int16Array(RATE), RATE);
    const view = new DataView(await blobToArrayBuffer(wav));
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(RATE * 2);
    expect(wav.size).toBe(44 + RATE * 2);
  });
});

class FakeTrack extends EventTarget {
  stopped = false;
  label = 'Microfone';
  getSettings(): MediaTrackSettings { return { deviceId: 'microphone-1' }; }
  stop(): void { this.stopped = true; }
}

class FakeScriptProcessor {
  onaudioprocess: ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null = null;
  connect() {}
  disconnect() {}
  feed(samples: Float32Array) {
    this.onaudioprocess?.({ inputBuffer: { getChannelData: () => samples } });
  }
}

class FakeAudioContext extends EventTarget {
  static last: FakeAudioContext | null = null;
  readonly sampleRate = RATE;
  state: AudioContextState = 'running';
  destination = {} as AudioDestinationNode;
  processor = new FakeScriptProcessor();
  constructor() {
    super();
    FakeAudioContext.last = this;
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
  createScriptProcessor() { return this.processor; }
}

function environment() {
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
  return { track, devices };
}

function segmenterFor(options: {
  segments: CapturedAudioSegment[];
  gaps?: CaptureGapMarker[];
  interruptions?: CaptureInterruptionReason[];
  maxActiveDurationMs?: number;
  onGap?: CaptureSegmenterOptions['onGap'];
}) {
  const { devices, track } = environment();
  const segmenter = new CaptureSegmenter({
    mediaDevices: devices,
    audioContextConstructor: FakeAudioContext as unknown as typeof AudioContext,
    crypto: cryptoApi,
    documentTarget: new EventTarget() as unknown as Document,
    windowTarget: new EventTarget() as unknown as Window,
    minChunkMs: 2_000,
    maxChunkMs: 4_000,
    maxActiveDurationMs: options.maxActiveDurationMs,
    onSegment: (segment) => { options.segments.push(segment); },
    onGap: (gap) => {
      options.gaps?.push(gap);
      return options.onGap?.(gap);
    },
    onInterruption: (reason) => { options.interruptions?.push(reason); },
  });
  return { segmenter, track };
}

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('CaptureSegmenter (real audio)', () => {
  it('emits contiguous WAV parts and keeps the audio spoken before a pause and the last words at stop', async () => {
    const segments: CapturedAudioSegment[] = [];
    const { segmenter, track } = segmenterFor({ segments });
    const prepared = await segmenter.prepare();
    expect(prepared).toMatchObject({ backend: 'script_processor_wav', mimeType: 'audio/wav' });
    await segmenter.start({ sessionId: SESSION_ID });
    const processor = FakeAudioContext.last!.processor;
    for (let second = 0; second < 5; second += 1) processor.feed(tone(1));
    await flushMicrotasks();
    await segmenter.pause();
    // Audio arriving while paused is not recorded.
    processor.feed(tone(2));
    expect(segmenter.activeDurationMs).toBe(5_000);
    await segmenter.resume();
    processor.feed(tone(1.5));
    await segmenter.stop();

    expect(segments.length).toBeGreaterThanOrEqual(3);
    segments.forEach((segment, index) => {
      expect(segment.metadata.sequence).toBe(index);
      expect(segment.metadata.mimeType).toBe('audio/wav');
      expect(segment.metadata.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(segment.audio.size).toBe(segment.metadata.bytes);
      if (index > 0) expect(segment.metadata.captureStartMs).toBe(segments[index - 1].metadata.captureEndMs);
    });
    expect(segments.at(-1)?.metadata.captureEndMs).toBe(6_500);
    expect(track.stopped).toBe(true);
  });

  it('records an explicit gap when the microphone track ends', async () => {
    const segments: CapturedAudioSegment[] = [];
    const gaps: CaptureGapMarker[] = [];
    const interruptions: CaptureInterruptionReason[] = [];
    const { segmenter, track } = segmenterFor({ segments, gaps, interruptions });
    await segmenter.prepare();
    await segmenter.start({ sessionId: SESSION_ID });
    FakeAudioContext.last!.processor.feed(tone(1));
    track.dispatchEvent(new Event('ended'));
    await vi.waitFor(() => expect(interruptions).toEqual(['track_ended']));
    expect(segments).toHaveLength(1);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].sequence).toBe(1);
  });

  it('saves audio and finishes even if the suspended device never closes its audio context', async () => {
    const segments: CapturedAudioSegment[] = [];
    const { segmenter, track } = segmenterFor({ segments });
    await segmenter.prepare();
    const context = FakeAudioContext.last!;
    const close = vi.spyOn(context, 'close').mockReturnValue(new Promise<void>(() => undefined));
    await segmenter.start({ sessionId: SESSION_ID });
    context.processor.feed(tone(1));

    const finished = vi.fn();
    void segmenter.stop().then(finished);
    await vi.waitFor(() => expect(finished).toHaveBeenCalledOnce());
    expect(segments[0].metadata.durationMs).toBe(1000);
    expect(track.stopped).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it('waits for an in-flight interruption to save the final audio and gap', async () => {
    const segments: CapturedAudioSegment[] = [];
    let completeGap = () => {};
    const savingGap = new Promise<void>((resolve) => { completeGap = resolve; });
    const onGap = vi.fn(() => savingGap);
    const { segmenter } = segmenterFor({ segments, onGap });
    await segmenter.prepare();
    await segmenter.start({ sessionId: SESSION_ID });
    FakeAudioContext.last!.processor.feed(tone(1));

    const interrupted = segmenter.interrupt('track_ended');
    const finished = vi.fn();
    const ending = segmenter.stop().then(finished);
    try {
      await vi.waitFor(() => expect(onGap).toHaveBeenCalledWith(expect.objectContaining({ sequence: 1 })));
      expect(segments[0].metadata.durationMs).toBe(1000);
      expect(finished).not.toHaveBeenCalled();
    } finally {
      completeGap();
      await interrupted;
      await ending;
    }
    expect(finished).toHaveBeenCalledOnce();
  });

  it('stops at the active-duration cap without counting paused time', async () => {
    const segments: CapturedAudioSegment[] = [];
    const interruptions: CaptureInterruptionReason[] = [];
    const { segmenter } = segmenterFor({ segments, interruptions, maxActiveDurationMs: 3_000 });
    await segmenter.prepare();
    await segmenter.start({ sessionId: SESSION_ID });
    FakeAudioContext.last!.processor.feed(tone(5));
    await vi.waitFor(() => expect(interruptions).toEqual(['max_duration']));
    expect(segments.reduce((sum, segment) => sum + segment.metadata.durationMs, 0)).toBe(3_000);
  });
  it('keeps the words spoken while the session was being created (up to 15 s)', async () => {
    const segments: CapturedAudioSegment[] = [];
    const { segmenter } = segmenterFor({ segments });
    await segmenter.prepare();
    const processor = FakeAudioContext.last!.processor;
    processor.feed(tone(1.5));
    await segmenter.start({ sessionId: SESSION_ID });
    processor.feed(tone(1));
    await segmenter.stop();
    expect(segments.reduce((sum, segment) => sum + segment.metadata.durationMs, 0)).toBe(2_500);
  });
});
