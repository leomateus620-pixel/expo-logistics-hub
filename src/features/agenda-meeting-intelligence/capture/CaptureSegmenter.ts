import {
  AGENDA_MEETING_MAX_ACTIVE_DURATION_MS,
  AGENDA_MEETING_SEGMENT_DURATION_MS,
  type CapturedAudioSegment,
  type CaptureBackendKind,
  type CaptureInterruptionReason,
  type CaptureGapMarker,
} from '../types';
import { createCaptureSegmentId } from './identity';
import { meetingDiagnostics } from './meetingDiagnostics';
import { AGENDA_MEETING_TEXT_SEGMENT_MIME_TYPE, selectMediaRecorderMimeType } from './mime';
import {
  NativeMeetingTranscriptionAdapter,
  type NativeMeetingTranscriptionOptions,
  type TranscriptionState,
} from './NativeMeetingTranscriptionAdapter';
import { sha256Blob } from './sha256';

const DURATION_TICK_MS = 250;

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
  onFinalTranscript?: (segmentText: string, canonicalTranscript: string) => void;
  onTranscriptionState?: (state: TranscriptionState) => void;
}

interface CompletedCycle {
  captureStartMs: number;
  captureEndMs: number;
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

/**
 * Motor de captura da reunião.
 *
 * Arquitetura: o microfone é aberto uma única vez (`getUserMedia`), o
 * reconhecimento nativo permanece vivo do início ao fim da sessão e a rotação
 * periódica apenas *drena* o texto já finalizado para persistência. Nenhum
 * áudio é gravado ou enviado — o `AnalyserNode` existe só para o medidor de
 * nível de entrada.
 */
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
  private cycleStartActiveMs = 0;
  private audioContext: AudioContext | null = null;
  private meterSource: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBuffer: Float32Array<ArrayBuffer> | null = null;
  private activeAccumulatedMs = 0;
  private activeStartedAtMonotonic: number | null = null;
  private segmentTimer: ReturnType<typeof setInterval> | null = null;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private operation: Promise<void> = Promise.resolve();
  private lifecycleAttached = false;
  private transcription: NativeMeetingTranscriptionAdapter | null = null;

  private readonly onVisibilityChange = () => {
    // Tela oculta NÃO encerra a reunião: apenas informa a UI. O microfone e o
    // reconhecimento continuam ativos enquanto o navegador permitir.
    if (this.options.documentTarget?.visibilityState === 'hidden' && this.mode === 'recording') {
      this.options.onLifecycleSignal?.('page_hidden');
    }
  };

  private readonly onPageHide = () => {
    if (this.mode === 'recording' || this.mode === 'paused') {
      void this.interrupt('pagehide');
    }
  };

