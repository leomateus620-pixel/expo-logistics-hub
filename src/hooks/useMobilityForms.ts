import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { useAuth } from './useAuth';

export function useMobilityForms() {
  const { orgId } = useCurrentOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: forms = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['mobility-forms', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await (supabase as any)
        .from('committee_mobility_forms')
        .select('*, official_committees(committee_name, president_name)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30_000,
    retry: 2,
  });

  const createForm = useMutation({
    mutationFn: async (params: {
      committee_id: string;
      committee_name_snapshot: string;
      president_name_snapshot: string;
      operational_responsible_name?: string;
      operational_responsible_phone?: string;
      operational_responsible_email?: string;
      needs_electric_car: boolean;
      needs_scooter: boolean;
    }) => {
      if (!orgId || !user) throw new Error('Missing context');
      const { data, error } = await (supabase as any)
        .from('committee_mobility_forms')
        .insert({
          org_id: orgId,
          submitted_by_user_id: user.id,
          ...params,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobility-forms'] }),
  });

  const updateForm = useMutation({
    mutationFn: async (params: { id: string; [key: string]: any }) => {
      const { id, ...rest } = params;
      const { error } = await (supabase as any)
        .from('committee_mobility_forms')
        .update(rest)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobility-forms'] }),
  });

  const submitForm = useMutation({
    mutationFn: async (formId: string) => {
      const { error } = await (supabase as any)
        .from('committee_mobility_forms')
        .update({ submission_status: 'enviado', submitted_at: new Date().toISOString() })
        .eq('id', formId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobility-forms'] }),
  });

  const deleteForm = useMutation({
    mutationFn: async (formId: string) => {
      const { error } = await (supabase as any)
        .from('committee_mobility_forms')
        .delete()
        .eq('id', formId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobility-forms'] }),
  });

  return { forms, isLoading, isError, refetch, createForm, updateForm, submitForm, deleteForm };
}
