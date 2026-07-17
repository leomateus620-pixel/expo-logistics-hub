import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  cronogramaSaveEvent,
  cronogramaSaveSubevent,
  cronogramaDeleteSubevent,
  cronogramaReorderSubevents,
  type CronogramaSaveEventPayload,
  type CronogramaSaveSubeventPayload,
} from '@/lib/cronograma-rpc';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
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
import type { CronogramaHistoryEntry } from '@/components/cronograma-eventos/types';
import {
  attachQueuedCronogramaRelationships,
  enqueueCronogramaRelationship,
  isQueueableCronogramaRelationshipError,
  readCronogramaRelationshipQueue,
  recordQueuedCronogramaAttempt,
  removeQueuedCronogramaRelationship,
  updateQueuedCronogramaRelationship,
  type QueuedCronogramaRelationship,
} from '@/lib/cronograma-relationship-queue';

export type CronogramaEventDraft = Partial<CronogramaEventSeed> & {
  title: string;
  category: string;
  eventType: CronogramaEvent['eventType'];
};

export type CronogramaSubeventDraft = Omit<
  CronogramaSubeventSeed,
  'id' | 'storage' | 'createdAt' | 'updatedAt'
> & {
  title: string;
};

interface SupabaseResult<T> {
  data: T | null;
  error: { message?: string; code?: string } | null;
}

interface SupabaseQueryBuilder extends PromiseLike<SupabaseResult<unknown[]>> {
  select(columns?: string): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  in(column: string, values: unknown[]): SupabaseQueryBuilder;
  order(column: string, options?: Record<string, unknown>): SupabaseQueryBuilder;
  limit(count: number): Promise<SupabaseResult<unknown[]>>;
  upsert(values: unknown, options?: Record<string, unknown>): SupabaseQueryBuilder;
  insert(values: unknown): SupabaseQueryBuilder;
  update(values: unknown): SupabaseQueryBuilder;
  delete(): SupabaseQueryBuilder;
  single(): Promise<SupabaseResult<unknown>>;
}

const cronogramaDb = supabase as unknown as {
  from(table: string): SupabaseQueryBuilder;
  auth: typeof supabase.auth;
};

function decorateEmbeddedSubevents(event: CronogramaEvent): CronogramaEvent {
  return {
    ...event,
    subevents: (event.subevents ?? []).map((subevent, index) => ({
      ...subevent,
      id: subevent.id ?? `embedded:${event.sourceKey || event.id}:${index}`,
      sortOrder: subevent.sortOrder ?? index,
      storage: subevent.storage ?? 'embedded',
    })),
  };
}

const officialSeedEvents = normalizeCronogramaSeed(fenasoja2028CronogramaSeed).map(decorateEmbeddedSubevents);

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