  private readonly onDeviceChange = () => {
    this.options.onLifecycleSignal?.('device_changed');
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

  get canonicalTranscript(): string {
    return this.transcription?.canonicalTranscript ?? '';
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
    meetingDiagnostics.record('GET_USER_MEDIA_REQUESTED', { explicitDevice: Boolean(deviceId) });
    try {
      this.stream = await mediaDevices.getUserMedia(constraints);
    } catch (error) {
      meetingDiagnostics.record('GET_USER_MEDIA_FAILED', {
        name: (error as Error)?.name ?? 'Error',
        message: (error as Error)?.message?.slice(0, 160) ?? null,
      });
      throw error;
    }
    meetingDiagnostics.record('GET_USER_MEDIA_GRANTED');
    const selectedTrack = this.stream.getAudioTracks()[0];
    if (!selectedTrack) {
      this.stopTracks();
      throw new Error('audio_track_unavailable');
    }
    this.selectedDeviceId = selectedTrack.getSettings().deviceId ?? deviceId ?? null;
    meetingDiagnostics.record('AUDIO_TRACK_READY', {
      readyState: selectedTrack.readyState,
      muted: selectedTrack.muted,
      enabled: selectedTrack.enabled,
      label: selectedTrack.label ? 'present' : 'empty',
    });
    selectedTrack.addEventListener('ended', this.handleTrackEnded);

    // Metadados de compatibilidade: nenhum áudio é codificado ou persistido.
    const recorderMimeType = selectMediaRecorderMimeType(this.options.mediaRecorderConstructor);
    this.backend = recorderMimeType ? 'media_recorder' : 'audio_worklet_wav';
    this.mimeType = AGENDA_MEETING_TEXT_SEGMENT_MIME_TYPE;

    await this.prepareInputMeter();

    this.transcription = new NativeMeetingTranscriptionAdapter({
      recognitionConstructor: this.options.speechRecognitionConstructor,
      onInterim: this.options.onInterimTranscript,
      onFinal: this.options.onFinalTranscript,
      onStateChange: this.options.onTranscriptionState,
      onFatalError: (code) => {
        void this.interrupt('capture_error', new Error(code));
      },
    });
    meetingDiagnostics.record('TRANSCRIPTION_ADAPTER_CREATED', {
      supported: this.transcription.supported,
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
      this.transcription?.pause();
      const cycle = this.closeCycle();
      await this.emitCompletedCycle(cycle);
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
    const wasCapturing = this.mode !== 'prepared';
    this.mode = 'stopped';
    this.clearTimers();
    await this.enqueue(async () => {
      try {
        // Consome o último resultado final antes de desmontar o reconhecimento.
        if (wasCapturing) await this.transcription?.stopAndFlush();
        else this.transcription?.stop();
        const cycle = this.closeCycle();
        if (wasCapturing) await this.emitCompletedCycle(cycle);
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
        this.transcription?.stop();
        this.closeCycle();
      } finally {
        await this.releaseCaptureResources();
        this.options.onDuration?.(this.activeDurationMs);
      }
    });
  }

  async interrupt(reason: CaptureInterruptionReason, error?: Error): Promise<void> {
    if (this.mode === 'interrupted' || this.mode === 'stopped' || this.mode === 'idle') return;
    const wasRecording = this.mode === 'recording';
    meetingDiagnostics.record('CAPTURE_INTERRUPTED', {
      reason,
      wasRecording,
      error: error?.message?.slice(0, 160) ?? null,
    });
    if (wasRecording) this.commitActiveInterval();
    this.mode = 'interrupted';
    this.clearTimers();
    await this.enqueue(async () => {
      try {
        this.transcription?.stop();
        const cycle = this.closeCycle();
        await this.emitCompletedCycle(cycle);
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

  /**
   * Flush periódico: persiste o texto já finalizado SEM parar o reconhecimento.
   */
  private async flush(): Promise<void> {
    if (this.mode !== 'recording') return;
    await this.enqueue(async () => {
      if (this.mode !== 'recording') return;
      const cycle = this.closeCycle();
      try {
        await this.emitCompletedCycle(cycle);
      } catch (error) {
        void this.interrupt(
          'capture_error',
          error instanceof Error ? error : new Error('segment_emit_failed'),
        );
      }
    });
  }

  private async startCycle(): Promise<void> {
    if (!this.stream || !this.backend) throw new Error('capture_stream_unavailable');
    this.transcription?.start();
    this.cycleStartActiveMs = this.activeDurationMs;
    this.scheduleSegmentFlush();
    if (this.audioContext?.state === 'suspended') await this.audioContext.resume();
  }

  private closeCycle(): CompletedCycle {
    const captureEndMs = Math.max(this.cycleStartActiveMs, this.activeDurationMs);
    const cycle = { captureStartMs: this.cycleStartActiveMs, captureEndMs };
    this.cycleStartActiveMs = captureEndMs;
    return cycle;
  }

  private async emitCompletedCycle(cycle: CompletedCycle): Promise<void> {
    if (!this.sessionId || !this.backend) return;
    // Somente o texto reconhecido localmente vira segmento; áudio nunca é persistido.
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

  private scheduleSegmentFlush(): void {
    if (this.segmentTimer) clearInterval(this.segmentTimer);
    this.segmentTimer = setInterval(() => void this.flush(), this.options.segmentDurationMs);
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
    if (this.segmentTimer) clearInterval(this.segmentTimer);
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

  private async prepareInputMeter(): Promise<void> {
    if (!this.stream) return;
    const Context = this.options.audioContextConstructor;
    if (!Context) return;
    try {
      if (!this.audioContext) this.audioContext = new Context({ latencyHint: 'interactive' });
      this.meterSource = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.75;
      this.meterSource.connect(this.analyser);
    } catch {
      // O medidor é acessório: sua ausência nunca impede a transcrição.
      this.analyser = null;
    }
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
    this.meterSource?.disconnect();
    this.analyser?.disconnect();
    this.meterSource = null;
    this.analyser = null;
    this.analyserBuffer = null;
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close().catch(() => undefined);
    }
    this.audioContext = null;
    this.stopTracks();
    this.detachLifecycleListeners();
  }
}
