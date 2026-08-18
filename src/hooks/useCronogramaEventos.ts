import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  cronogramaSaveEvent,
  cronogramaSaveSubevent,
  cronogramaSaveSubeventPlan,
  cronogramaDeleteSubevent,
  cronogramaReorderSubevents,
  type CronogramaSaveEventPayload,
  type CronogramaSaveSubeventPayload,
  type CronogramaSubeventPlanItemInput,
} from '@/lib/cronograma-rpc';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useCapabilities } from '@/hooks/useCapabilities';
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
import { officialMemberLabel, resolveOfficialMembers, type MemberIdentityRecord } from '@/lib/memberIdentity';
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
const EMPTY_SEED_EVENTS: CronogramaEvent[] = [];


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

function readBoolean(row: Record<string, unknown>, key: string): boolean | null {
  const value = row[key];
  return typeof value === 'boolean' ? value : null;
}

function normalizeTime(value: string | null): string | null {
  if (!value) return null;
  return /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : value;
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
  [['responsibles', 'responsiblesRel'], 'responsáveis'],
  [['commission_name', 'commissionName'], 'comissão'],
  [['commissions', 'commissionsRel'], 'comissões'],
  [['subevents'], 'checklist'],
];

const historyStatusLabels: Record<string, string> = {
  confirmed: 'Confirmado',
  planned: 'Planejado',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  overdue: 'Atrasado',
  rescheduled: 'Remarcado',
  cancelled: 'Cancelado',
  undated: 'Sem data',
  in_definition: 'Em definição',
  blocked: 'Bloqueado',
};

const historyPriorityLabels: Record<string, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

function firstValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function formatHistoryValue(keys: string[], value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) {
    const names = value
      .map((item) => {
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          return (record.name ?? record.commission_name ?? record.commissionName ?? record.title ?? '') as string;
        }
        return String(item ?? '');
      })
      .map((name) => name.trim())
      .filter(Boolean);
    return names.length > 0 ? names.join(', ') : null;
  }
  const raw = String(value);
  const field = keys[0] ?? '';
  if ((field.includes('date') || field.includes('Date')) && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [year, month, day] = raw.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }
  if (field === 'status') return historyStatusLabels[raw] ?? raw;
  if (field === 'priority') return historyPriorityLabels[raw] ?? raw;
  return raw;
}

