/**
 * Ponte entre o formulário da Agenda da unidade e o mesmo caminho de escrita
 * canônico da Agenda Fenasoja (`cronograma_save_event`).
 *
 * Não existe evento paralelo: o registro criado aqui é o mesmo evento, com o
 * mesmo ID, exibido nas duas agendas.
 */
import type { CronogramaSaveEventPayload } from '@/lib/cronograma-rpc';
import type { AgendaEventDraft } from '../components/EventFormShell';
import type { AgendaEventViewModel, EventStatus, PersonSummary } from '../types';

const STATUS_TO_DB: Record<EventStatus, string> = {
  requested: 'aguardando_definicao',
  confirmed: 'planejado',
  draft: 'aguardando_definicao',
  completed: 'concluido',
  cancelled: 'cancelado',
  rescheduled: 'planejado',
};

export interface UnitRef {
  commissionId: string;
  slug: string;
  name: string;
}

export interface DraftToPayloadOptions {
  orgId: string;
  /** Unidade dona do evento (workspace atual). */
  owner: UnitRef;
  editing?: AgendaEventViewModel | null;
  /** Resolve o id canônico do catálogo para a comissão real. */
  resolveUnit: (canonicalId: string) => UnitRef | undefined;
  /** Resolve a pessoa selecionada no formulário. */
  resolvePerson: (personId: string) => PersonSummary | undefined;
}

export function draftToSaveEventPayload(
  draft: AgendaEventDraft,
  options: DraftToPayloadOptions,
): CronogramaSaveEventPayload {
  const { orgId, owner, editing, resolveUnit, resolvePerson } = options;

  const commissions: NonNullable<CronogramaSaveEventPayload['commissions']> = [
    {
      commission_id: owner.commissionId,
      commission_slug: owner.slug,
      commission_name: owner.name,
      relation_role: 'principal',
    },
  ];

  for (const unitId of draft.unitIds) {
    const resolved = resolveUnit(unitId);
    if (!resolved || resolved.commissionId === owner.commissionId) continue;
    if (commissions.some((item) => item.commission_id === resolved.commissionId)) continue;
    commissions.push({
      commission_id: resolved.commissionId,
      commission_slug: resolved.slug,
      commission_name: resolved.name,
      relation_role: 'participante',
    });
  }

  const responsibles: NonNullable<CronogramaSaveEventPayload['responsibles']> = [];
  draft.peopleIds.forEach((personId, index) => {
    const person = resolvePerson(personId);
    if (!person) return;
    responsibles.push({
      user_id: person.userId ?? null,
      name: person.name,
      role: person.role ?? null,
      is_primary: index === 0,
      responsible_type: person.userId ? 'member' : 'external',
    });
  });

  const startDate = draft.date || null;
  const endDate = draft.endDate && draft.endDate !== draft.date ? draft.endDate : null;
  const year = startDate ? (Number(startDate.slice(0, 4)) as 2026 | 2027 | 2028) : 2028;
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;

  return {
    ...(editing?.id ? { id: editing.id } : { source_key: `unidade-${owner.slug}-${suffix}` }),
    org_id: orgId,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    category: 'Agenda das comissões',
    event_type: 'reuniao',
    source_year: year,
    start_date: startDate,
    end_date: endDate,
    status: STATUS_TO_DB[draft.status] ?? 'planejado',
    priority: 'media',
    location: draft.location.trim() || null,
    event_time: draft.startTime || null,
    start_time: draft.startTime || null,
    end_time: draft.endTime || null,
    commission_slug: owner.slug,
    commission_name: owner.name,
    responsible_name: responsibles[0]?.name ?? null,
    has_exact_date: Boolean(startDate),
    commissions,
    responsibles,
  };
}

export function validateDraft(draft: AgendaEventDraft): string | null {
  if (!draft.title.trim()) return 'Informe o título do evento.';
  if (!draft.date) return 'Informe a data do evento.';
  if (draft.endDate && draft.endDate < draft.date) return 'A data final não pode ser anterior à inicial.';
  if (draft.startTime && draft.endTime && !draft.endDate && draft.endTime < draft.startTime) {
    return 'O horário final não pode ser anterior ao inicial.';
  }
  return null;
}
