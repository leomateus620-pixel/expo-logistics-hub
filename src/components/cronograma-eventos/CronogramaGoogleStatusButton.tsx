import { memo, useMemo, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, Unlink } from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useGoogleCalendarConnection } from '@/hooks/useGoogleCalendarConnection';
import {
  deriveGoogleCalendarState,
  type GoogleCalendarAction,
} from '@/lib/google-calendar-state';

const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar/u/0/r';
const GOOGLE_OAUTH_POPUP_FEATURES = 'width=540,height=720,resizable=yes,scrollbars=yes';

/** Compact Google Calendar status control living inside the executive command bar. */
export const CronogramaGoogleStatusButton = memo(function CronogramaGoogleStatusButton() {
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
  const signal = state.busy
    ? 'busy'
    : state.tone === 'success'
      ? 'connected'
      : state.tone === 'warning'
        ? 'attention'
        : 'offline';

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

  const primaryLabel = state.primaryAction === 'open_calendar' ? 'Abrir Google Agenda' : state.primaryLabel;

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="cronograma-command-chip cronograma-command-chip--google focus-ring"
            data-signal={signal}
            aria-label={`Google Agenda: ${state.title}`}
          >
            <span className="cronograma-command-chip__glyph" aria-hidden="true">
              <img src={googleCalendarIcon} alt="" width="18" height="18" />
            </span>
            <span className="cronograma-command-signal" aria-hidden="true" />
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" sideOffset={10} className="cronograma-command-popover">
          <header className="cronograma-command-popover__head">
            <img src={googleCalendarIcon} alt="" width="22" height="22" aria-hidden="true" />
            <div className="min-w-0">
              <p className="cronograma-command-popover__eyebrow">Integração</p>
              <h3 className="cronograma-command-popover__title">Google Agenda</h3>
            </div>
          </header>

          <p className="cronograma-command-popover__state" data-signal={signal}>
            <span className="cronograma-command-signal" aria-hidden="true" />
            {state.title}
          </p>

          {state.description && (
            <p className="cronograma-command-popover__text">{state.description}</p>
          )}

          <div className="cronograma-command-popover__actions">
            {state.primaryAction === 'open_calendar' ? (
              <a
                className="cronograma-command-popover__cta"
                href={GOOGLE_CALENDAR_URL}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink aria-hidden="true" />
                <span>{primaryLabel}</span>
              </a>
            ) : state.primaryAction !== 'none' && state.primaryLabel ? (
              <button
                type="button"
                className="cronograma-command-popover__cta"
                onClick={() => runAction(state.primaryAction)}
                disabled={controlsLocked}
              >
                {state.busy
                  ? <Loader2 className="animate-spin" aria-hidden="true" />
                  : <RefreshCw aria-hidden="true" />}
                <span>{primaryLabel}</span>
              </button>
            ) : null}

            {state.secondaryAction && state.secondaryLabel && (
              <button
                type="button"
                className="cronograma-command-popover__ghost"
                onClick={() => runAction(state.secondaryAction!)}
                disabled={controlsLocked && state.secondaryAction !== 'cancel_oauth'}
              >
                {state.secondaryAction === 'disconnect' ? <Unlink aria-hidden="true" /> : null}
                <span>{state.secondaryLabel}</span>
              </button>
            )}
          </div>

          <p className="sr-only" aria-live="polite" aria-atomic="true">{state.announce}</p>
        </PopoverContent>
      </Popover>

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
