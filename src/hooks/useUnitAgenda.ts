import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from './useCurrentOrg';
import { useOrgCommissions } from './useOrgCommissions';
import { resolveOfficialUnit } from '@/modules/commissions/officialCommissionCatalog';
import {
  toUnitAgendaEvents,
  type UnitAgendaRow,
} from '@/features/commission-agenda/adapters/unit-agenda.adapter';
import type { UnitSummary } from '@/features/commission-agenda/types';

export interface UnitMetrics {
  total: number;
  upcoming: number;
  completed: number;
  inMonth: number;
  documents: number;
}

const EMPTY_METRICS: UnitMetrics = { total: 0, upcoming: 0, completed: 0, inMonth: 0, documents: 0 };

/**
 * Resolve o identificador do catálogo oficial (ex.: `mercosul`) para o
 * `commissions.id` real da organização. Nada é vinculado por nome.
 */
export function useUnitIdentity(entryId: string | null | undefined) {
  const { units, isLoading } = useOrgCommissions();

  return useMemo(() => {
    const bySlug = new Map<string, UnitSummary>();
    let commissionId: string | null = null;
    let commissionSlug: string | null = null;

    for (const unit of units) {
      const official = resolveOfficialUnit(unit.slug) ?? resolveOfficialUnit(unit.name);
      const canonicalId = official?.entry.id ?? unit.slug;
      bySlug.set(unit.slug, {
        id: canonicalId,
        name: official?.entry.name ?? unit.name,
        shortName: official?.entry.shortName,
        type: unit.type === 'assessoria' ? 'assessoria' : 'comissao',
      });
      if (entryId && canonicalId === entryId) {
        commissionId = unit.id;
        commissionSlug = unit.slug;
      }
    }

    return {
      commissionId,
      commissionSlug,
      resolveUnit: (slug: string) => bySlug.get(slug),
      isLoading,
    };
  }, [units, entryId, isLoading]);
}

/**
 * Agenda de uma unidade lida direto no banco por `commission_id`
 * (sem carregar todos os eventos para filtrar no cliente).
 */
export function useUnitAgenda(entryId: string | null | undefined) {
  const { orgId } = useCurrentOrg();
  const queryClient = useQueryClient();
  const { commissionId, commissionSlug, resolveUnit, isLoading: identityLoading } = useUnitIdentity(entryId);

  const agendaQuery = useQuery({
    queryKey: ['unit-agenda', orgId, commissionId],
    enabled: Boolean(orgId && commissionId),
    staleTime: 30_000,
    queryFn: async (): Promise<UnitAgendaRow[]> => {
      const { data, error } = await (supabase as any).rpc('cronograma_unit_agenda', {
        _commission_id: commissionId,
      });
      if (error) throw error;
      return (data ?? []) as UnitAgendaRow[];
    },
  });

  const metricsQuery = useQuery({
    queryKey: ['unit-metrics', orgId, commissionId],
    enabled: Boolean(orgId && commissionId),
    staleTime: 30_000,
    queryFn: async (): Promise<UnitMetrics> => {
      const { data, error } = await (supabase as any).rpc('cronograma_unit_metrics', {
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

  const rows = agendaQuery.data ?? [];
  const events = useMemo(() => toUnitAgendaEvents(rows, { resolveUnit }), [rows, resolveUnit]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['unit-agenda', orgId, commissionId] });
    queryClient.invalidateQueries({ queryKey: ['unit-metrics', orgId, commissionId] });
    queryClient.invalidateQueries({ queryKey: ['cronograma-eventos'] });
  };

  return {
    commissionId,
    commissionSlug,
    rows,
    events,
    metrics: metricsQuery.data ?? EMPTY_METRICS,
    isLoading: identityLoading || agendaQuery.isLoading,
    isError: agendaQuery.isError,
    refetch: agendaQuery.refetch,
    invalidate,
  };
}
