import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { describeSalesError, EMPTY_SALE_FILTERS, fetchSaleOrdersPage } from './salesOrdersService';

export interface CommercialSalesSummaryTotals {
  total: number;
  pending: number;
  signed: number;
}

export interface CommercialSalesSummaryAccess {
  projectId: string;
  canManageSales: boolean;
  canManageContracts: boolean;
}

export interface CommercialSalesSummary {
  totals: CommercialSalesSummaryTotals | null;
  state: 'loading' | 'ready' | 'stale' | 'unavailable' | 'restricted';
  isFetching: boolean;
  errorText: string | null;
}

interface SummaryRead {
  totals: CommercialSalesSummaryTotals | null;
  restricted: boolean;
  errorText: string | null;
}

function isPermissionFailure(error: unknown): boolean {
  const failure = error as { code?: string; status?: number; message?: string } | null;
  return describeSalesError(error).includes('permissão')
    || ['42501', '401', '403', 'PGRST301'].includes(failure?.code ?? '')
    || failure?.status === 401 || failure?.status === 403
    || /permission denied|unauthorized|not authenticated/i.test(failure?.message ?? '');
}

async function readGlobalSummary(projectId: string): Promise<SummaryRead> {
  try {
    return { totals: await fetchGlobalSummary(projectId), restricted: false, errorText: null };
  } catch (error) {
    if (!isPermissionFailure(error)) throw error;
    // Replace the old successful generation in the cache itself. A denial
    // must survive overview remounts and subsequent connection failures.
    return { totals: null, restricted: true, errorText: 'Você não tem permissão para esta ação.' };
  }
}

/** The API counts records globally; PARTIAL already belongs to its PENDING filter. */
async function fetchGlobalSummary(projectId: string): Promise<CommercialSalesSummaryTotals> {
  const pages = await Promise.all([
    fetchSaleOrdersPage(projectId, { ...EMPTY_SALE_FILTERS }, 0),
    fetchSaleOrdersPage(projectId, { ...EMPTY_SALE_FILTERS, status: 'PENDING' }, 0),
    fetchSaleOrdersPage(projectId, { ...EMPTY_SALE_FILTERS, status: 'SIGNED' }, 0),
  ]);
  if (pages.some(({ total }) => !Number.isSafeInteger(total) || total < 0)) {
    throw new Error('Não foi possível validar os totais de vendas.');
  }
  return { total: pages[0].total, pending: pages[1].total, signed: pages[2].total };
}

/**
 * Shares the module's invalidation prefix without inheriting its list filters.
 * Refresh generations are atomic and never replace valid totals with zero.
 * Dashboard's existing synchronization cycle invalidates this prefix; no timer
 * or map reload is created here. Mount/focus also refresh attached documents.
 */
export function useCommercialSalesSummary({ projectId, canManageSales, canManageContracts }: CommercialSalesSummaryAccess): CommercialSalesSummary {
  const client = useQueryClient();
  const queryKey = ['commercial-sale-orders', projectId, 'dashboard-summary', canManageSales, canManageContracts] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => readGlobalSummary(projectId),
    enabled: Boolean(projectId) && canManageSales,
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    meta: { persist: false },
    retry: (count, error) => !isPermissionFailure(error) && count < 2,
  });
  const permissionDenied = query.data?.restricted ?? isPermissionFailure(query.error);
  const errorText = permissionDenied ? query.data?.errorText ?? 'Você não tem permissão para esta ação.'
    : query.error ? describeSalesError(query.error) : null;
  const totals = canManageSales && projectId && !permissionDenied ? query.data?.totals ?? null : null;

  const previousAccess = useRef(canManageSales);
  useEffect(() => {
    const previous = previousAccess.current;
    previousAccess.current = canManageSales;
    if (!canManageSales && projectId) {
      const projectSummaryKey = ['commercial-sale-orders', projectId, 'dashboard-summary'] as const;
      // An earlier authorized request must not overwrite the denial marker
      // after permissions have been lost. Clear all contract-access variants.
      void client.cancelQueries({ queryKey: projectSummaryKey }, { revert: false });
      client.setQueriesData<SummaryRead>({ queryKey: projectSummaryKey },
        { totals: null, restricted: true, errorText: 'Você não tem permissão para esta ação.' });
    }
    if (!previous && canManageSales && projectId) {
      void client.invalidateQueries({ queryKey: ['commercial-sale-orders', projectId, 'dashboard-summary'] });
    }
  }, [client, canManageSales, canManageContracts, projectId]);

  return {
    totals,
    isFetching: canManageSales && query.isFetching,
    state: !canManageSales || permissionDenied ? 'restricted'
      : totals ? errorText ? 'stale' : 'ready'
        : errorText || !projectId ? 'unavailable' : 'loading',
    errorText,
  };
}
