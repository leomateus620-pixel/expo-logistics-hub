import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { sortOrgUnits, type OrgUnit, type OrgUnitResponsible } from '@/lib/org-units';

export interface OrgCommission {
  id: string;
  nome: string;
  slug: string;
}

/**
 * Official organizational registry (Comissões e Assessorias) for the current org.
 * Shared source of truth for "Cronograma e Eventos" and "Eventos Restaurante e Arena".
 */
export function useOrgCommissions() {
  const { orgId } = useCurrentOrg();

  const query = useQuery({
    queryKey: ['org-commissions', orgId],
    enabled: Boolean(orgId),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OrgUnit[]> => {
      if (!orgId) return [];
      const { data, error } = await (supabase as any)
        .from('commissions')
        .select(
          'id, nome, slug, unit_type, display_order, is_official, is_legacy, commission_responsibles(id, display_name, responsible_type, relationship_role, is_primary, display_order, active, user_id)',
        )
        .eq('org_id', orgId)
        .eq('is_active', true)
        .limit(500);
      if (error) throw error;

      const units: OrgUnit[] = (data ?? []).map((row: any) => {
        const responsibles: OrgUnitResponsible[] = (row.commission_responsibles ?? [])
          .filter((item: any) => item.active !== false)
          .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
          .map((item: any) => ({
            id: item.id as string,
            displayName: item.display_name as string,
            responsibleType: (item.responsible_type ?? 'pessoa') as OrgUnitResponsible['responsibleType'],
            relationshipRole: (item.relationship_role ?? 'principal') as OrgUnitResponsible['relationshipRole'],
            isPrimary: Boolean(item.is_primary),
            userId: (item.user_id ?? null) as string | null,
          }));

        return {
          id: row.id as string,
          name: row.nome as string,
          slug: row.slug as string,
          type: (row.unit_type ?? 'comissao') as OrgUnit['type'],
          displayOrder: Number(row.display_order ?? 999),
          isOfficial: Boolean(row.is_official),
          isLegacy: Boolean(row.is_legacy),
          responsibles,
        };
      });

      return sortOrgUnits(units);
    },
  });

  const units = query.data ?? [];

  return {
    units,
    /** Backwards-compatible shape used by existing relational selects. */
    commissions: units.map((unit): OrgCommission => ({ id: unit.id, nome: unit.name, slug: unit.slug })),
    isLoading: query.isLoading,
    error: query.error,
  };
}
