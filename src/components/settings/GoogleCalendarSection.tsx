import { useGoogleCalendarConnection } from '@/hooks/useGoogleCalendarConnection';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle2, AlertTriangle, Loader2, Unlink } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function GoogleCalendarSection() {
  const { connection, pending, isLoading, connect, disconnect } = useGoogleCalendarConnection();

  const status = connection?.status ?? 'disconnected';
  const backfillPct = connection && connection.backfill_total > 0
    ? Math.min(100, Math.round((connection.backfill_done / connection.backfill_total) * 100))
    : null;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Google Agenda</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Sincronize automaticamente os eventos da sua comissão para um calendário dedicado na sua conta Google.
            </p>
          </div>
        </div>
        {status === 'connected' && <Badge className="bg-green-500/15 text-green-700 border-green-500/30">Conectado</Badge>}
        {status === 'reconnect_required' && <Badge variant="destructive">Reconectar</Badge>}
        {status === 'connecting' && <Badge variant="secondary">Conectando…</Badge>}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Verificando conexão…
        </div>
      ) : connection ? (
        <div className="space-y-3">
          {connection.google_email && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="font-medium">{connection.google_email}</span>
              <span className="text-muted-foreground">· calendário &quot;FENASOJA — Cronograma&quot;</span>
            </div>
          )}
          {connection.last_sync_at && (
            <p className="text-xs text-muted-foreground">
              Última sincronização: {format(new Date(connection.last_sync_at), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
            </p>
          )}
          {backfillPct !== null && backfillPct < 100 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Sincronização inicial</span>
                <span>{connection.backfill_done}/{connection.backfill_total}</span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${backfillPct}%` }} />
              </div>
            </div>
          )}
          {pending > 0 && (
            <p className="text-xs text-muted-foreground">{pending} alteração(ões) em processamento…</p>
          )}
          {status === 'reconnect_required' && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <div>
                <p className="font-medium">Precisamos reconectar sua conta.</p>
                <p className="text-xs opacity-80">A permissão expirou ou foi revogada.</p>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            {status !== 'connected' && (
              <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending}>
                {connect.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Reconectar
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
              <Unlink className="h-4 w-4 mr-2" /> Desconectar
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
          {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calendar className="h-4 w-4 mr-2" />}
          Conectar Google Agenda
        </Button>
      )}
    </Card>
  );
}
