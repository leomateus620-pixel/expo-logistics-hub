import type { AgendaMeetingCapturePhase, AgendaMeetingSessionSummary } from '@/features/agenda-meeting-intelligence/types';

export const MEETING_CONSENT_VERSION = 'fenasoja-agenda-meeting-consent-v2-audio';
export const COLLAPSE_NOTICE = 'A gravação continua. Você pode reabrir o painel a qualquer momento.';

export const CAPTURE_PHASE_LABELS: Record<AgendaMeetingCapturePhase, string> = {
  idle: 'Pronto',
  requesting_permission: 'Solicitando microfone',
  starting: 'Iniciando',
  recording: 'Gravando',
  paused: 'Pausada',
  backpressure_paused: 'Pausada por segurança',
  finalizing: 'Finalizando',
  awaiting_transcripts: 'Enviando áudio',
  analysis_queued: 'Gerando relatório',
  review_required: 'Concluída',
  completed: 'Concluída',
  capture_interrupted: 'Gravação interrompida',
  recoverable_error: 'Ação necessária',
  fatal_error: 'Falha',
};

export function formatDuration(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1_000));
  return [Math.floor(total / 3_600), Math.floor((total % 3_600) / 60), total % 60]
    .map((part) => String(part).padStart(2, '0')).join(':');
}

export function formatClock(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

export function formatDateTime(value: string | null): string {
  if (!value) return 'Data não registrada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não registrada';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
}

/** Maps technical codes to messages a meeting organiser can act on. */
export function meetingErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case 'microphone_permission_denied':
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'O acesso ao microfone foi negado. Libere a permissão no navegador e tente de novo.';
    case 'NotFoundError':
    case 'audio_track_unavailable':
      return 'Nenhum microfone foi encontrado neste dispositivo.';
    case 'capture_backend_unavailable':
    case 'supported_audio_capture_unavailable':
    case 'media_devices_unavailable':
      return 'Este navegador não permite gravar áudio nesta página. Atualize o navegador ou abra o sistema em uma aba própria.';
    case 'meeting_capture_already_active':
      return 'Há uma reunião em gravação. Finalize-a antes de iniciar outra.';
    case 'meeting_capture_active_other_tab':
      return 'Há uma reunião em gravação em outra aba deste navegador.';
    case 'meeting_capture_active_elsewhere':
      return 'Você já está gravando uma reunião em outro dispositivo ou aba.';
    case 'meeting_audio_pipeline_disabled':
      return 'Novas gravações estão temporariamente desativadas pela administração.';
    case 'backlog_capacity_reached':
      return 'A gravação foi pausada para proteger as partes de áudio que ainda não foram enviadas.';
    case 'session_expired':
      return 'Sua sessão expirou. Entre novamente para continuar; o áudio já salvo neste dispositivo foi mantido.';
    case 'network_error':
    case 'request_timeout':
      return 'Sem conexão com o servidor. As partes de áudio ficam guardadas neste dispositivo e serão enviadas ao reconectar.';
    case 'meeting_consent_required':
      return 'Confirme que os participantes foram informados antes de iniciar.';
    case 'forbidden':
      return 'Você não tem permissão para esta ação nesta reunião.';
    case 'version_conflict':
      return 'A reunião foi atualizada em outro dispositivo. Atualize e tente de novo.';
    case 'invalid_meeting_state':
      return 'Esta reunião já foi encerrada ou cancelada.';
    case 'meeting_not_found':
      return 'A reunião não foi encontrada. Atualize o histórico.';
    case 'meeting_duration_limit_reached':
    case 'max_duration':
      return 'A reunião atingiu o limite de 4 horas de gravação ativa. Finalize para gerar a transcrição.';
    case 'meeting_audio_budget_exceeded':
      return 'A reunião atingiu o volume máximo de áudio permitido. Finalize para gerar a transcrição.';
    case 'meeting_report_limit_reached':
      return 'O limite de versões do relatório desta reunião foi atingido.';
    case 'meeting_report_already_queued':
      return 'Já existe um relatório sendo gerado para esta reunião.';
    case 'meeting_partial_confirmation_required':
      return 'A transcrição tem lacunas. Confirme que deseja um relatório parcial.';
    case 'meeting_transcript_has_no_speech':
    case 'analysis_transcript_has_no_speech':
      return 'Nenhuma fala foi identificada nesta reunião, por isso não há relatório.';
    case 'analysis_configuration_missing':
    case 'analysis_model_not_enabled':
      return 'Relatório pendente de configuração: o modelo GPT-6.1 Sol não está disponível para este projeto.';
    case 'transcription_configuration_missing':
    case 'transcription_model_not_enabled':
      return 'Transcrição pendente de configuração: o modelo Gemini 3.5 Transcribe não está disponível para este projeto.';
    case 'analysis_credits_exhausted':
    case 'transcription_credits_exhausted':
      return 'Os créditos de IA do workspace acabaram ou atingiram o limite. Após recarregar, use "Tentar novamente".';
    case 'meeting_persistence_failed':
      return 'O serviço de reuniões está indisponível no momento. Tente novamente em instantes.';
    default:
      if (code?.startsWith('transcription_')) return 'A transcrição de parte do áudio falhou. O áudio continua guardado e pode ser processado novamente.';
      if (code?.startsWith('analysis_')) return 'A geração do relatório falhou. A transcrição foi preservada e o relatório pode ser gerado novamente.';
      if (code?.startsWith('meeting_export')) return 'Não foi possível gerar o arquivo. Tente baixar novamente.';
      return 'Não foi possível concluir esta etapa. Nada foi descartado; tente novamente.';
  }
}

