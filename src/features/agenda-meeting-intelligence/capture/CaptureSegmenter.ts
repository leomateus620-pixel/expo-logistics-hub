import {
  AGENDA_MEETING_MAX_ACTIVE_DURATION_MS,
  AGENDA_MEETING_AUDIO_SAMPLE_RATE,
  type CapturedAudioSegment,
  type CaptureBackendKind,
  type CaptureInterruptionReason,
  type CaptureGapMarker,
} from '../types';
import { StreamingDownsampler } from './downsampler';
import { createCaptureSegmentId } from './identity';
import { meetingDiagnostics } from './meetingDiagnostics';
import { AGENDA_MEETING_AUDIO_SEGMENT_MIME_TYPE } from './mime';
import { encodeInt16Wav, PcmChunker, type PcmChunk } from './pcmChunker';
import { sha256Blob } from './sha256';

const DURATION_TICK_MS = 250;
const FLUSH_TIMEOUT_MS = 400;
/** Speech captured between opening the microphone and the server confirming the session. */
const PREROLL_MAX_MS = 15_000;
const WORKLET_NAME = 'fenasoja-meeting-pcm-tap';

type SegmenterMode = 'idle' | 'prepared' | 'recording' | 'paused' | 'stopped' | 'interrupted';

export interface PreparedAgendaMeetingCapture {
  backend: CaptureBackendKind;
  mimeType: string;
  selectedDeviceId: string | null;
}

export interface CaptureSegmenterStartInput {
  sessionId: string;
  sequenceStart?: number;
  initialActiveDurationMs?: number;
}

export interface CaptureSegmenterOptions {
  maxActiveDurationMs?: number;
  minChunkMs?: number;
  maxChunkMs?: number;
  mediaDevices?: MediaDevices;
  audioContextConstructor?: typeof AudioContext;
  crypto?: Crypto;
  wallClockNow?: () => number;
  documentTarget?: Document;
  windowTarget?: Window;
  onSegment: (segment: CapturedAudioSegment) => Promise<void> | void;
  onDuration?: (activeDurationMs: number) => void;
  onInterruption?: (reason: CaptureInterruptionReason, error?: Error) => void;
  onGap?: (gap: CaptureGapMarker) => Promise<void> | void;
  onLifecycleSignal?: (reason: Extract<CaptureInterruptionReason, 'page_hidden' | 'device_changed'>) => void;
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

const WORKLET_SOURCE = `
class FenasojaMeetingPcmTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.size = 0;
    this.port.onmessage = (event) => {
      if (event.data === 'flush') {
        this.port.postMessage({ flush: true, samples: this.buffer.slice(0, this.size) });
        this.size = 0;
      }
    };
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let index = 0; index < channel.length; index += 1) {
        this.buffer[this.size++] = channel[index];
        if (this.size === this.buffer.length) {
          this.port.postMessage({ samples: this.buffer.slice(0) });
          this.size = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('${WORKLET_NAME}', FenasojaMeetingPcmTap);
`;

/**
 * Real audio capture engine for Fenasoja Meeting.
 *
 * The microphone is opened once; PCM is tapped through an AudioWorklet (or a
 * ScriptProcessor fallback), resampled to 16 kHz mono and split by
 * {@link PcmChunker} into complete WAV parts. Part offsets come from sample
 * counts, so consecutive parts are contiguous on the active-capture timeline.
 * Pausing and stopping flush the worklet first, so the last words are kept.
 */
export class CaptureSegmenter {
  private readonly options: CaptureSegmenterOptions & {
    maxActiveDurationMs: number;
    crypto: Crypto;
    wallClockNow: () => number;
  };

  private mode: SegmenterMode = 'idle';
  private stream: MediaStream | null = null;
  private backend: CaptureBackendKind | null = null;
  private selectedDeviceId: string | null = null;
  private sessionId: string | null = null;
  private sequence = 0;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private tap: AudioWorkletNode | ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private downsampler: StreamingDownsampler | null = null;
  private chunker: PcmChunker | null = null;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private operation: Promise<void> = Promise.resolve();
  private lifecycleAttached = false;
  private pendingFlush: (() => void) | null = null;
  private emitting: Promise<void> = Promise.resolve();
  private preroll: Float32Array[] = [];
  private prerollSamples = 0;

