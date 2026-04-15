import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { toast } from 'sonner';

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface PublicFormLink {
  id: string;
  org_id: string;
  committee_id: string;
  committee_name_snapshot: string;
  president_name_snapshot: string;
  token_hash: string;
  token_hint: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function usePublicFormLinks() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['public_form_links', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('public_form_links')
        .select('*')
        .eq('org_id', orgId!)
        .order('committee_name_snapshot');
      if (error) throw error;
      return data as PublicFormLink[];
    },
  });

  const generateAll = useMutation({
    mutationFn: async (committees: { id: string; committee_name: string; president_name: string }[]) => {
      if (!orgId) throw new Error('Sem organização');
      
      // Get existing links to skip
      const { data: existing } = await (supabase as any)
        .from('public_form_links')
        .select('committee_id')
        .eq('org_id', orgId);
      
      const existingIds = new Set((existing ?? []).map((e: any) => e.committee_id));
      const toCreate = committees.filter((c) => !existingIds.has(c.id));
      
      if (toCreate.length === 0) {
        toast.info('Todos os links já foram gerados');
        return;
      }

      const rows = await Promise.all(
        toCreate.map(async (c) => {
          const token = crypto.randomUUID();
          const tokenHash = await sha256(token);
          const tokenHint = token.slice(-4);
          return {
            row: {
              org_id: orgId,
              committee_id: c.id,
              committee_name_snapshot: c.committee_name,
              president_name_snapshot: c.president_name,
              token_hash: tokenHash,
              token_hint: tokenHint,
              is_active: true,
            },
            token,
            committeeName: c.committee_name,
          };
        })
      );

      const { error } = await (supabase as any)
        .from('public_form_links')
        .insert(rows.map((r) => r.row));
      if (error) throw error;

      // Return the generated tokens so we can show them
      return rows.map((r) => ({
        committee_id: r.row.committee_id,
        committee_name: r.committeeName,
        token: r.token,
      }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public_form_links', orgId] });
      toast.success('Links gerados com sucesso');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any)
        .from('public_form_links')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public_form_links', orgId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { ...query, generateAll, toggleActive };
}
