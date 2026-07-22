import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useToast } from '@/hooks/use-toast';
import {
  buildGoogleCalendarReturnUrl,
  cleanGoogleCalendarCallbackUrl,
  extractGoogleCalendarConnectionKey,
  parseGoogleCalendarCallbackFeedback,
} from '@/lib/google-calendar-callback';
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
  connected_at: string;
}

export interface GoogleStatusResponse {
  connection: GoogleCalendarConnection | null;
  pending: number;
  outbox: GoogleCalendarOutboxSummary;
}

type GoogleCalendarErrorCode =
  | 'authorization_cancelled'
  | 'authorization_failed'
  | 'authorization_not_confirmed'
  | 'invalid_callback'
  | 'no_active_organization'
  | 'oauth_popup_blocked'
  | 'oauth_url_missing'
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
  authorization_failed: 'Não foi possível confirmar a autorização do Google. Tente novamente.',
  authorization_not_confirmed: 'A autorização ainda não foi confirmada. Tente novamente quando estiver pronto.',
  invalid_callback: 'O retorno da autorização não pôde ser validado. Inicie a conexão novamente.',
  no_active_organization: 'Selecione uma organização antes de conectar sua conta Google.',
  oauth_popup_blocked: 'Permita pop-ups neste site para abrir a autorização do Google.',
  oauth_url_missing: 'O serviço de autorização não respondeu como esperado. Tente novamente.',
  request_failed: 'O serviço está temporariamente indisponível. Tente novamente em instantes.',
  session_expired: 'Sua sessão expirou. Entre novamente antes de conectar sua conta.',
};

const isKnownErrorCode = (value: unknown): value is GoogleCalendarErrorCode =>
  typeof value === 'string' && value in SAFE_ERROR_COPY;

const GOOGLE_OAUTH_POPUP_FEATURES = 'width=540,height=720,resizable=yes,scrollbars=yes';

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
    } catch {
      // A resposta pode não ter corpo JSON. O usuário recebe uma mensagem segura.
    }
  }
  const message = String((error as Error)?.message ?? '');
  if (message.toLowerCase().includes('unauthorized')) return 'session_expired';
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
  pending?: boolean;
}

interface PopupMessage {
  type: 'fenasoja:google-calendar-oauth';
  status: 'success' | 'cancelled' | 'failed';
  code?: GoogleCalendarErrorCode;
  exchangeCode?: string | null;
  connectionKey?: string | null;
}

