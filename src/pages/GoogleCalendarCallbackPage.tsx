import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, CircleX, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  GOOGLE_CALENDAR_CALLBACK_PATH,
  cleanGoogleCalendarCallbackUrl,
  getGoogleCalendarCallbackNext,
  parseGoogleCalendarCallbackFeedback,
} from '@/lib/google-calendar-callback';

const MESSAGE_TYPE = 'fenasoja:google-calendar-oauth';
const SAFE_CALLBACK_CODES = new Set([
  'authorization_cancelled',
  'authorization_expired',
  'authorization_failed',
  'authorization_not_confirmed',
  'backfill_failed',
  'callback_replayed',
  'calendar_preparation_failed',
  'invalid_callback',
  'request_failed',
  'session_expired',
]);

function normalizeCallbackError(value: unknown) {
  const code = value instanceof Error ? value.message : String(value ?? '');
  return SAFE_CALLBACK_CODES.has(code) ? code : 'request_failed';
}

type CallbackUiState =
  | { status: 'validating'; title: string; description: string }
  | { status: 'success'; title: string; description: string }
  | { status: 'cancelled' | 'failed'; title: string; description: string; code: string };

const OAUTH_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-oauth`;
const PUBLISHABLE_APIKEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

async function keepaliveInvoke(action: string, body: Record<string, unknown>, timeoutMs = 4500) {
  const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const accessToken = sessionData?.session?.access_token;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (PUBLISHABLE_APIKEY) headers.apikey = PUBLISHABLE_APIKEY;
  headers.Authorization = `Bearer ${accessToken ?? PUBLISHABLE_APIKEY ?? ''}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(OAUTH_FN_URL, {
      method: 'POST',
      keepalive: true,
      headers,
      body: JSON.stringify({ action, ...body }),
      signal: controller.signal,
    });
    let payload: { ok?: boolean; error?: unknown; backfill?: number } = {};
    try { payload = await response.json(); } catch { /* empty body */ }
    if (!response.ok) {
      const code = typeof payload.error === 'string' && SAFE_CALLBACK_CODES.has(payload.error)
        ? payload.error
        : 'request_failed';
      throw new Error(code);
    }
    return payload;
  } finally {
    window.clearTimeout(timer);
  }
}


function safeCallbackCopy(code: string) {
  if (code === 'authorization_cancelled') return 'A autorização foi cancelada. Nenhuma alteração foi feita.';
  if (code === 'authorization_expired') return 'A autorização expirou. Inicie uma nova conexão pelo Cronograma.';
  if (code === 'callback_replayed' || code === 'invalid_callback') {
    return 'Este retorno não é válido ou já foi utilizado. Inicie uma nova conexão pelo Cronograma.';
  }
  if (code === 'session_expired') return 'Sua sessão expirou. Entre novamente antes de conectar a agenda.';
  if (code === 'calendar_preparation_failed') return 'A conta foi autorizada, mas o calendário FENASOJA não pôde ser preparado.';
  return 'Não foi possível confirmar a autorização do Google Agenda.';
}

