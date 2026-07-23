import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useToast } from '@/hooks/use-toast';
import type {
  GoogleCalendarBackendStatus,
  GoogleCalendarFlowPhase,
  GoogleCalendarOutboxSummary,
} from '@/lib/google-calendar-state';

export interface GoogleCalendarConnection {
  user_id: string;
  org_id: string;
  google_email: string | null;
  secondary_calendar_id: string | null;
  status: GoogleCalendarBackendStatus;
  last_sync_at: string | null;
  error_code: string | null;
  backfill_total: number;
  backfill_done: number;
  connected_at: string | null;
  verified_at: string | null;
}

export interface GoogleStatusResponse {
  connection: GoogleCalendarConnection | null;
  pending: number;
  outbox: GoogleCalendarOutboxSummary;
}

type GoogleCalendarErrorCode =
  | 'authorization_cancelled'
  | 'authorization_expired'
  | 'authorization_failed'
  | 'authorization_not_confirmed'
  | 'authorization_revoked'
  | 'backfill_failed'
  | 'calendar_not_verified'
  | 'calendar_preparation_failed'
  | 'google_api_disabled'
  | 'google_insufficient_scope'
  | 'google_rate_limited'
  | 'google_unauthorized'
  | 'google_unavailable'
  | 'no_active_organization'
  | 'oauth_callback_replayed'
  | 'oauth_client_mismatch'
  | 'oauth_code_expired'
  | 'oauth_code_invalid'
  | 'oauth_popup_blocked'
  | 'oauth_state_expired'
  | 'oauth_state_invalid'
  | 'oauth_url_missing'
  | 'provider_bad_request'
  | 'provider_conflict'
  | 'provider_not_found'
  | 'provider_rate_limited'
  | 'provider_rejected'
  | 'provider_unauthorized'
  | 'provider_unavailable'
  | 'refresh_token_invalid'
  | 'refresh_token_missing'
  | 'request_failed'
  | 'session_expired';

class GoogleCalendarFlowError extends Error {
  readonly code: GoogleCalendarErrorCode;

  constructor(code: GoogleCalendarErrorCode) {
    super(code);
    this.name = 'GoogleCalendarFlowError';
    this.code = code;
  }
}

const SAFE_ERROR_COPY: Record<GoogleCalendarErrorCode, string> = {
  authorization_cancelled: 'A autorização foi cancelada. Nenhuma alteração foi feita.',
  authorization_expired: 'A autorização expirou. Inicie a conexão novamente.',
  authorization_failed: 'O Google não confirmou a autorização. Inicie a conexão novamente.',
  authorization_not_confirmed: 'A autorização ainda não foi confirmada pelo servidor.',
  authorization_revoked: 'O Google revogou o acesso. Reconecte sua conta.',
  backfill_failed: 'A conta foi conectada, mas a sincronização inicial não pôde ser preparada.',
  calendar_not_verified: 'O calendário FENASOJA não está acessível. Reconecte sua conta.',
  calendar_preparation_failed: 'A conta foi autorizada, mas o calendário FENASOJA não pôde ser preparado.',
  google_api_disabled: 'A API do Google Agenda está desativada nesta conta. Ative-a e reconecte.',
  google_insufficient_scope: 'A conta não concedeu os escopos necessários. Reconecte marcando todas as permissões.',
  google_rate_limited: 'O Google limitou temporariamente as solicitações. Tente novamente em instantes.',
  google_unauthorized: 'O Google não autorizou o acesso à agenda. Verifique as permissões e reconecte.',
  google_unavailable: 'O Google Agenda está temporariamente indisponível. Tente novamente.',
  no_active_organization: 'Selecione uma organização antes de conectar sua conta Google.',
  oauth_callback_replayed: 'Este retorno de autorização já foi utilizado. Inicie uma nova conexão.',
  oauth_client_mismatch: 'A configuração do cliente OAuth do Google está incorreta. Contate o suporte.',
  oauth_code_expired: 'O código do Google expirou. Inicie a conexão novamente.',
  oauth_code_invalid: 'O código do Google é inválido. Inicie a conexão novamente.',
  oauth_popup_blocked: 'Permita pop-ups neste site para abrir a autorização do Google.',
  oauth_state_expired: 'O tempo da autorização expirou. Inicie a conexão novamente.',
  oauth_state_invalid: 'O retorno da autorização não pôde ser validado. Inicie a conexão novamente.',
  oauth_url_missing: 'O serviço de autorização não respondeu como esperado.',
  provider_bad_request: 'O Google rejeitou a validação da agenda. Reconecte sua conta.',
  provider_conflict: 'O Google retornou conflito ao preparar a agenda. Tente novamente.',
  provider_not_found: 'O calendário do Google não foi encontrado. Reconecte sua conta.',
  provider_rate_limited: 'O Google limitou temporariamente as solicitações. Tente novamente em instantes.',
  provider_rejected: 'O Google rejeitou a validação da agenda. Reconecte sua conta.',
  provider_unauthorized: 'O Google não autorizou o acesso à agenda. Verifique as permissões e reconecte.',
  provider_unavailable: 'O Google Agenda está temporariamente indisponível. Tente novamente.',
  refresh_token_invalid: 'A autorização do Google foi revogada. Reconecte sua conta.',
  refresh_token_missing: 'O Google não devolveu o refresh token. Reconecte marcando "sempre pedir" nas permissões.',
  request_failed: 'O serviço está temporariamente indisponível. Tente novamente em instantes.',
  session_expired: 'Sua sessão expirou. Entre novamente antes de conectar sua conta.',
};