export interface CronogramaHistoryDiff {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

function summarizeHistoryChange(previous: Record<string, unknown>, next: Record<string, unknown>) {
  return historyFieldLabels
    .filter(([keys]) => JSON.stringify(firstValue(previous, keys)) !== JSON.stringify(firstValue(next, keys)))
    .map(([, label]) => label);
}

function diffHistoryChange(previous: Record<string, unknown>, next: Record<string, unknown>): CronogramaHistoryDiff[] {
  return historyFieldLabels
    .filter(([keys]) => JSON.stringify(firstValue(previous, keys)) !== JSON.stringify(firstValue(next, keys)))
    .map(([keys, label]) => ({
      field: keys[0] ?? label,
      label,
      before: formatHistoryValue(keys, firstValue(previous, keys)),
      after: formatHistoryValue(keys, firstValue(next, keys)),
    }));
}

function isUuid(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function mapCommissionRel(item: unknown) {
  const record = item as Record<string, unknown>;
  return {
    commissionId: readString(record, 'commission_id'),
    commissionSlug: readString(record, 'commission_slug'),
    commissionName: readString(record, 'commission_name'),
    isPrimary: readString(record, 'relation_role') === 'principal' || readBoolean(record, 'is_primary') === true,
  };
}

function mapResponsibleRel(item: unknown) {
  const record = item as Record<string, unknown>;
  return {
    userId: readString(record, 'user_id'),
    name: readString(record, 'name'),
    role: readString(record, 'role'),
    isPrimary: readBoolean(record, 'is_primary') === true,
    responsibleType: (readString(record, 'responsible_type') ?? 'external') as 'member' | 'external',
  };
}

function mapPlanAction(item: unknown) {
  const record = item as Record<string, unknown>;
  return {
    id: readString(record, 'id') ?? undefined,
    startTime: normalizeTime(readString(record, 'start_time')),
    title: readString(record, 'title') ?? '',
    notes: readString(record, 'notes'),
    responsibleUserId: readString(record, 'responsible_user_id'),
    responsibleName: readString(record, 'responsible_name'),
    commissionSlug: readString(record, 'commission_slug'),
    commissionName: readString(record, 'commission_name'),
    isDone: readBoolean(record, 'is_done') === true,
    sortOrder: readNumber(record, 'sort_order') ?? 0,
  };
}

function mapPlanProvision(item: unknown) {
  const record = item as Record<string, unknown>;
  return {
    id: readString(record, 'id') ?? undefined,
    description: readString(record, 'description') ?? '',
    responsibleUserId: readString(record, 'responsible_user_id'),
    responsibleName: readString(record, 'responsible_name'),
    commissionSlug: readString(record, 'commission_slug'),
    commissionName: readString(record, 'commission_name'),
    note: readString(record, 'note'),
    isDone: readBoolean(record, 'is_done') === true,
    sortOrder: readNumber(record, 'sort_order') ?? 0,
  };
}

function mapPlanGuest(item: unknown) {
  const record = item as Record<string, unknown>;
  return {
    id: readString(record, 'id') ?? undefined,
    name: readString(record, 'name') ?? '',
    category: readString(record, 'category'),
    sortOrder: readNumber(record, 'sort_order') ?? 0,
  };
}

function fromViewSubevent(item: unknown): CronogramaSubeventSeed {
  const record = item as Record<string, unknown>;
  const commissions = parseJsonArray(record.commissions).map(mapCommissionRel);
  const responsibles = parseJsonArray(record.responsibles).map(mapResponsibleRel);
  const primaryCommission = commissions.find((commission) => commission.isPrimary) ?? commissions[0];
  const primaryResponsible = responsibles.find((responsible) => responsible.isPrimary) ?? responsibles[0];
  return {
    actions: parseJsonArray(record.actions).map(mapPlanAction),
    provisions: parseJsonArray(record.provisions).map(mapPlanProvision),
    guests: parseJsonArray(record.guests).map(mapPlanGuest),
    id: readString(record, 'id') ?? '',
    title: readString(record, 'title') ?? '',
    description: readString(record, 'description'),
    startDate: readString(record, 'start_date'),
    endDate: readString(record, 'end_date'),
    startTime: normalizeTime(readString(record, 'start_time')),
    endTime: normalizeTime(readString(record, 'end_time')),
    status: (readString(record, 'status') ?? 'planejado') as CronogramaStatus,
    priority: (readString(record, 'priority') ?? 'media') as CronogramaPriority,
    commissionSlug: primaryCommission?.commissionSlug ?? readString(record, 'commission_slug'),
    commissionName: primaryCommission?.commissionName ?? null,
    responsibleName: primaryResponsible?.name ?? readString(record, 'responsible_name'),
    sortOrder: readNumber(record, 'sort_order') ?? 0,
    lockVersion: readNumber(record, 'lock_version'),
    storage: 'relational',
    createdAt: readString(record, 'created_at'),
    updatedAt: readString(record, 'updated_at'),
    commissionsRel: commissions,
    responsiblesRel: responsibles,
  };
}

function fromDbRow(row: unknown): CronogramaEvent {
  const record = row as Record<string, unknown>;
  const commissionsRel = parseJsonArray(record.commissions_rel).map(mapCommissionRel);
  const responsiblesRel = parseJsonArray(record.responsibles_rel).map(mapResponsibleRel);
  const viewSubevents = parseJsonArray(record.subevents_rel).map(fromViewSubevent);
  const legacySubevents = parseJsonArray<CronogramaSubeventSeed>(record.subevents);
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
    time: normalizeTime(readString(record, 'event_time')),
    startTime: normalizeTime(readString(record, 'start_time')),
    endTime: normalizeTime(readString(record, 'end_time')),
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
    subevents: viewSubevents.length > 0 ? viewSubevents : legacySubevents,
    lockVersion: readNumber(record, 'lock_version'),
    commissionsRel,
    responsiblesRel,
    createdAt: readString(record, 'created_at'),
    updatedAt: readString(record, 'updated_at'),
    sourceDataQuality: {
      description: Boolean(readString(record, 'description')?.trim()),
      location: Boolean(readString(record, 'location')?.trim()),
      responsible: Boolean(
        responsiblesRel.some((responsible) => Boolean(responsible.name?.trim()))
        || readString(record, 'responsible_name')?.trim(),
      ),
      commission: Boolean(
        commissionsRel.some((commission) => Boolean(
          commission.commissionName?.trim() || commission.commissionSlug?.trim(),
        ))
        || readString(record, 'commission_name')?.trim()
        || readString(record, 'commission_slug')?.trim(),
      ),
      priority: Boolean(readString(record, 'priority')?.trim()),
      status: Boolean(readString(record, 'status')?.trim()),
      updatedAt: Boolean(readString(record, 'updated_at')),
    },
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
    startTime: normalizeTime(readString(record, 'start_time')),
    endTime: normalizeTime(readString(record, 'end_time')),
    status: (readString(record, 'status') ?? 'planejado') as CronogramaStatus,
    priority: (readString(record, 'priority') ?? 'media') as CronogramaPriority,
    commissionSlug: readString(record, 'commission_slug'),
    responsibleName: readString(record, 'responsible_name'),
    sortOrder: readNumber(record, 'sort_order') ?? 0,
    lockVersion: readNumber(record, 'lock_version'),
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
      startTime: subevent.startTime ?? null,
      endTime: subevent.endTime ?? null,
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
    start_time: event.startTime ?? null,
    end_time: event.endTime ?? null,
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
    pending_reason: event.sourceNote ?? null,
    decision_needed: null,
    created_by_user_id: createdByUserId ?? null,
  };
}

function toRpcEventPayload(event: CronogramaEventSeed | CronogramaEvent, orgId: string): CronogramaSaveEventPayload {
  return {
    id: 'id' in event && isUuid(event.id) ? event.id : undefined,
    org_id: orgId,
    source_key: event.sourceKey,
    title: event.title,
    description: event.description ?? null,
    category: event.category,
    category_key: 'categoryKey' in event && typeof event.categoryKey === 'string' ? event.categoryKey : null,
    event_type: event.eventType,
    source_year: event.sourceYear,
    start_date: event.startDate ?? null,
    end_date: event.endDate ?? null,
    month_label: event.monthLabel ?? null,
    week_label: event.weekLabel ?? null,
    status: event.status,
    priority: event.priority,
    location: event.location ?? null,
    event_time: event.time ?? event.startTime ?? null,
    start_time: event.startTime ?? event.time ?? null,
    end_time: event.endTime ?? null,
    commission_slug: event.commissionSlug ?? null,
    commission_name: event.commissionName ?? null,
    responsible_name: event.responsibleName ?? null,
    has_exact_date: event.hasExactDate,
    is_official_seed: event.isOfficialSeed,
    pending_reason: event.sourceNote ?? null,
    decision_needed: null,
    commissions: (event.commissionsRel ?? []).map((commission) => ({
      commission_id: commission.commissionId ?? null,
      commission_slug: commission.commissionSlug ?? null,
      commission_name: commission.commissionName ?? null,
      relation_role: commission.isPrimary ? 'principal' : 'participante',
    })),
    responsibles: (event.responsiblesRel ?? []).map((responsible) => ({
      user_id: responsible.userId ?? null,
      name: responsible.name ?? null,
      role: responsible.role ?? null,
      is_primary: responsible.isPrimary ?? false,
      responsible_type: responsible.responsibleType ?? (responsible.userId ? 'member' : 'external'),
    })),
  };
}

function toDbSubeventPayload(parentEventId: string, draft: CronogramaSubeventDraft) {
  return {
    parent_event_id: parentEventId,
    title: draft.title.trim(),
    description: draft.description?.trim() || null,
    start_date: draft.startDate ?? null,
    end_date: draft.endDate ?? draft.startDate ?? null,
    start_time: draft.startTime ?? null,
    end_time: draft.endTime ?? null,
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
    startTime: draft.startTime ?? draft.time ?? null,
    endTime: draft.endTime ?? null,
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
    commissionsRel: draft.commissionsRel ?? [],
    responsiblesRel: draft.responsiblesRel ?? [],
    subevents: draft.subevents ?? [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceDataQuality: {
      description: Boolean(draft.description?.trim()),
      location: Boolean(draft.location?.trim()),
      responsible: Boolean(
        draft.responsiblesRel?.some((responsible) => Boolean(responsible.name?.trim()))
        || draft.responsibleName?.trim(),
      ),
      commission: Boolean(
        draft.commissionsRel?.some((commission) => Boolean(
          commission.commissionName?.trim() || commission.commissionSlug?.trim(),
        ))
        || draft.commissionName?.trim()
        || draft.commissionSlug?.trim(),
      ),
      priority: Boolean(draft.priority),
      status: Boolean(draft.status),
      updatedAt: true,
    },
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

async function saveRelationalSubevent(
  parentEventId: string,
  draft: CronogramaSubeventDraft,
  requestId: string,
) {
  const payload = {
    ...toDbSubeventPayload(parentEventId, draft),
    id: requestId,
    legacy_key: requestId,
  };
  const savedParent = await cronogramaSaveSubevent(payload, draft.lockVersion ?? null);
  const parent = fromDbRow(savedParent);
  const created = (parent.subevents ?? []).find((subevent) => subevent.id === requestId)
    ?? (parent.subevents ?? []).slice().sort((left, right) => (right.sortOrder ?? 0) - (left.sortOrder ?? 0))[0];
  if (!created) throw new Error('O subevento foi salvo, mas ainda não apareceu. Atualize a página.');
  return { parent, subevent: created };
}

export function cronogramaEventsQueryKey(orgId: string | null | undefined) {
  return ['cronograma-eventos', orgId] as const;
}

/** Single source of truth for reading the module dataset, so every consumer
 *  (workspace and personal weekly summary) shares the same cache entry. */
export async function fetchCronogramaEventsForOrg(orgId: string): Promise<CronogramaEvent[]> {
  const { data, error } = await cronogramaDb
    .from('cronograma_eventos_full')
    .select('*')
    .eq('org_id', orgId)
    .order('start_date', { ascending: true, nullsFirst: false })
    .order('title', { ascending: true })
    .limit(1000);

  if (error) throw error;
  return (data ?? []).map(fromDbRow) as CronogramaEvent[];
}


export function useCronogramaEventos() {
  const { orgId, myRole } = useCurrentOrg();
  const { capSet } = useCapabilities();
  // Escrita liberada para papéis operacionais OU para quem recebeu a
  // capability explícita (ex.: presidente de comissão com visão restrita).
  const canWriteCronograma = isWritableRole(myRole) || capSet.has('cronograma_eventos_write');
  // Visão restrita (ex.: presidente de comissão): a tela mostra exclusivamente o
  // que o banco liberou por RLS — o catálogo oficial embutido no app nunca é mesclado.
  const hasScopedCronogramaView = capSet.has('cronograma_scoped_access');
  const localSeedEvents = hasScopedCronogramaView ? EMPTY_SEED_EVENTS : officialSeedEvents;
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const [sessionEvents, setSessionEvents] = useState<CronogramaEvent[]>(localSeedEvents);

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
    queryKey: cronogramaEventsQueryKey(orgId),
    enabled: !!orgId,
    staleTime: 30000,
    queryFn: async () => {
      if (!orgId) return [];
      try {
        const events = await fetchCronogramaEventsForOrg(orgId);
        setDbUnavailable(false);
        setRelationshipsUnavailable(false);
        return events;
      } catch (error) {
        setDbUnavailable(true);
        throw error;
      }
    },
    retry: false,
  });

  const seedOfficialData = useMutation({
    mutationFn: async (eventsToSeed: CronogramaEvent[] = officialSeedEvents) => {
      if (!orgId || !isWritableRole(myRole) || hasScopedCronogramaView) return [];
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
    setSessionEvents(mergeOfficialSeedWithDb(localSeedEvents, dbEvents));

    if (hasScopedCronogramaView) return;
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
  }, [hasScopedCronogramaView, isSeedingOfficialData, localSeedEvents, myRole, orgId, query.data, seedMissingOfficialData]);


  const googleSyncEligibility = useRef<Record<string, boolean>>({});
  const triggerSyncWorker = useCallback(() => {
    // Fire-and-forget push so Google Calendar mirrors changes immediately,
    // without waiting for the pg_cron minute tick. Skipped entirely when the
    // org has no active Google connection (avoids a noisy 401 on every save).
    if (!orgId) return;
    void (async () => {
      try {
        if (!(orgId in googleSyncEligibility.current)) {
          const { count } = await supabase
            .from('google_calendar_connections')
            .select('user_id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('status', 'connected');
          googleSyncEligibility.current[orgId] = (count ?? 0) > 0;
        }
        if (!googleSyncEligibility.current[orgId]) return;
        await supabase.functions.invoke('google-sync-worker', { body: {} }).catch(() => undefined);
      } catch {
        // Ignore — the pg_cron fallback will retry.
      }
    })();
  }, [orgId]);

  const create = useMutation({
    mutationFn: async (draft: CronogramaEventDraft) => {
      const event = draftToEvent(draft);
      if (!orgId) throw new Error('Não foi possível identificar a organização atual. Entre novamente e tente salvar.');
      if (dbUnavailable) {
        throw new Error('A sincronização está indisponível. O evento não foi salvo para evitar perda de dados. Tente novamente quando a conexão for restabelecida.');
      }

      const data = await cronogramaSaveEvent(toRpcEventPayload(event, orgId), null);
      return fromDbRow(data);
    },
    onSuccess: (event) => {
      setSessionEvents((current) => {
        const existingIndex = current.findIndex((item) => item.id === event.id || item.sourceKey === event.sourceKey);
        if (existingIndex === -1) return sortCronogramaEvents([...current, event]);
        return sortCronogramaEvents(current.map((item, index) => (index === existingIndex ? event : item)));
      });
      queryClient.invalidateQueries({ queryKey: ['cronograma-eventos'] });
      triggerSyncWorker();
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
    if (!orgId || !next.sourceKey) throw new Error('Este evento não está associado à organização atual.');
    if (dbUnavailable && !allowUnavailable) {
      throw new Error('A sincronização está indisponível. As alterações não foram salvas para evitar perda de dados. Tente novamente mais tarde.');
    }

    const payload = toRpcEventPayload(next, orgId);
    const data = await cronogramaSaveEvent(payload, current.lockVersion ?? null);
    return fromDbRow(data);
  };

  const ensurePersistedParent = async (current: CronogramaEvent, allowUnavailable = false) => {
    if (isUuid(current.id)) return current;
    if (!orgId || !current.sourceKey) throw new Error('O evento principal não está associado à organização atual.');

      const existing = await cronogramaDb
        .from('cronograma_eventos_full')
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
      triggerSyncWorker();
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const current = findSessionEvent(eventId);
      if (!current) throw new Error('Evento não encontrado. Atualize a página e tente novamente.');
      if (!isWritableRole(myRole)) throw new Error('Seu perfil possui acesso somente para consulta.');
      if (myRole !== 'admin' && myRole !== 'gestor') {
        throw new Error('Somente administradores e gestores podem excluir eventos.');
      }
      if (!orgId) throw new Error('Não foi possível identificar a organização atual.');

      // Non-persisted (seed/queued) — remove locally only.
      if (!isUuid(current.id)) {
        setSessionEvents((prev) => prev.filter((item) => item.id !== current.id && item.sourceKey !== current.sourceKey));
        return { id: current.id, remote: false as const };
      }

      if (dbUnavailable) {
        throw new Error('A sincronização está indisponível. A exclusão não foi realizada. Tente novamente em instantes.');
      }

      const { error } = await cronogramaDb
        .from('cronograma_eventos')
        .delete()
        .eq('id', current.id)
        .eq('org_id', orgId);
      if (error) throw new Error(error.message || 'Não foi possível excluir o evento.');

      return { id: current.id, remote: true as const, sourceKey: current.sourceKey };
    },
    onSuccess: (result) => {
      setSessionEvents((prev) => prev.filter((item) => item.id !== result.id));
      queryClient.invalidateQueries({ queryKey: ['cronograma-eventos'] });
      if (result.remote) {
        // DB trigger enqueues delete for every connected user; push immediately.
        triggerSyncWorker();
      }
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
      if (!canWriteCronograma) throw new Error('Seu perfil possui acesso somente para consulta.');
      const current = findSessionEvent(eventId);
      if (!current) throw new Error('Evento principal não encontrado. Atualize a página e tente novamente.');
      const id = requestId
        ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined);
      if (!id) throw new Error('Não foi possível preparar o subevento. Tente novamente.');
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
        const { parent: savedParent } = await saveRelationalSubevent(parent.id, normalizedDraft, id);
        removeQueuedCronogramaRelationship(orgId!, id);
        refreshQueuedRelationships();
        return {
          mode: 'synced' as const,
          event: savedParent,
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
      if (!orgId || !canWriteCronograma) return { synced: 0, failed: 0 };
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
            new Error('O evento principal deste subevento não está disponível na visualização atual.'),
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
          const { parent: persistedEvent } = await saveRelationalSubevent(parent.id, item.draft, item.requestId);
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
      if (!canWriteCronograma) throw new Error('Seu perfil possui acesso somente para consulta.');
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
        throw new Error('A sincronização de subeventos está indisponível. Tente novamente em instantes.');
      }
      const parent = await ensurePersistedParent(current);
      const data = await cronogramaSaveSubevent(
        { ...toDbSubeventPayload(parent.id, draft), id: subeventId },
        existingSubevent.lockVersion ?? null,
      );
      return fromDbRow(data);
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
        throw new Error('Somente administradores e gestores podem remover subeventos já salvos.');
      }

      if (existingSubevent.storage !== 'relational' || !isUuid(subeventId)) {
        const next = {
          ...current,
          subevents: (current.subevents ?? []).filter((subevent) => subevent.id !== subeventId),
        };
        return saveEventRecord(current, next, 'subevent_removed');
      }

      if (dbUnavailable || relationshipsUnavailable) {
        throw new Error('A sincronização de subeventos está indisponível. Tente novamente em instantes.');
      }
      const parent = await ensurePersistedParent(current);
      const data = await cronogramaDeleteSubevent(subeventId, existingSubevent.lockVersion ?? null);
      return fromDbRow(data);
    },
    onSuccess: (event) => {
      if (!event) return;
      replaceSessionEvent(event);
      queryClient.invalidateQueries({ queryKey: ['cronograma-eventos'] });
      queryClient.invalidateQueries({ queryKey: ['cronograma-event-history', event.id] });
    },
  });

  /** Saves an entire event plan (subeventos + ações + providências + convidados) in one call. */
  const saveSubeventPlan = useMutation({
    mutationFn: async ({ eventId, subevents }: { eventId: string; subevents: CronogramaSubeventPlanItemInput[] }) => {
      if (!canWriteCronograma) throw new Error('Seu perfil possui acesso somente para consulta.');
      const current = findSessionEvent(eventId);
      if (!current) throw new Error('Evento principal não encontrado. Atualize a página e tente novamente.');
      if (dbUnavailable || relationshipsUnavailable || !isOnline) {
        throw new Error('O planejamento só pode ser salvo com conexão ativa. Tente novamente em instantes.');
      }
      const parent = await ensurePersistedParent(current);
      const data = await cronogramaSaveSubeventPlan({ parent_event_id: parent.id, subevents });
      return fromDbRow(data);
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
      throw new Error('Este dispositivo está offline. Os subeventos pendentes continuam salvos aqui e serão enviados quando a conexão voltar.');
    }
    const refreshed = await query.refetch();
    if (refreshed.error) {
      throw new Error('O cronograma ainda não está disponível. Os subeventos pendentes continuam salvos; tente novamente mais tarde.');
    }
    lastAutoSyncSignature.current = '';
    const result = await syncQueuedRelationships.mutateAsync();
    if (result.failed > 0) {
      throw new Error(
        result.synced > 0
          ? `${result.synced} subeventos foram sincronizados, mas ${result.failed} ainda precisam de revisão.`
          : 'Os subeventos continuam salvos neste dispositivo e ainda não foram sincronizados.',
      );
    }
    return result;
  };

  const events = useMemo(
    () => sortCronogramaEvents(attachQueuedCronogramaRelationships(sessionEvents, queuedRelationshipsForOrg)),
    [queuedRelationshipsForOrg, sessionEvents],
  );
  const isSeedFallback = dbUnavailable || !orgId || !query.data;
  const canWriteEvents = canWriteCronograma && !dbUnavailable && isOnline && Boolean(orgId && query.data);
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
    canManage: canWriteCronograma,
    canWriteEvents,
    canDeleteSubevents: myRole === 'admin' || myRole === 'gestor',
    relationshipsUnavailable,
    relationshipSyncUnavailable,
    pendingRelationshipCount: queuedRelationshipsForOrg.length,
    failedRelationshipCount: queuedRelationshipsForOrg.filter((item) => item.lastError).length,
    isSyncingRelationships: syncQueuedRelationships.isPending,
    retryRelationships,
    create,
    update,
    deleteEvent,

    createSubevent,
    saveSubeventPlan,
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
      const memberByUserId = new Map<string, MemberIdentityRecord>();
      if (userIds.length > 0) {
        const members = await cronogramaDb
          .from('org_members')
          .select('user_id,nome_exibicao,is_active,is_core_team')
          .in('user_id', userIds)
          .limit(50);
        const resolved = resolveOfficialMembers((members.data ?? []) as MemberIdentityRecord[]);
        resolved.forEach((member, userId) => memberByUserId.set(userId, member));
      }

      return rows.map<CronogramaHistoryEntry>((row) => {
        const userId = readString(row, 'user_id');
        const previous = readObject(row, 'previous_value');
        const next = readObject(row, 'new_value');
        return {
          id: readString(row, 'id') ?? `${readString(row, 'created_at')}-${userId}`,
          action: readString(row, 'action') ?? 'updated',
          createdAt: readString(row, 'created_at') ?? new Date().toISOString(),
          userId,
          userLabel: officialMemberLabel(userId ? memberByUserId.get(userId) : null) || 'Usuário autenticado',
          changedFields: summarizeHistoryChange(previous, next),
          changes: diffHistoryChange(previous, next),
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
