import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';

export function useOrgMembers() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data: memberData } = await (supabase as any)
        .from('org_members_safe')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('nome_exibicao');
      if (!memberData) return [];
      // Fetch commissions separately to get names
      const { data: commData } = await (supabase as any)
        .from('commissions')
        .select('id, nome')
        .eq('org_id', orgId);
      const commMap = new Map((commData || []).map((c: any) => [c.id, c.nome]));
      return memberData.map((m: any) => ({
        ...m,
        commission_nome: m.commission_id ? commMap.get(m.commission_id) || null : null,
      }));
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const addMember = useMutation({
    mutationFn: async (member: { user_id: string; role?: string; nome_exibicao: string; cargo?: string; telefone?: string; avatar_color?: string }) => {
      const { data, error } = await (supabase as any)
        .from('org_members')
        .insert({ ...member, org_id: orgId, role: member.role || 'operador' })
        .select()
        .single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'org_members', entityId: data.id, action: 'create', after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members'] }),
  });

  const updateMember = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data: before } = await (supabase as any).from('org_members').select('*').eq('id', id).single();
      const { data, error } = await (supabase as any)
        .from('org_members')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'org_members', entityId: id, action: 'update', before, after: data });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members'] }),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { data: before } = await (supabase as any).from('org_members').select('*').eq('id', id).single();
      const { error } = await (supabase as any).from('org_members').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'org_members', entityId: id, action: 'delete', before });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members'] }),
  });

  return { members, isLoading, addMember, updateMember, removeMember };
}
