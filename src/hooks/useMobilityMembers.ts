import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';

export interface MobilityMember {
  id: string;
  form_id: string;
  committee_id: string;
  member_name: string;
  member_role: string | null;
  member_identifier: string | null;
  access_electric_car: boolean;
  access_scooter: boolean;
  qr_access_free: boolean;
  access_status: string;
  notes: string | null;
  org_id: string;
  created_at: string;
}

export function useMobilityMembers(formId?: string) {
  const { orgId } = useCurrentOrg();
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['mobility-members', orgId, formId],
    queryFn: async () => {
      if (!orgId) return [];
      let query = (supabase as any)
        .from('committee_mobility_members')
        .select('*')
        .eq('org_id', orgId)
        .order('member_name');
      if (formId) query = query.eq('form_id', formId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const allMembers = useQuery({
    queryKey: ['mobility-members-all', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await (supabase as any)
        .from('committee_mobility_members')
        .select('*, committee_mobility_forms(committee_name_snapshot)')
        .eq('org_id', orgId)
        .order('member_name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const addMember = useMutation({
    mutationFn: async (params: {
      form_id: string;
      committee_id: string;
      member_name: string;
      member_role?: string;
      member_identifier?: string;
      access_electric_car: boolean;
      access_scooter: boolean;
      qr_access_free?: boolean;
      notes?: string;
    }) => {
      if (!orgId) throw new Error('No org');
      const { data, error } = await (supabase as any)
        .from('committee_mobility_members')
        .insert({ org_id: orgId, ...params })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobility-members'] });
      queryClient.invalidateQueries({ queryKey: ['mobility-members-all'] });
    },
  });

  const updateMember = useMutation({
    mutationFn: async (params: { id: string; [key: string]: any }) => {
      const { id, ...rest } = params;
      const { error } = await (supabase as any)
        .from('committee_mobility_members')
        .update(rest)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobility-members'] });
      queryClient.invalidateQueries({ queryKey: ['mobility-members-all'] });
    },
  });

  const deleteMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('committee_mobility_members')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mobility-members'] });
      queryClient.invalidateQueries({ queryKey: ['mobility-members-all'] });
    },
  });

  return {
    members,
    allMembers: allMembers.data || [],
    allMembersLoading: allMembers.isLoading,
    isLoading,
    addMember,
    updateMember,
    deleteMember,
  };
}
