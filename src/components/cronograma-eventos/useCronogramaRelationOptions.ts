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
    id: link.userId ?? `external:${(link.name ?? '').toLocaleLowerCase('pt-BR')}`,
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
    const isExternal = selection.id.startsWith('external:') || selection.id.startsWith('custom:');
    return {
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
  const reconciled = next.map((selection) => {
    if (!selection.id.startsWith('custom:') && !selection.id.startsWith('external:')) return selection;
    const match = options.find(
      (option) => normalizeSearchTerm(option.label) === normalizeSearchTerm(selection.label),
    );
    return match ? { ...selection, id: match.id, hint: selection.hint ?? match.hint } : selection;
  });
  const seen = new Set<string>();
  return reconciled.filter((selection) => {
    const key = normalizeSearchTerm(selection.label);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Official commission/assessoria options, keeping already linked units selectable. */
export function buildCommissionOptions(
  units: ReturnType<typeof useOrgCommissions>['units'],
  linkedUnitIds: string[] = [],
): RelationalOption[] {
  return selectableOrgUnits(units, linkedUnitIds).map((unit) => ({
    id: unit.id,
    label: unit.name,
    // `hint` participates in the existing persistence fallback; preserve it byte-for-byte.
    hint: orgUnitHint(unit),
    description: orgUnitHint(unit),
    context: unit.isLegacy ? 'Registro histórico' : 'Área institucional oficial',
    searchText: unit.responsibles.map((person) => person.displayName).join(' '),
    group: orgUnitGroupLabel(unit.type),
  }));
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

  const responsibleOptions = useMemo<RelationalOption[]>(() => {
    const options: RelationalOption[] = [];
    const seenUserIds = new Set<string>();
    const seenExternalNames = new Set<string>();
    const typedMembers = (members ?? []) as CronogramaRelationMember[];
    const typedLoginMembers = (loginMembers ?? []) as CronogramaRelationMember[];
    const memberByUserId = resolveOfficialMembers([...typedLoginMembers, ...typedMembers]);
    const institutionalByName = new Map<string, {
      label: string;
      userId: string | null;
      firstUnitName: string;
      unitNames: Set<string>;
      roles: Set<string>;
    }>();

    units.forEach((unit) => {
      unit.responsibles.forEach((person) => {
        const label = (person.displayName ?? '').trim();
        if (!label) return;
        const key = normalizeSearchTerm(label);
        const existing = institutionalByName.get(key);
        if (existing) {
          existing.unitNames.add(unit.name);
          existing.roles.add(responsibleRoleLabel(person.relationshipRole));
          return;
        }
        institutionalByName.set(key, {
          label,
          userId: person.userId,
          firstUnitName: unit.name,
          unitNames: new Set([unit.name]),
          roles: new Set([responsibleRoleLabel(person.relationshipRole)]),
        });
      });
    });

    Array.from(resolveOfficialMembers(typedLoginMembers).values())
      .sort((a, b) => (a.nome_exibicao ?? '').localeCompare(b.nome_exibicao ?? '', 'pt-BR'))
      .forEach((member) => {
        const label = (member?.nome_exibicao ?? '').trim();
        if (!label || !member?.user_id) return;
        if (seenUserIds.has(member.user_id)) return;
        seenUserIds.add(member.user_id);
        const key = normalizeSearchTerm(label);
        const memberProfile = memberByUserId.get(member.user_id);
        const institutional = institutionalByName.get(key);
        const persistedRole = member.cargo || undefined;
        const displayRole = member.cargo || memberProfile?.cargo || member.role || undefined;
        const contexts = new Set<string>();
        if (memberProfile?.commission_nome) contexts.add(memberProfile.commission_nome);
        institutional?.unitNames.forEach((unitName) => contexts.add(unitName));
        options.push({
          id: member.user_id as string,
          label,
          hint: persistedRole,
          description: displayRole || 'Membro do sistema',
          context: contexts.size > 0 ? Array.from(contexts).join(' · ') : 'Membro do sistema',
          searchText: [member.role, memberProfile?.role, ...(institutional?.roles ?? [])].filter(Boolean).join(' '),
          group: 'Membros do sistema',
        });
      });

    institutionalByName.forEach((person, key) => {
      if (person.userId && seenUserIds.has(person.userId)) return;
      if (!person.userId && seenExternalNames.has(key)) return;
      if (person.userId) seenUserIds.add(person.userId);
      else seenExternalNames.add(key);
      const unitNames = Array.from(person.unitNames);
      const roles = Array.from(person.roles);
      options.push({
        id: person.userId ?? `custom:${person.label.toLocaleLowerCase('pt-BR')}`,
        label: person.label,
        hint: person.firstUnitName,
        description: roles.join(' · ') || 'Responsável institucional',
        context: unitNames.join(' · '),
        searchText: [...unitNames, ...roles].join(' '),
        group: 'Responsáveis institucionais',
      });
    });

    return options;
  }, [loginMembers, members, units]);

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
