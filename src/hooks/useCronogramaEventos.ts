import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import {
  fenasoja2028CronogramaSeed,
  type CronogramaCommissionLink,
  type CronogramaEventSeed,
  type CronogramaPriority,
  type CronogramaStatus,
  type CronogramaSubeventSeed,
} from '@/data/fenasoja2028CronogramaSeed';
import {
  normalizeCronogramaSeed,
  sortCronogramaEvents,
  type CronogramaEvent,
} from '@/lib/cronograma-eventos';

const officialSeedEvents = normalizeCronogramaSeed(fenasoja2028CronogramaSeed);

export type CronogramaEventDraft = Partial<CronogramaEventSeed> & {
  title: string;
  category: string;
  eventType: CronogramaEvent['eventType'];
};

interface SupabaseResult<T> {
  data: T | null;
  error: { message?: string } | null;
}

interface SupabaseQueryBuilder extends PromiseLike<SupabaseResult<unknown[]>> {
  select(columns?: string): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  order(column: string, options?: Record<string, unknown>): SupabaseQueryBuilder;
  limit(count: number): Promise<SupabaseResult<unknown[]>>;
  upsert(values: unknown, options?: Record<string, unknown>): SupabaseQueryBuilder;
  insert(values: unknown): SupabaseQueryBuilder;
  update(values: unknown): SupabaseQueryBuilder;
  single(): Promise<SupabaseResult<unknown>>;
}

const cronogramaDb = supabase as unknown as {
  from(table: string): SupabaseQueryBuilder;
  auth: typeof supabase.auth;
};

export function mergeOfficialSeedWithDb(seedEvents: CronogramaEvent[], dbEvents: CronogramaEvent[]): CronogramaEvent[] {
  const byKey = new Map<string, CronogramaEvent>();

  seedEvents.forEach((seedEvent) => {
    const key = seedEvent.sourceKey || seedEvent.id;
    byKey.set(key, seedEvent);
  });

  dbEvents.forEach((dbEvent) => {
    const key = dbEvent.sourceKey || dbEvent.id;
    const seedEvent = byKey.get(key);
    byKey.set(key, {
      ...(seedEvent ?? {}),
      ...dbEvent,
      id: dbEvent.id || seedEvent?.id || key,
      sourceKey: dbEvent.sourceKey || seedEvent?.sourceKey || key,
      isOfficialSeed: seedEvent?.isOfficialSeed ?? dbEvent.isOfficialSeed,
    });
  });

  return sortCronogramaEvents(Array.from(byKey.values()));
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function readString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' ? value : null;
}

function readNumber(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  return typeof value === 'number' ? value : null;
}

function fromDbRow(row: unknown): CronogramaEvent {
  const record = row as Record<string, unknown>;
  return {
    id: readString(record, 'id') ?? readString(record, 'source_key') ?? '',
    sourceKey: readString(record, 'source_key') ?? '',
    title: readString(record, 'title') ?? '',
    description: readString(record, 'description'),
    category: readString(record, 'category') ?? 'Outros / a classificar',
    eventType: (readString(record, 'event_type') ?? 'planejamento') as CronogramaEvent['eventType'],
    sourceYear: (readNumber(record, 'source_year') ?? 2028) as 2026 | 2027 | 2028,
    startDate: readString(record, 'start_date'),
    endDate: readString(record, 'end_date'),
    monthLabel: readString(record, 'month_label'),
    weekLabel: readString(record, 'week_label'),
    status: (readString(record, 'status') ?? 'planejado') as CronogramaStatus,
    priority: (readString(record, 'priority') ?? 'media') as CronogramaPriority,
    location: readString(record, 'location'),
    time: readString(record, 'event_time'),
    daysRemaining: readNumber(record, 'days_remaining'),
    commissionSlug: readString(record, 'commission_slug'),
    commissionName: readString(record, 'commission_name'),
    responsibleName: readString(record, 'responsible_name'),
    sourceSheet: readString(record, 'source_sheet') ?? 'Supabase',
    sourceRow: readString(record, 'source_row'),
    sourceCell: readString(record, 'source_cell'),
    sourceNote: readString(record, 'source_note'),
    isOfficialSeed: record.is_official_seed === true,
    hasExactDate: record.has_exact_date === false ? false : true,
    linkedCommissions: parseJsonArray<CronogramaCommissionLink>(record.linked_commissions),
    subevents: parseJsonArray<CronogramaSubeventSeed>(record.subevents),
    createdAt: readString(record, 'created_at'),
    updatedAt: readString(record, 'updated_at'),
  };
}