function readObject(row: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = row[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

const historyFieldLabels: Array<[string[], string]> = [
  [['title'], 'título'],
  [['description', 'summary'], 'resumo'],
  [['start_date', 'startDate'], 'data'],
  [['end_date', 'endDate'], 'data final'],
  [['event_time', 'time'], 'horário'],
  [['status'], 'status'],
  [['priority'], 'prioridade'],
  [['location'], 'local'],
  [['responsible_name', 'responsibleName'], 'responsável'],
  [['commission_name', 'commissionName'], 'comissão'],
  [['subevents'], 'checklist'],
];

function firstValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function summarizeHistoryChange(previous: Record<string, unknown>, next: Record<string, unknown>) {
  return historyFieldLabels
    .filter(([keys]) => JSON.stringify(firstValue(previous, keys)) !== JSON.stringify(firstValue(next, keys)))
    .map(([, label]) => label);
}

function isUuid(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function fromDbRow(row: unknown): CronogramaEvent {
  const record = row as Record<string, unknown>;
  return decorateEmbeddedSubevents({
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
  });
}

function fromDbSubeventRow(row: unknown): CronogramaSubeventSeed & { parentEventId: string } {
  const record = row as Record<string, unknown>;
  return {
    id: readString(record, 'id') ?? '',
    parentEventId: readString(record, 'parent_event_id') ?? '',
    title: readString(record, 'title') ?? '',
    description: readString(record, 'description'),
    startDate: readString(record, 'start_date'),
    endDate: readString(record, 'end_date'),
    status: (readString(record, 'status') ?? 'planejado') as CronogramaStatus,
    priority: (readString(record, 'priority') ?? 'media') as CronogramaPriority,
    commissionSlug: readString(record, 'commission_slug'),
    responsibleName: readString(record, 'responsible_name'),
    sortOrder: readNumber(record, 'sort_order') ?? 0,
    storage: 'relational',
    createdAt: readString(record, 'created_at'),
    updatedAt: readString(record, 'updated_at'),
  };
}

function mergeRelationalSubevents(
  event: CronogramaEvent,
  relational: CronogramaSubeventSeed[],
): CronogramaEvent {
  const embedded = (event.subevents ?? []).filter((subevent) => (
    !subevent.storage || subevent.storage === 'embedded'
  ));
  return {
    ...event,
    subevents: [...embedded, ...relational].sort(
      (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
    ),
  };
}

function toDbPayload(event: CronogramaEventSeed | CronogramaEvent, orgId: string, createdByUserId?: string | null) {
  const embeddedSubevents = (event.subevents ?? [])
    .filter((subevent) => !subevent.storage || subevent.storage === 'embedded')
    .map((subevent) => ({
      id: subevent.id,
      title: subevent.title,
      description: subevent.description ?? null,
      startDate: subevent.startDate ?? null,
      endDate: subevent.endDate ?? null,
      status: subevent.status ?? 'planejado',
      priority: subevent.priority ?? 'media',
      commissionSlug: subevent.commissionSlug ?? null,
      commissionName: subevent.commissionName ?? null,
      responsibleName: subevent.responsibleName ?? null,
      sortOrder: subevent.sortOrder ?? 0,
    }));
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
    subevents: embeddedSubevents,
    created_by_user_id: createdByUserId ?? null,
  };
}

function toDbSubeventPayload(parentEventId: string, draft: CronogramaSubeventDraft) {
  return {
    parent_event_id: parentEventId,
    title: draft.title.trim(),
    description: draft.description?.trim() || null,
    start_date: draft.startDate ?? null,
    end_date: draft.endDate ?? draft.startDate ?? null,
    status: draft.status ?? 'planejado',
    priority: draft.priority ?? 'media',
    commission_slug: draft.commissionSlug ?? null,
    responsible_name: draft.responsibleName?.trim() || null,
    sort_order: draft.sortOrder ?? 0,
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

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

function nextSubeventSortOrder(event: CronogramaEvent) {
  return Math.max(-1, ...(event.subevents ?? []).map((subevent) => subevent.sortOrder ?? -1)) + 1;
}

function replaceEventInList(events: CronogramaEvent[], event: CronogramaEvent) {
  const existingIndex = events.findIndex((item) => (
    item.id === event.id || item.sourceKey === event.sourceKey
  ));
  if (existingIndex === -1) return sortCronogramaEvents([...events, event]);
  return sortCronogramaEvents(events.map((item, index) => (index === existingIndex ? event : item)));
}

async function insertRelationalSubevent(
  parentEventId: string,
  draft: CronogramaSubeventDraft,
  requestId: string,
) {
  const result = await cronogramaDb
    .from('cronograma_subeventos')
    .insert({ id: requestId, ...toDbSubeventPayload(parentEventId, draft) })
    .select('*')
    .single();

  if (!result.error) return fromDbSubeventRow(result.data);
  if (result.error.code !== '23505') throw result.error;

  const existing = await cronogramaDb
    .from('cronograma_subeventos')
    .select('*')
    .eq('id', requestId)
    .eq('parent_event_id', parentEventId)
    .limit(1);
  if (existing.error) throw existing.error;
  if (!existing.data?.[0]) throw result.error;
  return fromDbSubeventRow(existing.data[0]);
}

export function useCronogramaEventos() {
  const { orgId, myRole } = useCurrentOrg();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const [sessionEvents, setSessionEvents] = useState<CronogramaEvent[]>(officialSeedEvents);
  const [dbUnavailable, setDbUnavailable] = useState(false);
  const [relationshipsUnavailable, setRelationshipsUnavailable] = useState(false);
  const [queuedRelationships, setQueuedRelationships] = useState<QueuedCronogramaRelationship[]>(
    () => readCronogramaRelationshipQueue(),
  );
  const seedAttemptedForOrg = useRef(new Set<string>());
  const lastAutoSyncSignature = useRef('');

  const refreshQueuedRelationships = useCallback(() => {
    setQueuedRelationships(readCronogramaRelationshipQueue());
  }, []);

  const queuedRelationshipsForOrg = useMemo(
    () => queuedRelationships.filter((item) => item.orgId === orgId),
    [orgId, queuedRelationships],
  );

  useEffect(() => {
    refreshQueuedRelationships();
    const handleStorage = () => refreshQueuedRelationships();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [orgId, refreshQueuedRelationships]);

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
      const dbEvents = (data ?? []).map(fromDbRow) as CronogramaEvent[];
      const parentIds = dbEvents.map((event) => event.id).filter(isUuid);
      if (parentIds.length === 0) {
        setRelationshipsUnavailable(false);
        return dbEvents;
      }

      const relationalResult = await cronogramaDb
        .from('cronograma_subeventos')
        .select('*')
        .in('parent_event_id', parentIds)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(5000);

      if (relationalResult.error) {
        setRelationshipsUnavailable(true);
        return dbEvents;
      }

      setRelationshipsUnavailable(false);
      const byParent = new Map<string, CronogramaSubeventSeed[]>();
      (relationalResult.data ?? []).map(fromDbSubeventRow).forEach((subevent) => {
        const current = byParent.get(subevent.parentEventId) ?? [];
        current.push(subevent);
        byParent.set(subevent.parentEventId, current);
      });

      return dbEvents.map((event) => mergeRelationalSubevents(event, byParent.get(event.id) ?? []));
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
      if (!orgId) throw new Error('Não foi possível identificar a organização atual. Entre novamente e tente salvar.');
      if (dbUnavailable) {
        throw new Error('A sincronização está indisponível. O evento não foi salvo para evitar perda de dados. Tente novamente quando a conexão for restabelecida.');
      }

      const user = (await cronogramaDb.auth.getUser()).data.user;
      const { data, error } = await cronogramaDb
        .from('cronograma_eventos')
        .insert(toDbPayload(event, orgId, user?.id))
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

  const replaceSessionEvent = (event: CronogramaEvent) => {
    setSessionEvents((current) => replaceEventInList(current, event));
  };

  const findSessionEvent = (identity: string) => attachQueuedCronogramaRelationships(
    sessionEvents,
    queuedRelationshipsForOrg,
  ).find((event) => event.id === identity || event.sourceKey === identity);

  const writeEventLog = async ({
    eventId,
    action,
    previousValue,
    newValue,
    userId,
  }: {
    eventId: string;
    action: string;
    previousValue: unknown;
    newValue: unknown;
    userId: string | null;
  }) => {
    await cronogramaDb.from('cronograma_evento_logs').insert({
      event_id: eventId,
      action,
      previous_value: previousValue,
      new_value: newValue,
      user_id: userId,
    });
  };

  const saveEventRecord = async (
    current: CronogramaEvent,
    next: CronogramaEvent,
    action = 'updated',
    allowUnavailable = false,
  ) => {
    if (!orgId || !next.sourceKey) throw new Error('O evento não possui vínculo persistente com a organização atual.');
    if (dbUnavailable && !allowUnavailable) {
      throw new Error('A sincronização está indisponível. As alterações não foram salvas para evitar perda de dados. Tente novamente mais tarde.');
    }

    const user = (await cronogramaDb.auth.getUser()).data.user;
    const fullPayload = toDbPayload(next, orgId, user?.id);
    const { created_by_user_id: _createdByUserId, ...updatePayload } = fullPayload;
    let result: SupabaseResult<unknown>;

    if (current.updatedAt) {
      result = await cronogramaDb
        .from('cronograma_eventos')
        .update(updatePayload)
        .eq('org_id', orgId)
        .eq('source_key', next.sourceKey)
        .eq('updated_at', current.updatedAt)
        .select('*')
        .single();
      if (result.error?.code === 'PGRST116' || (!result.error && !result.data)) {
        queryClient.invalidateQueries({ queryKey: ['cronograma-eventos'] });
        throw new Error('Este evento foi alterado por outra pessoa. Atualize a página, revise a versão mais recente e tente novamente.');
      }
    } else {
      result = await cronogramaDb
        .from('cronograma_eventos')
        .upsert(fullPayload, { onConflict: 'org_id,source_key' })
        .select('*')
        .single();
    }

    if (result.error) throw new Error(result.error.message || 'Não foi possível salvar as alterações.');
    const savedFromDb = fromDbRow(result.data);
    const relational = (current.subevents ?? []).filter((subevent) => subevent.storage === 'relational');
    const saved = mergeRelationalSubevents(savedFromDb, relational);

    await writeEventLog({
      eventId: saved.id,
      action,
      previousValue: toDbPayload(current, orgId, user?.id),
      newValue: updatePayload,
      userId: user?.id ?? null,
    });
    return saved;
  };

  const ensurePersistedParent = async (current: CronogramaEvent, allowUnavailable = false) => {
    if (isUuid(current.id)) return current;
    if (!orgId || !current.sourceKey) throw new Error('O evento principal não possui vínculo persistente.');

    const existing = await cronogramaDb
      .from('cronograma_eventos')
      .select('*')
      .eq('org_id', orgId)
      .eq('source_key', current.sourceKey)
      .limit(1);
    if (existing.error) throw existing.error;
    if (existing.data?.[0]) {
      const persisted = fromDbRow(existing.data[0]);
      const relational = (current.subevents ?? []).filter((subevent) => subevent.storage === 'relational');
      return mergeRelationalSubevents(persisted, relational);
    }

    return saveEventRecord(current, current, 'relationship_parent_created', allowUnavailable);
  };

  const update = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CronogramaEvent> }) => {
      const current = findSessionEvent(id);
      if (!current) throw new Error('Evento não encontrado. Atualize a página e tente novamente.');
      const next = { ...current, ...updates, updatedAt: new Date().toISOString() };
      return saveEventRecord(current, next);
    },
    onSuccess: (event) => {
      replaceSessionEvent(event);
      queryClient.invalidateQueries({ queryKey: ['cronograma-eventos'] });
      queryClient.invalidateQueries({ queryKey: ['cronograma-event-history', event.id] });
    },
  });

  const queueSubevent = (
    current: CronogramaEvent,
    draft: CronogramaSubeventDraft,
    requestId: string,
    attemptError?: unknown,
  ) => {
    if (!orgId) throw new Error('Não foi possível identificar a organização atual. Entre novamente e tente salvar.');
    enqueueCronogramaRelationship({
      requestId,
      orgId,
      parentEventId: current.id,
      parentSourceKey: current.sourceKey || current.id,
      parentTitle: current.title,
      draft,
    });
    if (attemptError) recordQueuedCronogramaAttempt(orgId, requestId, attemptError);
    refreshQueuedRelationships();
  };

  const markRelationshipBackendUnavailable = (error: unknown) => {
    const message = errorMessage(error, '').toLocaleLowerCase('pt-BR');
    if (message.includes('cronograma_eventos') && !message.includes('cronograma_subeventos')) {
      setDbUnavailable(true);
      return;
    }
    setRelationshipsUnavailable(true);
  };

  const createSubevent = useMutation({
    mutationFn: async ({
      eventId,
      draft,
      requestId,
    }: {
      eventId: string;
      draft: CronogramaSubeventDraft;
      requestId?: string;
    }) => {
      if (!isWritableRole(myRole)) throw new Error('Seu perfil possui acesso somente para consulta.');
      const current = findSessionEvent(eventId);
      if (!current) throw new Error('Evento principal não encontrado. Atualize a página e tente novamente.');
      const id = requestId
        ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined);
      if (!id) throw new Error('Não foi possível gerar uma identidade segura para o subevento. Tente novamente.');
      const normalizedDraft = {
        ...draft,
        sortOrder: draft.sortOrder ?? nextSubeventSortOrder(current),
      };

      if (!isOnline || dbUnavailable || relationshipsUnavailable) {
        queueSubevent(current, normalizedDraft, id);
        return { mode: 'queued' as const, event: null };
      }

      try {
        const parent = await ensurePersistedParent(current);
        const relational = (parent.subevents ?? []).filter((subevent) => subevent.storage === 'relational');
        const created = await insertRelationalSubevent(parent.id, normalizedDraft, id);
        removeQueuedCronogramaRelationship(orgId!, id);
        refreshQueuedRelationships();
        return {
          mode: 'synced' as const,
          event: mergeRelationalSubevents(parent, [...relational, created]),
        };
      } catch (error) {
        if (!isQueueableCronogramaRelationshipError(error, isOnline)) {
          throw new Error(errorMessage(error, 'Não foi possível criar o subevento.'));
        }
        markRelationshipBackendUnavailable(error);
        queueSubevent(current, normalizedDraft, id, error);
        return { mode: 'queued' as const, event: null };
      }
    },
    onSuccess: (result) => {
      if (!result.event) return;
      replaceSessionEvent(result.event);
      queryClient.invalidateQueries({ queryKey: ['cronograma-eventos'] });
      queryClient.invalidateQueries({ queryKey: ['cronograma-event-history', result.event.id] });
    },
  });

  const syncQueuedRelationships = useMutation({
    mutationFn: async () => {
      if (!orgId || !isWritableRole(myRole)) return { synced: 0, failed: 0 };
      const queued = readCronogramaRelationshipQueue(orgId);
      let remaining = [...queued];
      let workingEvents = sessionEvents;
      const persistedEvents: CronogramaEvent[] = [];
      let synced = 0;
      let failed = 0;

      for (const item of queued) {
        const visibleEvents = attachQueuedCronogramaRelationships(workingEvents, remaining);
        const current = visibleEvents.find((event) => (
          event.id === item.parentEventId || event.sourceKey === item.parentSourceKey
        ));
        if (!current) {
          recordQueuedCronogramaAttempt(
            orgId,
            item.requestId,
            new Error('O evento principal desta conexão não está disponível no recorte atual.'),
          );
          failed += 1;
          continue;
        }

        const alreadyPersisted = (current.subevents ?? []).find((subevent) => (
          subevent.id === item.requestId && subevent.storage === 'relational'
        ));
        if (alreadyPersisted) {
          removeQueuedCronogramaRelationship(orgId, item.requestId);
          remaining = remaining.filter((queuedItem) => queuedItem.requestId !== item.requestId);
          synced += 1;
          continue;
        }

        try {
          const parent = await ensurePersistedParent(current, true);
          const relational = (parent.subevents ?? []).filter((subevent) => subevent.storage === 'relational');
          const created = await insertRelationalSubevent(parent.id, item.draft, item.requestId);
          const persistedEvent = mergeRelationalSubevents(parent, [...relational, created]);
          workingEvents = replaceEventInList(workingEvents, persistedEvent);
          persistedEvents.push(persistedEvent);
          removeQueuedCronogramaRelationship(orgId, item.requestId);
          remaining = remaining.filter((queuedItem) => queuedItem.requestId !== item.requestId);
          synced += 1;
        } catch (error) {
          recordQueuedCronogramaAttempt(orgId, item.requestId, error);
          if (isQueueableCronogramaRelationshipError(error, isOnline)) {
            markRelationshipBackendUnavailable(error);
          }
          failed += 1;
        }
      }

      if (synced > 0) {
        setSessionEvents((current) => persistedEvents.reduce(
          (events, event) => replaceEventInList(events, event),
          current,
        ));
        setDbUnavailable(false);
        setRelationshipsUnavailable(false);
      }
      refreshQueuedRelationships();
      return { synced, failed };
    },
    onSuccess: ({ synced }) => {
      if (synced === 0) return;
      queryClient.invalidateQueries({ queryKey: ['cronograma-eventos'] });
    },
  });

  const queuedRelationshipSignature = useMemo(
    () => queuedRelationshipsForOrg.map((item) => item.requestId).sort().join(','),
    [queuedRelationshipsForOrg],
  );
  const canAutoSyncRelationships = Boolean(isOnline && orgId && query.data);
  const syncQueuedRelationshipsNow = syncQueuedRelationships.mutate;

  useEffect(() => {
    if (!canAutoSyncRelationships || !queuedRelationshipSignature || syncQueuedRelationships.isPending) return;
    const signature = `${orgId}:${query.dataUpdatedAt}:${queuedRelationshipSignature}`;
    if (lastAutoSyncSignature.current === signature) return;
    lastAutoSyncSignature.current = signature;
    syncQueuedRelationshipsNow();
  }, [
    canAutoSyncRelationships,
    orgId,
    query.dataUpdatedAt,
    queuedRelationshipSignature,
    syncQueuedRelationships.isPending,
    syncQueuedRelationshipsNow,
  ]);

  const updateSubevent = useMutation({
    mutationFn: async ({
      eventId,
      subeventId,
      draft,
    }: {
      eventId: string;
      subeventId: string;
      draft: CronogramaSubeventDraft;
    }) => {
      if (!isWritableRole(myRole)) throw new Error('Seu perfil possui acesso somente para consulta.');
      const current = findSessionEvent(eventId);
      if (!current) throw new Error('Evento principal não encontrado. Atualize a página e tente novamente.');
      const existingSubevent = (current.subevents ?? []).find((subevent) => subevent.id === subeventId);
      if (!existingSubevent) throw new Error('Subevento não encontrado. Atualize a página e tente novamente.');

      if (existingSubevent.storage === 'queued') {
        if (!orgId) throw new Error('Não foi possível identificar a organização atual.');
        updateQueuedCronogramaRelationship(orgId, subeventId, {
          ...draft,
          sortOrder: draft.sortOrder ?? existingSubevent.sortOrder,
        });
        refreshQueuedRelationships();
        return null;
      }

      if (existingSubevent.storage !== 'relational' || !isUuid(subeventId)) {
        const next = {
          ...current,
          subevents: (current.subevents ?? []).map((subevent) => (
            subevent.id === subeventId
              ? { ...subevent, ...draft, id: subevent.id, storage: 'embedded' as const }
              : subevent
          )),
        };
        return saveEventRecord(current, next, 'subevent_updated');
      }

      if (dbUnavailable || relationshipsUnavailable) {
        throw new Error('Os relacionamentos online estão indisponíveis. Tente novamente em instantes.');
      }
      const parent = await ensurePersistedParent(current);
      let request = cronogramaDb
        .from('cronograma_subeventos')
        .update(toDbSubeventPayload(parent.id, draft))
        .eq('id', subeventId)
        .eq('parent_event_id', parent.id);
      if (existingSubevent.updatedAt) request = request.eq('updated_at', existingSubevent.updatedAt);
      const result = await request.select('*').single();
      if (result.error?.code === 'PGRST116' || (!result.error && !result.data)) {
        queryClient.invalidateQueries({ queryKey: ['cronograma-eventos'] });
        throw new Error('Este subevento foi alterado por outra pessoa. Atualize a página e revise a versão mais recente.');
      }
      if (result.error) throw new Error(result.error.message || 'Não foi possível atualizar o subevento.');

      const saved = fromDbSubeventRow(result.data);
      const next = {
        ...parent,
        subevents: (parent.subevents ?? []).map((subevent) => (subevent.id === subeventId ? saved : subevent)),
      };
      return next;
    },
    onSuccess: (event) => {
      if (!event) return;
      replaceSessionEvent(event);
      queryClient.invalidateQueries({ queryKey: ['cronograma-eventos'] });
      queryClient.invalidateQueries({ queryKey: ['cronograma-event-history', event.id] });
    },
  });

  const deleteSubevent = useMutation({
    mutationFn: async ({ eventId, subeventId }: { eventId: string; subeventId: string }) => {
      const current = findSessionEvent(eventId);
      if (!current) throw new Error('Evento principal não encontrado. Atualize a página e tente novamente.');
      const existingSubevent = (current.subevents ?? []).find((subevent) => subevent.id === subeventId);
      if (!existingSubevent) throw new Error('Subevento não encontrado. Atualize a página e tente novamente.');

      if (existingSubevent.storage === 'queued') {
        if (!isWritableRole(myRole)) throw new Error('Seu perfil possui acesso somente para consulta.');
        if (!orgId) throw new Error('Não foi possível identificar a organização atual.');
        removeQueuedCronogramaRelationship(orgId, subeventId);
        refreshQueuedRelationships();
        return null;
      }

      if (myRole !== 'admin' && myRole !== 'gestor') {
        throw new Error('Somente administradores e gestores podem remover subeventos persistidos.');
      }

      if (existingSubevent.storage !== 'relational' || !isUuid(subeventId)) {
        const next = {
          ...current,
          subevents: (current.subevents ?? []).filter((subevent) => subevent.id !== subeventId),
        };
        return saveEventRecord(current, next, 'subevent_removed');
      }

      if (dbUnavailable || relationshipsUnavailable) {
        throw new Error('Os relacionamentos online estão indisponíveis. Tente novamente em instantes.');
      }
      const parent = await ensurePersistedParent(current);
      let request = cronogramaDb
        .from('cronograma_subeventos')
        .delete()
        .eq('id', subeventId)
        .eq('parent_event_id', parent.id);
      if (existingSubevent.updatedAt) request = request.eq('updated_at', existingSubevent.updatedAt);
      const result = await request.select('*').single();
      if (result.error?.code === 'PGRST116' || (!result.error && !result.data)) {
        queryClient.invalidateQueries({ queryKey: ['cronograma-eventos'] });
        throw new Error('Este subevento mudou desde a última leitura. Atualize a página antes de remover.');
      }
      if (result.error) throw new Error(result.error.message || 'Não foi possível remover o subevento.');

      const next = {
        ...parent,
        subevents: (parent.subevents ?? []).filter((subevent) => subevent.id !== subeventId),
      };
      return next;
    },
    onSuccess: (event) => {
      if (!event) return;
      replaceSessionEvent(event);
      queryClient.invalidateQueries({ queryKey: ['cronograma-eventos'] });
      queryClient.invalidateQueries({ queryKey: ['cronograma-event-history', event.id] });
    },
  });

  const retryRelationships = async () => {
    if (!isOnline) {
      throw new Error('Este dispositivo está offline. Os rascunhos permanecem preservados e serão enviados quando a conexão voltar.');
    }
    const refreshed = await query.refetch();
    if (refreshed.error) {
      throw new Error('O serviço do cronograma ainda não está disponível. Nenhum rascunho foi perdido; tente novamente mais tarde.');
    }
    lastAutoSyncSignature.current = '';
    const result = await syncQueuedRelationships.mutateAsync();
    if (result.failed > 0) {
      throw new Error(
        result.synced > 0
          ? `${result.synced} conexões foram sincronizadas, mas ${result.failed} ainda precisam de revisão.`
          : 'As conexões continuam preservadas localmente, mas o serviço ainda não aceitou a sincronização.',
      );
    }
    return result;
  };

  const events = useMemo(
    () => sortCronogramaEvents(attachQueuedCronogramaRelationships(sessionEvents, queuedRelationshipsForOrg)),
    [queuedRelationshipsForOrg, sessionEvents],
  );
  const isSeedFallback = dbUnavailable || !orgId || !query.data;
  const relationshipSyncUnavailable = dbUnavailable || relationshipsUnavailable || !isOnline || !query.data;

  const saveEventRpc = useMutation({
    mutationFn: async (input: { payload: CronogramaSaveEventPayload; expectedLockVersion?: number | null }) =>
      cronogramaSaveEvent(input.payload, input.expectedLockVersion),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cronograma-eventos', orgId] }); },
  });
  const saveSubeventRpc = useMutation({
    mutationFn: async (input: { payload: CronogramaSaveSubeventPayload; expectedLockVersion?: number | null }) =>
      cronogramaSaveSubevent(input.payload, input.expectedLockVersion),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cronograma-eventos', orgId] }); },
  });
  const deleteSubeventRpc = useMutation({
    mutationFn: async (input: { subeventId: string; expectedLockVersion?: number | null }) =>
      cronogramaDeleteSubevent(input.subeventId, input.expectedLockVersion),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cronograma-eventos', orgId] }); },
  });
  const reorderSubeventsRpc = useMutation({
    mutationFn: async (input: { eventId: string; orderedIds: string[] }) =>
      cronogramaReorderSubevents(input.eventId, input.orderedIds),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cronograma-eventos', orgId] }); },
  });

  return {
    events,
    isLoading: query.isLoading || isSeedingOfficialData,
    isRefreshing: query.isFetching,
    isSeedFallback,
    error: query.error,
    refetch: query.refetch,
    canManage: isWritableRole(myRole),
    canDeleteSubevents: myRole === 'admin' || myRole === 'gestor',
    relationshipsUnavailable,
    relationshipSyncUnavailable,
    pendingRelationshipCount: queuedRelationshipsForOrg.length,
    failedRelationshipCount: queuedRelationshipsForOrg.filter((item) => item.lastError).length,
    isSyncingRelationships: syncQueuedRelationships.isPending,
    retryRelationships,
    create,
    update,
    createSubevent,
    updateSubevent,
    deleteSubevent,
    seedOfficialData,
    saveEventRpc,
    saveSubeventRpc,
    deleteSubeventRpc,
    reorderSubeventsRpc,
  };
}


export function useCronogramaEventHistory(eventId: string | null | undefined) {
  const { myRole } = useCurrentOrg();
  const canViewHistory = myRole === 'admin' || myRole === 'gestor';
  const query = useQuery({
    queryKey: ['cronograma-event-history', eventId],
    enabled: canViewHistory && isUuid(eventId),
    staleTime: 15000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await cronogramaDb
        .from('cronograma_evento_logs')
        .select('*')
        .eq('event_id', eventId!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message || 'Histórico indisponível.');

      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const userIds = Array.from(new Set(rows.map((row) => readString(row, 'user_id')).filter(Boolean) as string[]));
      const profileByUserId = new Map<string, string>();
      if (userIds.length > 0) {
        const profiles = await cronogramaDb
          .from('profiles')
          .select('user_id,full_name')
          .in('user_id', userIds)
          .limit(50);
        (profiles.data ?? []).forEach((profile) => {
          const record = profile as Record<string, unknown>;
          const userId = readString(record, 'user_id');
          const fullName = readString(record, 'full_name');
          if (userId && fullName) profileByUserId.set(userId, fullName);
        });
      }

      return rows.map<CronogramaHistoryEntry>((row) => {
        const userId = readString(row, 'user_id');
        const previous = readObject(row, 'previous_value');
        const next = readObject(row, 'new_value');
        return {
          id: readString(row, 'id') ?? `${readString(row, 'created_at')}-${userId}`,
          action: readString(row, 'action') ?? 'updated',
          createdAt: readString(row, 'created_at') ?? new Date().toISOString(),
          userLabel: (userId && profileByUserId.get(userId)) || 'Usuário autenticado',
          changedFields: summarizeHistoryChange(previous, next),
        };
      });
    },
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    canViewHistory,
  };
}