export function errorCodeOf(error: unknown): string {
  if (error && typeof error === 'object') {
    const record = error as { code?: unknown; name?: unknown; message?: unknown };
    if (typeof record.code === 'string') return record.code;
    if (typeof record.name === 'string' && ['NotAllowedError', 'PermissionDeniedError', 'NotFoundError', 'SecurityError'].includes(record.name)) {
      return record.name === 'SecurityError' ? 'NotAllowedError' : record.name;
    }
    if (typeof record.message === 'string') return record.message;
  }
  return 'unknown';
}

export type ServerStage =
  | 'recording'
  | 'paused'
  | 'interrupted'
  | 'transcribing'
  | 'generating_report'
  | 'report_ready'
  | 'reviewed'
  | 'no_speech'
  | 'needs_gap_decision'
  | 'partial_transcript'
  | 'transcript_ready'
  | 'failed'
  | 'cancelled';

export const SERVER_STAGE_LABELS: Record<ServerStage, string> = {
  recording: 'Gravando',
  paused: 'Pausada',
  interrupted: 'Gravação interrompida',
  transcribing: 'Finalizando transcrição',
  generating_report: 'Gerando relatório',
  report_ready: 'Relatório pronto · revisão pendente',
  reviewed: 'Concluída',
  no_speech: 'Nenhuma fala identificada',
  needs_gap_decision: 'Áudio incompleto',
  partial_transcript: 'Transcrição com lacunas',
  transcript_ready: 'Transcrição pronta',
  failed: 'Falha recuperável',
  cancelled: 'Cancelada',
};

export function serverStageOf(session: AgendaMeetingSessionSummary & {
  errorCode?: string | null;
  retryableStage?: string | null;
  unresolvedSequences?: number[];
  reportQueued?: boolean;
}): ServerStage {
  if (session.state === 'cancelled') return 'cancelled';
  if (session.captureState === 'recording') return 'recording';
  if (session.captureState === 'paused') return 'paused';
  if (session.captureState === 'interrupted') return 'interrupted';
  if (session.errorCode === 'analysis_transcript_has_no_speech') return 'no_speech';
  if (session.state === 'failed') return 'failed';
  if (session.reportQueued || session.state === 'analysis_queued' || session.state === 'analyzing') return 'generating_report';
  if (session.state === 'completed') return 'reviewed';
  if (session.state === 'review_required') return 'report_ready';
  if (session.state === 'transcript_ready_with_gaps') return 'partial_transcript';
  if (session.state === 'transcript_ready') return 'transcript_ready';
  return 'transcribing';
}