function toDbPayload(event: CronogramaEventSeed | CronogramaEvent, orgId: string, createdByUserId?: string | null) {
  return {
    org_id: orgId,
    source_key: event.sourceKey,
    title: event.title,
    description: event.description ?? null,
    category: event.category,
    event_type: event.eventType,
    source_year: event.sourceYear,
    start_date: event.startDate ?? null,
    end_date: event.endDate ?? null,
    month_label: event.monthLabel ?? null,
    week_label: event.weekLabel ?? null,
    status: event.status,
    priority: event.priority,
    location: event.location ?? null,
    event_time: event.time ?? null,
    days_remaining: event.daysRemaining ?? null,
    commission_slug: event.commissionSlug ?? null,
    commission_name: event.commissionName ?? null,
    responsible_name: event.responsibleName ?? null,
    source_sheet: event.sourceSheet,
    source_row: event.sourceRow ?? null,
    source_cell: event.sourceCell ?? null,
    source_note: event.sourceNote ?? null,
    is_official_seed: event.isOfficialSeed,
    has_exact_date: event.hasExactDate,
    linked_commissions: event.linkedCommissions ?? [],
    subevents: event.subevents ?? [],
    created_by_user_id: createdByUserId ?? null,
  };
}

function draftToEvent(draft: CronogramaEventDraft): CronogramaEvent {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
  const hasExactDate = Boolean(draft.startDate);
  return {
    id: `local-${id}`,
    sourceKey: draft.sourceKey ?? `manual-${id}`,
    title: draft.title,
    description: draft.description ?? null,
    category: draft.category,
    eventType: draft.eventType,
    sourceYear: draft.sourceYear ?? (draft.startDate ? Number(draft.startDate.slice(0, 4)) as 2026 | 2027 | 2028 : 2028),
    startDate: draft.startDate ?? null,
    endDate: draft.endDate ?? null,
    monthLabel: draft.monthLabel ?? null,
    weekLabel: draft.weekLabel ?? null,
    status: draft.status ?? (hasExactDate ? 'planejado' : 'aguardando_definicao'),
    priority: draft.priority ?? 'media',
    location: draft.location ?? null,
    time: draft.time ?? null,
    daysRemaining: draft.daysRemaining ?? null,
    commissionSlug: draft.commissionSlug ?? null,
    commissionName: draft.commissionName ?? null,
    responsibleName: draft.responsibleName ?? null,
    sourceSheet: draft.sourceSheet ?? 'Cadastro manual',
    sourceRow: draft.sourceRow ?? null,
    sourceCell: draft.sourceCell ?? null,
    sourceNote: draft.sourceNote ?? null,
    isOfficialSeed: draft.isOfficialSeed ?? false,
    hasExactDate,
    linkedCommissions: draft.linkedCommissions ?? [],
    subevents: draft.subevents ?? [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function isWritableRole(role: string | null) {
  return role === 'admin' || role === 'gestor' || role === 'operador';
}

export function useCronogramaEventos() {
  const { orgId, myRole } = useCurrentOrg();
  const queryClient = useQueryClient();
  const [sessionEvents, setSessionEvents] = useState<CronogramaEvent[]>(officialSeedEvents);
  const [dbUnavailable, setDbUnavailable] = useState(false);
  const seedAttemptedForOrg = useRef(new Set<string>());

  const query = useQuery({
    queryKey: ['cronograma-eventos', orgId],
    enabled: !!orgId,
    staleTime: 30000,
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await cronogramaDb
        .from('cronograma_eventos')
        .select('*')
        .eq('org_id', orgId)
        .order('start_date', { ascending: true, nullsFirst: false })
        .order('title', { ascending: true })
        .limit(1000);

      if (error) {
        setDbUnavailable(true);
        throw error;
      }

      setDbUnavailable(false);
      return (data ?? []).map(fromDbRow) as CronogramaEvent[];
    },
    retry: false,
  });

  const seedOfficialData = useMutation({
    mutationFn: async (eventsToSeed: CronogramaEvent[] = officialSeedEvents) => {
      if (!orgId || !isWritableRole(myRole)) return [];
      const user = (await cronogramaDb.auth.getUser()).data.user;
      if (eventsToSeed.length === 0) return [];
      const payload = eventsToSeed.map((event) => toDbPayload(event, orgId, user?.id));
      const { data, error } = await cronogramaDb
        .from('cronograma_eventos')
        .upsert(payload, { onConflict: 'org_id,source_key', ignoreDuplicates: true })
        .select('*');
      if (error) throw error;
      return (data ?? []).map(fromDbRow) as CronogramaEvent[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cronograma-eventos'] });
    },
    onError: () => {
      setDbUnavailable(true);
    },
  });
  const { isPending: isSeedingOfficialData, mutate: seedMissingOfficialData } = seedOfficialData;

  useEffect(() => {
    const dbEvents = query.data ?? [];
    setSessionEvents(mergeOfficialSeedWithDb(officialSeedEvents, dbEvents));

    if (!orgId || !query.data || !isWritableRole(myRole) || isSeedingOfficialData) return;

    const dbSourceKeys = new Set(dbEvents.map((event) => event.sourceKey).filter(Boolean));
    const missingOfficialEvents = officialSeedEvents.filter((event) => event.sourceKey && !dbSourceKeys.has(event.sourceKey));

    if (
      missingOfficialEvents.length > 0 &&
      !seedAttemptedForOrg.current.has(orgId) &&
      !isSeedingOfficialData
    ) {
      seedAttemptedForOrg.current.add(orgId);
      seedMissingOfficialData(missingOfficialEvents);
    }
  }, [isSeedingOfficialData, myRole, orgId, query.data, seedMissingOfficialData]);

  const create = useMutation({
    mutationFn: async (draft: CronogramaEventDraft) => {
      const event = draftToEvent(draft);
      const canUseDb = Boolean(orgId && !dbUnavailable);

      if (!canUseDb) return event;

      const user = (await cronogramaDb.auth.getUser()).data.user;
      const { data, error } = await cronogramaDb
        .from('cronograma_eventos')
        .insert(toDbPayload(event, orgId!, user?.id))
        .select('*')
        .single();
      if (error) throw error;
      return fromDbRow(data);
    },
    onSuccess: (event) => {
      setSessionEvents((current) => {
        const existingIndex = current.findIndex((item) => item.id === event.id || item.sourceKey === event.sourceKey);
        if (existingIndex === -1) return sortCronogramaEvents([...current, event]);
        return sortCronogramaEvents(current.map((item, index) => (index === existingIndex ? event : item)));
      });
      queryClient.invalidateQueries({ queryKey: ['cronograma-eventos'] });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CronogramaEvent> }) => {
      const current = sessionEvents.find((event) => event.id === id);
      if (!current) throw new Error('Evento não encontrado');
      const next = { ...current, ...updates, updatedAt: new Date().toISOString() };
      const canUseDb = Boolean(orgId && !dbUnavailable && next.sourceKey);

      if (!canUseDb) return next;

      const user = (await cronogramaDb.auth.getUser()).data.user;
      const { data, error } = await cronogramaDb
        .from('cronograma_eventos')
        .upsert(toDbPayload(next, orgId!, user?.id), { onConflict: 'org_id,source_key' })
        .select('*')
        .single();
      if (error) throw error;
      return fromDbRow(data);
    },
    onSuccess: (event) => {
      setSessionEvents((current) => {
        const existingIndex = current.findIndex((item) => item.id === event.id || item.sourceKey === event.sourceKey);
        if (existingIndex === -1) return sortCronogramaEvents([...current, event]);
        return sortCronogramaEvents(current.map((item, index) => (index === existingIndex ? event : item)));
      });
      queryClient.invalidateQueries({ queryKey: ['cronograma-eventos'] });
    },
  });

  const events = useMemo(() => sortCronogramaEvents(sessionEvents), [sessionEvents]);
  const isSeedFallback = dbUnavailable || !orgId || !query.data;

  return {
    events,
    isLoading: query.isLoading || isSeedingOfficialData,
    isSeedFallback,
    canManage: isWritableRole(myRole),
    create,
    update,
    seedOfficialData,
  };
}
