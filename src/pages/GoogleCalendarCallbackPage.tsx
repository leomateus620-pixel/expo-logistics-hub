import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, CircleX, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const MESSAGE_TYPE = 'fenasoja:google-calendar-oauth';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OAUTH_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-oauth`;
const PUBLISHABLE_APIKEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const SAFE_CODES: Record<string, string> = {
  authorization_cancelled: 'A autorização foi cancelada. Nenhuma alteração foi feita.',
  authorization_expired: 'A autorização expirou. Inicie uma nova conexão pelo Cronograma.',
  authorization_failed: 'O Google não confirmou a autorização.',
  authorization_not_confirmed: 'Não foi possível confirmar a autorização do Google Agenda.',
  backfill_failed: 'A conta foi conectada, mas a sincronização inicial não pôde ser preparada.',
  calendar_preparation_failed: 'A conta foi autorizada, mas o calendário FENASOJA não pôde ser preparado.',
  google_api_disabled: 'A API do Google Agenda está desativada nesta conta.',
  google_insufficient_scope: 'A conta não concedeu todas as permissões necessárias.',
  google_rate_limited: 'O Google limitou temporariamente as solicitações. Tente novamente em instantes.',
  google_unauthorized: 'O Google não autorizou o acesso à agenda.',
  google_unavailable: 'O Google Agenda está temporariamente indisponível.',
  oauth_callback_replayed: 'Este retorno já foi utilizado. Inicie uma nova conexão pelo Cronograma.',
  oauth_client_mismatch: 'A configuração do cliente OAuth do Google está incorreta.',
  oauth_code_expired: 'O código do Google expirou. Inicie a conexão novamente.',
  oauth_code_invalid: 'O código do Google é inválido. Inicie a conexão novamente.',
  oauth_state_expired: 'O tempo da autorização expirou. Inicie a conexão novamente.',
  oauth_state_invalid: 'Este retorno não é válido. Inicie uma nova conexão pelo Cronograma.',
  refresh_token_missing: 'O Google não devolveu o refresh token. Reconecte marcando "sempre pedir".',
  request_failed: 'O serviço está temporariamente indisponível. Tente novamente em instantes.',
};

interface CallbackParams {
  attemptId: string | null;
  status: 'ok' | 'error' | null;
  errorCode: string | null;
}

function parseCallback(searchAndHash: { search: string; hash: string }): CallbackParams {
  const params = new URLSearchParams(searchAndHash.search);
  if (!params.has('status') && searchAndHash.hash) {
    const alt = new URLSearchParams(searchAndHash.hash.replace(/^#/, ''));
    alt.forEach((value, key) => { if (!params.has(key)) params.set(key, value); });
  }
  const attemptRaw = (params.get('attempt') ?? '').trim();
  const attemptId = UUID_PATTERN.test(attemptRaw) ? attemptRaw : null;
  const statusRaw = (params.get('status') ?? '').toLowerCase();
  const status = statusRaw === 'ok' ? 'ok' : statusRaw === 'error' ? 'error' : null;
  const errorCode = (params.get('code') ?? '').trim() || null;
  return { attemptId, status, errorCode };
}

async function fetchStatus(): Promise<{
  connection: {
    status: string;
    secondary_calendar_id: string | null;
    verified_at: string | null;
    error_code: string | null;
    backfill_total: number;
    backfill_done: number;
  } | null;
} | null> {
  const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) return null;
  const response = await fetch(OAUTH_FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: PUBLISHABLE_APIKEY ?? '',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action: 'status' }),
  });
  if (!response.ok) return null;
  try { return await response.json(); } catch { return null; }
}

type UiStatus = 'validating' | 'success' | 'cancelled' | 'failed';

interface UiState {
  status: UiStatus;
  title: string;
  description: string;
  code?: string;
}

const IN_PROGRESS = new Set(['starting', 'waiting_authorization', 'completing', 'preparing_calendar', 'synchronizing']);
const TERMINAL_ERROR = new Set(['error', 'reconnect_required']);

export default function GoogleCalendarCallbackPage() {
  const initialParams = useMemo<CallbackParams>(
    () => parseCallback({ search: window.location.search, hash: window.location.hash }),
    [],
  );
  const [ui, setUi] = useState<UiState>({
    status: 'validating',
    title: 'Validando autorização',
    description: 'Aguarde enquanto confirmamos a conta e preparamos o calendário FENASOJA.',
  });

  useEffect(() => {
    // Clean the URL immediately so no attempt/code/state remains visible.
    window.history.replaceState({}, '', '/google-calendar/callback');
    let active = true;

    const finish = (status: 'success' | 'cancelled' | 'failed', code?: string) => {
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage(
            { type: MESSAGE_TYPE, status, code, attemptId: initialParams.attemptId },
            window.location.origin,
          );
        } catch { /* ignore */ }
        window.setTimeout(() => window.close(), 1200);
        return;
      }
      window.setTimeout(() => window.location.replace('/cronograma-eventos'), status === 'success' ? 800 : 1800);
    };

    // If the server-side callback marked the redirect as an explicit error, respect it.
    if (initialParams.status === 'error') {
      const code = initialParams.errorCode || 'authorization_failed';
      if (!active) return;
      const cancelled = code === 'authorization_cancelled';
      setUi({
        status: cancelled ? 'cancelled' : 'failed',
        title: cancelled ? 'Conexão cancelada' : 'Autorização não confirmada',
        description: SAFE_CODES[code] ?? SAFE_CODES.request_failed,
        code,
      });
      finish(cancelled ? 'cancelled' : 'failed', code);
      return;
    }

    // Otherwise poll status to confirm probe + calendar + verified_at.
    const started = Date.now();
    const MAX_WAIT_MS = 90_000;
    const poll = async () => {
      while (active && Date.now() - started < MAX_WAIT_MS) {
        const state = await fetchStatus();
        const conn = state?.connection ?? null;
        if (conn) {
          if (
            conn.verified_at
            && conn.secondary_calendar_id
            && (conn.status === 'connected' || conn.status === 'synchronizing')
          ) {
            if (!active) return;
            setUi({
              status: 'success',
              title: 'Google Agenda conectado',
              description: (conn.backfill_total ?? 0) > 0
                ? 'A conta foi verificada. A sincronização inicial já começou.'
                : 'A conta e o calendário FENASOJA foram verificados com segurança.',
            });
            finish('success');
            return;
          }
          if (TERMINAL_ERROR.has(conn.status)) {
            const code = conn.error_code || 'authorization_failed';
            if (!active) return;
            setUi({
              status: 'failed',
              title: 'Autorização não confirmada',
              description: SAFE_CODES[code] ?? SAFE_CODES.request_failed,
              code,
            });
            finish('failed', code);
            return;
          }
          // Update transient phase description while backend prepares.
          if (conn.status === 'preparing_calendar') {
            setUi((prev) => prev.status === 'validating' ? {
              status: 'validating',
              title: 'Preparando calendário',
              description: 'A conta foi validada. Estamos criando ou verificando o calendário FENASOJA.',
            } : prev);
          } else if (conn.status === 'synchronizing') {
            setUi((prev) => prev.status === 'validating' ? {
              status: 'validating',
              title: 'Sincronizando eventos',
              description: 'A conta e o calendário foram verificados. A sincronização está em andamento.',
            } : prev);
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      if (!active) return;
      setUi({
        status: 'failed',
        title: 'Autorização não confirmada',
        description: SAFE_CODES.authorization_not_confirmed,
        code: 'authorization_not_confirmed',
      });
      finish('failed', 'authorization_not_confirmed');
    };
    void poll();
    return () => { active = false; };
  }, [initialParams]);

  const isSuccess = ui.status === 'success';
  const isFailure = ui.status === 'failed' || ui.status === 'cancelled';

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <section className="max-w-sm w-full rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {isSuccess
            ? <CalendarCheck2 aria-hidden="true" />
            : isFailure
              ? <CircleX aria-hidden="true" />
              : <Loader2 className="animate-spin" aria-hidden="true" />}
        </div>
        <h1 className="text-xl font-bold tracking-normal">{ui.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{ui.description}</p>
      </section>
    </main>
  );
}