function extractGoogleCalendarExchangeCode(search: string) {
  return new URLSearchParams(search).get('code')?.trim() || null;
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

export function useGoogleCalendarConnection() {
  const { user } = useAuth();
  const { orgId } = useCurrentOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const [flowPhase, setFlowPhase] = useState<GoogleCalendarFlowPhase>('idle');
  const [flowErrorCode, setFlowErrorCode] = useState<GoogleCalendarErrorCode | null>(null);
  const connectPromiseRef = useRef<Promise<CompleteResponse> | null>(null);
  const popupRef = useRef<Window | null>(null);
  const oauthCancelledRef = useRef(false);
  const callbackHandledRef = useRef(false);
  const phaseTimerRef = useRef<number | null>(null);
  const refreshPromiseRef = useRef<Promise<unknown> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const invalidateStatus = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['google-calendar-status', userId] }),
    [queryClient, userId],
  );

  const status = useQuery({
    queryKey: ['google-calendar-status', userId],
    queryFn: () => invoke<GoogleStatusResponse>('status'),
    enabled: Boolean(userId),
    retry: (failureCount, error) =>
      !(error instanceof GoogleCalendarFlowError && error.code === 'session_expired') && failureCount < 1,
    refetchInterval: (query) => {
      if (query.state.error) return false;
      const data = query.state.data as GoogleStatusResponse | undefined;
      if (data?.connection?.status === 'connecting' || data?.connection?.status === 'completing') return 3000;
      if ((data?.pending ?? 0) > 0) return 8000;
      return 60000;
    },
  });

  const completeConnection = useCallback(async (
    activeOrgId: string,
    attempts = 6,
    connectionKey?: string | null,
    exchangeCode?: string | null,
  ) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await invoke<CompleteResponse>('complete', {
        orgId: activeOrgId,
        connectionKey,
        code: attempt === 0 ? exchangeCode : null,
      });
      if (!response.pending) return response;
      await new Promise((resolve) => window.setTimeout(resolve, attempt < 3 ? 1400 : 2400));
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
          setFlowErrorCode(null);
          setFlowPhase('starting');
          await invoke('reset').catch(() => undefined);

          const oauth = await invoke<{
            authorization_url?: string;
            authorize_url?: string;
            url?: string;
          }>('start', {
            orgId,
            returnUrl: buildGoogleCalendarReturnUrl(window.location.href),
          });
          const authorizeUrl = oauth.authorization_url ?? oauth.authorize_url ?? oauth.url;
          if (!authorizeUrl) throw new GoogleCalendarFlowError('oauth_url_missing');

          if (preparedPopup) {
            preparedPopup.location.href = authorizeUrl;
          } else {
            preparedPopup = window.open(authorizeUrl, 'fenasoja-google-oauth', GOOGLE_OAUTH_POPUP_FEATURES);
          }
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
            throw new GoogleCalendarFlowError(popupResult.code ?? 'authorization_failed');
          }

          setFlowPhase('returning');
          return completeConnection(
            orgId,
            popupResult.status === 'closed' ? 10 : 6,
            'connectionKey' in popupResult ? popupResult.connectionKey : null,
            'exchangeCode' in popupResult ? popupResult.exchangeCode : null,
          );
        } catch (error) {
          if (popupRef.current === preparedPopup) popupRef.current = null;
          if (preparedPopup && !preparedPopup.closed && flowPhase !== 'waiting_oauth') {
            preparedPopup.close();
          }
          throw error;
        }
      })();

      connectPromiseRef.current = operation;
      try {
        return await operation;
      } finally {
        connectPromiseRef.current = null;
      }
    },
    onSuccess: (data) => {
      const total = data.backfill ?? 0;
      setFlowPhase('success');
      setFlowErrorCode(null);
      toast({
        title: 'Google Agenda conectado',
        description: total > 0
          ? `${total} evento${total === 1 ? '' : 's'} será${total === 1 ? '' : 'ão'} sincronizado${total === 1 ? '' : 's'} em segundo plano.`
          : 'A conexão foi confirmada com segurança.',
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
    },
  });

  const cancelOAuth = useCallback(() => {
    oauthCancelledRef.current = true;
    popupRef.current?.close();
    popupRef.current = null;
    setFlowPhase('cancelled');
    setFlowErrorCode('authorization_cancelled');
    void invoke('reset').catch(() => undefined);
  }, []);

  // O gateway retorna para a rota pública já consolidada. A própria página
  // conclui o handshake, avisa a janela de origem e remove parâmetros sensíveis.
  useEffect(() => {
    if (callbackHandledRef.current || !orgId || typeof window === 'undefined') return;
    const feedback = parseGoogleCalendarCallbackFeedback(window.location.search);
    if (feedback.kind === 'none') return;
    callbackHandledRef.current = true;
    const connectionKey = extractGoogleCalendarConnectionKey(window.location.search);
    const exchangeCode = extractGoogleCalendarExchangeCode(window.location.search);
    window.history.replaceState({}, '', cleanGoogleCalendarCallbackUrl(window.location));

    const notifyOpener = (message: PopupMessage) => {
      if (!window.opener || window.opener.closed) return false;
      window.opener.postMessage(message, window.location.origin);
      window.close();
      return true;
    };

    if (feedback.kind === 'cancelled') {
      setFlowPhase('cancelled');
      setFlowErrorCode(feedback.code);
      notifyOpener({ type: 'fenasoja:google-calendar-oauth', status: 'cancelled', code: feedback.code });
      return;
    }
    if (feedback.kind === 'failed') {
      setFlowPhase('idle');
      setFlowErrorCode(feedback.code);
      notifyOpener({ type: 'fenasoja:google-calendar-oauth', status: 'failed', code: feedback.code });
      return;
    }

    setFlowPhase('returning');
    completeConnection(orgId, 10, connectionKey, exchangeCode)
      .then((result) => {
        setFlowPhase('success');
        setFlowErrorCode(null);
        void invalidateStatus();
        const openerNotified = notifyOpener({
          type: 'fenasoja:google-calendar-oauth',
          status: 'success',
          exchangeCode,
          connectionKey,
        });
        if (!openerNotified) {
          toast({
            title: 'Google Agenda conectado',
            description: (result.backfill ?? 0) > 0
              ? 'A sincronização inicial foi programada e continuará em segundo plano.'
              : 'A conexão foi confirmada com segurança.',
          });
        }
        if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
        phaseTimerRef.current = window.setTimeout(() => setFlowPhase('idle'), 1400);
        return result;
      })
      .catch((error: Error) => {
        const code = error instanceof GoogleCalendarFlowError ? error.code : 'authorization_failed';
        setFlowPhase('idle');
        setFlowErrorCode(code);
        notifyOpener({ type: 'fenasoja:google-calendar-oauth', status: 'failed', code });
      });
  }, [completeConnection, invalidateStatus, orgId, toast]);

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
    mutationFn: () => invoke<{ ok: boolean; retried: number }>('retry'),
    onSuccess: (result) => {
      toast({
        title: 'Nova tentativa programada',
        description: result.retried > 0
          ? `${result.retried} evento${result.retried === 1 ? '' : 's'} será${result.retried === 1 ? '' : 'ão'} reprocessado${result.retried === 1 ? '' : 's'}.`
          : 'Não há eventos com falha para reprocessar.',
      });
      void invalidateStatus();
    },
    onError: () => {
      toast({
        title: 'Não foi possível tentar novamente',
        description: SAFE_ERROR_COPY.request_failed,
        variant: 'destructive',
      });
    },
  });

  const disconnect = useMutation({
    mutationFn: () => invoke<{ ok: boolean }>('disconnect'),
    onSuccess: () => {
      setFlowPhase('disconnected_success');
      setFlowErrorCode(null);
      toast({ title: 'Google Agenda desconectado' });
      void invalidateStatus();
      if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = window.setTimeout(() => setFlowPhase('idle'), 2200);
    },
    onError: () => {
      toast({
        title: 'Não foi possível desconectar',
        description: SAFE_ERROR_COPY.request_failed,
        variant: 'destructive',
      });
    },
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
