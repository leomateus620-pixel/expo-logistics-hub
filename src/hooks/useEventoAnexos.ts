import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCurrentOrg } from './useCurrentOrg';

const BUCKET = 'cronograma-event-attachments';

export interface EventoAnexo {
  id: string;
  event_id: string;
  org_id: string;
  uploaded_by: string | null;
  uploader_name: string | null;
  file_name: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  kind: 'foto' | 'documento';
  caption: string | null;
  created_at: string;
  updated_at: string;
}

export function useEventoAnexos(eventId: string | null | undefined) {
  const { user } = useAuth();
  const { orgId } = useCurrentOrg();
  const queryClient = useQueryClient();
  const enabled = !!eventId && !!orgId;

  const listQuery = useQuery({
    queryKey: ['cronograma-anexos', eventId],
    enabled,
    queryFn: async (): Promise<EventoAnexo[]> => {
      const { data, error } = await (supabase as any)
        .from('cronograma_evento_anexos')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!eventId || !orgId || !user) throw new Error('Sessão inválida');
      const maxBytes = 20 * 1024 * 1024;
      if (file.size > maxBytes) throw new Error('Arquivo excede 20 MB');
      const kind: 'foto' | 'documento' = file.type.startsWith('image/') ? 'foto' : 'documento';
      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${orgId}/${eventId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (upErr) throw upErr;

      const uploaderName =
        (user.user_metadata as any)?.nome_exibicao ||
        (user.user_metadata as any)?.full_name ||
        user.email ||
        null;

      const { data, error } = await (supabase as any)
        .from('cronograma_evento_anexos')
        .insert({
          event_id: eventId,
          org_id: orgId,
          uploaded_by: user.id,
          uploader_name: uploaderName,
          file_name: file.name,
          file_path: path,
          mime_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
          kind,
        })
        .select('*')
        .single();

      if (error) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
        throw error;
      }
      return data as EventoAnexo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cronograma-anexos', eventId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (anexo: EventoAnexo) => {
      const { error } = await (supabase as any)
        .from('cronograma_evento_anexos')
        .delete()
        .eq('id', anexo.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([anexo.file_path]).catch(() => undefined);
      return anexo.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cronograma-anexos', eventId] });
    },
  });

  const getSignedUrl = async (path: string, expiresIn = 3600): Promise<string | null> => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
    if (error) return null;
    return data?.signedUrl ?? null;
  };

  return {
    anexos: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    upload: uploadMutation.mutateAsync,
    uploading: uploadMutation.isPending,
    remove: removeMutation.mutateAsync,
    removing: removeMutation.isPending,
    getSignedUrl,
  };
}
