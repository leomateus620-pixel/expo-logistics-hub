export type GoogleCalendarBackendStatus =
  | 'connected'
  | 'reconnect_required'
  | 'disconnected'
  | 'error'
  | 'starting'
  | 'waiting_authorization'
  | 'completing'
  | 'preparing_calendar'
  | 'synchronizing'
  | 'disconnecting';

export type GoogleCalendarFlowPhase =
  | 'idle'
  | 'starting'
  | 'waiting_oauth'
  | 'returning'
  | 'success'
  | 'cancelled'
  | 'disconnected_success';

export type GoogleCalendarUiStateId =
  | 'checking'
  | 'disconnected'
  | 'starting_connection'
  | 'waiting_oauth'
  | 'returning_from_oauth'
  | 'preparing_calendar'
  | 'connection_success'
  | 'initial_sync_queued'
  | 'initial_sync_in_progress'
  | 'connected'
  | 'pending_updates'
  | 'partial_failure'
  | 'temporary_failure'
  | 'authorization_cancelled'
  | 'authorization_not_confirmed'
  | 'authorization_revoked'
  | 'reconnect_required'
  | 'retry_in_progress'
  | 'disconnect_confirmation'
  | 'disconnecting'
  | 'disconnected_success'
  | 'fallback';

export type GoogleCalendarAction =
  | 'connect'
  | 'retry_connection'
  | 'retry_sync'
  | 'reconnect'
  | 'refresh'
  | 'open_calendar'
  | 'disconnect'
  | 'confirm_disconnect'
  | 'cancel_disconnect'
  | 'cancel_oauth'
  | 'none';

export type GoogleCalendarStateTone = 'neutral' | 'progress' | 'success' | 'warning' | 'danger';

export interface GoogleCalendarStateView {
  id: GoogleCalendarUiStateId;
  eyebrow: string;
  title: string;
  description: string;
  tone: GoogleCalendarStateTone;
  primaryAction: GoogleCalendarAction;
  primaryLabel?: string;
  secondaryAction?: GoogleCalendarAction;
  secondaryLabel?: string;
  busy: boolean;
  announce: string;
}

export interface GoogleCalendarConnectionSnapshot {
  status: GoogleCalendarBackendStatus | string;
  secondary_calendar_id?: string | null;
  verified_at?: string | null;
  backfill_total: number;
  backfill_done: number;
  error_code?: string | null;
}

export interface GoogleCalendarOutboxSummary {
  queued: number;
  inFlight: number;
  failed: number;
  deadLetter: number;
  reconnectRequired: number;
}

export interface DeriveGoogleCalendarStateInput {
  connection: GoogleCalendarConnectionSnapshot | null;
  pending: number;
  outbox?: Partial<GoogleCalendarOutboxSummary> | null;
  isLoading?: boolean;
  statusErrorCode?: string | null;
  flowErrorCode?: string | null;
  flowPhase?: GoogleCalendarFlowPhase;
  retrying?: boolean;
  disconnecting?: boolean;
  confirmingDisconnect?: boolean;
}

const view = (
  id: GoogleCalendarUiStateId,
  title: string,
  description: string,
  tone: GoogleCalendarStateTone,
  primaryAction: GoogleCalendarAction,
  primaryLabel?: string,
  secondaryAction?: GoogleCalendarAction,
  secondaryLabel?: string,
  busy = false,
): GoogleCalendarStateView => ({
  id,
  eyebrow: 'Integração de calendário',
  title,
  description,
  tone,
  primaryAction,
  primaryLabel,
  secondaryAction,
  secondaryLabel,
  busy,
  announce: `${title}. ${description}`,
});

