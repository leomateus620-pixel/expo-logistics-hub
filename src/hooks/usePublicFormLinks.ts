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
  current_token?: string | null;
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
              current_token: token,
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

      return rows.map((r) => ({
        committee_id: r.row.committee_id,
        token: r.token,
      }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public_form_links', orgId] });
      toast.success('Links gerados com sucesso');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const regenerateToken = useMutation({
    mutationFn: async (linkId: string) => {
      const token = crypto.randomUUID();
      const tokenHash = await sha256(token);
      const tokenHint = token.slice(-4);
      const { error } = await (supabase as any)
        .from('public_form_links')
        .update({ current_token: token, token_hash: tokenHash, token_hint: tokenHint })
        .eq('id', linkId);
      if (error) throw error;
      return { linkId, token };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public_form_links', orgId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const regenerateAllTokens = useMutation({
    mutationFn: async (linkIds: string[]) => {
      const prepared = await Promise.all(
        linkIds.map(async (linkId) => {
          const token = crypto.randomUUID();
          const tokenHash = await sha256(token);
          const tokenHint = token.slice(-4);
          return { linkId, token, tokenHash, tokenHint };
        })
      );

      const settled = await Promise.allSettled(
        prepared.map(async ({ linkId, token, tokenHash, tokenHint }) => {
          const { error } = await (supabase as any)
            .from('public_form_links')
            .update({ current_token: token, token_hash: tokenHash, token_hint: tokenHint })
            .eq('id', linkId);
          if (error) throw error;
          return { linkId, token };
        })
      );

      const results: { linkId: string; token: string }[] = [];
      let failures = 0;
      for (const r of settled) {
        if (r.status === 'fulfilled') results.push(r.value);
        else failures++;
      }
      if (failures > 0 && results.length > 0) {
        toast.warning(`${failures} link(s) falharam. ${results.length} copiados.`);
      } else if (failures > 0 && results.length === 0) {
        throw new Error('Falha ao regenerar todos os tokens');
      }
      return results;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public_form_links', orgId] });
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

  return { ...query, generateAll, regenerateToken, regenerateAllTokens, toggleActive };
}
