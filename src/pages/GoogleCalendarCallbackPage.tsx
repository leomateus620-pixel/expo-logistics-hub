import { useEffect, useMemo } from 'react';
import { CalendarCheck2, Loader2 } from 'lucide-react';
import {
  appendGoogleCalendarCallbackSignal,
  cleanGoogleCalendarCallbackUrl,
  extractGoogleCalendarConnectionKey,
  getGoogleCalendarCallbackNext,
  parseGoogleCalendarCallbackFeedback,
} from '@/lib/google-calendar-callback';

const MESSAGE_TYPE = 'fenasoja:google-calendar-oauth';

export default function GoogleCalendarCallbackPage() {
  const feedback = useMemo(() => parseGoogleCalendarCallbackFeedback(window.location.search), []);

  useEffect(() => {
    const next = getGoogleCalendarCallbackNext(window.location.search);
    const fallbackTarget = appendGoogleCalendarCallbackSignal(next);
    const connectionKey = extractGoogleCalendarConnectionKey(window.location.search);
    window.history.replaceState({}, '', cleanGoogleCalendarCallbackUrl(window.location));

    const status = feedback.kind === 'success'
      ? 'success'
      : feedback.kind === 'cancelled'
        ? 'cancelled'
        : 'failed';
    const code = feedback.kind === 'cancelled' || feedback.kind === 'failed'
      ? feedback.code
      : undefined;
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: MESSAGE_TYPE, status, code, connectionKey }, window.location.origin);
      window.setTimeout(() => window.close(), 120);
      return;
    }

    window.setTimeout(() => {
      window.location.replace(fallbackTarget);
    }, 300);
  }, [feedback]);

  const isSuccess = feedback.kind === 'success';

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <section className="max-w-sm w-full rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {isSuccess ? <CalendarCheck2 aria-hidden="true" /> : <Loader2 className="animate-spin" aria-hidden="true" />}
        </div>
        <h1 className="text-xl font-bold tracking-normal">
          {isSuccess ? 'Google Agenda autorizado' : 'Finalizando autorização'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta janela será fechada automaticamente para concluir a conexão no Cronograma.
        </p>
      </section>
    </main>
  );
}