const GOOGLE_OAUTH_POPUP_FEATURES = 'width=540,height=720,resizable=yes,scrollbars=yes';
const VERIFIED_STATUSES: GoogleCalendarBackendStatus[] = ['connected', 'synchronizing'];
const IN_PROGRESS_STATUSES: GoogleCalendarBackendStatus[] = [
  'starting',
  'waiting_authorization',
  'completing',
  'preparing_calendar',
  'synchronizing',
];

const isKnownErrorCode = (value: unknown): value is GoogleCalendarErrorCode =>
  typeof value === 'string' && value in SAFE_ERROR_COPY;

async function getValidatedAccessToken() {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new GoogleCalendarFlowError('session_expired');
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) throw new GoogleCalendarFlowError('session_expired');
  return token;
}

async function readFunctionErrorCode(error: unknown): Promise<GoogleCalendarErrorCode> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: unknown };
      if (isKnownErrorCode(payload.error)) return payload.error;
    } catch { /* fall through */ }
  }
  const message = String((error as Error)?.message ?? '').toLowerCase();
  if (message.includes('unauthorized')) return 'session_expired';
  return 'request_failed';
}

async function invoke<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const accessToken = await getValidatedAccessToken();
  const { data, error } = await supabase.functions.invoke('google-calendar-oauth', {
    body: { action, ...body },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) throw new GoogleCalendarFlowError(await readFunctionErrorCode(error));
  if (data && typeof data === 'object' && isKnownErrorCode((data as { error?: unknown }).error)) {
    throw new GoogleCalendarFlowError((data as { error: GoogleCalendarErrorCode }).error);
  }
  return data as T;
}

interface CompleteResponse {
  ok: boolean;
  calendarId?: string;
  backfill?: number;
}

interface PopupMessage {
  type: 'fenasoja:google-calendar-oauth';
  status: 'success' | 'cancelled' | 'failed';
  code?: string;
  attemptId?: string | null;
}

function waitForPopupResult(popup: Window): Promise<PopupMessage | { status: 'closed' }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: PopupMessage | { status: 'closed' }) => {
      if (settled) return;
      settled = true;
      window.clearInterval(interval);
      window.removeEventListener('message', onMessage);
      resolve(result);
    };
    const onMessage = (event: MessageEvent<PopupMessage>) => {
      if (event.origin !== window.location.origin || event.source !== popup) return;
      if (event.data?.type !== 'fenasoja:google-calendar-oauth') return;
      finish(event.data);
    };
    const interval = window.setInterval(() => {
      if (popup.closed) finish({ status: 'closed' });
    }, 400);
    window.addEventListener('message', onMessage);
  });
}

