import { useMemo, useState } from 'react';
import { BellRing, CalendarCheck2, Loader2, Smartphone, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import { useGoogleCalendarConnection } from '@/hooks/useGoogleCalendarConnection';
import { useCapabilitiesContext } from '@/contexts/CapabilitiesProvider';
import {
  VENUE_SCOPES,
  useVenueNotificationSettings,
  type VenueScope,
  type VenueSubscription,
} from '@/hooks/useVenueNotificationSettings';

const PUSH_MESSAGES: Record<string, string> = {
  registered: 'Avisos ativados neste aparelho.',
  'not-configured': 'O serviço de avisos ainda não está configurado.',
  unsupported: 'Este navegador não suporta avisos.',
  'open-in-new-tab': 'Abra o sistema em uma aba própria (ou pelo app instalado) para ativar os avisos.',
  denied: 'Os avisos foram bloqueados. Libere as notificações nas configurações do navegador.',
  error: 'Não foi possível ativar os avisos agora.',
};

const POPUP = 'width=540,height=720,resizable=yes,scrollbars=yes';

function formatDate(iso: string | null) {
  if (!iso) return 'ainda não sincronizado';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function findSub(list: VenueSubscription[], userId: string, scope: VenueScope) {
  return list.find((s) => s.user_id === userId && s.scope === scope) ?? null;
}

export function VenueNotificationsButton() {
  const { hasCapability } = useCapabilitiesContext();
  const manageAll = hasCapability('venue_events_full_access');
  const push = usePushRegistration();
  const google = useGoogleCalendarConnection();
  const { subscriptions, candidates, save, currentUserId } = useVenueNotificationSettings(manageAll);
  const [open, setOpen] = useState(false);
  const list = useMemo(() => subscriptions.data ?? [], [subscriptions.data]);

  const enablePush = async () => {
    const result = await push.enable();
    if (result === 'registered') toast.success(PUSH_MESSAGES.registered);
    else toast.error(PUSH_MESSAGES[result] ?? PUSH_MESSAGES.error);
  };

  const connectGoogle = () => {
    const popup = window.open('about:blank', 'fenasoja-google-oauth', POPUP);
    google.connect.mutate(popup);
  };

  const update = (userId: string, scope: VenueScope, patch: Partial<VenueSubscription> & { subscribed?: boolean }) => {
    const current = findSub(list, userId, scope);
    save.mutate(
      {
        userId,
        scope,
        subscribed: patch.subscribed ?? true,
        push_enabled: patch.push_enabled ?? current?.push_enabled ?? true,
        google_enabled: patch.google_enabled ?? current?.google_enabled ?? true,
      },
      { onError: () => toast.error('Não foi possível salvar a preferência.') },
    );
  };

  const connection = google.connection;
  const googleConnected = connection && ['connected', 'synchronizing'].includes(connection.status);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="venue-module-shell__notifications" aria-label="Notificações da Agenda Restaurante e Arena">
          <BellRing aria-hidden="true" />
          <span className="hidden sm:inline">Notificações</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Notificações</SheetTitle>
          <SheetDescription>
            Avisos no celular e Google Agenda para os eventos do Restaurante e da Arena.
          </SheetDescription>
        </SheetHeader>

        <section className="mt-6 space-y-3 rounded-xl border border-border p-4">
          <h3 className="flex items-center gap-2 font-semibold"><Smartphone className="h-4 w-4" /> Avisos neste aparelho</h3>
          <p className="text-sm text-muted-foreground">
            {push.hasDevice ? 'Ativos neste aparelho.' : 'Desativados neste aparelho.'} Você recebe aviso de evento novo,
            alteração de data/horário/espaço, cancelamento e 1 hora antes.
          </p>
          {push.status !== 'idle' && push.status !== 'registered' && (
            <p className="text-sm text-muted-foreground">{PUSH_MESSAGES[push.status]}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={enablePush} disabled={push.busy || !push.configured}>
              {push.busy ? <Loader2 className="animate-spin" /> : <Smartphone />}
              {push.hasDevice ? 'Reativar' : 'Ativar avisos'}
            </Button>
            {push.hasDevice && (
              <Button type="button" variant="outline" onClick={() => void push.disable()} disabled={push.busy}>
                Desativar
              </Button>
            )}
          </div>
        </section>

        <section className="mt-4 space-y-3 rounded-xl border border-border p-4">
          <h3 className="flex items-center gap-2 font-semibold"><CalendarCheck2 className="h-4 w-4" /> Google Agenda</h3>
          {google.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : googleConnected ? (
            <p className="text-sm text-muted-foreground">
              Conectado a <strong>{connection?.google_email ?? 'sua conta'}</strong>. Último sync: {formatDate(connection?.last_sync_at ?? null)}.
            </p>
          ) : connection?.status === 'reconnect_required' ? (
            <p className="text-sm text-muted-foreground">A conexão precisa ser refeita.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma conta Google conectada.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={connectGoogle} disabled={google.connect.isPending}>
              {google.connect.isPending && <Loader2 className="animate-spin" />}
              {googleConnected ? 'Reconectar' : 'Conectar Google'}
            </Button>
            {connection && (
              <Button type="button" variant="outline" onClick={() => google.disconnect.mutate()} disabled={google.disconnect.isPending}>
                Desconectar
              </Button>
            )}
          </div>
        </section>

        {currentUserId && (
          <section className="mt-4 space-y-3 rounded-xl border border-border p-4">
            <h3 className="font-semibold">Minhas agendas</h3>
            {VENUE_SCOPES.map((scope) => {
              const sub = findSub(list, currentUserId, scope.id);
              return (
                <div key={scope.id} className="space-y-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
                  <label className="flex items-center justify-between gap-3 font-medium">
                    Acompanhar {scope.label}
                    <Switch
                      checked={Boolean(sub)}
                      disabled={save.isPending}
                      onCheckedChange={(on) => update(currentUserId, scope.id, { subscribed: on })}
                    />
                  </label>
                  {sub && (
                    <div className="grid gap-2 pl-1 text-sm">
                      <label className="flex items-center justify-between gap-3">
                        Avisos no celular
                        <Switch checked={sub.push_enabled} onCheckedChange={(on) => update(currentUserId, scope.id, { push_enabled: on })} />
                      </label>
                      <label className="flex items-center justify-between gap-3">
                        Google Agenda
                        <Switch checked={sub.google_enabled} onCheckedChange={(on) => update(currentUserId, scope.id, { google_enabled: on })} />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              Responsáveis por um evento recebem os avisos dele mesmo sem acompanhar a agenda.
            </p>
          </section>
        )}

        {manageAll && (
          <section className="mt-4 mb-6 space-y-3 rounded-xl border border-border p-4">
            <h3 className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4" /> Quem acompanha</h3>
            {candidates.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            <ul className="space-y-2">
              {(candidates.data ?? []).map((person) => (
                <li key={person.user_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{person.full_name ?? 'Sem nome'}</span>
                  <span className="flex gap-3">
                    {VENUE_SCOPES.map((scope) => (
                      <label key={scope.id} className="flex items-center gap-1.5">
                        <Switch
                          checked={Boolean(findSub(list, person.user_id, scope.id))}
                          disabled={save.isPending}
                          onCheckedChange={(on) => update(person.user_id, scope.id, { subscribed: on })}
                          aria-label={`${person.full_name ?? 'Pessoa'} acompanha ${scope.label}`}
                        />
                        {scope.label}
                      </label>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </SheetContent>
    </Sheet>
  );
}
