import { useMemo } from 'react';
import { useOrgCommissions } from '@/hooks/useOrgCommissions';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { resolveOfficialMembers } from '@/lib/memberIdentity';
import {
  normalizeSearchTerm,
  orgUnitGroupLabel,
  orgUnitHint,
  responsibleRoleLabel,
  selectableOrgUnits,
} from '@/lib/org-units';
import { resolveOrgUnitIdentity } from './org-unit-identity';
import type { RelationalOption, RelationalSelection } from './RelationalMultiSelect';
import type {
  CronogramaEventCommissionLink,
  CronogramaEventResponsibleLink,
} from './types';

export interface CronogramaRelationMember {
  user_id?: string | null;
  nome_exibicao?: string | null;
  cargo?: string | null;
  role?: string | null;
  commission_nome?: string | null;
  is_active?: boolean | null;
  is_core_team?: boolean | null;
}

export function commissionLinksToSelections(
  links: CronogramaEventCommissionLink[] | undefined,
): RelationalSelection[] {
  return (links ?? []).map((link) => ({
    id: link.commissionId ?? `slug:${link.commissionSlug ?? link.commissionName ?? 'sem-vinculo'}`,
    label: link.commissionName ?? link.commissionSlug ?? 'Comissão',
    hint: link.commissionSlug ?? undefined,
    isPrimary: link.isPrimary ?? false,
  }));
}

export function responsibleLinksToSelections(
  links: CronogramaEventResponsibleLink[] | undefined,
): RelationalSelection[] {
  return (links ?? []).map((link) => ({
    id: link.personId ? `person:${link.personId}` : link.userId ?? `external:${(link.name ?? '').toLocaleLowerCase('pt-BR')}`,
    label: link.name ?? 'Responsável',
    hint: link.role ?? (link.responsibleType === 'external' ? 'Externo' : 'Membro'),
    isPrimary: link.isPrimary ?? false,
  }));
}

export function selectionsToCommissionLinks(
  selections: RelationalSelection[],
  options: Array<{ id: string; nome: string; slug: string }>,
): CronogramaEventCommissionLink[] {
  return selections.map((selection) => {
    const option = options.find((item) => item.id === selection.id);
    return {
      commissionId: option?.id ?? (selection.id.startsWith('slug:') ? null : selection.id),
      commissionSlug: option?.slug ?? selection.hint ?? null,
      commissionName: option?.nome ?? selection.label,
      isPrimary: selection.isPrimary ?? false,
    };
  });
}

export function selectionsToResponsibleLinks(
  selections: RelationalSelection[],
): CronogramaEventResponsibleLink[] {
  return selections.map((selection) => {
    const isPerson = selection.id.startsWith('person:');
    const isExternal = isPerson || selection.id.startsWith('external:') || selection.id.startsWith('custom:') || selection.id.startsWith('legacy:');
    return {
      personId: isPerson ? selection.id.slice(7) : null,
      userId: isExternal ? null : selection.id,
      name: selection.label,
      role: selection.hint ?? null,
      isPrimary: selection.isPrimary ?? false,
      responsibleType: isExternal ? 'external' : 'member',
    };
  });
}

/**
 * Reconciles free-typed responsible entries with real options and drops duplicates
 * so the same person is never linked twice under different ids.
 */
export function reconcileResponsibleSelections(
  next: RelationalSelection[],
  options: RelationalOption[],
): RelationalSelection[] {
  // A name is not an identity: never merge homonyms or promote typed text to an account.
  const seen = new Set<string>();
  return next.filter(selection => {
    if (seen.has(selection.id)) return false;
    seen.add(selection.id);
    return true;
  });
}

