import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useOrgCommissions } from '@/hooks/useOrgCommissions';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { buildOrganizationalGraph } from './resolver';
import type {
  OrganizationalEcosystemDataResult,
  OrganizationalMemberRecord,
  OrganizationalUnitRecord,
} from './types';

function asError(value: unknown): Error | null {
  if (!value) return null;
  if (value instanceof Error) return value;
  return new Error(typeof value === 'string' ? value : 'Falha ao carregar o ecossistema organizacional.');
}

/**
 * Reuses the Agenda member registry and the official commission/advisory
 * registry. Data is normalized while the cinematic intro is still playing.
 */
export function useOrganizationalEcosystemData(): OrganizationalEcosystemDataResult {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const currentOrg = useCurrentOrg();
  const membersQuery = useOrgMembers();
  const unitsQuery = useOrgCommissions();

  const graph = useMemo(
    () =>
      buildOrganizationalGraph({
        members: membersQuery.members as OrganizationalMemberRecord[],
        units: unitsQuery.units as OrganizationalUnitRecord[],
      }),
    [membersQuery.members, unitsQuery.units],
  );
  const refetch = useCallback(async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['my-org-membership'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['org-members'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['org-member-commission-names'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['org-commissions'], type: 'active' }),
    ]);
  }, [queryClient]);

  const organizationLoading = auth.loading
    || (currentOrg.isLoading && !currentOrg.isError);
  const accessError = !auth.loading && !auth.user
    ? new Error('Entre no Portal para carregar a organização FENASOJA 2028.')
    : currentOrg.isError
      ? new Error('Não foi possível validar a organização ativa. Tente novamente.')
      : auth.user && !organizationLoading && !currentOrg.hasOrg
        ? new Error('Nenhuma organização ativa foi localizada para esta sessão.')
        : null;

  return {
    graph,
    isLoading: organizationLoading || membersQuery.isLoading || unitsQuery.isLoading,
    error: accessError ?? asError(membersQuery.error) ?? asError(unitsQuery.error),
    refetch,
  };
}
