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

async function invokeOAuth(action: string, body: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('session_expired');
  const { data, error } = await supabase.functions.invoke('google-calendar-oauth', {
    body: { action, ...body },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown };
        if (typeof payload.error === 'string' && SAFE_CALLBACK_CODES.has(payload.error)) {
          throw new Error(payload.error);
        }
      } catch (cause) {
        const safeCode = normalizeCallbackError(cause);
        if (safeCode !== 'request_failed') throw new Error(safeCode);
      }
    }
    throw new Error('request_failed');
  }
  return data as { ok?: boolean; backfill?: number };
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
    // Diagnostic: record what the Lovable connector gateway actually returns
    // on the callback URL, before we strip it from history.
    try {
      const raw = new URLSearchParams(window.location.search);
      const snapshot: Record<string, string> = {};
      raw.forEach((v, k) => {
        if (k === 'code' || k === 'state') snapshot[k] = `${v.slice(0, 6)}…(${v.length})`;
        else snapshot[k] = v.length > 40 ? `${v.slice(0, 40)}…` : v;
      });
      console.info('google_calendar_callback_params', snapshot);
    } catch { /* ignore */ }

    // Codes, state and attempt identifiers leave browser history before any
    // network work begins. Captured values remain only in this closure.
    window.history.replaceState({}, '', cleanGoogleCalendarCallbackUrl(window.location));
    let active = true;

    const finish = (
      status: 'success' | 'cancelled' | 'failed',
      code?: string,
      attemptId?: string | null,
    ) => {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: MESSAGE_TYPE, status, code, attemptId }, window.location.origin);
        window.setTimeout(() => window.close(), 350);
        return;
      }
      window.setTimeout(() => window.location.replace(captured.next), status === 'success' ? 600 : 1800);
    };

    const run = async () => {
      const { feedback } = captured;
      if (feedback.kind === 'cancelled') {
        if (feedback.attemptId) {
          await invokeOAuth('cancel', { attemptId: feedback.attemptId }).catch(() => undefined);
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
        if (!active) return;
        setUi({
          status: 'failed',
          title: 'Autorização não confirmada',
          description: safeCallbackCopy(code),
          code,
        });
        finish('failed', code);
        return;
      }

      try {
        const result = await invokeOAuth('complete', {
          // attemptId is optional — the backend resolves the attempt from
          // `state` when the gateway strips our custom query param.
          ...(feedback.attemptId ? { attemptId: feedback.attemptId } : {}),
          code: feedback.code,
          state: feedback.state,
          callbackPath: GOOGLE_CALENDAR_CALLBACK_PATH,
        });
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
