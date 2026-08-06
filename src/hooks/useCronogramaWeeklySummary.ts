import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { cronogramaEventsQueryKey, fetchCronogramaEventsForOrg } from '@/hooks/useCronogramaEventos';
import { buildWeeklySummary, type WeeklySummary } from '@/lib/cronograma-weekly-summary';

export function useCronogramaWeeklySummary() {
  const { user } = useAuth();
  const { orgId, membership } = useCurrentOrg();

  const query = useQuery({
    queryKey: cronogramaEventsQueryKey(orgId),
    enabled: !!orgId,
    staleTime: 30000,
    retry: false,
    queryFn: async () => (orgId ? fetchCronogramaEventsForOrg(orgId) : []),
  });

  const displayName = (membership as { nome_exibicao?: string | null } | null | undefined)?.nome_exibicao
    ?? (user?.user_metadata?.full_name as string | undefined)
    ?? null;

  const summary: WeeklySummary = useMemo(
    () => buildWeeklySummary(query.data ?? [], { userId: user?.id ?? null, displayName }),
    [displayName, query.data, user?.id],
  );

  return {
    summary,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