/** Official commission/assessoria options, keeping already linked units selectable. */
export function buildCommissionOptions(
  units: ReturnType<typeof useOrgCommissions>['units'],
  linkedUnitIds: string[] = [],
): RelationalOption[] {
  const selectable = selectableOrgUnits(units, linkedUnitIds);
  // CCPF (conselho) is its own category and always leads the list.
  const ordered = [
    ...selectable.filter((unit) => unit.type === 'conselho'),
    ...selectable.filter((unit) => unit.type !== 'conselho'),
  ];
  return ordered.map((unit) => {
    const identity = resolveOrgUnitIdentity(unit);
    return {
      id: unit.id,
      label: unit.name,
      // `hint` participates in the existing persistence fallback; preserve it byte-for-byte.
      hint: orgUnitHint(unit),
      description: orgUnitHint(unit),
      context: unit.isLegacy ? 'Registro histórico' : 'Área institucional oficial',
      searchText: unit.responsibles.map((person) => person.displayName).join(' '),
      group: orgUnitGroupLabel(unit.type),
      identityId: identity?.id,
      identityKind: identity?.kind ?? (unit.type === 'conselho' || unit.type === 'assessoria' ? unit.type : 'comissao'),
    };
  });
}

/**
 * Single source of truth for the official commission/assessoria and responsible
 * option lists used by the event form and the subevent plan builder.
 */
export function useCronogramaRelationOptions(linkedUnitIds: string[] = []) {
  const {
    units,
    commissions,
    isLoading: commissionsLoading,
    error: commissionsError,
  } = useOrgCommissions();
  const {
    members,
    loginMembers,
    isLoading: membersLoading,
    isLoadingLoginMembers,
    error: membersError,
    loginMembersError,
  } = useOrgMembers();

  const linkedSignature = linkedUnitIds.join('|');

  const commissionOptions = useMemo<RelationalOption[]>(
    () => buildCommissionOptions(units, linkedSignature ? linkedSignature.split('|') : []),
    [units, linkedSignature],
  );

  const responsibleOptions = useMemo<RelationalOption[]>(() => buildInstitutionalPersonOptions(units, loginMembers as CronogramaRelationMember[]), [units,loginMembers]);

  return {
    units,
    commissions,
    members,
    loginMembers,
    commissionOptions,
    responsibleOptions,
    commissionsLoading,
    commissionsError,
    membersLoading: membersLoading || isLoadingLoginMembers,
    membersError: membersError || loginMembersError,
  };
}

/** Deduplicate only by the persisted person ID or a verified account relationship. */
export function buildInstitutionalPersonOptions(units: ReturnType<typeof useOrgCommissions>['units'], loginMembers:CronogramaRelationMember[]=[]):RelationalOption[]{
  const people=new Map<string,{label:string;userId:string|null;units:Set<string>;roles:Set<string>}>();
  const seenUsers=new Set<string>();
  for(const unit of units) for(const p of unit.responsibles){
    if(p.responsibleType!=='pessoa')continue;
    const id=p.personId?`person:${p.personId}`:p.userId??`legacy:${p.id}`;
    const existing=people.get(id);
    if(existing){existing.units.add(unit.name);existing.roles.add(responsibleRoleLabel(p.relationshipRole));}
    else people.set(id,{label:p.displayName,userId:p.userId,units:new Set([unit.name]),roles:new Set([responsibleRoleLabel(p.relationshipRole)])});
    if(p.userId)seenUsers.add(p.userId);
  }
  const options:RelationalOption[]=[...people].map(([id,p])=>({id,label:p.label,hint:[...p.units].join(' · '),description:[...p.roles].join(' · '),context:[...p.units].join(' · '),searchText:[...p.units,...p.roles].join(' '),group:'Equipe institucional'}));
  for(const m of loginMembers){
    if(!m.user_id||!m.nome_exibicao||seenUsers.has(m.user_id))continue;
    seenUsers.add(m.user_id);
    options.push({id:m.user_id,label:m.nome_exibicao,hint:m.cargo??undefined,context:m.commission_nome??'Membro do sistema',group:'Membros do sistema'});
  }
  return options.sort((a,b)=>a.label.localeCompare(b.label,'pt-BR')||a.id.localeCompare(b.id));
}
