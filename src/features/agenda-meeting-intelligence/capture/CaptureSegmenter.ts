import {
  AGENDA_MEETING_MAX_ACTIVE_DURATION_MS,
  AGENDA_MEETING_SEGMENT_DURATION_MS,
  type CapturedAudioSegment,
  type CaptureBackendKind,
  type CaptureInterruptionReason,
  type CaptureGapMarker,
} from '../types';
import { createCaptureSegmentId } from './identity';
import { AGENDA_MEETING_TEXT_SEGMENT_MIME_TYPE, selectMediaRecorderMimeType } from './mime';
import {
  NativeMeetingTranscriptionAdapter,
  type NativeMeetingTranscriptionOptions,
} from './NativeMeetingTranscriptionAdapter';
import { sha256Blob } from './sha256';
import { encodePcm16Wav } from './wav';

const DURATION_TICK_MS = 250;
const WORKLET_PROCESSOR_NAME = 'fenasoja-meeting-pcm-capture';
const WORKLET_SOURCE = `
class FenasojaMeetingPcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      const copy = new Float32Array(channel);
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor('${WORKLET_PROCESSOR_NAME}', FenasojaMeetingPcmCapture);
`;

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
  segmentDurationMs?: number;
  maxActiveDurationMs?: number;
  mediaDevices?: MediaDevices;
  mediaRecorderConstructor?: typeof MediaRecorder;
  audioContextConstructor?: typeof AudioContext;
  crypto?: Crypto;
  monotonicNow?: () => number;
  wallClockNow?: () => number;
  documentTarget?: Document;
  windowTarget?: Window;
  onSegment: (segment: CapturedAudioSegment) => Promise<void> | void;
  onDuration?: (activeDurationMs: number) => void;
  onInterruption?: (reason: CaptureInterruptionReason, error?: Error) => void;
  onGap?: (gap: CaptureGapMarker) => Promise<void> | void;
  onLifecycleSignal?: (reason: Extract<CaptureInterruptionReason, 'page_hidden' | 'device_changed'>) => void;
  speechRecognitionConstructor?: NativeMeetingTranscriptionOptions['recognitionConstructor'];
  onInterimTranscript?: (text: string) => void;
}

interface CompletedRecorderCycle {
  blob: Blob;
  captureStartMs: number;
  captureEndMs: number;
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

export class CaptureSegmenter {
  private readonly options: Required<
    Pick<CaptureSegmenterOptions, 'segmentDurationMs' | 'maxActiveDurationMs'>
  > &
    Omit<CaptureSegmenterOptions, 'segmentDurationMs' | 'maxActiveDurationMs'>;

  private mode: SegmenterMode = 'idle';
  private stream: MediaStream | null = null;
  private backend: CaptureBackendKind | null = null;
  private mimeType: string | null = null;
  private selectedDeviceId: string | null = null;
  private sessionId: string | null = null;
  private sequence = 0;
  private recorder: MediaRecorder | null = null;
  private recorderChunks: Blob[] = [];
  private cycleStartActiveMs = 0;
  private workletChunks: Float32Array[] = [];
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletSource: MediaStreamAudioSourceNode | null = null;
  private silentGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBuffer: Float32Array<ArrayBuffer> | null = null;
  private activeAccumulatedMs = 0;
  private activeStartedAtMonotonic: number | null = null;
  private segmentTimer: ReturnType<typeof setTimeout> | null = null;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private operation: Promise<void> = Promise.resolve();
  private lifecycleAttached = false;
  private transcription: NativeMeetingTranscriptionAdapter | null = null;

  private readonly onVisibilityChange = () => {
    if (this.options.documentTarget?.visibilityState === 'hidden' && this.mode === 'recording') {
      this.options.onLifecycleSignal?.('page_hidden');
      void this.interrupt('page_hidden');
    }
  };

  private readonly onPageHide = () => {
    if (this.mode === 'recording' || this.mode === 'paused') {
      void this.interrupt('pagehide');
    }
  };

  private readonly onDeviceChange = () => {
    if (this.mode === 'recording') void this.interrupt('device_changed');
    else if (this.mode === 'paused') this.options.onLifecycleSignal?.('device_changed');
  };

