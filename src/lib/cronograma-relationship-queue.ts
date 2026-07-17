import type {
  CronogramaPriority,
  CronogramaStatus,
  CronogramaSubeventSeed,
} from '@/data/fenasoja2028CronogramaSeed';
import type { CronogramaEvent } from '@/lib/cronograma-eventos';

const STORAGE_KEY = 'fenasoja:cronograma-relationship-queue:v1';
const QUEUE_VERSION = 1;
const MAX_QUEUE_ITEMS = 200;

export interface QueuedCronogramaSubeventDraft {
  title: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: CronogramaStatus;
  priority?: CronogramaPriority;
  commissionSlug?: string | null;
  commissionName?: string | null;
  responsibleName?: string | null;
  sortOrder?: number;
}

export interface QueuedCronogramaRelationship {
  version: 1;
  requestId: string;
  orgId: string;
  parentEventId: string;
  parentSourceKey: string;
  parentTitle: string;
  draft: QueuedCronogramaSubeventDraft;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
}

interface QueueEnvelope {
  version: 1;
  items: QueuedCronogramaRelationship[];
}

function defaultStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  if (isRecord(error) && typeof error.message === 'string') return error.message.slice(0, 500);
  return 'Falha temporária ao sincronizar a conexão.';
}

function isQueuedRelationship(value: unknown): value is QueuedCronogramaRelationship {
  if (!isRecord(value) || !isRecord(value.draft)) return false;
  return value.version === QUEUE_VERSION
    && typeof value.requestId === 'string'
    && typeof value.orgId === 'string'
    && typeof value.parentEventId === 'string'
    && typeof value.parentSourceKey === 'string'
    && typeof value.parentTitle === 'string'
    && typeof value.draft.title === 'string'
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
    && typeof value.attempts === 'number';
}

function readEnvelope(storage: Storage | null = defaultStorage()): QueueEnvelope {
  if (!storage) return { version: QUEUE_VERSION, items: [] };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { version: QUEUE_VERSION, items: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== QUEUE_VERSION || !Array.isArray(parsed.items)) {
      return { version: QUEUE_VERSION, items: [] };
    }
    return {
      version: QUEUE_VERSION,
      items: parsed.items.filter(isQueuedRelationship).slice(-MAX_QUEUE_ITEMS),
    };
  } catch {
    return { version: QUEUE_VERSION, items: [] };
  }
}

