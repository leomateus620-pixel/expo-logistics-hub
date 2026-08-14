/**
 * Controlador autoritativo de reconhecimento de fala nativo (Web Speech API).
 *
 * Regras estruturais:
 * - uma única instância de SpeechRecognition viva durante toda a reunião;
 * - `onend` inesperado com sessão ativa dispara reinício controlado com backoff;
 * - erros são classificados entre recuperáveis e fatais (somente fatais encerram);
 * - `finalSegments` é append-only: reinícios nunca apagam texto já reconhecido.
 *
 * Nenhum áudio sai do dispositivo: apenas o texto reconhecido é entregue.
 */

import { meetingDiagnostics } from './meetingDiagnostics';


interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onsoundend: (() => void) | null;
  onaudioend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export type TranscriptionState =
  | 'idle'
  | 'initializing'
  | 'listening'
  | 'speech_detected'
  | 'recovering'
  | 'paused'
  | 'stopping'
  | 'completed'
  | 'error';

const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported']);
const RESTART_BACKOFF_MS = [250, 500, 1_000, 2_000, 5_000];
const MAX_RESTART_ATTEMPTS = 24;
const RESTART_WINDOW_MS = 60_000;
const DEBUG =
  typeof window !== 'undefined' &&
  (window as Window & { __FENASOJA_MEETING_DEBUG__?: boolean }).__FENASOJA_MEETING_DEBUG__ === true;

function debugLog(event: string, detail?: unknown): void {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.info(`[meeting-stt] ${event}`, detail ?? '');
}

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const scope = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export function isNativeSpeechRecognitionSupported(): boolean {
  return Boolean(getSpeechRecognitionConstructor());
}

function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove sobreposição evidente entre o fim do texto anterior e o início do novo,
 * comparando até 12 palavras. Não reescreve conteúdo — apenas corta a repetição.
 */
export function dedupeTranscriptOverlap(previous: string, next: string): string {
  const candidate = next.trim();
  if (!previous.trim() || !candidate) return candidate;
  const previousWords = normalizeForComparison(previous).split(' ').filter(Boolean);
  const nextRawWords = candidate.split(/\s+/).filter(Boolean);
  const nextWords = normalizeForComparison(candidate).split(' ').filter(Boolean);
  if (!previousWords.length || !nextWords.length) return candidate;

  const maxOverlap = Math.min(12, previousWords.length, nextWords.length);
  for (let size = maxOverlap; size >= 2; size -= 1) {
    const tail = previousWords.slice(previousWords.length - size).join(' ');
    const head = nextWords.slice(0, size).join(' ');
    if (tail === head) {
      return nextRawWords.slice(size).join(' ').trim();
    }
  }
  return candidate;
}

export interface NativeMeetingTranscriptionOptions {
  lang?: string;
  onInterim?: (text: string) => void;
  onFinal?: (text: string, canonicalTranscript: string) => void;
  onStateChange?: (state: TranscriptionState) => void;
  onFatalError?: (code: string) => void;
  recognitionConstructor?: SpeechRecognitionConstructor;
  restartDelaysMs?: number[];
  scheduleRestart?: (callback: () => void, delayMs: number) => unknown;
}

export class NativeMeetingTranscriptionAdapter {
  private readonly options: NativeMeetingTranscriptionOptions;
  private recognition: SpeechRecognitionLike | null = null;
  /** Sessão logicamente ativa (usuário não parou nem pausou). */
  private active = false;
  private manualStop = false;
  private startLock = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private restartAttempts = 0;
  private restartWindowStartedAt = 0;
  private state: TranscriptionState = 'idle';

  /** Append-only: nunca é limpo em reinícios. */
  private finalSegments: string[] = [];
  /** Índice do primeiro segmento ainda não drenado (persistido). */
  private drainedCount = 0;
  private interim = '';

  constructor(options: NativeMeetingTranscriptionOptions = {}) {
    this.options = options;
  }

  get supported(): boolean {
    return Boolean(this.options.recognitionConstructor ?? getSpeechRecognitionConstructor());
  }

  get isRunning(): boolean {
    return this.active;
  }

  get currentState(): TranscriptionState {
    return this.state;
  }

  get interimText(): string {
    return this.interim;
  }

  /** Todo o texto reconhecido na sessão, já deduplicado. */
  get canonicalTranscript(): string {
    return this.finalSegments.join(' ').replace(/\s+/g, ' ').trim();
  }

  get finalSegmentCount(): number {
    return this.finalSegments.length;
  }

  start(): void {
    if (this.active) return;
    const Recognition = this.options.recognitionConstructor ?? getSpeechRecognitionConstructor();
    if (!Recognition) throw new Error('speech_recognition_unavailable');
    this.active = true;
    this.manualStop = false;
    this.restartAttempts = 0;
    this.restartWindowStartedAt = Date.now();
    this.setState('initializing');
    this.spawn(Recognition);
  }

  /** Pausa explícita do usuário: mantém o texto e não reinicia sozinho. */
  pause(): void {
    if (!this.active) return;
    this.teardown('stopping');
    this.setState('paused');
  }

  /** Parada definitiva (encerramento da reunião ou falha fatal). */
  stop(): void {
    if (!this.active && this.state !== 'paused') {
      this.teardown('stopping');
      this.setState('completed');
      return;
    }
    this.manualStop = true;
    this.teardown('stopping');
    this.setState('completed');
  }

