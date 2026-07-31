import { useMemo } from 'react';
import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import {
  buildCronogramaDashboardModel,
  type CronogramaDashboardLog,
  type DashboardLogStatus,
} from '@/lib/cronograma-dashboard-selectors';

interface UseCronogramaDashboardDataOptions {
  events: CronogramaEvent[];
  logs: CronogramaDashboardLog[] | null;
  logStatus: DashboardLogStatus;
  todayKey?: string;
}

export function useCronogramaDashboardData({
  events,
  logs,
  logStatus,
  todayKey,
}: UseCronogramaDashboardDataOptions) {
  return useMemo(
    () => buildCronogramaDashboardModel(events, logs, { logStatus, todayKey }),
    [events, logs, logStatus, todayKey],
  );
}
