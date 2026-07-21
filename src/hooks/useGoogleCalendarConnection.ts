import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useToast } from '@/hooks/use-toast';

export interface GoogleCalendarConnection {
  user_id: string;
  org_id: string;
  google_email: string | null;
  secondary_calendar_id: string | null;
  status: 'connected' | 'reconnect_required' | 'disconnected' | 'error' | 'connecting';
  last_sync_at: string | null;
  last_error: string | null;
  backfill_total: number;
  backfill_done: number;
  connected_at: string;
}

export interface GoogleStatusResponse {
  connection: GoogleCalendarConnection | null;
  pending: number;
}

async function invoke<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('google-calendar-oauth', {
    body: { action, ...body },
  });
  if (error) throw error;
  return data as T;
}

export function useGoogleCalendarConnection() {
  const { user } = useAuth();
  const { orgId } = useCurrentOrg();
  const { toast } = useToast();
  const qc = useQueryClient();

  const status = useQuery({
    queryKey: ['google-calendar-status', user?.id],
    queryFn: () => invoke<GoogleStatusResponse>('status'),
    enabled: !!user,
    refetchInterval: (q) => {
      const data = q.state.data as GoogleStatusResponse | undefined;
      if (data?.connection?.status === 'connecting') return 4000;
      if ((data?.pending ?? 0) > 0) return 10000;
      return 60000;
    },
  });

  const connect = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('sem_organizacao');
      const returnUrl = `${window.location.origin}/settings?google=connected`;
      const oauth = await invoke<{ authorize_url?: string; url?: string }>('start', { orgId, returnUrl });
      const authorizeUrl = oauth.authorize_url ?? oauth.url;
      if (!authorizeUrl) throw new Error('sem_url_oauth');

      const popup = window.open(authorizeUrl, 'google-oauth', 'width=520,height=680');
      if (!popup) throw new Error('popup_bloqueado');

      // Aguarda o popup fechar (usuário concluiu ou cancelou)
      await new Promise<void>((resolve) => {
        const interval = window.setInterval(() => {
          if (popup.closed) { window.clearInterval(interval); resolve(); }
        }, 800);
      });

      // Completa: busca connection_key + cria calendário + backfill
      return invoke<{ ok: boolean; calendarId: string; backfill: number }>('complete', { orgId });
    },
    onSuccess: (data) => {
      toast({ title: 'Google Agenda conectada', description: `${data.backfill} eventos serão sincronizados em segundo plano.` });
      qc.invalidateQueries({ queryKey: ['google-calendar-status'] });
    },
    onError: (e: Error) => {
      const msg = e.message === 'popup_bloqueado'
        ? 'Ative pop-ups para conectar sua conta Google.'
        : 'Falha ao conectar Google Agenda.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    },
  });

  const disconnect = useMutation({
    mutationFn: () => invoke<{ ok: boolean }>('disconnect'),
    onSuccess: () => {
      toast({ title: 'Google Agenda desconectada' });
      qc.invalidateQueries({ queryKey: ['google-calendar-status'] });
    },
  });

  return {
    connection: status.data?.connection ?? null,
    pending: status.data?.pending ?? 0,
    isLoading: status.isLoading,
    connect,
    disconnect,
  };
}
