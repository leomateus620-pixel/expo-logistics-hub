/**
 * Shared organizational registry (Comissões e Assessorias — Fenasoja 2028).
 *
 * Single source of truth consumed by both "Cronograma e Eventos" and
 * "Eventos Restaurante e Arena". No module may keep its own hardcoded list.
 */

export type OrgUnitType = 'comissao' | 'assessoria' | 'externo';

export type OrgUnitResponsibleRole =
  | 'principal'
  | 'corresponsavel'
  | 'copresidente'
  | 'equipe_apoio';

export interface OrgUnitResponsible {
  id: string;
  displayName: string;
  responsibleType: 'pessoa' | 'equipe';
  relationshipRole: OrgUnitResponsibleRole;
  isPrimary: boolean;
  userId: string | null;
}

export interface OrgUnit {
  id: string;
  name: string;
  slug: string;
  type: OrgUnitType;
  displayOrder: number;
  isOfficial: boolean;
  isLegacy: boolean;
  responsibles: OrgUnitResponsible[];
}

export const ORG_UNIT_SELECT_LABEL = 'Comissão ou Assessoria responsável';

export function normalizeSearchTerm(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function orgUnitTypeLabel(type: OrgUnitType): string {
  if (type === 'assessoria') return 'Assessoria';
  if (type === 'externo') return 'Organização';
  return 'Comissão';
}

export function orgUnitGroupLabel(type: OrgUnitType): string {
  if (type === 'assessoria') return 'Assessorias';
  if (type === 'externo') return 'Outras organizações';
  return 'Comissões';
}

/** "Miguel Nedel e Diana Nedel" / "Julio Bravo, Roberto Racho e Sara Kirchhof" */
export function joinResponsibleNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export function responsibleNames(unit: Pick<OrgUnit, 'responsibles'>): string[] {
  return unit.responsibles.map((item) => item.displayName);
}

/** Secondary line used in selector options: "Comissão · Miguel Nedel e Diana Nedel". */
export function orgUnitHint(unit: OrgUnit): string {
  const names = joinResponsibleNames(responsibleNames(unit));
  return names ? `${orgUnitTypeLabel(unit.type)} · ${names}` : orgUnitTypeLabel(unit.type);
}

/** Heading used above the responsible list in the selected-state summary. */
export function responsibleHeading(unit: Pick<OrgUnit, 'responsibles'>): string {
  const items = unit.responsibles;
  if (items.length === 0) return 'Sem responsável institucional cadastrado';
  if (items.length === 1) {
    return items[0].responsibleType === 'equipe' ? 'Equipe responsável' : 'Responsável institucional';
  }
  return 'Responsáveis institucionais';
}

export function responsibleRoleLabel(role: OrgUnitResponsibleRole): string {
  switch (role) {
    case 'principal':
      return 'Principal';
    case 'corresponsavel':
      return 'Corresponsável';
    case 'copresidente':
      return 'Copresidência';
    case 'equipe_apoio':
      return 'Equipe de apoio';
    default:
      return 'Responsável';
  }
}

/** Accent/case-insensitive match by unit name or by any responsible name. */
export function orgUnitMatches(unit: OrgUnit, term: string): boolean {
  const needle = normalizeSearchTerm(term);
  if (!needle) return true;
  const haystack = [unit.name, unit.slug, orgUnitTypeLabel(unit.type), ...responsibleNames(unit)]
    .map(normalizeSearchTerm)
    .join(' ');
  return needle.split(' ').every((token) => haystack.includes(token));
}

/** Official units first (by display order), legacy ones last. */
export function sortOrgUnits(units: OrgUnit[]): OrgUnit[] {
  return [...units].sort((a, b) => {
    if (a.isLegacy !== b.isLegacy) return a.isLegacy ? 1 : -1;
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

export interface OrgUnitGroup {
  type: OrgUnitType;
  label: string;
  units: OrgUnit[];
}

export function groupOrgUnits(units: OrgUnit[]): OrgUnitGroup[] {
  const order: OrgUnitType[] = ['comissao', 'assessoria', 'externo'];
  return order
    .map((type) => ({
      type,
      label: orgUnitGroupLabel(type),
      units: sortOrgUnits(units.filter((unit) => unit.type === type)),
    }))
    .filter((group) => group.units.length > 0);
}

/**
 * Units offered for new registrations: official ones, plus any legacy unit
 * already linked to the record being edited (so history keeps rendering).
 */
export function selectableOrgUnits(units: OrgUnit[], keepIds: string[] = []): OrgUnit[] {
  const keep = new Set(keepIds);
  return units.filter((unit) => !unit.isLegacy || keep.has(unit.id));
}

export function findOrgUnitByName(units: OrgUnit[], name: string | null | undefined): OrgUnit | undefined {
  const normalized = normalizeSearchTerm(name);
  if (!normalized) return undefined;
  return units.find((unit) => normalizeSearchTerm(unit.name) === normalized);
}
