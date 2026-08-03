import { memo, useMemo, useState } from 'react';
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
const GOOGLE_CALENDAR_DETAIL_STATES = new Set<GoogleCalendarStateView['id']>([
  'waiting_oauth',
  'partial_failure',
  'temporary_failure',
  'authorization_cancelled',
  'authorization_not_confirmed',
  'authorization_revoked',
  'reconnect_required',
  'fallback',
]);

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
  const showDetail = GOOGLE_CALENDAR_DETAIL_STATES.has(state.id);

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
    if (!state.primaryLabel || state.primaryAction === 'none') return null;
    const primaryLabel = state.primaryAction === 'open_calendar' ? 'Gerenciar' : state.primaryLabel;
    if (state.primaryAction === 'open_calendar') {
      return (
        <a
          className="fenasoja-google-widget-cta"
          href={GOOGLE_CALENDAR_URL}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink aria-hidden="true" />
          <span>{primaryLabel}</span>
        </a>
      );
    }

    const canRetryConnection = ['connect', 'retry_connection', 'reconnect'].includes(state.primaryAction);
    const disabled = controlsLocked || (state.busy && !canRetryConnection);
    return (
      <button
        type="button"
        className="fenasoja-google-widget-cta"
        onClick={() => runAction(state.primaryAction)}
        disabled={disabled}
        aria-busy={disabled && state.busy ? true : undefined}
      >
        {state.busy ? <Loader2 className="fenasoja-google-widget-spinner" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
        <span>{primaryLabel}</span>
      </button>
    );
  };

  return (
    <>
      <article
        className="fenasoja-google-widget fenasoja-google-widget--compact"
        data-state={state.id}
        data-tone={state.tone}
        data-busy={state.busy || undefined}
        data-visible="true"
        aria-labelledby="google-calendar-widget-title"
        aria-describedby={showDetail ? 'google-calendar-widget-detail' : undefined}
        aria-busy={state.busy}
      >
        <div className="fenasoja-google-widget-heading">
          <div
            className="fenasoja-google-widget-icon"
            role="img"
            aria-label="Google Agenda"
          >
            <img src={googleCalendarIcon} alt="" width="48" height="48" />
          </div>

          <div className="fenasoja-google-widget-identity">
            <h3 id="google-calendar-widget-title">Google Agenda</h3>
            <p className="fenasoja-google-widget-state" data-tone={state.tone}>
              <StatusGlyph state={state} />
              <span>{state.title}</span>
            </p>
          </div>
        </div>

        {showDetail && (
          <p id="google-calendar-widget-detail" className="fenasoja-google-widget-detail">
            {state.description}
          </p>
        )}

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