  private readonly onVisibilityChange = () => {
    // A hidden tab does not end the meeting: audio continues while the browser allows.
    if (this.options.documentTarget?.visibilityState === 'hidden' && this.mode === 'recording') {
      this.options.onLifecycleSignal?.('page_hidden');
    }
    if (this.options.documentTarget?.visibilityState === 'visible' && this.audioContext?.state === 'suspended' && this.mode === 'recording') {
      void this.audioContext.resume().catch(() => undefined);
    }
  };

  private readonly onPageHide = (event: PageTransitionEvent) => {
    // bfcache keeps the page alive; only a real unload interrupts the capture.
    if (event.persisted) return;
    if (this.mode === 'recording' || this.mode === 'paused') void this.interrupt('pagehide');
  };

  private readonly onDeviceChange = () => {
    this.options.onLifecycleSignal?.('device_changed');
  };

  private readonly onContextStateChange = () => {
    const state = this.audioContext?.state as string | undefined;
    if (this.mode !== 'recording' || !state) return;
    if (state === 'suspended' || state === 'interrupted') {
      meetingDiagnostics.record('AUDIO_CONTEXT_SUSPENDED', { state });
      void this.audioContext?.resume().catch(() => {
        void this.interrupt('capture_error', new Error('audio_context_suspended'));
      });
    }
  };

  constructor(options: CaptureSegmenterOptions) {
    this.options = {
      ...options,
      maxActiveDurationMs: options.maxActiveDurationMs ?? AGENDA_MEETING_MAX_ACTIVE_DURATION_MS,
      mediaDevices: options.mediaDevices ?? globalThis.navigator?.mediaDevices,
      audioContextConstructor: options.audioContextConstructor ?? getAudioContextConstructor(),
      crypto: options.crypto ?? globalThis.crypto,
      wallClockNow: options.wallClockNow ?? (() => Date.now()),
      documentTarget: options.documentTarget ?? globalThis.document,
      windowTarget: options.windowTarget ?? globalThis.window,
    };
    if (this.options.maxActiveDurationMs <= 0) throw new Error('invalid_max_active_duration');
  }

  get currentMode(): SegmenterMode {
    return this.mode;
  }

  get activeDurationMs(): number {
    const samples = this.chunker?.totalSamples ?? 0;
    return Math.min(this.options.maxActiveDurationMs, Math.round((samples * 1_000) / AGENDA_MEETING_AUDIO_SAMPLE_RATE));
  }

  get preparedCapture(): PreparedAgendaMeetingCapture | null {
    if (!this.backend) return null;
    return { backend: this.backend, mimeType: AGENDA_MEETING_AUDIO_SEGMENT_MIME_TYPE, selectedDeviceId: this.selectedDeviceId };
  }

  async prepare(deviceId?: string): Promise<PreparedAgendaMeetingCapture> {
    if (this.mode !== 'idle' && this.mode !== 'stopped' && this.mode !== 'interrupted') throw new Error('capture_already_prepared');
    const mediaDevices = this.options.mediaDevices;
    if (!mediaDevices?.getUserMedia) throw new Error('media_devices_unavailable');
    const Context = this.options.audioContextConstructor;
    if (!Context) throw new Error('supported_audio_capture_unavailable');

    meetingDiagnostics.record('GET_USER_MEDIA_REQUESTED', { explicitDevice: Boolean(deviceId) });
    try {
      this.stream = await mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
        video: false,
      });
    } catch (error) {
      meetingDiagnostics.record('GET_USER_MEDIA_FAILED', {
        name: (error as Error)?.name ?? 'Error',
        message: (error as Error)?.message?.slice(0, 160) ?? null,
      });
      throw error;
    }
    const track = this.stream.getAudioTracks()[0];
    if (!track) {
      this.stopTracks();
      throw new Error('audio_track_unavailable');
    }
    this.selectedDeviceId = track.getSettings().deviceId ?? deviceId ?? null;
    track.addEventListener('ended', this.handleTrackEnded);

