import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { toast } from 'sonner';

export interface NotificationRecipient {
  id: string;
  org_id: string;
  nome: string;
  telefone: string;
  tipo: string;
  ativo: boolean;
  notify_on_start: boolean;
  message_template: string;
  created_at: string;
  updated_at: string;
}

export function useNotificationRecipients() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ['notification_recipients', orgId],
    queryFn: async () => {
      if (!orgId) return [] as NotificationRecipient[];
      const { data, error } = await (supabase as any)
        .from('notification_recipients')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as NotificationRecipient[];
    },
    enabled: !!orgId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['notification_recipients'] });

  const create = useMutation({
    mutationFn: async (input: Partial<NotificationRecipient>) => {
      const { error } = await (supabase as any).from('notification_recipients').insert({
        org_id: orgId,
        nome: input.nome,
        telefone: input.telefone,
        tipo: input.tipo || 'agente_viagem',
        ativo: input.ativo ?? true,
        notify_on_start: input.notify_on_start ?? true,
        message_template: input.message_template,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Destinatário adicionado'); invalidate(); },
    onError: (e: any) => toast.error(e?.message || 'Erro ao adicionar'),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NotificationRecipient> }) => {
      const { error } = await (supabase as any)
        .from('notification_recipients')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Atualizado'); invalidate(); },
    onError: (e: any) => toast.error(e?.message || 'Erro ao atualizar'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('notification_recipients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Removido'); invalidate(); },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover'),
  });

  return { recipients, isLoading, create, update, remove };
}
