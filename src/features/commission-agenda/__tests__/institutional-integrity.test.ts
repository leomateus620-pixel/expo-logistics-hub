import { describe, expect, it } from 'vitest';
import { OFFICIAL_COMMISSION_UNITS, resolveOfficialUnit } from '@/modules/commissions/officialCommissionCatalog';
import { resolveUnitDirectory } from '../lib/unit-identity';
import { draftToSaveEventPayload } from '../lib/event-draft';
import { canonicalEventToUnitAgendaRow, toUnitAgendaEvent } from '../adapters/unit-agenda.adapter';
import { filterEvents, createDefaultFilters, isCompletedLike, getTodayKey } from '../lib/agenda-presentation';
import { buildInstitutionalPersonOptions } from '@/components/cronograma-eventos/useCronogramaRelationOptions';
import type { OrgUnit } from '@/lib/org-units';
import type { AgendaEventDraft } from '../components/EventFormShell';

const unit = (id: string, slug: string, patch: Partial<OrgUnit> = {}): OrgUnit => ({
  id, slug, name: slug, type: 'comissao', displayOrder: 1, isOfficial: true, isLegacy: false, responsibles: [], ...patch,
});
const draft: AgendaEventDraft = { sourceKey: 'stable-draft', title: 'Reunião institucional', description: '', date: '2028-05-20',
  endDate: '', startTime: '09:30', endTime: '10:30', location: 'CASA FENASOJA', locationCode: 'casa_fenasoja',
  status: 'confirmed', peopleIds: ['person'], unitIds: ['owner', 'partner'] };
const owner = { commissionId: 'owner', slug: 'saude-bem-estar-e-acessibilidade', name: 'Saúde' };
const partner = { commissionId: 'partner', slug: 'assessoria-de-marketing', name: 'Marketing' };
const options = { orgId: 'org', owner, resolveUnit: (id: string) => id === 'owner' ? owner : id === 'partner' ? partner : undefined,
  resolvePerson: (id: string) => id === 'person' ? { id, personId: id, name: 'Responsável sem conta' } : undefined };

describe('catálogo inteiro → UUID persistido e rota institucional', () => {
  it.each(OFFICIAL_COMMISSION_UNITS)('$id', entry => {
    const official = unit('official', entry.id, { name: entry.name, type: entry.type });
    const legacy = unit('legacy', entry.moduleSlug ?? entry.aliases[0] ?? entry.id, { name: entry.name, isOfficial: false, isLegacy: true });
    for (const units of [[official, legacy], [legacy, official]]) {
      expect(resolveUnitDirectory(units, entry.id)).toMatchObject({ commissionId: 'official', commissionSlug: entry.id, identityError: null });
      const resolution = resolveOfficialUnit(entry.moduleSlug ?? entry.id)!;
      expect(resolution.entry.id).toBe(entry.id);
      expect(`${resolution.module.basePath}/agenda`).toMatch(/^\/comissoes\/[^/]+\/agenda$/);
      expect(draftToSaveEventPayload({ ...draft, unitIds: [] }, { ...options, owner: { commissionId: 'official', slug: entry.id, name: entry.name } }))
        .toMatchObject({ origin_commission_id: 'official', commission_slug: entry.id, source_key: 'stable-draft' });
    }
  });
  it('refuses ambiguous owner instead of relying on database order', () => {
    const result = resolveUnitDirectory([unit('1', owner.slug), unit('2', owner.slug)], owner.slug);
    expect(result.commissionId).toBeNull();
    expect(result.identityError).toMatch(/mais de um/);
  });
  it('keeps council separate and real UUIDs for historical selections', () => {
    const result = resolveUnitDirectory([unit('ccpf-id', 'ccpf', { type: 'conselho' }), unit('old-id', 'etnias', { isLegacy: true })]);
    expect(result.unitOptions).toMatchObject([{ id: 'ccpf-id', type: 'conselho' }]);
    expect(result.byCanonicalId.get('old-id')?.commissionId).toBe('old-id');
  });
});