const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export function useGoogleCalendarConnection() {
  const { user } = useAuth();
  const { orgId } = useCurrentOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const [flowPhase, setFlowPhase] = useState<GoogleCalendarFlowPhase>('idle');
  const [flowErrorCode, setFlowErrorCode] = useState<GoogleCalendarErrorCode | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const connectPromiseRef = useRef<Promise<CompleteResponse> | null>(null);
  const popupRef = useRef<Window | null>(null);
  const activeAttemptRef = useRef<string | null>(null);
  const oauthCancelledRef = useRef(false);
  const phaseTimerRef = useRef<number | null>(null);
  const refreshPromiseRef = useRef<Promise<unknown> | null>(null);

  const queryKey = useMemo(
    () => ['google-calendar-status', userId, orgId] as const,
    [orgId, userId],
  );
  const invalidateStatus = useCallback(
    () => queryClient.invalidateQueries({ queryKey }),
    [queryClient, queryKey],
  );

  const status = useQuery({
    queryKey,
    queryFn: () => invoke<GoogleStatusResponse>('status', { orgId }),
    enabled: Boolean(userId && orgId),
    retry: (failureCount, error) =>
      !(error instanceof GoogleCalendarFlowError && error.code === 'session_expired') && failureCount < 1,
    refetchInterval: (query) => {
      if (query.state.error) return false;
      const data = query.state.data as GoogleStatusResponse | undefined;
      if (data?.connection && IN_PROGRESS_STATUSES.includes(data.connection.status)) return 3000;
      if ((data?.pending ?? 0) > 0) return 8000;
      return 60000;
    },
  });

  const waitForBackendConfirmation = useCallback(async (activeOrgId: string, attempts = 60) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const result = await invoke<GoogleStatusResponse>('status', { orgId: activeOrgId });
      const connection = result.connection;
      if (
        connection
        && VERIFIED_STATUSES.includes(connection.status)
        && connection.secondary_calendar_id
        && connection.verified_at
      ) {
        return {
          ok: true,
          calendarId: connection.secondary_calendar_id,
          backfill: connection.backfill_total,
        } satisfies CompleteResponse;
      }
      if (connection?.status === 'error' || connection?.status === 'reconnect_required') {
        throw new GoogleCalendarFlowError(
          isKnownErrorCode(connection.error_code) ? connection.error_code : 'authorization_failed',
        );
      }
      if (connection && !IN_PROGRESS_STATUSES.includes(connection.status)) {
        throw new GoogleCalendarFlowError('authorization_not_confirmed');
      }
      await delay(attempt < 10 ? 800 : 1500);
    }
    throw new GoogleCalendarFlowError('authorization_not_confirmed');
  }, []);

  const connect = useMutation({
    mutationFn: async (preOpenedPopup?: Window | null) => {
      if (connectPromiseRef.current) return connectPromiseRef.current;
      const operation = (async () => {
        let preparedPopup = preOpenedPopup && !preOpenedPopup.closed ? preOpenedPopup : null;
        try {
          if (!orgId) throw new GoogleCalendarFlowError('no_active_organization');
          oauthCancelledRef.current = false;
          activeAttemptRef.current = null;
          setFlowErrorCode(null);
          setFlowPhase('starting');

          const oauth = await invoke<{
            authorization_url?: string;
            attempt_id?: string;
          }>('start', { orgId });
          if (!oauth.authorization_url || !oauth.attempt_id) {
            throw new GoogleCalendarFlowError('oauth_url_missing');
          }
          activeAttemptRef.current = oauth.attempt_id;

          if (preparedPopup) preparedPopup.location.href = oauth.authorization_url;
          else preparedPopup = window.open(oauth.authorization_url, 'fenasoja-google-oauth', GOOGLE_OAUTH_POPUP_FEATURES);
          if (!preparedPopup) throw new GoogleCalendarFlowError('oauth_popup_blocked');
          popupRef.current = preparedPopup;
          preparedPopup.focus();
          setFlowPhase('waiting_oauth');

          const popupResult = await waitForPopupResult(preparedPopup);
          popupRef.current = null;
          if (oauthCancelledRef.current || popupResult.status === 'cancelled') {
            throw new GoogleCalendarFlowError('authorization_cancelled');
          }
          if (popupResult.status === 'failed') {
            throw new GoogleCalendarFlowError(
              isKnownErrorCode(popupResult.code) ? popupResult.code : 'authorization_failed',
            );
          }

          setFlowPhase('returning');
          return await waitForBackendConfirmation(orgId, popupResult.status === 'closed' ? 60 : 30);
        } catch (error) {
          if (preparedPopup && !preparedPopup.closed) preparedPopup.close();
          const attemptId = activeAttemptRef.current;
          const code = error instanceof GoogleCalendarFlowError ? error.code : 'request_failed';
          if (attemptId && code === 'authorization_cancelled') {
            await invoke('cancel', { attemptId }).catch(() => undefined);
          }
          throw error;
        } finally {
          popupRef.current = null;
        }
      })();

      connectPromiseRef.current = operation;
      try { return await operation; }
      finally {
        connectPromiseRef.current = null;
        activeAttemptRef.current = null;
      }
    },
    onSuccess: (data) => {
      const total = data.backfill ?? 0;
      setFlowPhase('success');
      setFlowErrorCode(null);
      toast({
        title: 'Google Agenda conectado',
        description: total > 0
          ? `${total} evento${total === 1 ? '' : 's'} entrou${total === 1 ? '' : 'aram'} na sincronização inicial.`
          : 'A conta e o calendário FENASOJA foram verificados com segurança.',
      });
      void invalidateStatus();
      if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = window.setTimeout(() => setFlowPhase('idle'), 1400);
    },
    onError: (error: Error) => {
      const code = error instanceof GoogleCalendarFlowError ? error.code : 'request_failed';
      setFlowErrorCode(code);
      setFlowPhase(code === 'authorization_cancelled' ? 'cancelled' : 'idle');
      toast({
        title: code === 'authorization_cancelled' ? 'Conexão cancelada' : 'Não foi possível conectar',
        description: SAFE_ERROR_COPY[code],
        variant: code === 'authorization_cancelled' ? 'default' : 'destructive',
      });
      void invalidateStatus();
    },
  });

  const cancelOAuth = useCallback(() => {
    oauthCancelledRef.current = true;
    popupRef.current?.close();
    popupRef.current = null;
    const attemptId = activeAttemptRef.current;
    if (attemptId) void invoke('cancel', { attemptId }).catch(() => undefined);
    setFlowPhase('cancelled');
    setFlowErrorCode('authorization_cancelled');
  }, []);

  const refreshStatus = useCallback(() => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    setIsRefreshing(true);
    const operation = status.refetch().finally(() => {
      if (refreshPromiseRef.current === operation) refreshPromiseRef.current = null;
      setIsRefreshing(false);
    });
    refreshPromiseRef.current = operation;
    return operation;
  }, [status]);

  const retry = useMutation({
    mutationFn: () => {
      if (!orgId) throw new GoogleCalendarFlowError('no_active_organization');
      return invoke<{ ok: boolean; retried: number }>('retry', { orgId });
    },
    onSuccess: (result) => {
      toast({
        title: 'Nova tentativa programada',
        description: result.retried > 0
          ? `${result.retried} evento${result.retried === 1 ? '' : 's'} será${result.retried === 1 ? '' : 'ão'} reprocessado${result.retried === 1 ? '' : 's'}.`
          : 'Não há eventos com falha para reprocessar.',
      });
      void invalidateStatus();
    },
    onError: () => toast({
      title: 'Não foi possível tentar novamente',
      description: SAFE_ERROR_COPY.request_failed,
      variant: 'destructive',
    }),
  });

  const disconnect = useMutation({
    mutationFn: () => {
      if (!orgId) throw new GoogleCalendarFlowError('no_active_organization');
      return invoke<{ ok: boolean }>('disconnect', { orgId });
    },
    onSuccess: () => {
      setFlowPhase('disconnected_success');
      setFlowErrorCode(null);
      toast({ title: 'Google Agenda desconectado' });
      void invalidateStatus();
      if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = window.setTimeout(() => setFlowPhase('idle'), 2200);
    },
    onError: () => toast({
      title: 'Não foi possível desconectar',
      description: SAFE_ERROR_COPY.provider_unavailable,
      variant: 'destructive',
    }),
  });

  useEffect(() => () => {
    if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
    popupRef.current?.close();
  }, []);

  const statusErrorCode = useMemo(() => {
    if (!status.error) return null;
    return status.error instanceof GoogleCalendarFlowError ? status.error.code : 'request_failed';
  }, [status.error]);

  return {
    connection: status.data?.connection ?? null,
    pending: status.data?.pending ?? 0,
    outbox: status.data?.outbox ?? null,
    isLoading: status.isLoading,
    isRefreshing,
    statusErrorCode,
    flowErrorCode,
    flowPhase,
    connect,
    retry,
    disconnect,
    cancelOAuth,
    refresh: refreshStatus,
  };
}
