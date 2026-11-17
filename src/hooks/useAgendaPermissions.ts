import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCurrentOrg } from './useCurrentOrg';

interface AgendaPermissions {
  global_write: boolean;
  managed_commission_ids: string[];
  writable_event_ids: string[];
  deletable_event_ids: string[];
}

/** The server computes membership/role grants; module access never implies event write. */
export function useAgendaPermissions() {
  const { orgId } = useCurrentOrg();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['cronograma-agenda-access', orgId, user?.id],
    enabled: Boolean(orgId && user),
    meta: { persist: false },
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cronograma_agenda_permissions', { _org_id: orgId! });
      if (error) throw error;
      return data as unknown as AgendaPermissions;
    },
  });
  return {
    ...query,
    canCreateInUnit: (id?: string | null) => Boolean(id && query.data?.managed_commission_ids.includes(id)),
    canEditEvent: (id: string) => Boolean(query.data?.writable_event_ids.includes(id)),
    canDeleteEvent: (id: string) => Boolean(query.data?.deletable_event_ids.includes(id)),
  };
}