  constructor(options: CaptureSegmenterOptions) {
    this.options = {
      ...options,
      segmentDurationMs: options.segmentDurationMs ?? AGENDA_MEETING_SEGMENT_DURATION_MS,
      maxActiveDurationMs: options.maxActiveDurationMs ?? AGENDA_MEETING_MAX_ACTIVE_DURATION_MS,
      mediaDevices: options.mediaDevices ?? globalThis.navigator?.mediaDevices,
      mediaRecorderConstructor:
        options.mediaRecorderConstructor ??
        (typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder),
      audioContextConstructor: options.audioContextConstructor ?? getAudioContextConstructor(),
      crypto: options.crypto ?? globalThis.crypto,
      monotonicNow: options.monotonicNow ?? (() => performance.now()),
      wallClockNow: options.wallClockNow ?? (() => Date.now()),
      documentTarget: options.documentTarget ?? globalThis.document,
      windowTarget: options.windowTarget ?? globalThis.window,
    };
    if (this.options.segmentDurationMs <= 0) throw new Error('invalid_segment_duration');
    if (this.options.maxActiveDurationMs <= 0) throw new Error('invalid_max_active_duration');
  }

  get currentMode(): SegmenterMode {
    return this.mode;
  }

  get activeDurationMs(): number {
    const running =
      this.activeStartedAtMonotonic === null
        ? 0
        : Math.max(0, this.options.monotonicNow() - this.activeStartedAtMonotonic);
    return Math.min(this.options.maxActiveDurationMs, this.activeAccumulatedMs + running);
  }

  get preparedCapture(): PreparedAgendaMeetingCapture | null {
    if (!this.backend || !this.mimeType) return null;
    return {
      backend: this.backend,
      mimeType: this.mimeType,
      selectedDeviceId: this.selectedDeviceId,
    };
  }

  async prepare(deviceId?: string): Promise<PreparedAgendaMeetingCapture> {
    if (this.mode !== 'idle' && this.mode !== 'stopped') throw new Error('capture_already_prepared');
    const mediaDevices = this.options.mediaDevices;
    if (!mediaDevices?.getUserMedia) throw new Error('media_devices_unavailable');

    const constraints: MediaStreamConstraints = {
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
      video: false,
    };
    this.stream = await mediaDevices.getUserMedia(constraints);
    const selectedTrack = this.stream.getAudioTracks()[0];
    if (!selectedTrack) {
      this.stopTracks();
      throw new Error('audio_track_unavailable');
    }
    this.selectedDeviceId = selectedTrack.getSettings().deviceId ?? deviceId ?? null;
    selectedTrack.addEventListener('ended', this.handleTrackEnded);

    const recorderMimeType = selectMediaRecorderMimeType(this.options.mediaRecorderConstructor);
    if (recorderMimeType && this.options.mediaRecorderConstructor) {
      this.backend = 'media_recorder';
      this.mimeType = recorderMimeType;
    } else if (this.options.audioContextConstructor && typeof AudioWorkletNode !== 'undefined') {
      this.backend = 'audio_worklet_wav';
      this.mimeType = 'audio/wav';
      try {
        await this.prepareAudioWorklet();
      } catch {
        this.stopTracks();
        throw new Error('audio_worklet_unavailable');
      }
    } else {
      this.stopTracks();
      throw new Error('supported_audio_capture_unavailable');
    }

    await this.prepareInputMeter();

    this.transcription = new NativeMeetingTranscriptionAdapter({
      recognitionConstructor: this.options.speechRecognitionConstructor,
      onInterim: this.options.onInterimTranscript,
      onFatalError: (code) => {
        void this.interrupt('capture_error', new Error(code));
      },
    });
    if (!this.transcription.supported) {
      this.transcription = null;
      await this.releaseCaptureResources();
      throw new Error('speech_recognition_unavailable');
    }

    this.mode = 'prepared';
    this.attachLifecycleListeners();
    return this.preparedCapture as PreparedAgendaMeetingCapture;
  }