  /**
   * Encerra aguardando um curto intervalo pelo último resultado final do
   * navegador antes de desmontar o reconhecimento.
   */
  async stopAndFlush(graceMs = 900): Promise<void> {
    if (!this.recognition) {
      this.stop();
      return;
    }
    this.manualStop = true;
    this.active = false;
    this.setState('stopping');
    this.clearRestartTimer();
    const recognition = this.recognition;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, graceMs);
      recognition.onend = finish;
      try {
        recognition.stop();
      } catch {
        finish();
      }
    });
    this.teardown('stopping');
    this.setState('completed');
  }

  /**
   * Retorna o texto final ainda não persistido, preservando o acumulado.
   */
  drain(): { transcript: string; confidence: number | null } {
    const pending = this.finalSegments.slice(this.drainedCount);
    this.drainedCount = this.finalSegments.length;
    this.interim = '';
    return {
      transcript: pending.join(' ').replace(/\s+/g, ' ').trim(),
      confidence: null,
    };
  }

  private setState(next: TranscriptionState): void {
    if (this.state === next) return;
    this.state = next;
    debugLog('state', next);
    this.options.onStateChange?.(next);
  }

  private clearRestartTimer(): void {
    if (!this.restartTimer) return;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private teardown(reason: TranscriptionState): void {
    this.active = false;
    this.startLock = false;
    this.clearRestartTimer();
    const recognition = this.recognition;
    this.recognition = null;
    this.interim = '';
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onaudiostart = null;
    recognition.onspeechstart = null;
    recognition.onspeechend = null;
    recognition.onaudioend = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      if (reason === 'stopping') recognition.stop();
      else recognition.abort();
    } catch {
      // O reconhecimento já pode ter encerrado sozinho.
    }
  }

  private appendFinal(text: string): void {
    const previous = this.finalSegments[this.finalSegments.length - 1] ?? '';
    const deduped = dedupeTranscriptOverlap(previous, text);
    if (!deduped) return;
    this.finalSegments.push(deduped);
    debugLog('final_segment', { count: this.finalSegments.length });
    this.options.onFinal?.(deduped, this.canonicalTranscript);
  }

  private scheduleRestart(Recognition: SpeechRecognitionConstructor): void {
    if (!this.active || this.manualStop) return;
    const now = Date.now();
    if (now - this.restartWindowStartedAt > RESTART_WINDOW_MS) {
      this.restartWindowStartedAt = now;
      this.restartAttempts = 0;
    }
    if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
      this.active = false;
      this.setState('error');
      this.options.onFatalError?.('speech_recognition_restart_exhausted');
      return;
    }
    const delays = this.options.restartDelaysMs ?? RESTART_BACKOFF_MS;
    const delay = delays[Math.min(this.restartAttempts, delays.length - 1)];
    this.restartAttempts += 1;
    this.setState('recovering');
    debugLog('restart_scheduled', { attempt: this.restartAttempts, delay });
    const schedule = this.options.scheduleRestart ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
    this.clearRestartTimer();
    this.restartTimer = schedule(() => {
      this.restartTimer = null;
      if (!this.active || this.manualStop) return;
      this.spawn(Recognition);
    }, delay) as ReturnType<typeof setTimeout>;
  }

  private spawn(Recognition: SpeechRecognitionConstructor): void {
    if (this.startLock) return;
    if (this.recognition) {
      // Nunca deixar duas instâncias competindo pelo microfone.
      const stale = this.recognition;
      this.recognition = null;
      stale.onend = null;
      stale.onerror = null;
      stale.onresult = null;
      try {
        stale.abort();
      } catch {
        // instância já encerrada
      }
    }
    this.startLock = true;

    const recognition = new Recognition();
    recognition.lang = this.options.lang ?? 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      this.startLock = false;
      debugLog('recognition_start');
      if (this.active) this.setState('listening');
    };

    recognition.onaudiostart = () => {
      if (this.active && this.state === 'initializing') this.setState('listening');
    };

    recognition.onspeechstart = () => {
      if (this.active) this.setState('speech_detected');
    };

    recognition.onspeechend = () => {
      if (this.active && this.state === 'speech_detected') this.setState('listening');
    };

    recognition.onaudioend = () => {
      // O ciclo de áudio pode fechar sozinho; `onend` decide o reinício.
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result?.[0];
        if (!alternative) continue;
        const text = alternative.transcript.trim();
        if (!text) continue;
        if (result.isFinal) {
          this.appendFinal(text);
          this.restartAttempts = 0;
        } else {
          interim = interim ? `${interim} ${text}` : text;
        }
      }
      this.interim = interim;
      this.options.onInterim?.(interim);
      if (this.active && this.state === 'recovering') this.setState('listening');
    };

    recognition.onerror = (event) => {
      const code = event.error;
      debugLog('recognition_error', code);
      if (FATAL_ERRORS.has(code)) {
        this.active = false;
        this.startLock = false;
        this.teardown('error');
        this.setState('error');
        this.options.onFatalError?.(code);
        return;
      }
      // 'no-speech', 'aborted', 'network', 'audio-capture' e 'bad-grammar'
      // são recuperáveis: `onend` cuida do reinício controlado.
      this.startLock = false;
      if (this.active) this.setState('recovering');
    };

    recognition.onend = () => {
      this.startLock = false;
      debugLog('recognition_end', { manualStop: this.manualStop, active: this.active });
      if (this.recognition === recognition) this.recognition = null;
      if (!this.active || this.manualStop) return;
      this.scheduleRestart(Recognition);
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch (error) {
      // InvalidStateError acontece quando o navegador ainda não liberou a
      // instância anterior: tratamos como reinício controlado.
      this.startLock = false;
      debugLog('recognition_start_failed', (error as Error)?.name);
      this.scheduleRestart(Recognition);
    }
  }
}
