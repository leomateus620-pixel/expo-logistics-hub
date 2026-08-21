import { useMemo } from 'react';
import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import { buildAgendaKpiMetrics, type AgendaKpiMetrics } from '@/lib/cronograma-kpi-metrics';

/**
 * Agregação única dos indicadores superiores da Dashboard da Agenda Fenasoja.
 * Deriva exclusivamente dos eventos já carregados em cache — nenhuma consulta nova.
 */
export function useAgendaDashboardMetrics(
  events: CronogramaEvent[],
  todayKey?: string,
): AgendaKpiMetrics {
  return useMemo(() => buildAgendaKpiMetrics(events, todayKey), [events, todayKey]);
}
