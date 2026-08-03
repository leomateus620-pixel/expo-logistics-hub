import { describe, expect, it } from 'vitest';
import {
  groupOrgUnits,
  joinResponsibleNames,
  normalizeSearchTerm,
  orgUnitHint,
  orgUnitMatches,
  responsibleHeading,
  selectableOrgUnits,
  sortOrgUnits,
  type OrgUnit,
} from '@/lib/org-units';

function unit(partial: Partial<OrgUnit> & Pick<OrgUnit, 'id' | 'name'>): OrgUnit {
  return {
    slug: partial.name.toLowerCase().replace(/\s+/g, '-'),
    type: 'comissao',
    displayOrder: 1,
    isOfficial: true,
    isLegacy: false,
    responsibles: [],
    ...partial,
  } as OrgUnit;
}

const relacoesEstrategicas = unit({
  id: 'u1',
  name: 'Relações Estratégicas',
  displayOrder: 18,
  responsibles: [
    { id: 'r1', displayName: 'Miguel Nedel', responsibleType: 'pessoa', relationshipRole: 'principal', isPrimary: true, userId: null },
    { id: 'r2', displayName: 'Diana Nedel', responsibleType: 'pessoa', relationshipRole: 'copresidente', isPrimary: false, userId: null },
  ],
});

const relacoesInternacionais = unit({
  id: 'u2',
  name: 'Assessoria de Relações Internacionais',
  type: 'assessoria',
  displayOrder: 6,
  responsibles: [
    { id: 'r3', displayName: 'Julio Bravo', responsibleType: 'pessoa', relationshipRole: 'principal', isPrimary: true, userId: null },
    { id: 'r4', displayName: 'Roberto Racho', responsibleType: 'pessoa', relationshipRole: 'corresponsavel', isPrimary: false, userId: null },
    { id: 'r5', displayName: 'Sara Kirchhof', responsibleType: 'pessoa', relationshipRole: 'corresponsavel', isPrimary: false, userId: null },
  ],
});

const projetosCaptacoes = unit({
  id: 'u3',
  name: 'Assessoria de Projetos e Captações',
  type: 'assessoria',
  displayOrder: 4,
  responsibles: [
    { id: 'r6', displayName: 'Jardel Hillesheim', responsibleType: 'pessoa', relationshipRole: 'principal', isPrimary: true, userId: null },
    { id: 'r7', displayName: 'Equipe do EP', responsibleType: 'equipe', relationshipRole: 'equipe_apoio', isPrimary: false, userId: null },
  ],
});

const logistica = unit({
  id: 'u4',
  name: 'Logística, Hotelaria e Turismo',
  displayOrder: 13,
  responsibles: [
    { id: 'r8', displayName: 'Eduardo Santos', responsibleType: 'pessoa', relationshipRole: 'principal', isPrimary: true, userId: null },
  ],
});

const central = unit({ id: 'u5', name: 'CENTRAL', isOfficial: false, isLegacy: true, displayOrder: 999 });

const registry = [relacoesEstrategicas, relacoesInternacionais, projetosCaptacoes, logistica, central];

describe('registro organizacional compartilhado', () => {
  it('normaliza acentos, caixa e pontuação para deduplicação', () => {
    expect(normalizeSearchTerm('ARTE E CULTURA')).toBe('arte e cultura');
    expect(normalizeSearchTerm('Arte e Cultura')).toBe('arte e cultura');
    expect(normalizeSearchTerm('arte-cultura')).toBe('arte cultura');
    expect(normalizeSearchTerm("Alexandre Dall'Agnese")).toBe('alexandre dall agnese');
  });

  it('monta a linha auxiliar com tipo e responsáveis', () => {
    expect(orgUnitHint(relacoesEstrategicas)).toBe('Comissão · Miguel Nedel e Diana Nedel');
    expect(orgUnitHint(relacoesInternacionais)).toBe(
      'Assessoria · Julio Bravo, Roberto Racho e Sara Kirchhof',
    );
    expect(joinResponsibleNames(['Eduardo Santos'])).toBe('Eduardo Santos');
  });

  it('usa o título correto conforme quantidade e tipo de responsável', () => {
    expect(responsibleHeading(logistica)).toBe('Responsável institucional');
    expect(responsibleHeading(relacoesEstrategicas)).toBe('Responsáveis institucionais');
    expect(responsibleHeading({ responsibles: [projetosCaptacoes.responsibles[1]] })).toBe('Equipe responsável');
  });

  it('busca por nome da unidade e por nome do responsável, ignorando acento e caixa', () => {
    expect(orgUnitMatches(logistica, 'logistica')).toBe(true);
    expect(orgUnitMatches(logistica, 'EDUARDO')).toBe(true);
    expect(orgUnitMatches(projetosCaptacoes, 'equipe ep')).toBe(true);
    expect(orgUnitMatches(logistica, 'imprensa')).toBe(false);
  });

  it('agrupa em Comissões e Assessorias e ordena oficiais antes de legados', () => {
    const groups = groupOrgUnits(registry);
    expect(groups.map((group) => group.label)).toEqual(['Comissões', 'Assessorias']);
    expect(groups[0].units.map((item) => item.name)).toEqual([
      'Logística, Hotelaria e Turismo',
      'Relações Estratégicas',
      'CENTRAL',
    ]);
    expect(sortOrgUnits(registry)[sortOrgUnits(registry).length - 1].name).toBe('CENTRAL');
  });

  it('oferece unidades legado apenas quando já vinculadas ao registro', () => {
    expect(selectableOrgUnits(registry).map((item) => item.id)).not.toContain('u5');
    expect(selectableOrgUnits(registry, ['u5']).map((item) => item.id)).toContain('u5');
  });

  it('não duplica opções para uma mesma unidade', () => {
    const ids = groupOrgUnits(registry).flatMap((group) => group.units.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
