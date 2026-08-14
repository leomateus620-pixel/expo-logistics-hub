/**
 * Reconhecimento de fala 100% nativo do navegador (Web Speech API).
 * Nenhum áudio sai do dispositivo: apenas o texto reconhecido é entregue.
 */

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
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported']);

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

export interface NativeMeetingTranscriptionOptions {
  lang?: string;
  onInterim?: (text: string) => void;
  onFatalError?: (code: string) => void;
  recognitionConstructor?: SpeechRecognitionConstructor;
}

export class NativeMeetingTranscriptionAdapter {
  private readonly options: NativeMeetingTranscriptionOptions;
  private recognition: SpeechRecognitionLike | null = null;
  private running = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private buffer: string[] = [];
  private confidences: number[] = [];
  private interim = '';

  constructor(options: NativeMeetingTranscriptionOptions = {}) {
    this.options = options;
  }

  get supported(): boolean {
    return Boolean(this.options.recognitionConstructor ?? getSpeechRecognitionConstructor());
  }

  get isRunning(): boolean {
    return this.running;
  }

  get interimText(): string {
    return this.interim;
  }

  start(): void {
    if (this.running) return;
    const Recognition = this.options.recognitionConstructor ?? getSpeechRecognitionConstructor();
    if (!Recognition) throw new Error('speech_recognition_unavailable');
    this.running = true;
    this.spawn(Recognition);
  }

  stop(): void {
    this.running = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const recognition = this.recognition;
    this.recognition = null;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      // O reconhecimento já pode ter encerrado sozinho.
    }
  }

  /** Retorna o texto final acumulado desde a última chamada e zera o buffer. */
  drain(): { transcript: string; confidence: number | null } {
    const transcript = this.buffer.join(' ').replace(/\s+/g, ' ').trim();
    const confidence = this.confidences.length
      ? this.confidences.reduce((sum, value) => sum + value, 0) / this.confidences.length
      : null;
    this.buffer = [];
    this.confidences = [];
    this.interim = '';
    return { transcript, confidence };
  }

  private spawn(Recognition: SpeechRecognitionConstructor): void {
    const recognition = new Recognition();
    recognition.lang = this.options.lang ?? 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternative = result?.[0];
        if (!alternative) continue;
        const text = alternative.transcript.trim();
        if (!text) continue;
        if (result.isFinal) {
          this.buffer.push(text);
          if (Number.isFinite(alternative.confidence) && alternative.confidence > 0) {
            this.confidences.push(alternative.confidence);
          }
        } else {
          interim = interim ? `${interim} ${text}` : text;
        }
      }
      this.interim = interim;
      this.options.onInterim?.(interim);
    };

    recognition.onerror = (event) => {
      if (FATAL_ERRORS.has(event.error)) {
        this.running = false;
        this.options.onFatalError?.(event.error);
      }
      // 'no-speech', 'aborted' e 'network' são transitórios: onend reinicia.
    };

    recognition.onend = () => {
      if (!this.running) return;
      this.restartTimer = setTimeout(() => {
        if (!this.running) return;
        try {
          this.spawn(Recognition);
        } catch {
          this.running = false;
          this.options.onFatalError?.('speech_recognition_restart_failed');
        }
      }, 250);
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      // start() lança se já houver reconhecimento ativo; onend cuidará do ciclo.
    }
  }
}