describe('round trip de vínculos, estado e identidade', () => {
  it('editing in participant workspace preserves origin, primary unit, relationships and classification', () => {
    const event = toUnitAgendaEvent({ id: 'event', title: 'Original', start_date: draft.date, end_date: null,
      start_time: '09:30:00', end_time: '10:30:00', event_time: null, status: 'em_andamento', location: draft.location,
      location_code: 'casa_fenasoja', description: null, responsible_name: null, commission_slug: owner.slug,
      origin_source: 'unidade', origin_commission_id: owner.commissionId, lock_version: 3,
      units: [{ commission_id: 'owner', slug: owner.slug, name: owner.name, role: 'principal' },
        { commission_id: 'partner', slug: partner.slug, name: partner.name, role: 'apoio' }],
      people: [{ id: 'link', person_id: 'person', user_id: null, name: 'Responsável sem conta', role: 'Apoio', is_primary: true }], document_count: 2 })!;
    const payload = draftToSaveEventPayload({ ...draft, status: event.status }, { ...options, owner: partner, editing: event });
    expect(payload).toMatchObject({ id: 'event', commission_slug: owner.slug, location_code: 'casa_fenasoja', status: 'em_andamento' });
    expect(payload).not.toHaveProperty('category');
    expect(payload).not.toHaveProperty('priority');
    expect(payload).not.toHaveProperty('origin_commission_id');
    expect(payload.commissions?.map(item => [item.commission_id, item.relation_role])).toEqual([['owner','principal'],['partner','apoio']]);
    expect(payload.responsibles).toMatchObject([{ person_id: 'person', user_id: null }]);
  });
  it.each(['peopleIds', 'unitIds'] as const)('never silently drops an unresolved %s selection', field => {
    expect(() => draftToSaveEventPayload({ ...draft, [field]: ['missing'] }, options)).toThrow(/selecionad/);
  });
  it('deduplicates the same person across memberships, never homonyms', () => {
    const person = { id:'link',personId:'person',displayName:'Nome Real',userId:null,responsibleType:'pessoa' as const,
      relationshipRole:'principal' as const,isPrimary:true };
    const result = buildInstitutionalPersonOptions([unit('1','saude',{responsibles:[person]}),
      unit('2','marketing',{responsibles:[{...person,id:'other-link'}, {...person,personId:'homonym',id:'third-link'}]})]);
    expect(result).toHaveLength(2);
    expect(result.map(item=>item.id).sort()).toEqual(['person:homonym','person:person']);
  });
  it('keeps undated events readable and out of completed events', () => {
    const event = { id:'undated',title:'A definir',date:'',status:'requested' as const };
    expect(filterEvents([event],createDefaultFilters(2028),'2028-05-20')).toEqual([event]);
    expect(isCompletedLike(event,'2028-05-20')).toBe(false);
  });
  it('uses institutional timezone across devices', () => {
    expect(getTodayKey(new Date('2028-05-20T01:00:00Z'))).toBe('2028-05-19');
  });
});


describe('confirmed cache and explicit external identity', () => {
  it('only uses canonical relationships returned by the server for immediate display', () => {
    expect(canonicalEventToUnitAgendaRow({ id: 'event' })).toBeNull();
    const row = canonicalEventToUnitAgendaRow({ id: 'event', title: 'Persistido', lock_version: 3,
      commissions_rel: [{ commission_id: 'owner', commission_slug: 'acolhimento-e-bem-comum', commission_name: 'Acolhimento', relation_role: 'principal' }],
      responsibles_rel: [{ id: 'link', person_id: 'person', name: 'Pessoa persistida', is_primary: true }],
    });
    expect(row?.units?.[0]).toMatchObject({ commission_id: 'owner', role: 'principal' });
    expect(row?.people?.[0]).toMatchObject({ person_id: 'person', is_primary: true });
    expect(row?.lock_version).toBe(3);
  });
  it('saves explicitly created external guests without fabricating an institutional account', () => {
    const payload = draftToSaveEventPayload({ ...draft, peopleIds: ['external:qa'], externalPeople: [{ id: 'external:qa', name: 'Convidada externa' }] }, options);
    expect(payload.responsibles).toEqual([expect.objectContaining({ name: 'Convidada externa', person_id: null, user_id: null, responsible_type: 'external' })]);
  });
});
