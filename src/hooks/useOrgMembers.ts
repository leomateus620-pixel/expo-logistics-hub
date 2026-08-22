import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useCurrentOrg } from './useCurrentOrg';
import { logAudit } from '@/services/auditService';

type OrgMemberUpdate = Database['public']['Tables']['org_members']['Update'];
type OrgMemberUpdateInput = { id: string } & OrgMemberUpdate;
type OrgMemberInsert = Database['public']['Tables']['org_members']['Insert'];
type AddOrgMemberInput = Pick<OrgMemberInsert, 'user_id'> & {
  role?: OrgMemberInsert['role'];
  nome_exibicao: string;
  cargo?: string;
  telefone?: string;
  avatar_color?: string;
};

export function useOrgMembers() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const {
    data: memberData = [],
    isLoading: isLoadingMembers,
    error,
  } = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error: memberError } = await supabase
        .from('org_members_safe')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('nome_exibicao');
      if (memberError) throw memberError;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const {
    data: commissionNames = [],
    isLoading: isLoadingCommissionNames,
    error: commissionNamesError,
  } = useQuery({
    queryKey: ['org-member-commission-names', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error: commissionsError } = await supabase
        .from('commissions')
        .select('id, nome')
        .eq('org_id', orgId);
      if (commissionsError) throw commissionsError;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const members = useMemo(() => {
    const commissionById = new Map(commissionNames.map((commission) => (
      [commission.id, commission.nome]
    )));
    return memberData.map((member) => ({
      ...member,
      commission_nome: member.commission_id
        ? commissionById.get(member.commission_id) || null
        : null,
    }));
  }, [commissionNames, memberData]);
  const isLoading = isLoadingMembers || isLoadingCommissionNames;

  // Somente pessoas com conta de acesso real que já entraram no sistema
  const {
    data: loginMembers = [],
    isLoading: isLoadingLoginMembers,
    error: loginMembersError,
  } = useQuery({
    queryKey: ['org-login-members', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase.rpc('list_org_login_members', { _org_id: orgId });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60000,
  });

  const addMember = useMutation({
    mutationFn: async (member: AddOrgMemberInput) => {
      const { data, error } = await supabase
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
    mutationFn: async ({ id, ...updates }: OrgMemberUpdateInput) => {
      const { data: before } = await supabase.from('org_members').select('*').eq('id', id).single();
      const { data, error } = await supabase
        .from('org_members')
        .update(updates as OrgMemberUpdate)
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
      const { data: before } = await supabase.from('org_members').select('*').eq('id', id).single();
      const { error } = await supabase.from('org_members').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      await logAudit({ orgId: orgId!, entity: 'org_members', entityId: id, action: 'delete', before });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-members'] }),
  });

  return {
    members,
    loginMembers,
    isLoading,
    isLoadingLoginMembers,
    error,
    commissionNamesError,
    loginMembersError,
    addMember,
    updateMember,
    removeMember,
  };
}
