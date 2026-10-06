import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { cronogramaEventsQueryKey, fetchCronogramaDatasetForOrg } from '@/hooks/useCronogramaEventos';
import { buildWeeklySummary, type WeeklySummary } from '@/lib/cronograma-weekly-summary';
import { filterCronogramaAgendaMode } from '@/lib/cronograma-agenda-mode';
import { useCronogramaAgendaMode } from '@/components/cronograma-eventos/CronogramaAgendaModeContext';

export function useCronogramaWeeklySummary() {
  const { user } = useAuth();
  const agendaMode = useCronogramaAgendaMode()?.mode ?? 'general';
  const { orgId, membership } = useCurrentOrg();

  const query = useQuery({
    queryKey: cronogramaEventsQueryKey(orgId),
    enabled: !!orgId,
    staleTime: 30000,
    retry: false,
    queryFn: async () => (orgId
      ? fetchCronogramaDatasetForOrg(orgId)
      : { events: [], deletedSourceKeys: [] }),
  });

  const displayName = (membership as { nome_exibicao?: string | null } | null | undefined)?.nome_exibicao
    ?? (user?.user_metadata?.full_name as string | undefined)
    ?? null;

  const summary: WeeklySummary = useMemo(
    () => buildWeeklySummary(filterCronogramaAgendaMode(query.data?.events ?? [], agendaMode), { userId: user?.id ?? null, displayName }),
    [agendaMode, displayName, query.data, user?.id],
  );

  return {
    summary,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
