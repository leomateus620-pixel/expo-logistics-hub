/**
 * Camada de diagnóstico da Inteligência de Reuniões.
 *
 * Registra, em memória e em ordem cronológica, o ciclo de vida real da captura
 * e do reconhecimento de fala. Nunca guarda transcrição, tokens ou credenciais:
 * apenas nomes de eventos, códigos de erro e metadados do runtime.
 */

export interface MeetingDiagnosticEvent {
  readonly at: number;
  readonly elapsedMs: number;
  readonly event: string;
  readonly detail?: Record<string, string | number | boolean | null>;
}

export interface MeetingRuntimeEnvironment {
  readonly origin: string;
  readonly secureContext: boolean;
  readonly topLevel: boolean;
  readonly userAgent: string;
  readonly hasSpeechRecognition: boolean;
  readonly hasWebkitSpeechRecognition: boolean;
  readonly selectedImplementation: 'SpeechRecognition' | 'webkitSpeechRecognition' | 'none';
  readonly hasMediaDevices: boolean;
}

export type MeetingCapabilityState =
  | 'supported_and_ready'
  | 'supported_requires_configuration'
  | 'unsupported_by_runtime';

const MAX_EVENTS = 400;

function readWindow(): (Window & Record<string, unknown>) | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as Window & Record<string, unknown>);
}

export function describeMeetingRuntime(): MeetingRuntimeEnvironment {
  const scope = readWindow();
  const hasStandard = Boolean(scope && 'SpeechRecognition' in scope && scope.SpeechRecognition);
  const hasWebkit = Boolean(scope && 'webkitSpeechRecognition' in scope && scope.webkitSpeechRecognition);
  let topLevel = true;
  try {
    topLevel = Boolean(scope) && scope!.top === scope!.self;
  } catch {
    // Acesso a window.top bloqueado significa contexto embutido cross-origin.
    topLevel = false;
  }
  return {
    origin: scope?.location?.origin ?? 'unknown',
    secureContext: Boolean(scope?.isSecureContext),
    topLevel,
    userAgent: scope?.navigator?.userAgent ?? 'unknown',
    hasSpeechRecognition: hasStandard,
    hasWebkitSpeechRecognition: hasWebkit,
    selectedImplementation: hasStandard ? 'SpeechRecognition' : hasWebkit ? 'webkitSpeechRecognition' : 'none',
    hasMediaDevices: Boolean(scope?.navigator?.mediaDevices?.getUserMedia),
  };
}

class MeetingDiagnosticsRecorder {
  private events: MeetingDiagnosticEvent[] = [];
  private startedAt = Date.now();
  private listeners = new Set<(events: MeetingDiagnosticEvent[]) => void>();
  private terminalReason: string | null = null;

  reset(): void {
    this.events = [];
    this.startedAt = Date.now();
    this.terminalReason = null;
    const environment = describeMeetingRuntime();
    this.record('ENVIRONMENT', {
      origin: environment.origin,
      secureContext: environment.secureContext,
      topLevel: environment.topLevel,
      userAgent: environment.userAgent.slice(0, 180),
      speechRecognition: environment.hasSpeechRecognition,
      webkitSpeechRecognition: environment.hasWebkitSpeechRecognition,
      implementation: environment.selectedImplementation,
      mediaDevices: environment.hasMediaDevices,
    });
  }

  record(event: string, detail?: Record<string, string | number | boolean | null | undefined>): void {
    const sanitized: Record<string, string | number | boolean | null> = {};
    if (detail) {
      for (const [key, value] of Object.entries(detail)) {
        if (value === undefined) continue;
        sanitized[key] = value;
      }
    }
    const entry: MeetingDiagnosticEvent = {
      at: Date.now(),
      elapsedMs: Date.now() - this.startedAt,
      event,
      detail: Object.keys(sanitized).length ? sanitized : undefined,
    };
    this.events.push(entry);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    if (isMeetingDebugEnabled()) {
      // eslint-disable-next-line no-console
      console.info(`[meeting-diag] ${entry.event}`, entry.detail ?? '');
    }
    for (const listener of this.listeners) listener(this.events.slice());
  }

  markTerminal(reason: string): void {
    this.terminalReason = reason;
    this.record('TERMINAL', { reason });
  }

  get terminal(): string | null {
    return this.terminalReason;
  }

  snapshot(): MeetingDiagnosticEvent[] {
    return this.events.slice();
  }

  subscribe(listener: (events: MeetingDiagnosticEvent[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.events.slice());
    return () => {
      this.listeners.delete(listener);
    };
  }

  toText(): string {
    const lines = this.events.map((entry) => {
      const detail = entry.detail
        ? ` ${Object.entries(entry.detail)
            .map(([key, value]) => `${key}=${String(value)}`)
            .join(' ')}`
        : '';
      return `+${String(entry.elapsedMs).padStart(6, '0')}ms ${entry.event}${detail}`;
    });
    return lines.join('\n');
  }
}

export const meetingDiagnostics = new MeetingDiagnosticsRecorder();

export function isMeetingDebugEnabled(): boolean {
  const scope = readWindow();
  if (!scope) return false;
  if ((scope as { __FENASOJA_MEETING_DEBUG__?: boolean }).__FENASOJA_MEETING_DEBUG__ === true) return true;
  try {
    if (new URLSearchParams(scope.location.search).get('meetingDebug') === '1') return true;
  } catch {
    // Ambientes sem location utilizável seguem sem depuração.
  }
  return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
}

export interface MeetingCapabilityEvaluation {
  readonly state: MeetingCapabilityState;
  readonly reason: string;
  readonly environment: MeetingRuntimeEnvironment;
}

/**
 * Três estados explícitos de capacidade — uma limitação do runtime nunca deve
 * ser apresentada como "falha terminal" da reunião.
 */
export function evaluateMeetingCapability(): MeetingCapabilityEvaluation {
  const environment = describeMeetingRuntime();
  if (environment.selectedImplementation === 'none') {
    return { state: 'unsupported_by_runtime', reason: 'speech_recognition_unavailable', environment };
  }
  if (!environment.secureContext) {
    return { state: 'supported_requires_configuration', reason: 'insecure_context', environment };
  }
  if (!environment.topLevel) {
    return { state: 'supported_requires_configuration', reason: 'embedded_context', environment };
  }
  if (!environment.hasMediaDevices) {
    return { state: 'supported_requires_configuration', reason: 'media_devices_unavailable', environment };
  }
  return { state: 'supported_and_ready', reason: 'ok', environment };
}
