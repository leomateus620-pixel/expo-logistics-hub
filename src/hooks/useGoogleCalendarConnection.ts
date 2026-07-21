import { useEffect, useRef } from 'react';
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

  const completeConnection = async (useOrg: string) => {
    const tryCall = async () =>
      invoke<{ ok: boolean; calendarId?: string; backfill?: number; pending?: boolean }>(
        'complete',
        { orgId: useOrg },
      );
    let last: unknown;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const res = await tryCall();
        if ((res as any).pending) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return res;
      } catch (e: any) {
        last = e;
        const msg = String(e?.message ?? e);
        const isRetryable = msg.includes('no_connection') || msg.includes('non-2xx') || msg.includes('pending');
        if (!isRetryable || attempt === 5) throw e;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    throw last ?? new Error('no_connection');
  };

  const connect = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('sem_organizacao');
      // Limpa qualquer estado travado (connecting/error) antes de reiniciar.
      try { await invoke('reset'); } catch { /* ignore */ }
      const returnUrl = `${window.location.origin}${window.location.pathname}?google=connected`;
      const oauth = await invoke<{ authorization_url?: string; authorize_url?: string; url?: string; session_id?: string }>(
        'start',
        { orgId, returnUrl },
      );
      const authorizeUrl = oauth.authorization_url ?? oauth.authorize_url ?? oauth.url;
      if (!authorizeUrl) {
        console.error('[google-oauth] resposta sem authorization_url:', oauth);
        throw new Error('sem_url_oauth');
      }

      const popup = window.open(authorizeUrl, 'google-oauth', 'width=520,height=680');
      if (!popup) throw new Error('popup_bloqueado');

      // Aguarda o popup fechar (usuário concluiu ou cancelou)
      await new Promise<void>((resolve) => {
        const interval = window.setInterval(() => {
          if (popup.closed) { window.clearInterval(interval); resolve(); }
        }, 800);
      });

      return await completeConnection(orgId);
    },
    onSuccess: (data) => {
      const n = (data as any)?.backfill ?? 0;
      toast({ title: 'Google Agenda conectada', description: `${n} eventos serão sincronizados em segundo plano.` });
      qc.invalidateQueries({ queryKey: ['google-calendar-status'] });
    },
    onError: (e: Error) => {
      console.error('[google-oauth] connect error:', e);
      const known: Record<string, string> = {
        popup_bloqueado: 'Ative pop-ups no navegador para conectar sua conta Google.',
        sem_organizacao: 'Nenhuma organização ativa. Selecione uma organização antes de conectar.',
        sem_url_oauth: 'O servidor não devolveu a URL de autorização do Google. Tente novamente.',
      };
      const description = known[e.message] ?? `Falha ao conectar Google Agenda: ${e.message}`;
      toast({ title: 'Erro', description, variant: 'destructive' });
    },
  });

  // Recuperação: quando o usuário volta ao app com ?google=connected na URL,
  // dispara complete() automaticamente para fechar o fluxo mesmo que o popup
  // tenha sido fechado antes do await terminar.
  const recoveryTriedRef = useRef(false);
  useEffect(() => {
    if (recoveryTriedRef.current) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('google') !== 'connected') return;
    if (!orgId) return;
    recoveryTriedRef.current = true;
    completeConnection(orgId)
      .then(() => qc.invalidateQueries({ queryKey: ['google-calendar-status'] }))
      .catch((e) => console.warn('[google-oauth] recovery complete falhou:', e))
      .finally(() => {
        params.delete('google');
        const qs = params.toString();
        const newUrl = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
      });
  }, [orgId, qc]);



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
