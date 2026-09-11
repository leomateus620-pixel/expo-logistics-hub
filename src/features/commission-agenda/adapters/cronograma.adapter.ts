/**
 * Read-only adapters that translate what the app already loads today
 * (official unit catalog, commission people, Agenda Fenasoja rows) into the
 * presentation ViewModels of the unit workspace.
 *
 * Nothing here talks to the database; the queries stay where they are and
 * only their results are reshaped. The future backend phase replaces these
 * functions with the real event/document mapping.
 */
import type { CommissionModule } from '@/modules/commissions/commissionRegistry';
import type { OfficialUnitEntry } from '@/modules/commissions/officialCommissionCatalog';
import type { CommissionUnitPeople } from '@/hooks/useCommissionPeople';
import type { CommissionPerson } from '@/components/commissions/CommissionPeopleStack';
import type {
  AgendaEventViewModel,
  CommissionUnitViewModel,
  EventStatus,
  OrganizationalUnitStatus,
  PersonSummary,
  UnitSummary,
} from '../types';
import { computeDuration } from '../lib/agenda-presentation';

/** Minimal shape of an Agenda Fenasoja row consumed by the workspace. */
export interface CronogramaEventRowLike {
  id: string;
  title: string;
  start_date: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  event_time?: string | null;
  status: string | null;
  location: string | null;
  description?: string | null;
  responsible_name?: string | null;
  commission_slug?: string | null;
  commission_name?: string | null;
}

const STATUS_MAP: Record<string, EventStatus> = {
  confirmed: 'confirmed',
  confirmado: 'confirmed',
  planned: 'requested',
  planejado: 'requested',
  requested: 'requested',
  solicitado: 'requested',
  in_progress: 'confirmed',
  em_andamento: 'confirmed',
  completed: 'completed',
  concluido: 'completed',
  concluído: 'completed',
  overdue: 'requested',
  rescheduled: 'rescheduled',
  reprogramado: 'rescheduled',
  reagendado: 'rescheduled',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  cancelado: 'cancelled',
  draft: 'draft',
  rascunho: 'draft',
  undated: 'draft',
  in_definition: 'draft',
  aguardando_definicao: 'draft',
  aguardando_responsavel: 'requested',
  blocked: 'requested',
};

export function mapCronogramaStatus(status: string | null | undefined): EventStatus {
  if (!status) return 'draft';
  return STATUS_MAP[status.trim().toLowerCase()] ?? 'requested';
}

function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function toPersonSummary(person: CommissionPerson): PersonSummary {
  return { id: person.id, name: person.name, role: person.role ?? null, userId: person.userId ?? null };
}

export function toUnitSummary(entry: Pick<OfficialUnitEntry, 'id' | 'name' | 'shortName' | 'type'>): UnitSummary {
  return { id: entry.id, name: entry.name, shortName: entry.shortName, type: entry.type };
}

const MODULE_STATUS_MAP: Record<CommissionModule['status'], OrganizationalUnitStatus> = {
  active: 'active',
  structuring: 'structuring',
  restricted: 'restricted',
};

export interface ToCommissionUnitOptions {
  module: CommissionModule;
  entry: OfficialUnitEntry;
  people?: CommissionUnitPeople;
}

export function toCommissionUnitViewModel({ module, entry, people }: ToCommissionUnitOptions): CommissionUnitViewModel {
  const fallbackLeads: PersonSummary[] = (entry.responsibles?.length ? entry.responsibles : [entry.responsible])
    .filter(Boolean)
    .map((name, index) => ({ id: `${entry.id}-principal-${index}`, name, role: entry.responsibleRole ?? 'Responsável' }));

  const leads = people?.leads?.length
    ? people.leads.map(toPersonSummary)
    : people?.responsible
      ? [toPersonSummary(people.responsible)]
      : fallbackLeads;
  const leadIds = new Set(leads.map((person) => person.id));
  const members = (people?.members ?? []).map(toPersonSummary).filter((person) => !leadIds.has(person.id));

  return {
    ...toUnitSummary(entry),
    description: entry.description,
    status: MODULE_STATUS_MAP[module.status] ?? 'structuring',
    icon: entry.icon,
    accentColor: module.visual.accentColor,
    principal: leads[0],
    leads,
    members,
    basePath: module.basePath,
  };
}

export interface ToAgendaEventOptions {
  /** Unit that owns the workspace; used to tag the event when the row has no link data. */
  self?: UnitSummary;
  /** Resolves a commission slug into a unit summary (for cross-unit chips). */
  resolveUnit?: (slug: string) => UnitSummary | undefined;
}

export function toAgendaEventViewModel(row: CronogramaEventRowLike, options: ToAgendaEventOptions = {}): AgendaEventViewModel | null {
  const date = normalizeDate(row.start_date);
  if (!date) return null;

  const startTime = normalizeTime(row.start_time ?? row.event_time);
  const endTime = normalizeTime(row.end_time);
  const endDate = normalizeDate(row.end_date);

  const units: UnitSummary[] = [];
  if (options.self) units.push(options.self);
  if (row.commission_slug && options.resolveUnit) {
    const linked = options.resolveUnit(row.commission_slug);
    if (linked && !units.some((unit) => unit.id === linked.id)) units.push(linked);
  }

  const people: PersonSummary[] = row.responsible_name
    ? [{ id: `${row.id}-responsible`, name: row.responsible_name, role: 'Responsável' }]
    : [];

  return {
    id: row.id,
    title: row.title,
    date,
    endDate: endDate && endDate !== date ? endDate : null,
    startTime,
    endTime,
    duration: computeDuration(startTime, endTime),
    status: mapCronogramaStatus(row.status),
    location: row.location ?? null,
    description: row.description ?? null,
    people,
    units,
    documentCount: 0,
  };
}

export function toAgendaEventViewModels(rows: CronogramaEventRowLike[], options: ToAgendaEventOptions = {}): AgendaEventViewModel[] {
  return rows
    .map((row) => toAgendaEventViewModel(row, options))
    .filter((event): event is AgendaEventViewModel => event !== null);
}
