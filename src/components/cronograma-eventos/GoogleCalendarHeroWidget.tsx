import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Unlink,
  XCircle,
} from 'lucide-react';
import googleCalendarIcon from '@/assets/google-calendar.svg';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useGoogleCalendarConnection } from '@/hooks/useGoogleCalendarConnection';
import {
  deriveGoogleCalendarState,
  type GoogleCalendarAction,
  type GoogleCalendarStateView,
} from '@/lib/google-calendar-state';

const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar/u/0/r';
const GOOGLE_OAUTH_POPUP_FEATURES = 'width=540,height=720,resizable=yes,scrollbars=yes';

function statusLabel(state: GoogleCalendarStateView) {
  if (state.tone === 'success') return 'Conectado';
  if (state.tone === 'progress') return 'Em andamento';
  if (state.tone === 'danger') return 'Ação necessária';
  if (state.tone === 'warning') return 'Atenção';
  return state.id === 'disconnected' ? 'Não conectado' : 'Disponível';
}

function StatusGlyph({ state }: { state: GoogleCalendarStateView }) {
  if (state.busy) return <Loader2 className="fenasoja-google-widget-spinner" aria-hidden="true" />;
  if (state.tone === 'success') return <CheckCircle2 aria-hidden="true" />;
  if (state.tone === 'danger') return <XCircle aria-hidden="true" />;
  if (state.tone === 'warning') return <AlertTriangle aria-hidden="true" />;
  return <Link2 aria-hidden="true" />;
}

export const GoogleCalendarHeroWidget = memo(function GoogleCalendarHeroWidget() {
  const {
    connection,
    pending,
    outbox,
    isLoading,
    isRefreshing,
    statusErrorCode,
    flowErrorCode,
    flowPhase,
    connect,
    retry,
    disconnect,
    cancelOAuth,
    refresh,
  } = useGoogleCalendarConnection();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [isVisible, setIsVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const widgetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = widgetRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setIsVisible(true);
    }, { rootMargin: '80px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const state = useMemo(() => deriveGoogleCalendarState({
    connection,
    pending,
    outbox,
    isLoading,
    statusErrorCode,
    flowErrorCode,
    flowPhase,
    retrying: retry.isPending || isRefreshing,
    disconnecting: disconnect.isPending,
    confirmingDisconnect,
  }), [
    confirmingDisconnect,
    connection,
    disconnect.isPending,
    flowErrorCode,
    flowPhase,
    isLoading,
    isRefreshing,
    outbox,
    pending,
    retry.isPending,
    statusErrorCode,
  ]);

  const controlsLocked = connect.isPending || retry.isPending || disconnect.isPending || isRefreshing;

  const runAction = (action: GoogleCalendarAction) => {
    if (controlsLocked && action !== 'cancel_oauth') return;
    if (action === 'connect' || action === 'retry_connection' || action === 'reconnect') {
      const popup = window.open('about:blank', 'fenasoja-google-oauth', GOOGLE_OAUTH_POPUP_FEATURES);
      connect.mutate(popup);
    } else if (action === 'retry_sync') {
      retry.mutate();
    } else if (action === 'refresh') {
      void refresh();
    } else if (action === 'disconnect') {
      setConfirmingDisconnect(true);
    } else if (action === 'cancel_oauth') {
      cancelOAuth();
    }
  };

  const renderPrimaryAction = () => {
    if (!state.primaryLabel) return null;
    if (state.primaryAction === 'open_calendar') {
      return (
        <a
          className="fenasoja-google-widget-cta"
          href={GOOGLE_CALENDAR_URL}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink aria-hidden="true" />
          <span>{state.primaryLabel}</span>
        </a>
      );
    }

    const canRetryConnection = ['connect', 'retry_connection', 'reconnect'].includes(state.primaryAction);
    const disabled = state.primaryAction === 'none' || controlsLocked || (state.busy && !canRetryConnection);
    return (
      <button
        type="button"
        className="fenasoja-google-widget-cta"
        onClick={() => runAction(state.primaryAction)}
        disabled={disabled}
        aria-busy={disabled && state.busy ? true : undefined}
      >
        {state.busy ? <Loader2 className="fenasoja-google-widget-spinner" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
        <span>{state.primaryLabel}</span>
      </button>
    );
  };

  return (
    <>
      <article
        ref={widgetRef}
        className="fenasoja-google-widget fenasoja-google-widget--compact"
        data-state={state.id}
        data-tone={state.tone}
        data-busy={state.busy || undefined}
        data-visible={isVisible || undefined}
        aria-labelledby="google-calendar-widget-title"
        aria-describedby="google-calendar-widget-description"
        aria-busy={state.busy}
      >
        <div className="fenasoja-google-widget-heading">
          <div
            className="fenasoja-google-widget-icon"
            role="img"
            aria-label="Google Agenda"
          >
            <img src={googleCalendarIcon} alt="" width="48" height="48" />
            <span className="fenasoja-google-widget-icon-status">
              <StatusGlyph state={state} />
            </span>
          </div>

          <div className="fenasoja-google-widget-identity">
            <h3 id="google-calendar-widget-title">Google Agenda</h3>
            <span className="fenasoja-google-widget-status" data-tone={state.tone}>
              <StatusGlyph state={state} />
              {statusLabel(state)}
            </span>
          </div>
        </div>

        <p id="google-calendar-widget-description" className="fenasoja-google-widget-message">
          {state.title}
        </p>

        <div className="fenasoja-google-widget-actions">
          {renderPrimaryAction()}
          {state.secondaryAction && state.secondaryLabel && (
            <button
              type="button"
              className="fenasoja-google-widget-ghost"
              onClick={() => runAction(state.secondaryAction!)}
              disabled={controlsLocked && state.secondaryAction !== 'cancel_oauth'}
            >
              {state.secondaryAction === 'disconnect' ? <Unlink aria-hidden="true" /> : null}
              <span>{state.secondaryLabel}</span>
            </button>
          )}
        </div>

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {state.announce}
        </p>
      </article>

      <AlertDialog open={confirmingDisconnect} onOpenChange={setConfirmingDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar o Google Agenda?</AlertDialogTitle>
            <AlertDialogDescription>
              Novas alterações deixarão de ser sincronizadas. Os eventos que já estão no Google Agenda serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter conexão</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => disconnect.mutate()}
            >
              Sim, desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
