import { describe, expect, it } from 'vitest';
import {
  canEditEvent,
  canManageDocuments,
  canManageEvent,
  canViewInCentralAgenda,
  getOwnerUnitId,
} from '@/features/commission-agenda/lib/visibility';
import {
  toAccessSubject,
  toUnitAgendaEvents,
  type UnitAgendaRow,
} from '@/features/commission-agenda/adapters/unit-agenda.adapter';
import { draftToSaveEventPayload, validateDraft } from '@/features/commission-agenda/lib/event-draft';
import { isVisibleInCentralTimeline } from '@/lib/cronograma-eventos';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const CENTRAL = '33333333-3333-3333-3333-333333333333';

function row(overrides: Partial<UnitAgendaRow> = {}): UnitAgendaRow {
  return {
    id: 'event-1',
    title: 'Reunião de planejamento',
    start_date: '2026-05-04',
    end_date: '2026-05-05',
    start_time: '09:00:00',
    end_time: '11:00:00',
    event_time: null,
    status: 'planejado',
    location: 'Auditório',
    description: 'Pauta oficial',
    responsible_name: 'Leonardo',
    commission_slug: 'mercosul',
    origin_source: 'unidade',
    origin_commission_id: OWNER,
    units: [
      { commission_id: OWNER, slug: 'mercosul', name: 'Mercosul', role: 'principal' },
      { commission_id: OTHER, slug: 'seguranca', name: 'Segurança', role: 'participante' },
    ],
    people: [{ id: 'p1', user_id: 'user-1', name: 'Leonardo', role: 'Principal', is_primary: true }],
    document_count: 3,
    ...overrides,
  };
}

describe('adapter da agenda da unidade', () => {
  it('mantém um único evento canônico com unidades, pessoas e documentos', () => {
    const events = toUnitAgendaEvents([row(), row()]);
    expect(events).toHaveLength(2);
    const [event] = events;
    expect(event.id).toBe('event-1');
    expect(event.endDate).toBe('2026-05-05');
    expect(event.startTime).toBe('09:00');
    expect(event.units?.map((unit) => unit.id)).toEqual([OWNER, OTHER]);
    expect(event.documentCount).toBe(3);
  });

  it('ignora linhas sem data inicial', () => {
    expect(toUnitAgendaEvents([row({ start_date: null })])).toHaveLength(0);
  });
});

describe('regras centralizadas de acesso', () => {
  const subject = toAccessSubject(row());

  it('reconhece a unidade proprietária', () => {
    expect(getOwnerUnitId(subject)).toBe(OWNER);
  });

  it('permite editar a quem pertence a qualquer unidade do evento', () => {
    expect(canEditEvent(subject, { memberCommissionIds: [OTHER] })).toBe(true);
    expect(canEditEvent(subject, { memberCommissionIds: [CENTRAL] })).toBe(false);
    expect(canEditEvent(subject, { orgRole: 'admin' })).toBe(true);
  });

  it('restringe ações críticas à unidade proprietária', () => {
    expect(canManageEvent(subject, { memberCommissionIds: [OTHER] })).toBe(false);
    expect(canManageEvent(subject, { memberCommissionIds: [OWNER] })).toBe(true);
  });

  it('controla a gestão de documentos pela unidade', () => {
    expect(canManageDocuments({ memberCommissionIds: [OWNER] }, OWNER)).toBe(true);
    expect(canManageDocuments({ memberCommissionIds: [] }, OWNER)).toBe(false);
  });

  it('mantém eventos internos fora da agenda central', () => {
    expect(canViewInCentralAgenda(subject, { centralCommissionId: CENTRAL })).toBe(false);
    const withCentral = toAccessSubject(
      row({
        units: [
          { commission_id: OWNER, slug: 'mercosul', name: 'Mercosul', role: 'principal' },
          { commission_id: CENTRAL, slug: 'central', name: 'Comissão Central', role: 'participante' },
        ],
      }),
    );
    expect(canViewInCentralAgenda(withCentral, { centralCommissionId: CENTRAL })).toBe(true);
  });

  it('aplica a mesma regra na timeline da Agenda Fenasoja', () => {
    expect(isVisibleInCentralTimeline({ originSource: 'agenda_central' })).toBe(true);
    expect(isVisibleInCentralTimeline({ originSource: 'unidade', commissionSlug: 'mercosul' })).toBe(false);
    expect(
      isVisibleInCentralTimeline({ originSource: 'unidade', linkedCommissions: [{ slug: 'central' }] }),
    ).toBe(true);
  });
});

describe('formulário da unidade → evento canônico', () => {
  const baseDraft = {
    title: 'Reunião da frente',
    description: 'Pauta',
    date: '2026-05-04',
    endDate: '',
    startTime: '09:00',
    endTime: '10:00',
    location: 'Sala 2',
    status: 'confirmed' as const,
    peopleIds: ['p1'],
    unitIds: ['seguranca-canonica'],
  };

  const options = {
    orgId: 'org-1',
    owner: { commissionId: OWNER, slug: 'mercosul', name: 'Mercosul' },
    resolveUnit: (id: string) =>
      id === 'seguranca-canonica' ? { commissionId: OTHER, slug: 'seguranca', name: 'Segurança' } : undefined,
    resolvePerson: (id: string) => (id === 'p1' ? { id: 'p1', name: 'Leonardo', userId: 'user-1' } : undefined),
  };

  it('envia a unidade dona como principal e as demais como participantes', () => {
    const payload = draftToSaveEventPayload(baseDraft, options);
    expect(payload.commissions).toEqual([
      { commission_id: OWNER, commission_slug: 'mercosul', commission_name: 'Mercosul', relation_role: 'principal' },
      { commission_id: OTHER, commission_slug: 'seguranca', commission_name: 'Segurança', relation_role: 'participante' },
    ]);
    expect(payload.responsibles?.[0]).toMatchObject({ user_id: 'user-1', is_primary: true, responsible_type: 'member' });
    expect(payload.id).toBeUndefined();
  });

  it('preserva o mesmo ID ao editar', () => {
    const payload = draftToSaveEventPayload(baseDraft, {
      ...options,
      editing: { id: 'event-1', title: 'x', date: '2026-05-04', status: 'confirmed' },
    });
    expect(payload.id).toBe('event-1');
    expect(payload.source_key).toBeUndefined();
  });

  it('valida período e campos obrigatórios', () => {
    expect(validateDraft(baseDraft)).toBeNull();
    expect(validateDraft({ ...baseDraft, title: '  ' })).toMatch(/título/i);
    expect(validateDraft({ ...baseDraft, date: '' })).toMatch(/data/i);
    expect(validateDraft({ ...baseDraft, endDate: '2026-05-01' })).toMatch(/anterior/i);
  });
});