  async start(input: CaptureSegmenterStartInput): Promise<void> {
    if (this.mode !== 'prepared') throw new Error('capture_not_prepared');
    if (!input.sessionId) throw new Error('session_id_required');
    this.sessionId = input.sessionId;
    this.sequence = Math.max(0, input.sequenceStart ?? 0);
    this.activeAccumulatedMs = Math.max(
      0,
      Math.min(this.options.maxActiveDurationMs, input.initialActiveDurationMs ?? 0),
    );
    this.activeStartedAtMonotonic = this.options.monotonicNow();
    this.mode = 'recording';
    await this.enqueue(async () => {
      await this.startCycle();
      this.startDurationTimer();
    });
  }

  async listAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    if (!this.options.mediaDevices?.enumerateDevices) return [];
    const devices = await this.options.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'audioinput');
  }

  readInputLevel(): number | null {
    if (this.mode !== 'recording' || !this.analyser) return null;
    const buffer = this.analyserBuffer ??
      new Float32Array(new ArrayBuffer(this.analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));
    this.analyserBuffer = buffer;
    this.analyser.getFloatTimeDomainData(buffer);
    let energy = 0;
    for (const sample of buffer) energy += sample * sample;
    return Math.min(1, Math.sqrt(energy / buffer.length) * 4);
  }

  async pause(): Promise<void> {
    if (this.mode !== 'recording') throw new Error('capture_not_recording');
    this.commitActiveInterval();
    this.mode = 'paused';
    this.clearTimers();
    await this.enqueue(async () => {
      const cycle = await this.finishCycle();
      if (cycle) await this.emitCompletedCycle(cycle);
      this.options.onDuration?.(this.activeDurationMs);
    });
  }

  async resume(): Promise<void> {
    if (this.mode !== 'paused') throw new Error('capture_not_paused');
    if (this.activeDurationMs >= this.options.maxActiveDurationMs) {
      await this.interrupt('max_duration');
      return;
    }
    this.activeStartedAtMonotonic = this.options.monotonicNow();
    this.mode = 'recording';
    await this.enqueue(async () => {
      await this.startCycle();
      this.startDurationTimer();
    });
  }

  async stop(): Promise<void> {
    if (!['recording', 'paused', 'prepared'].includes(this.mode)) return;
    if (this.mode === 'recording') this.commitActiveInterval();
    this.mode = 'stopped';
    this.clearTimers();
    await this.enqueue(async () => {
      try {
        const cycle = await this.finishCycle();
        if (cycle) await this.emitCompletedCycle(cycle);
      } finally {
        await this.releaseCaptureResources();
        this.options.onDuration?.(this.activeDurationMs);
      }
    });
  }

  async abort(): Promise<void> {
    if (this.mode === 'stopped' || this.mode === 'idle') return;
    if (this.mode === 'recording') this.commitActiveInterval();
    this.mode = 'stopped';
    this.clearTimers();
    await this.enqueue(async () => {
      try {
        await this.finishCycle();
      } finally {
        await this.releaseCaptureResources();
        this.options.onDuration?.(this.activeDurationMs);
      }
    });
  }

  async interrupt(reason: CaptureInterruptionReason, error?: Error): Promise<void> {
    if (this.mode === 'interrupted' || this.mode === 'stopped' || this.mode === 'idle') return;
    const wasRecording = this.mode === 'recording';
    if (wasRecording) this.commitActiveInterval();
    this.mode = 'interrupted';
    this.clearTimers();
    await this.enqueue(async () => {
      try {
        const cycle = await this.finishCycle();
        if (cycle) await this.emitCompletedCycle(cycle);
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

  private async rotate(): Promise<void> {
    if (this.mode !== 'recording') return;
    await this.enqueue(async () => {
      if (this.mode !== 'recording') return;
      const cycle = await this.finishCycle();
      if (cycle) {
        try {
          await this.emitCompletedCycle(cycle);
        } catch (error) {
          void this.interrupt('capture_error', error instanceof Error ? error : new Error('segment_emit_failed'));
          return;
        }
      }
      // Persist/enqueue the completed segment before opening the next recorder.
      // This lets backpressure pause the capture at the exact boundary instead
      // of producing one extra segment beyond the encrypted spool limit.
      if (this.mode === 'recording') await this.startCycle();
    });
  }

  private async startCycle(): Promise<void> {
    if (!this.stream || !this.backend) throw new Error('capture_stream_unavailable');
    this.transcription?.start();
    this.cycleStartActiveMs = this.activeDurationMs;
    this.scheduleSegmentRotation();
    if (this.backend === 'media_recorder') {
      const Recorder = this.options.mediaRecorderConstructor;
      if (!Recorder || !this.mimeType) throw new Error('media_recorder_unavailable');
      this.recorderChunks = [];
      this.recorder = new Recorder(this.stream, {
        mimeType: this.mimeType,
        audioBitsPerSecond: 64_000,
      });
      this.recorder.addEventListener('dataavailable', this.handleRecorderData);
      this.recorder.start();
      if (this.audioContext?.state === 'suspended') await this.audioContext.resume();
      return;
    }
    this.workletChunks = [];
    if (this.audioContext?.state === 'suspended') await this.audioContext.resume();
  }

  private readonly handleRecorderData = (event: BlobEvent) => {
    if (event.data.size > 0) this.recorderChunks.push(event.data);
  };

  private async finishCycle(): Promise<CompletedRecorderCycle | null> {
    if (!this.backend) return null;
    this.transcription?.stop();
    if (this.segmentTimer) {
      clearTimeout(this.segmentTimer);
      this.segmentTimer = null;
    }
    const captureEndMs = Math.max(this.cycleStartActiveMs, this.activeDurationMs);

    if (this.backend === 'audio_worklet_wav') {
      if (!this.audioContext) return null;
      const chunks = this.workletChunks;
      this.workletChunks = [];
      return {
        blob: encodePcm16Wav(chunks, this.audioContext.sampleRate),
        captureStartMs: this.cycleStartActiveMs,
        captureEndMs,
      };
    }

    const recorder = this.recorder;
    if (!recorder) {
      return { blob: new Blob(), captureStartMs: this.cycleStartActiveMs, captureEndMs };
    }
    const chunks = this.recorderChunks;
    this.recorder = null;
    this.recorderChunks = [];
    recorder.removeEventListener('dataavailable', this.handleRecorderData);

    if (recorder.state !== 'inactive') {
      await new Promise<void>((resolve, reject) => {
        const onData = (event: BlobEvent) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        const cleanup = () => {
          recorder.removeEventListener('dataavailable', onData);
          recorder.removeEventListener('stop', onStop);
          recorder.removeEventListener('error', onError);
        };
        const onStop = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error('media_recorder_stop_failed'));
        };
        recorder.addEventListener('dataavailable', onData);
        recorder.addEventListener('stop', onStop, { once: true });
        recorder.addEventListener('error', onError, { once: true });
        recorder.stop();
      });
    }
    return {
      blob: new Blob(chunks, { type: this.mimeType ?? chunks[0]?.type ?? 'application/octet-stream' }),
      captureStartMs: this.cycleStartActiveMs,
      captureEndMs,
    };
  }

  private async emitCompletedCycle(cycle: CompletedRecorderCycle): Promise<void> {
    if (!this.sessionId || !this.backend) return;
    // O áudio do ciclo nunca é persistido nem enviado: apenas o texto
    // reconhecido localmente pela Web Speech API vira segmento.
    const { transcript } = this.transcription?.drain() ?? { transcript: '' };
    if (!transcript) return;
    const payload = new Blob([transcript], { type: AGENDA_MEETING_TEXT_SEGMENT_MIME_TYPE });
    const sequence = this.sequence;
    this.sequence += 1;
    const segmentId = createCaptureSegmentId(this.options.crypto);
    const metadata = {
      id: segmentId,
      sessionId: this.sessionId,
      sequence,
      captureStartMs: Math.round(cycle.captureStartMs),
      captureEndMs: Math.max(Math.round(cycle.captureStartMs) + 1, Math.round(cycle.captureEndMs)),
      durationMs: Math.max(0, Math.round(cycle.captureEndMs - cycle.captureStartMs)),
      capturedAtIso: new Date(this.options.wallClockNow()).toISOString(),
      mimeType: AGENDA_MEETING_TEXT_SEGMENT_MIME_TYPE,
      bytes: payload.size,
      sha256: await sha256Blob(payload, this.options.crypto),
      backend: this.backend,
    } as const;
    await this.options.onSegment({ metadata, audio: payload });
  }


  private async emitGapMarker(
    reason: Exclude<CaptureInterruptionReason, 'max_duration' | 'backpressure'>,
  ): Promise<void> {
    if (!this.sessionId || !this.options.onGap) return;
    const captureStartMs = Math.min(
      this.options.maxActiveDurationMs - 1,
      Math.max(0,Math.round(this.activeDurationMs)),
    );
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

  private scheduleSegmentRotation(): void {
    if (this.segmentTimer) clearTimeout(this.segmentTimer);
    this.segmentTimer = setTimeout(() => void this.rotate(), this.options.segmentDurationMs);
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
    if (this.segmentTimer) clearTimeout(this.segmentTimer);
    if (this.durationTimer) clearInterval(this.durationTimer);
    this.segmentTimer = null;
    this.durationTimer = null;
  }

  private commitActiveInterval(): void {
    if (this.activeStartedAtMonotonic === null) return;
    this.activeAccumulatedMs = Math.min(
      this.options.maxActiveDurationMs,
      this.activeAccumulatedMs +
        Math.max(0, this.options.monotonicNow() - this.activeStartedAtMonotonic),
    );
    this.activeStartedAtMonotonic = null;
  }

  private async prepareAudioWorklet(): Promise<void> {
    const Context = this.options.audioContextConstructor;
    if (!Context || !this.stream) throw new Error('audio_worklet_unavailable');
    this.audioContext = new Context({ sampleRate: 48_000, latencyHint: 'interactive' });
    const moduleUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }));
    try {
      await this.audioContext.audioWorklet.addModule(moduleUrl);
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
    this.workletSource = this.audioContext.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.audioContext, WORKLET_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.silentGain = this.audioContext.createGain();
    this.silentGain.gain.value = 0;
    this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (this.mode === 'recording') this.workletChunks.push(new Float32Array(event.data));
    };
    this.workletSource.connect(this.workletNode);
    this.workletNode.connect(this.silentGain);
    this.silentGain.connect(this.audioContext.destination);
  }

  private async prepareInputMeter(): Promise<void> {
    if (!this.stream) return;
    const Context = this.options.audioContextConstructor;
    if (!this.audioContext && Context) this.audioContext = new Context({ latencyHint: 'interactive' });
    if (!this.audioContext) return;
    if (!this.workletSource) this.workletSource = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.75;
    this.workletSource.connect(this.analyser);
  }

  private attachLifecycleListeners(): void {
    if (this.lifecycleAttached) return;
    this.options.documentTarget?.addEventListener('visibilitychange', this.onVisibilityChange);
    this.options.windowTarget?.addEventListener('pagehide', this.onPageHide);
    this.options.mediaDevices?.addEventListener?.('devicechange', this.onDeviceChange);
    this.lifecycleAttached = true;
  }

  private detachLifecycleListeners(): void {
    if (!this.lifecycleAttached) return;
    this.options.documentTarget?.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.options.windowTarget?.removeEventListener('pagehide', this.onPageHide);
    this.options.mediaDevices?.removeEventListener?.('devicechange', this.onDeviceChange);
    this.lifecycleAttached = false;
  }

  private stopTracks(): void {
    if (!this.stream) return;
    for (const track of this.stream.getTracks()) {
      track.removeEventListener('ended', this.handleTrackEnded);
      track.stop();
    }
    this.stream = null;
  }

  private async releaseCaptureResources(): Promise<void> {
    this.transcription?.stop();
    this.transcription = null;
    this.workletNode?.disconnect();
    this.workletSource?.disconnect();
    this.silentGain?.disconnect();
    this.analyser?.disconnect();
    this.workletNode = null;
    this.workletSource = null;
    this.silentGain = null;
    this.analyser = null;
    this.analyserBuffer = null;
    if (this.audioContext && this.audioContext.state !== 'closed') await this.audioContext.close();
    this.audioContext = null;
    this.stopTracks();
    this.detachLifecycleListeners();
  }
}