export default function GoogleCalendarCallbackPage() {
  const captured = useMemo(() => {
    const search = window.location.search;
    return {
      feedback: parseGoogleCalendarCallbackFeedback(search),
      next: getGoogleCalendarCallbackNext(search),
    };
  }, []);
  const [ui, setUi] = useState<CallbackUiState>({
    status: 'validating',
    title: 'Validando autorização',
    description: 'Aguarde enquanto confirmamos a conta e preparamos o calendário FENASOJA.',
  });

  useEffect(() => {
    const rawSearch = window.location.search;
    const rawHash = window.location.hash;
    const source = rawSearch && rawSearch.length > 1
      ? { transport: 'query' as const, raw: rawSearch }
      : rawHash && rawHash.length > 1
        ? { transport: 'hash' as const, raw: rawHash.startsWith('#') ? `?${rawHash.slice(1)}` : rawHash }
        : { transport: 'query' as const, raw: '' };
    const searchParams = new URLSearchParams(rawSearch);
    const hashParams = new URLSearchParams(rawHash.startsWith('#') ? rawHash.slice(1) : rawHash);
    const paramMeta: { name: string; length: number; loc: 'q' | 'h' }[] = [];
    searchParams.forEach((value, key) => paramMeta.push({ name: key.slice(0, 64), length: value.length, loc: 'q' }));
    hashParams.forEach((value, key) => paramMeta.push({ name: key.slice(0, 64), length: value.length, loc: 'h' }));
    const activeParams = new URLSearchParams(source.raw);
    const observation = {
      contract_version: '2026-07-23.observe-keepalive',
      transport: source.transport,
      route: GOOGLE_CALENDAR_CALLBACK_PATH,
      hasCode: activeParams.has('code') || hashParams.has('code'),
      hasState: activeParams.has('state') || hashParams.has('state'),
      hasAttempt: activeParams.has('attempt') || hashParams.has('attempt'),
      hasError: activeParams.has('error') || activeParams.has('google_error') || hashParams.has('error'),
      params: paramMeta,
      searchLength: rawSearch.length,
      hashLength: rawHash.length,
      openerPresent: Boolean(window.opener && !window.opener.closed),
    };
    const observedAttemptId = activeParams.get('attempt') ?? hashParams.get('attempt');

    // Snapshot everything before mutating history — captured stays valid.
    window.history.replaceState({}, '', cleanGoogleCalendarCallbackUrl(window.location));
    let active = true;

    const finish = (
      status: 'success' | 'cancelled' | 'failed',
      code?: string,
      attemptId?: string | null,
    ) => {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: MESSAGE_TYPE, status, code, attemptId }, window.location.origin);
        window.setTimeout(() => window.close(), 1500);
        return;
      }
      window.setTimeout(() => window.location.replace(captured.next), status === 'success' ? 600 : 1800);
    };

    const run = async () => {
      // Phase A: always await observe_callback with keepalive so evidence
      // survives the popup close race.
      await keepaliveInvoke('observe_callback', {
        observation,
        ...(observedAttemptId ? { attemptId: observedAttemptId } : {}),
      }).catch((error) => {
        window.console.warn('google_calendar_observe_failed', (error as Error)?.message);
      });

      const { feedback } = captured;
      if (feedback.kind === 'cancelled') {
        if (feedback.attemptId) {
          await keepaliveInvoke('cancel', { attemptId: feedback.attemptId }).catch(() => undefined);
        }
        if (!active) return;
        setUi({
          status: 'cancelled',
          title: 'Conexão cancelada',
          description: safeCallbackCopy(feedback.code),
          code: feedback.code,
        });
        finish('cancelled', feedback.code, feedback.attemptId);
        return;
      }

      if (feedback.kind !== 'completion_required') {
        const code = feedback.kind === 'failed' ? feedback.code : 'invalid_callback';
        const attemptId = feedback.kind === 'failed' ? feedback.attemptId : null;
        if (!active) return;
        setUi({
          status: 'failed',
          title: 'Autorização não confirmada',
          description: safeCallbackCopy(code),
          code,
        });
        finish('failed', code, attemptId);
        return;
      }

      try {
        const result = await keepaliveInvoke('complete', {
          ...(feedback.attemptId ? { attemptId: feedback.attemptId } : {}),
          code: feedback.code,
          state: feedback.state,
          callbackPath: GOOGLE_CALENDAR_CALLBACK_PATH,
        }, 12000);
        if (!result.ok) throw new Error('authorization_not_confirmed');

        if (!active) return;
        setUi({
          status: 'success',
          title: 'Google Agenda conectado',
          description: (result.backfill ?? 0) > 0
            ? 'A conta e o calendário foram verificados. A sincronização inicial já começou.'
            : 'A conta e o calendário FENASOJA foram verificados com segurança.',
        });
        finish('success', undefined, feedback.attemptId);
      } catch (error) {
        if (!active) return;
        const code = normalizeCallbackError(error);
        setUi({
          status: 'failed',
          title: 'Autorização não confirmada',
          description: safeCallbackCopy(code),
          code,
        });
        finish('failed', code, feedback.attemptId);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [captured]);


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
