import { useMemo } from 'react';
import { useOrgCommissions } from '@/hooks/useOrgCommissions';
import { useAuth } from '@/hooks/useAuth';
import { normalizeUnitKey, resolveOfficialUnit } from '@/modules/commissions/officialCommissionCatalog';
import type { CommissionPerson } from '@/components/commissions/CommissionPeopleStack';
import { responsibleRoleLabel } from '@/lib/org-units';

export interface CommissionUnitPeople {
  responsible?: CommissionPerson;
  members: CommissionPerson[];
}

/**
 * Pessoas oficiais de cada frente, lidas do registro do Agenda Fenasoja
 * (comissões + responsáveis) e indexadas pelo slug canônico da frente.
 */
export function useCommissionPeople() {
  const { units, isLoading } = useOrgCommissions();

  const byUnit = useMemo(() => {
    const map = new Map<string, CommissionUnitPeople>();
    for (const unit of units) {
      const official = resolveOfficialUnit(unit.slug) ?? resolveOfficialUnit(unit.name);
      const key = official?.entry.id ?? unit.slug;
      const people: CommissionPerson[] = unit.responsibles.map((item) => ({
        id: item.id,
        name: item.displayName,
        userId: item.userId,
        role: responsibleRoleLabel(item.relationshipRole),
      }));
      const responsible = people.find((_, index) => unit.responsibles[index].isPrimary) ?? people[0];
      map.set(key, {
        responsible,
        members: people.filter((person) => person.id !== responsible?.id),
      });
    }
    return map;
  }, [units]);

  /** Slugs canônicos das frentes em que o usuário atual está vinculado. */
  const { user } = useAuth();
  const memberUnitSlugs = useMemo(() => {
    const slugs = new Set<string>();
    if (!user) return slugs;
    for (const unit of units) {
      if (!unit.responsibles.some((item) => item.userId && item.userId === user.id)) continue;
      const official = resolveOfficialUnit(unit.slug) ?? resolveOfficialUnit(unit.name);
      slugs.add(official?.entry.id ?? unit.slug);
      if (official?.entry.moduleSlug) slugs.add(official.entry.moduleSlug);
      slugs.add(normalizeUnitKey(unit.slug));
    }
    return slugs;
  }, [units, user]);

  return { byUnit, memberUnitSlugs, isLoading };
}
