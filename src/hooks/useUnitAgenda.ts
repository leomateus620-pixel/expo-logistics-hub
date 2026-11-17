import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { useOrgCommissions } from './useOrgCommissions';
import { resolveUnitDirectory } from '@/features/commission-agenda/lib/unit-identity';
import { useAuth } from './useAuth';
import { invalidateInstitutionalAgendas } from '@/lib/institutional-agenda-cache';
import {
  toUnitAgendaEvents,
  canonicalEventToUnitAgendaRow,
  type UnitAgendaRow,
} from '@/features/commission-agenda/adapters/unit-agenda.adapter';

export interface UnitMetrics {
  total: number;
  upcoming: number;
  completed: number;
  inMonth: number;
  documents: number;
}

const EMPTY_METRICS: UnitMetrics = { total: 0, upcoming: 0, completed: 0, inMonth: 0, documents: 0 };
const EMPTY_AGENDA_ROWS: UnitAgendaRow[] = [];

interface UnitMetricsRpcRow {
  total?: number | null;
  upcoming?: number | null;
  completed?: number | null;
  in_month?: number | null;
  documents?: number | null;
}

interface UnitAgendaRpcResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

const unitAgendaRpc = supabase as unknown as {
  rpc(name: 'cronograma_unit_agenda', args: { _commission_id: string | null }): PromiseLike<UnitAgendaRpcResult<UnitAgendaRow[]>>;
  rpc(name: 'cronograma_unit_metrics', args: { _commission_id: string | null }): PromiseLike<UnitAgendaRpcResult<UnitMetricsRpcRow | UnitMetricsRpcRow[]>>;
};

/**
 * Resolve o identificador do catálogo oficial (ex.: `mercosul`) para o
 * `commissions.id` real da organização. Nada é vinculado por nome.
 */
export function useUnitIdentity(entryId: string | null | undefined) {
  const { units, directoryPeople, isLoading, error } = useOrgCommissions();
  return useMemo(() => ({ ...resolveUnitDirectory(units, entryId), resolvePerson: (id: string) => directoryPeople.find(person => person.id === id), isLoading, error }), [units, directoryPeople, entryId, isLoading, error]);
}

/**
 * Agenda de uma unidade lida direto no banco por `commission_id`
 * (sem carregar todos os eventos para filtrar no cliente).
 */
export function useUnitAgenda(entryId: string | null | undefined) {
  const { orgId } = useCurrentOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const {
    commissionId,
    commissionIdBySlug,
    commissionSlug,
    resolveUnit,
    resolvePerson,
    unitOptions,
    byCanonicalId,
    isLoading: identityLoading,
    identityError,
    error: directoryError,
  } = useUnitIdentity(entryId);

  const agendaQuery = useQuery({
    queryKey: ['unit-agenda', orgId, user?.id, commissionId],
    enabled: Boolean(orgId && user && commissionId),
    meta: { persist: false },
    staleTime: 30_000,
    queryFn: async (): Promise<UnitAgendaRow[]> => {
      const { data, error } = await unitAgendaRpc.rpc('cronograma_unit_agenda', {
        _commission_id: commissionId,
      });
      if (error) throw error;
      return data ?? EMPTY_AGENDA_ROWS;
    },
  });

  const metricsQuery = useQuery({
    queryKey: ['unit-metrics', orgId, user?.id, commissionId],
    enabled: Boolean(orgId && user && commissionId),
    meta: { persist: false },
    staleTime: 30_000,
    queryFn: async (): Promise<UnitMetrics> => {
      const { data, error } = await unitAgendaRpc.rpc('cronograma_unit_metrics', {
        _commission_id: commissionId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return EMPTY_METRICS;
      return {
        total: row.total ?? 0,
        upcoming: row.upcoming ?? 0,
        completed: row.completed ?? 0,
        inMonth: row.in_month ?? 0,
        documents: row.documents ?? 0,
      };
    },
  });

  const rows = agendaQuery.data ?? EMPTY_AGENDA_ROWS;
  const events = useMemo(() => toUnitAgendaEvents(rows, { resolveUnit, resolvePerson }), [rows, resolveUnit, resolvePerson]);

  const cacheSavedEvent = useCallback((saved: unknown) => {
    const row = canonicalEventToUnitAgendaRow(saved);
    if (!row) return;
    for (const [key, rows] of queryClient.getQueriesData<UnitAgendaRow[]>({ queryKey: ['unit-agenda', orgId, user?.id] })) {
      const linked = row.units?.some(unit => unit.commission_id === key[3]);
      const previous = rows?.find(event => event.id === row.id);
      const remaining = (rows ?? []).filter(event => event.id !== row.id);
      queryClient.setQueryData(key, linked ? [...remaining, { ...row, document_count: previous?.document_count ?? 0 }] : remaining);
    }
  }, [queryClient, orgId, user?.id]);

  const invalidate = useCallback(() => invalidateInstitutionalAgendas(queryClient, orgId), [queryClient, orgId]);

  return {
    commissionId,
    commissionIdBySlug,
    commissionSlug,
    unitOptions,
    byCanonicalId,
    rows,
    events,
    metrics: metricsQuery.data ?? EMPTY_METRICS,
    identityLoading,
    identityError,
    isLoading: identityLoading || agendaQuery.isLoading,
    isError: agendaQuery.isError || Boolean(directoryError) || (!identityLoading && Boolean(identityError)),
    refetch: agendaQuery.refetch,
    invalidate,
    cacheSavedEvent,
  };
}
