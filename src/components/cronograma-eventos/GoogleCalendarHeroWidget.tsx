import { memo } from 'react';
import { Calendar, CheckCircle2, Loader2, AlertTriangle, Unlink, LinkIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useGoogleCalendarConnection } from '@/hooks/useGoogleCalendarConnection';

export const GoogleCalendarHeroWidget = memo(function GoogleCalendarHeroWidget() {
  const { connection, pending, isLoading, authError, connect, disconnect } = useGoogleCalendarConnection();

  const status = connection?.status ?? 'disconnected';
  const backfillPct =
    connection && connection.backfill_total > 0
      ? Math.min(100, Math.round((connection.backfill_done / connection.backfill_total) * 100))
      : null;

  const isConnected = status === 'connected';
  const isReconnect = status === 'reconnect_required';
  const isErrored = status === 'error';
  const isStalePending = status === 'connecting' && !connect.isPending;
  const isConnecting = connect.isPending;
  const isSyncing = backfillPct !== null && backfillPct < 100;

  return (
    <div
      className="fenasoja-google-widget"
      data-state={status}
      aria-label="Sincronização com Google Agenda"
    >
      <div className="fenasoja-google-widget-icon" aria-hidden="true">
        {isConnecting ? (
          <Loader2 className="animate-spin" />
        ) : authError === 'sessao_expirada' ? (
          <>
            <small>Google Agenda</small>
            <strong>Sessão expirada</strong>
            <em>Recarregue o sistema e entre novamente para conectar.</em>
          </>
        ) : isConnected ? (
          <CheckCircle2 />
        ) : isReconnect ? (
          <AlertTriangle />
        ) : (
          <Calendar />
        )}
      </div>

      <div className="fenasoja-google-widget-body">
        {isLoading ? (
          <>
            <small>Google Agenda</small>
            <strong>Verificando conexão…</strong>
          </>
        ) : isConnected ? (
          <>
            <small>Google Agenda · Conectado</small>
            <strong>{connection?.google_email ?? 'Conta vinculada'}</strong>
            {isSyncing ? (
              <em>
                Sincronizando {connection?.backfill_done}/{connection?.backfill_total} eventos
                <span className="fenasoja-google-widget-track" aria-hidden="true">
                  <span style={{ width: `${backfillPct}%` }} />
                </span>
              </em>
            ) : connection?.last_sync_at ? (
              <em>
                Última sync{' '}
                {format(new Date(connection.last_sync_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                {pending > 0 ? ` · ${pending} pendente${pending > 1 ? 's' : ''}` : ''}
              </em>
            ) : (
              <em>Calendário &quot;FENASOJA — Cronograma&quot;</em>
            )}
          </>
        ) : isReconnect ? (
          <>
            <small>Google Agenda · Reconectar</small>
            <strong>Permissão expirada</strong>
            <em>A conexão precisa ser reautorizada.</em>
          </>
        ) : isConnecting ? (
          <>
            <small>Google Agenda</small>
            <strong>Conectando…</strong>
            <em>Aprovando permissão na conta Google.</em>
          </>
        ) : isStalePending || isErrored ? (
          <>
            <small>Google Agenda</small>
            <strong>Conexão não finalizada</strong>
            <em>Clique em "Tentar novamente" para reiniciar o fluxo.</em>
          </>
        ) : (
          <>
            <small>Google Agenda</small>
            <strong>Sincronize seu cronograma</strong>
            <em>Eventos das suas comissões no seu calendário Google.</em>
          </>
        )}
      </div>

      <div className="fenasoja-google-widget-actions">
        {isConnected ? (
          <button
            type="button"
            className="fenasoja-google-widget-ghost"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
            aria-label="Desconectar Google Agenda"
          >
            {disconnect.isPending ? <Loader2 className="animate-spin" /> : <Unlink />}
            <span>Desconectar</span>
          </button>
        ) : (
          <button
            type="button"
            className="fenasoja-google-widget-cta"
            onClick={() => connect.mutate()}
            disabled={isConnecting}
          >
            {isConnecting ? <Loader2 className="animate-spin" /> : <LinkIcon />}
            <span>
              {isReconnect
                ? 'Reconectar'
                : isStalePending || isErrored
                ? 'Tentar novamente'
                : 'Conectar'}
            </span>
          </button>
        )}
      </div>
    </div>
  );
});
