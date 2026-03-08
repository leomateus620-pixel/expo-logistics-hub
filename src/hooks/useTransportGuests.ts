import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';

export function useTransportGuests() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data: transportGuests = [], isLoading } = useQuery({
    queryKey: ['transport-guests', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await (supabase as any)
        .from('transport_guests')
        .select('*')
        .eq('org_id', orgId);
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 30000,
  });

  const getGuestsForTransport = (transportId: string): string[] => {
    return transportGuests
      .filter((tg: any) => tg.transport_id === transportId)
      .map((tg: any) => tg.guest_id);
  };

  const setGuestsForTransport = useMutation({
    mutationFn: async ({ transportId, guestIds }: { transportId: string; guestIds: string[] }) => {
      if (!orgId) return;
      // Delete existing
      await (supabase as any)
        .from('transport_guests')
        .delete()
        .eq('transport_id', transportId)
        .eq('org_id', orgId);
      // Insert new
      if (guestIds.length > 0) {
        const rows = guestIds.map(gid => ({
          transport_id: transportId,
          guest_id: gid,
          org_id: orgId,
        }));
        const { error } = await (supabase as any)
          .from('transport_guests')
          .insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transport-guests'] });
    },
  });

  return { transportGuests, isLoading, getGuestsForTransport, setGuestsForTransport };
}