const VIEWS: Record<GoogleCalendarUiStateId, GoogleCalendarStateView> = {
  checking: view(
    'checking',
    'Verificando conexão',
    'Estamos confirmando o estado da sua agenda.',
    'progress',
    'none',
    undefined,
    undefined,
    undefined,
    true,
  ),
  disconnected: view(
    'disconnected',
    'Conecte sua agenda',
    'Receba automaticamente os eventos relacionados às suas comissões.',
    'neutral',
    'connect',
    'Conectar Google Agenda',
  ),
  starting_connection: view(
    'starting_connection',
    'Preparando conexão',
    'Estamos abrindo a autorização segura do Google.',
    'progress',
    'none',
    'Preparando…',
    undefined,
    undefined,
    true,
  ),
  waiting_oauth: view(
    'waiting_oauth',
    'Autorize sua conta Google',
    'Conclua a autorização na janela aberta para continuar.',
    'progress',
    'none',
    'Aguardando autorização',
    'cancel_oauth',
    'Cancelar',
    true,
  ),
  returning_from_oauth: view(
    'returning_from_oauth',
    'Confirmando autorização',
    'Aguarde enquanto validamos a conexão com segurança.',
    'progress',
    'none',
    'Confirmando…',
    undefined,
    undefined,
    true,
  ),
  preparing_calendar: view(
    'preparing_calendar',
    'Preparando o calendário FENASOJA',
    'A conta já foi validada. Estamos criando ou recuperando o calendário secundário.',
    'progress',
    'none',
    'Preparando calendário…',
    undefined,
    undefined,
    true,
  ),
  connection_success: view(
    'connection_success',
    'Google Agenda conectado',
    'A autorização foi confirmada. A sincronização começará em seguida.',
    'success',
    'none',
    undefined,
    undefined,
    undefined,
    true,
  ),
  initial_sync_queued: view(
    'initial_sync_queued',
    'Sincronização programada',
    'Seus eventos estão na fila segura de sincronização.',
    'progress',
    'none',
    undefined,
    'disconnect',
    'Desconectar',
    true,
  ),
  initial_sync_in_progress: view(
    'initial_sync_in_progress',
    'Sincronizando seus eventos',
    'Estamos adicionando os eventos das suas comissões à sua agenda.',
    'progress',
    'none',
    undefined,
    'disconnect',
    'Desconectar',
    true,
  ),
  connected: view(
    'connected',
    'Google Agenda conectado',
    'Seus eventos estão sendo sincronizados automaticamente.',
    'success',
    'open_calendar',
    'Abrir Google Agenda',
    'disconnect',
    'Desconectar',
  ),
  pending_updates: view(
    'pending_updates',
    'Atualizando sua agenda',
    'Há alterações recentes sendo sincronizadas em segundo plano.',
    'progress',
    'open_calendar',
    'Abrir Google Agenda',
    'disconnect',
    'Desconectar',
    true,
  ),
  partial_failure: view(
    'partial_failure',
    'Alguns eventos não foram sincronizados',
    'Sua conexão continua ativa. Tente novamente ou consulte os detalhes.',
    'warning',
    'retry_sync',
    'Tentar novamente',
    'disconnect',
    'Desconectar',
  ),
  temporary_failure: view(
    'temporary_failure',
    'Não foi possível atualizar agora',
    'A conexão pode estar temporariamente indisponível. Tente novamente.',
    'warning',
    'refresh',
    'Verificar novamente',
  ),
  authorization_cancelled: view(
    'authorization_cancelled',
    'Conexão cancelada',
    'Nada foi alterado. Você pode iniciar a autorização novamente quando quiser.',
    'neutral',
    'retry_connection',
    'Tentar novamente',
  ),
  authorization_not_confirmed: view(
    'authorization_not_confirmed',
    'Conexão não finalizada',
    'A autorização não foi confirmada pelo Google Agenda. Inicie a conexão novamente.',
    'warning',
    'retry_connection',
    'Tentar novamente',
  ),
  authorization_revoked: view(
    'authorization_revoked',
    'Autorização removida',
    'O Google não permite mais a sincronização desta conta. Autorize-a novamente.',
    'danger',
    'reconnect',
    'Reconectar conta',
  ),
  reconnect_required: view(
    'reconnect_required',
    'Reconexão necessária',
    'Sua autorização expirou ou foi removida. Reconecte sua conta para continuar sincronizando.',
    'warning',
    'reconnect',
    'Reconectar conta',
  ),
  retry_in_progress: view(
    'retry_in_progress',
    'Tentando sincronizar novamente',
    'Vamos reprocessar somente os eventos que precisam de atenção.',
    'progress',
    'none',
    'Tentando novamente…',
    undefined,
    undefined,
    true,
  ),
  disconnect_confirmation: view(
    'disconnect_confirmation',
    'Desconectar o Google Agenda?',
    'Novas alterações deixarão de ser sincronizadas. Seus eventos atuais serão preservados no Google.',
    'warning',
    'confirm_disconnect',
    'Sim, desconectar',
    'cancel_disconnect',
    'Manter conexão',
  ),
  disconnecting: view(
    'disconnecting',
    'Desconectando com segurança',
    'Estamos encerrando a sincronização desta conta.',
    'progress',
    'none',
    'Desconectando…',
    undefined,
    undefined,
    true,
  ),
  disconnected_success: view(
    'disconnected_success',
    'Google Agenda desconectado',
    'A sincronização foi encerrada e os eventos existentes foram preservados.',
    'success',
    'connect',
    'Conectar novamente',
  ),
  fallback: view(
    'fallback',
    'Verifique sua conexão',
    'Recebemos um estado inesperado, mas você pode atualizar a verificação com segurança.',
    'warning',
    'refresh',
    'Atualizar estado',
  ),
};

