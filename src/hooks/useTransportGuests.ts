import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { useCallback } from 'react';

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

  const getGuestsForTransport = useCallback((transportId: string): string[] => {
    return transportGuests
      .filter((tg: any) => tg.transport_id === transportId)
      .map((tg: any) => tg.guest_id);
  }, [transportGuests]);

  const setGuestsForTransport = useMutation({
    mutationFn: async ({ transportId, guestIds }: { transportId: string; guestIds: string[] }) => {
      if (!orgId) return;
      const { error } = await (supabase as any).rpc('set_transport_guests', {
        _transport_id: transportId,
        _org_id: orgId,
        _guest_ids: guestIds,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transport-guests'] });
    },
  });

  return { transportGuests, isLoading, getGuestsForTransport, setGuestsForTransport };
}