    try {
      this.audioContext = new Context({ latencyHint: 'interactive' });
      if (this.audioContext.state === 'suspended') await this.audioContext.resume().catch(() => undefined);
      this.audioContext.addEventListener('statechange', this.onContextStateChange);
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.sink = this.audioContext.createGain();
      this.sink.gain.value = 0;
      this.sink.connect(this.audioContext.destination);
      this.backend = await this.createTap();
      this.source.connect(this.tap as AudioNode);
      (this.tap as AudioNode).connect(this.sink);
    } catch (error) {
      await this.releaseCaptureResources();
      throw error instanceof Error ? error : new Error('supported_audio_capture_unavailable');
    }
    meetingDiagnostics.record('AUDIO_CAPTURE_READY', {
      backend: this.backend,
      inputSampleRate: this.audioContext.sampleRate,
      label: track.label ? 'present' : 'empty',
    });
    this.mode = 'prepared';
    this.attachLifecycleListeners();
    return this.preparedCapture as PreparedAgendaMeetingCapture;
  }

  async start(input: CaptureSegmenterStartInput): Promise<void> {
    if (this.mode !== 'prepared') throw new Error('capture_not_prepared');
    if (!input.sessionId) throw new Error('session_id_required');
    this.sessionId = input.sessionId;
    this.sequence = Math.max(0, input.sequenceStart ?? 0);
    const initialMs = Math.max(0, Math.min(this.options.maxActiveDurationMs, input.initialActiveDurationMs ?? 0));
    this.downsampler = new StreamingDownsampler(this.audioContext?.sampleRate ?? AGENDA_MEETING_AUDIO_SAMPLE_RATE, AGENDA_MEETING_AUDIO_SAMPLE_RATE);
    this.chunker = new PcmChunker({
      sampleRate: AGENDA_MEETING_AUDIO_SAMPLE_RATE,
      minChunkMs: this.options.minChunkMs,
      maxChunkMs: this.options.maxChunkMs,
      startSample: Math.round((initialMs * AGENDA_MEETING_AUDIO_SAMPLE_RATE) / 1_000),
    });
    if (this.audioContext?.state === 'suspended') await this.audioContext.resume().catch(() => undefined);
    this.mode = 'recording';
    // Keep what was said while the session was being created: the microphone
    // was already open for this meeting, so dropping it would lose the opening words.
    const preroll = this.preroll;
    this.preroll = [];
    this.prerollSamples = 0;
    for (const samples of preroll) this.handleSamples(samples);
    this.startDurationTimer();
  }

  async listAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    if (!this.options.mediaDevices?.enumerateDevices) return [];
    const devices = await this.options.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'audioinput');
  }

  readInputLevel(): number | null {
    if (this.mode !== 'recording' || !this.chunker) return null;
    return Math.min(1, this.chunker.level * 6);
  }

  async pause(): Promise<void> {
    if (this.mode !== 'recording') throw new Error('capture_not_recording');
    await this.enqueue(async () => {
      await this.drainTap();
      this.mode = 'paused';
      this.clearTimers();
      await this.emitChunk(this.chunker?.flush() ?? null);
      this.options.onDuration?.(this.activeDurationMs);
    });
  }

  async resume(): Promise<void> {
    if (this.mode !== 'paused') throw new Error('capture_not_paused');
    if (this.activeDurationMs >= this.options.maxActiveDurationMs) {
      await this.interrupt('max_duration');
      return;
    }
    if (this.audioContext?.state === 'suspended') await this.audioContext.resume().catch(() => undefined);
    this.mode = 'recording';
    this.startDurationTimer();
  }

  async stop(): Promise<void> {
    if (!['recording', 'paused', 'prepared'].includes(this.mode)) return;
    const wasRecording = this.mode === 'recording';
    await this.enqueue(async () => {
      try {
        if (wasRecording) await this.drainTap();
        this.mode = 'stopped';
        this.clearTimers();
        await this.emitChunk(this.chunker?.flush() ?? null);
      } finally {
        await this.releaseCaptureResources();
        this.options.onDuration?.(this.activeDurationMs);
      }
    });
  }

  async abort(): Promise<void> {
    if (this.mode === 'stopped' || this.mode === 'idle') return;
    this.mode = 'stopped';
    this.clearTimers();
    await this.enqueue(async () => {
      await this.releaseCaptureResources();
      this.options.onDuration?.(this.activeDurationMs);
    });
  }

  async interrupt(reason: CaptureInterruptionReason, error?: Error): Promise<void> {
    if (this.mode === 'interrupted' || this.mode === 'stopped' || this.mode === 'idle') return;
    const wasRecording = this.mode === 'recording';
    meetingDiagnostics.record('CAPTURE_INTERRUPTED', { reason, wasRecording, error: error?.message?.slice(0, 160) ?? null });
    this.mode = 'interrupted';
    this.clearTimers();
    await this.enqueue(async () => {
      try {
        // Keep everything already captured; a gap marker records the interruption itself.
        await this.emitChunk(this.chunker?.flush() ?? null);
        if (wasRecording && reason !== 'max_duration' && reason !== 'backpressure') {
          await this.emitGapMarker(reason);
        }
      } finally {
        await this.releaseCaptureResources();
        this.options.onInterruption?.(reason, error);
      }
    });
  }

  async dispose(): Promise<void> {
    await this.stop();
    this.detachLifecycleListeners();
  }

  private readonly handleTrackEnded = () => {
    void this.interrupt('track_ended');
  };

  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.operation.then(task, task);
    this.operation = next.catch(() => undefined);
    return next;
  }

  private async createTap(): Promise<CaptureBackendKind> {
    const context = this.audioContext as AudioContext;
    if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
      try {
        await context.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(context, WORKLET_NAME, { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
        node.port.onmessage = (event: MessageEvent<{ samples: Float32Array; flush?: boolean }>) => {
          this.handleSamples(event.data.samples);
          if (event.data.flush) {
            this.pendingFlush?.();
            this.pendingFlush = null;
          }
        };
        this.tap = node;
        return 'audio_worklet_wav';
      } catch (error) {
        meetingDiagnostics.record('AUDIO_WORKLET_UNAVAILABLE', { message: (error as Error)?.message?.slice(0, 120) ?? null });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (typeof context.createScriptProcessor !== 'function') throw new Error('supported_audio_capture_unavailable');
    const processor = context.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => this.handleSamples(event.inputBuffer.getChannelData(0).slice());
    this.tap = processor;
    return 'script_processor_wav';
  }

  /** Waits until every sample already captured by the worklet reached the chunker. */
  private async drainTap(): Promise<void> {
    if (!(this.tap && 'port' in this.tap)) return;
    const tap = this.tap;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingFlush = null;
        resolve();
      }, FLUSH_TIMEOUT_MS);
      this.pendingFlush = () => {
        clearTimeout(timer);
        resolve();
      };
      tap.port.postMessage('flush');
    });
  }

  private handleSamples(samples: Float32Array | undefined) {
    if (this.mode === 'prepared' && samples?.length) {
      const maxSamples = Math.round(((this.audioContext?.sampleRate ?? AGENDA_MEETING_AUDIO_SAMPLE_RATE) * PREROLL_MAX_MS) / 1_000);
      this.preroll.push(samples);
      this.prerollSamples += samples.length;
      while (this.prerollSamples > maxSamples && this.preroll.length > 1) {
        this.prerollSamples -= (this.preroll.shift() as Float32Array).length;
      }
      return;
    }
    if (this.mode !== 'recording' || !samples?.length || !this.downsampler || !this.chunker) return;
    const resampled = this.downsampler.process(samples);
    const remainingSamples = Math.max(0,
      Math.round((this.options.maxActiveDurationMs * AGENDA_MEETING_AUDIO_SAMPLE_RATE) / 1_000) - this.chunker.totalSamples);
    const accepted = resampled.length > remainingSamples ? resampled.subarray(0, remainingSamples) : resampled;
    for (const chunk of this.chunker.push(accepted)) {
      this.emitChunk(chunk).catch((error) => {
        void this.interrupt('capture_error', error instanceof Error ? error : new Error('segment_emit_failed'));
      });
    }
    if (accepted.length < resampled.length) void this.interrupt('max_duration');
  }

  /** Serialises part emission so sequences stay in capture order. */
  private emitChunk(chunk: PcmChunk | null): Promise<void> {
    const run = this.emitting.then(() => this.writeChunk(chunk));
    this.emitting = run.catch(() => undefined);
    return run;
  }

  private async writeChunk(chunk: PcmChunk | null): Promise<void> {
    if (!chunk || !this.sessionId || !this.backend || chunk.samples.length === 0) return;
    const audio = encodeInt16Wav(chunk.samples, AGENDA_MEETING_AUDIO_SAMPLE_RATE);
    const sequence = this.sequence;
    this.sequence += 1;
    const captureStartMs = Math.round((chunk.startSample * 1_000) / AGENDA_MEETING_AUDIO_SAMPLE_RATE);
    const captureEndMs = Math.max(captureStartMs + 1, Math.round((chunk.endSample * 1_000) / AGENDA_MEETING_AUDIO_SAMPLE_RATE));
    await this.options.onSegment({
      metadata: {
        id: createCaptureSegmentId(this.options.crypto),
        sessionId: this.sessionId,
        sequence,
        captureStartMs,
        captureEndMs,
        durationMs: captureEndMs - captureStartMs,
        capturedAtIso: new Date(this.options.wallClockNow()).toISOString(),
        mimeType: AGENDA_MEETING_AUDIO_SEGMENT_MIME_TYPE,
        bytes: audio.size,
        sha256: await sha256Blob(audio, this.options.crypto),
        backend: this.backend,
        stats: { ...chunk.stats, sampleRate: AGENDA_MEETING_AUDIO_SAMPLE_RATE },
      },
      audio,
    });
  }

  private async emitGapMarker(reason: Exclude<CaptureInterruptionReason, 'max_duration' | 'backpressure'>): Promise<void> {
    if (!this.sessionId || !this.options.onGap) return;
    const captureStartMs = Math.min(this.options.maxActiveDurationMs - 1, Math.max(0, this.activeDurationMs));
    const gap: CaptureGapMarker = {
      id: createCaptureSegmentId(this.options.crypto),
      sessionId: this.sessionId,
      sequence: this.sequence,
      captureStartMs,
      captureEndMs: captureStartMs + 1,
      reason,
    };
    this.sequence += 1;
    await this.options.onGap(gap);
  }

  private startDurationTimer(): void {
    if (this.durationTimer) clearInterval(this.durationTimer);
    this.durationTimer = setInterval(() => {
      const duration = this.activeDurationMs;
      this.options.onDuration?.(duration);
      if (duration >= this.options.maxActiveDurationMs) void this.interrupt('max_duration');
    }, DURATION_TICK_MS);
  }

  private clearTimers(): void {
    if (this.durationTimer) clearInterval(this.durationTimer);
    this.durationTimer = null;
  }

  private attachLifecycleListeners(): void {
    if (this.lifecycleAttached) return;
    this.options.documentTarget?.addEventListener('visibilitychange', this.onVisibilityChange);
    this.options.windowTarget?.addEventListener('pagehide', this.onPageHide as EventListener);
    this.options.mediaDevices?.addEventListener?.('devicechange', this.onDeviceChange);
    this.lifecycleAttached = true;
  }

  private detachLifecycleListeners(): void {
    if (!this.lifecycleAttached) return;
    this.options.documentTarget?.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.options.windowTarget?.removeEventListener('pagehide', this.onPageHide as EventListener);
    this.options.mediaDevices?.removeEventListener?.('devicechange', this.onDeviceChange);
    this.lifecycleAttached = false;
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((track) => {
      track.removeEventListener('ended', this.handleTrackEnded);
      track.stop();
    });
    this.stream = null;
  }

  private async releaseCaptureResources(): Promise<void> {
    this.clearTimers();
    this.preroll = [];
    this.prerollSamples = 0;
    try {
      if (this.tap && 'port' in this.tap) this.tap.port.onmessage = null;
      if (this.tap && 'onaudioprocess' in this.tap) this.tap.onaudioprocess = null;
      this.source?.disconnect();
      (this.tap as AudioNode | null)?.disconnect();
      this.sink?.disconnect();
    } catch {
      // Nodes may already be disconnected.
    }
    this.tap = null;
    this.source = null;
    this.sink = null;
    this.stopTracks();
    if (this.audioContext) {
      this.audioContext.removeEventListener('statechange', this.onContextStateChange);
      await this.audioContext.close().catch(() => undefined);
    }
    this.audioContext = null;
    this.detachLifecycleListeners();
  }
}
