/**
 * Ponte entre o formulário da Agenda da unidade e o mesmo caminho de escrita
 * canônico da Agenda Fenasoja (`cronograma_save_event`).
 *
 * Não existe evento paralelo: o registro criado aqui é o mesmo evento, com o
 * mesmo ID, exibido nas duas agendas.
 */
import type { CronogramaSaveEventPayload } from '@/lib/cronograma-rpc';
import { newRequestId } from '@/lib/cronograma-rpc';
import type { AgendaEventDraft } from '../components/EventFormShell';
import type { AgendaEventViewModel, EventStatus, PersonSummary } from '../types';

const STATUS_TO_DB: Record<EventStatus, string> = {
  requested: 'planejado',
  confirmed: 'planejado',
  draft: 'planejado',
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
  /** Unidade de criação; em edições a proprietária vem do evento persistido. */
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
  const { orgId, editing, resolveUnit, resolvePerson } = options;
  const owner = editing ? editing.ownerUnit : options.owner;
  if (!owner) throw new Error('Unidade proprietária não identificada no evento. Reabra os detalhes ou solicite a revisão do vínculo principal.');
  if (editing && editing.lockVersion == null) throw new Error('Versão do evento indisponível. Reabra o evento antes de editar.');

  const commissions: NonNullable<CronogramaSaveEventPayload['commissions']> = [
    {
      commission_id: owner.commissionId,
      commission_slug: owner.slug,
      commission_name: owner.name,
      relation_role: 'principal',
    },
  ];

  for (const unitId of draft.unitIds) {
    const linked = editing?.units?.find(unit => unit.id === unitId);
    const resolved = linked?.commissionId && linked.slug
      ? { commissionId: linked.commissionId, slug: linked.slug, name: linked.name } : resolveUnit(unitId);
    if (!resolved) throw new Error('Uma unidade selecionada não pôde ser identificada. Revise as unidades participantes.');
    if (resolved.commissionId === owner.commissionId) continue;
    if (commissions.some((item) => item.commission_id === resolved.commissionId)) continue;
    commissions.push({
      commission_id: resolved.commissionId,
      commission_slug: resolved.slug,
      commission_name: resolved.name,
      relation_role: linked?.relationRole ?? 'participante',
    });
  }

  const responsibles: NonNullable<CronogramaSaveEventPayload['responsibles']> = [];
  draft.peopleIds.forEach((personId, index) => {
    const existing = editing?.people?.find(person => person.id === personId);
    const person: PersonSummary | undefined = resolvePerson(personId) ?? existing ?? draft.externalPeople?.find(person => person.id === personId);
    if (!person) throw new Error('Uma pessoa selecionada não pôde ser identificada. Revise os convidados.');
    if (responsibles.some(item => person.personId ? item.person_id === person.personId
      : person.userId ? item.user_id === person.userId : false)) return;
    responsibles.push({
      person_id: person.personId ?? null,
      user_id: person.personId ? null : person.userId ?? null,
      name: person.name,
      role: person.role ?? null,
      is_primary: editing?.people?.some(item => item.isPrimary && draft.peopleIds.includes(item.id))
        ? existing?.isPrimary ?? false : index === 0,
      responsible_type: person.userId ? 'member' : 'external',
    });
  });

  const startDate = draft.date || null;
  const endDate = draft.endDate && draft.endDate !== draft.date ? draft.endDate : null;
  const year = startDate ? (Number(startDate.slice(0, 4)) as 2026 | 2027 | 2028) : 2028;

  return {
    ...(editing?.id ? { id: editing.id } : { source_key: draft.sourceKey ?? `unidade-${owner.slug}-${newRequestId()}` }),
    ...(!editing?.id ? { origin_commission_id: owner.commissionId } : {}),
    org_id: orgId,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    ...(!editing ? { category: 'Agenda das comissões', event_type: 'reuniao', priority: 'media' } : {}),
    source_year: year,
    start_date: startDate,
    end_date: endDate,
    status: editing?.status === draft.status && editing.persistedStatus && editing.persistedStatus !== 'aguardando_definicao' ? editing.persistedStatus : STATUS_TO_DB[draft.status] ?? 'planejado',
    location: draft.location.trim() || null,
    location_code: draft.locationCode ?? null,
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
  if (draft.startTime && draft.endTime && (!draft.endDate || draft.endDate === draft.date) && draft.endTime < draft.startTime) {
    return 'O horário final não pode ser anterior ao inicial.';
  }
  return null;
}