function writeEnvelope(items: QueuedCronogramaRelationship[], storage: Storage | null = defaultStorage()) {
  if (!storage) throw new Error('O armazenamento local não está disponível neste dispositivo.');
  const envelope: QueueEnvelope = { version: QUEUE_VERSION, items };
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

export function readCronogramaRelationshipQueue(
  orgId?: string | null,
  storage: Storage | null = defaultStorage(),
) {
  const items = readEnvelope(storage).items;
  return orgId ? items.filter((item) => item.orgId === orgId) : items;
}

export function enqueueCronogramaRelationship(
  input: Omit<QueuedCronogramaRelationship, 'version' | 'createdAt' | 'updatedAt' | 'attempts' | 'lastAttemptAt' | 'lastError'>,
  storage: Storage | null = defaultStorage(),
) {
  const envelope = readEnvelope(storage);
  const existing = envelope.items.find(
    (item) => item.orgId === input.orgId && item.requestId === input.requestId,
  );
  const now = new Date().toISOString();
  const next: QueuedCronogramaRelationship = {
    version: QUEUE_VERSION,
    ...input,
    draft: { ...input.draft, title: input.draft.title.trim() },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    attempts: existing?.attempts ?? 0,
    lastAttemptAt: existing?.lastAttemptAt ?? null,
    lastError: existing?.lastError ?? null,
  };

  const items = existing
    ? envelope.items.map((item) => (
      item.orgId === input.orgId && item.requestId === input.requestId ? next : item
    ))
    : [...envelope.items, next];

  if (items.length > MAX_QUEUE_ITEMS) {
    throw new Error('A fila local de sincronização atingiu o limite seguro. Sincronize ou cancele itens pendentes antes de continuar.');
  }
  writeEnvelope(items, storage);
  return next;
}

export function updateQueuedCronogramaRelationship(
  orgId: string,
  requestId: string,
  draft: QueuedCronogramaSubeventDraft,
  storage: Storage | null = defaultStorage(),
) {
  const envelope = readEnvelope(storage);
  let updated: QueuedCronogramaRelationship | null = null;
  const items = envelope.items.map((item) => {
    if (item.orgId !== orgId || item.requestId !== requestId) return item;
    updated = {
      ...item,
      draft: { ...draft, title: draft.title.trim() },
      updatedAt: new Date().toISOString(),
      lastError: null,
    };
    return updated;
  });
  if (!updated) throw new Error('O rascunho pendente não foi encontrado neste dispositivo.');
  writeEnvelope(items, storage);
  return updated;
}

export function recordQueuedCronogramaAttempt(
  orgId: string,
  requestId: string,
  error: unknown,
  storage: Storage | null = defaultStorage(),
) {
  const envelope = readEnvelope(storage);
  let updated: QueuedCronogramaRelationship | null = null;
  const now = new Date().toISOString();
  const items = envelope.items.map((item) => {
    if (item.orgId !== orgId || item.requestId !== requestId) return item;
    updated = {
      ...item,
      attempts: item.attempts + 1,
      lastAttemptAt: now,
      lastError: normalizeError(error),
    };
    return updated;
  });
  if (updated) writeEnvelope(items, storage);
  return updated;
}

export function removeQueuedCronogramaRelationship(
  orgId: string,
  requestId: string,
  storage: Storage | null = defaultStorage(),
) {
  const envelope = readEnvelope(storage);
  const items = envelope.items.filter((item) => (
    item.orgId !== orgId || item.requestId !== requestId
  ));
  if (items.length !== envelope.items.length) writeEnvelope(items, storage);
}

function queuedSubevent(item: QueuedCronogramaRelationship): CronogramaSubeventSeed {
  return {
    id: item.requestId,
    ...item.draft,
    storage: 'queued',
    syncState: item.lastError ? 'failed' : 'pending',
    syncError: item.lastError,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function attachQueuedCronogramaRelationships(
  events: CronogramaEvent[],
  queue: QueuedCronogramaRelationship[],
) {
  if (queue.length === 0) return events;
  return events.map((event) => {
    const queued = queue.filter((item) => (
      item.parentEventId === event.id
      || (event.sourceKey && item.parentSourceKey === event.sourceKey)
    ));
    if (queued.length === 0) return event;
    const existingIds = new Set((event.subevents ?? []).map((subevent) => subevent.id).filter(Boolean));
    const pending = queued
      .filter((item) => !existingIds.has(item.requestId))
      .map(queuedSubevent);
    if (pending.length === 0) return event;
    return {
      ...event,
      subevents: [...(event.subevents ?? []), ...pending].sort(
        (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
      ),
    };
  });
}

export function isQueueableCronogramaRelationshipError(error: unknown, isOnline = true) {
  if (!isOnline) return true;
  const record = isRecord(error) ? error : {};
  const code = typeof record.code === 'string' ? record.code : '';
  if (['42501', '401', '403', '23502', '23503', '23514', 'PGRST116'].includes(code)) return false;
  if (['PGRST205', '42P01', 'PGRST502', 'PGRST503', '57014'].includes(code)) return true;
  const message = normalizeError(error).toLocaleLowerCase('pt-BR');
  return /failed to fetch|network|rede|timeout|temporariamente|temporarily|gateway|schema cache|could not find the table|connection/.test(message);
}

export const cronogramaRelationshipQueueStorageKey = STORAGE_KEY;
