import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type {
  CronogramaDashboardLog,
  DashboardLogStatus,
} from '@/lib/cronograma-dashboard-selectors';

const LOG_PAGE_SIZE = 500;
const LOG_QUERY_BATCH_SIZE = 100;
const LOG_HARD_LIMIT = 10_000;

type JsonRecord = Record<string, unknown>;

interface DashboardLogQueryResult {
  logs: CronogramaDashboardLog[];
  partial: boolean;
}

interface DashboardQueryResult {
  data: unknown[] | null;
  error: { message?: string } | null;
}

interface DashboardQueryBuilder extends PromiseLike<DashboardQueryResult> {
  select(columns: string): DashboardQueryBuilder;
  in(column: string, values: string[]): DashboardQueryBuilder;
  order(column: string, options: { ascending: boolean }): DashboardQueryBuilder;
  range(from: number, to: number): DashboardQueryBuilder;
  limit(count: number): DashboardQueryBuilder;
  abortSignal(signal: AbortSignal): DashboardQueryBuilder;
}

const dashboardDb = supabase as unknown as {
  from(table: string): DashboardQueryBuilder;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function readString(row: JsonRecord, key: string) {
  const value = row[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function chunk<T>(values: T[], size: number) {
  return Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  );
}

async function loadProfileLabels(userIds: string[], signal?: AbortSignal) {
  const labels = new Map<string, string>();
  for (const ids of chunk(userIds, LOG_QUERY_BATCH_SIZE)) {
    let request = dashboardDb
      .from('profiles')
      .select('user_id,full_name')
      .in('user_id', ids)
      .limit(LOG_QUERY_BATCH_SIZE);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) continue;
    for (const value of data ?? []) {
      const row = value as JsonRecord;
      const userId = readString(row, 'user_id');
      const fullName = readString(row, 'full_name');
      if (userId && fullName) labels.set(userId, fullName);
    }
  }
  return labels;
}

async function loadDashboardLogs(
  eventIds: string[],
  signal?: AbortSignal,
): Promise<DashboardLogQueryResult> {
  const rows: JsonRecord[] = [];
  let partial = false;

  for (const ids of chunk(eventIds, LOG_QUERY_BATCH_SIZE)) {
    let from = 0;
    while (from < LOG_HARD_LIMIT) {
      let request = dashboardDb
        .from('cronograma_evento_logs')
        .select('id,event_id,entity_type,entity_id,action,previous_value,new_value,user_id,created_at')
        .in('event_id', ids)
        .order('created_at', { ascending: true })
        .range(from, from + LOG_PAGE_SIZE - 1);
      if (signal) request = request.abortSignal(signal);

      const { data, error } = await request;
      if (error) throw new Error(error.message || 'Histórico executivo indisponível.');

      const page = (data ?? []) as JsonRecord[];
      rows.push(...page);
      if (rows.length >= LOG_HARD_LIMIT) {
        partial = true;
        break;
      }
      if (page.length < LOG_PAGE_SIZE) break;
      from += LOG_PAGE_SIZE;
    }
    if (partial) break;
  }

  const userIds = Array.from(
    new Set(
      rows
        .map((row) => readString(row, 'user_id'))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const profileLabels = await loadProfileLabels(userIds, signal);

  return {
    partial,
    logs: rows.map((row, index) => {
      const userId = readString(row, 'user_id');
      const createdAt = readString(row, 'created_at') ?? new Date(0).toISOString();
      return {
        id: readString(row, 'id') ?? `${readString(row, 'event_id')}-${createdAt}-${index}`,
        eventId: readString(row, 'event_id') ?? '',
        entityType: readString(row, 'entity_type') ?? 'event',
        entityId: readString(row, 'entity_id'),
        action: readString(row, 'action') ?? 'updated',
        previousValue: asRecord(row.previous_value),
        newValue: asRecord(row.new_value),
        userId,
        userLabel: (userId && profileLabels.get(userId)) || 'Usuário autenticado',
        createdAt,
      };
    }),
  };
}

export function useCronogramaDashboardActivity(eventIds: string[], enabled: boolean) {
  const { myRole, isLoading: isOrgLoading } = useCurrentOrg();
  const isOnline = useOnlineStatus();
  const canViewHistory = myRole === 'admin' || myRole === 'gestor';
  const persistedEventIds = useMemo(
    () => Array.from(new Set(eventIds.filter(isUuid))).sort(),
    [eventIds],
  );

  const query = useQuery({
    queryKey: ['cronograma-dashboard-activity', persistedEventIds],
    enabled:
      enabled &&
      !isOrgLoading &&
      canViewHistory &&
      isOnline &&
      persistedEventIds.length > 0,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => loadDashboardLogs(persistedEventIds, signal),
  });

  let status: DashboardLogStatus = 'idle';
  if (enabled) {
    if (isOrgLoading) status = 'loading';
    else if (!canViewHistory) status = 'restricted';
    else if (!isOnline) status = 'offline';
    else if (persistedEventIds.length === 0) status = 'unavailable';
    else if (query.isLoading) status = 'loading';
    else if (query.isError) status = 'error';
    else if (query.data?.partial) status = 'partial';
    else if (!query.data?.logs.length) status = 'empty';
    else status = 'ready';
  }

  return {
    logs: query.data?.logs ?? null,
    status,
    canViewHistory,
    isLoading: status === 'loading',
    error: query.error instanceof Error ? query.error : null,
    refetch: query.refetch,
  };
}