export function deriveGoogleCalendarState({
  connection,
  pending,
  outbox,
  isLoading = false,
  statusErrorCode,
  flowErrorCode,
  flowPhase = 'idle',
  retrying = false,
  disconnecting = false,
  confirmingDisconnect = false,
}: DeriveGoogleCalendarStateInput): GoogleCalendarStateView {
  const providerNeedsReconnect = (code?: string | null) => [
    'provider_unauthorized',
    'provider_bad_request',
    'provider_rejected',
    'provider_not_found',
    'calendar_not_verified',
  ].includes(code ?? '');

  if (disconnecting) return VIEWS.disconnecting;
  if (confirmingDisconnect) return VIEWS.disconnect_confirmation;
  if (retrying) return VIEWS.retry_in_progress;
  if (flowPhase === 'starting') return VIEWS.starting_connection;
  if (flowPhase === 'waiting_oauth') return VIEWS.waiting_oauth;
  if (flowPhase === 'returning') return VIEWS.returning_from_oauth;
  if (flowPhase === 'success') return VIEWS.connection_success;
  if (flowPhase === 'cancelled' || flowErrorCode === 'authorization_cancelled') {
    return VIEWS.authorization_cancelled;
  }
  if (flowPhase === 'disconnected_success') return VIEWS.disconnected_success;
  if (isLoading) return VIEWS.checking;
  if (flowErrorCode === 'authorization_not_confirmed' || flowErrorCode === 'invalid_callback' || flowErrorCode === 'callback_replayed') {
    return VIEWS.authorization_not_confirmed;
  }
  if (flowErrorCode === 'authorization_expired' || providerNeedsReconnect(flowErrorCode)) return VIEWS.reconnect_required;
  if (statusErrorCode || flowErrorCode) return VIEWS.temporary_failure;
  if (!connection) return VIEWS.disconnected;

  if (connection.error_code === 'authorization_not_confirmed') return VIEWS.authorization_not_confirmed;
  if (connection.status === 'starting') return VIEWS.starting_connection;
  if (connection.status === 'waiting_authorization') return VIEWS.waiting_oauth;
  if (connection.status === 'completing') return VIEWS.returning_from_oauth;
  if (connection.status === 'preparing_calendar') return VIEWS.preparing_calendar;
  if (connection.status === 'disconnecting') return VIEWS.disconnecting;
  if (connection.status === 'disconnected') return VIEWS.disconnected;
  if (connection.status === 'reconnect_required') {
    return connection.error_code === 'authorization_revoked'
      ? VIEWS.authorization_revoked
      : VIEWS.reconnect_required;
  }
  if (connection.status === 'error') {
    if (connection.error_code === 'authorization_revoked') return VIEWS.authorization_revoked;
    if (connection.error_code === 'authorization_not_confirmed') return VIEWS.authorization_not_confirmed;
    if (connection.error_code === 'authorization_expired') return VIEWS.reconnect_required;
    if (providerNeedsReconnect(connection.error_code)) return VIEWS.reconnect_required;
    return VIEWS.temporary_failure;
  }
  if (!['connected', 'synchronizing'].includes(connection.status)) return VIEWS.fallback;
  if (!connection.secondary_calendar_id || !connection.verified_at) return VIEWS.authorization_not_confirmed;

  const queue = {
    queued: outbox?.queued ?? 0,
    inFlight: outbox?.inFlight ?? 0,
    failed: outbox?.failed ?? 0,
    deadLetter: outbox?.deadLetter ?? 0,
    reconnectRequired: outbox?.reconnectRequired ?? 0,
  };
  if (queue.reconnectRequired > 0) return VIEWS.reconnect_required;
  if (queue.failed + queue.deadLetter > 0) return VIEWS.partial_failure;

  const total = Math.max(0, connection.backfill_total || 0);
  const done = Math.max(0, connection.backfill_done || 0);
  if (total > 0 && done === 0 && pending > 0) return VIEWS.initial_sync_queued;
  if (total > 0 && done < total) return VIEWS.initial_sync_in_progress;
  if (pending > 0 || queue.queued + queue.inFlight > 0) return VIEWS.pending_updates;
  return VIEWS.connected;
}

export function getGoogleCalendarStateView(id: GoogleCalendarUiStateId) {
  return VIEWS[id];
}
