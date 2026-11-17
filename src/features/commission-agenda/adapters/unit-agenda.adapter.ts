/**
 * Database → Domain → ViewModel da agenda de uma unidade.
 *
 * A origem é a função `cronograma_unit_agenda`, que já devolve o evento
 * canônico com suas unidades, pessoas e contagem de documentos.
 */
import type { AgendaEventViewModel, PersonSummary, UnitSummary } from '../types';
import { computeDuration } from '../lib/agenda-presentation';
import { mapCronogramaStatus } from './cronograma.adapter';
import type { EventAccessSubject, EventUnitLink } from '../lib/visibility';

export interface UnitAgendaUnitJson {
  commission_id: string | null;
  slug: string | null;
  name: string | null;
  role: string | null;
}

export interface UnitAgendaPersonJson {
  person_id?: string | null;
  legacy_photo?: boolean;
  id: string | null;
  user_id: string | null;
  name: string | null;
  role: string | null;
  is_primary: boolean | null;
}

export interface UnitAgendaRow {
  id: string;
  source_key?: string | null;
  lock_version?: number | null;
  location_code?: string | null;
  title: string;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  event_time: string | null;
  status: string | null;
  location: string | null;
  description: string | null;
  responsible_name: string | null;
  commission_slug: string | null;
  origin_source: string | null;
  origin_commission_id: string | null;
  units: UnitAgendaUnitJson[] | null;
  people: UnitAgendaPersonJson[] | null;
  document_count: number | null;
}

function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function toEventUnitLinks(row: UnitAgendaRow): EventUnitLink[] {
  return (row.units ?? []).map((unit) => ({
    commissionId: unit.commission_id ?? null,
    slug: unit.slug ?? null,
    name: unit.name ?? null,
    role: unit.role === 'principal' ? 'principal' : 'participante',
  }));
}

export function toAccessSubject(row: UnitAgendaRow): EventAccessSubject {
  return {
    id: row.id,
    units: toEventUnitLinks(row),
    peopleUserIds: (row.people ?? []).map((person) => person.user_id).filter((id): id is string => Boolean(id)),
    originSource: row.origin_source === 'unidade' ? 'unidade' : 'agenda_central',
    originCommissionId: row.origin_commission_id ?? null,
  };
}

export interface UnitAgendaAdapterOptions {
  /** Resolve o nome de exibição/tipo da unidade a partir do slug do banco. */
  resolveUnit?: (slug: string) => UnitSummary | undefined;
  resolvePerson?: (personId: string) => Pick<PersonSummary, 'photoUrl' | 'legacyPhoto'> | undefined;
}

export function toUnitAgendaEvent(
  row: UnitAgendaRow,
  options: UnitAgendaAdapterOptions = {},
): AgendaEventViewModel | null {
  const date = normalizeDate(row.start_date) ?? '';

  const startTime = normalizeTime(row.start_time ?? row.event_time);
  const endTime = normalizeTime(row.end_time);
  const endDate = normalizeDate(row.end_date);

  const units: UnitSummary[] = [];
  for (const link of row.units ?? []) {
    const slug = link.slug ?? '';
    const resolved = slug ? options.resolveUnit?.(slug) : undefined;
    const summary: UnitSummary = resolved ?? {
      id: link.commission_id ?? slug,
      name: link.name ?? slug,
      type: 'comissao',
    };
    if (!units.some((unit) => unit.id === summary.id)) units.push({ ...summary,
      commissionId: link.commission_id ?? undefined, slug: link.slug ?? undefined, relationRole: link.role ?? 'participante' });
  }

  const people: PersonSummary[] = (row.people ?? []).map((person, index) => ({
    id: person.person_id ?? person.user_id ?? person.id ?? `${row.id}-person-${index}`,
    personId: person.person_id ?? undefined,
    legacyPhoto: person.legacy_photo,
    isPrimary: person.is_primary ?? false,
    ...(person.person_id ? options.resolvePerson?.(person.person_id) : {}),
    name: person.name ?? 'Sem nome',
    role: person.role ?? null,
    userId: person.user_id ?? null,
  }));

  if (people.length === 0 && row.responsible_name) {
    people.push({ id: `${row.id}-responsible`, name: row.responsible_name, role: 'Responsável' });
  }

  const principal = (row.units ?? []).find(link => link.role === 'principal');
  return {
    id: row.id,
    originSource: row.origin_source === 'unidade' ? 'unidade' : 'agenda_central',
    originCommissionId: row.origin_commission_id,
    persistedStatus: row.status,
    ownerUnit: principal?.commission_id && principal.slug ? {
      commissionId: principal.commission_id, slug: principal.slug, name: principal.name ?? principal.slug,
    } : null,
    title: row.title,
    sourceKey: row.source_key ?? null,
    lockVersion: row.lock_version ?? null,
    locationCode: row.location_code ?? null,
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
    documentCount: row.document_count ?? 0,
  };
}

export function toUnitAgendaEvents(
  rows: UnitAgendaRow[],
  options: UnitAgendaAdapterOptions = {},
): AgendaEventViewModel[] {
  return rows
    .map((row) => toUnitAgendaEvent(row, options))
    .filter((event): event is AgendaEventViewModel => event !== null);
}

/** Only a confirmed canonical RPC result can enter the unit cache. Never build it from a draft. */
export function canonicalEventToUnitAgendaRow(saved: unknown): UnitAgendaRow | null {
  const event = saved as (Omit<UnitAgendaRow, 'units' | 'people' | 'document_count'> & {
    commissions_rel: Array<{ commission_id: string; commission_slug: string; commission_name: string; relation_role: string }>;
    responsibles_rel: UnitAgendaPersonJson[];
  }) | null;
  if (!event || typeof event.id !== 'string' || typeof event.title !== 'string'
    || !Array.isArray(event.commissions_rel) || !Array.isArray(event.responsibles_rel)) return null;
  return { ...event, document_count: 0,
    units: event.commissions_rel.map(link => ({ commission_id: link.commission_id, slug: link.commission_slug, name: link.commission_name, role: link.relation_role })),
    people: event.responsibles_rel,
  };
}
