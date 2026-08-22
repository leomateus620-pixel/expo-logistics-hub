import { type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useOrgCommissions } from '@/hooks/useOrgCommissions';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { useOrganizationalEcosystemData } from './useOrganizationalEcosystemData';

vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: vi.fn() }));
vi.mock('@/hooks/useOrgCommissions', () => ({ useOrgCommissions: vi.fn() }));
vi.mock('@/hooks/useOrgMembers', () => ({ useOrgMembers: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseCurrentOrg = vi.mocked(useCurrentOrg);
const mockedUseOrgCommissions = vi.mocked(useOrgCommissions);
const mockedUseOrgMembers = vi.mocked(useOrgMembers);

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('useOrganizationalEcosystemData', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'authenticated-user' },
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);
    mockedUseCurrentOrg.mockReturnValue({
      orgId: 'org-2028',
      isLoading: false,
      isError: false,
      hasOrg: true,
    } as unknown as ReturnType<typeof useCurrentOrg>);
    mockedUseOrgMembers.mockReturnValue({
      members: [],
      isLoading: false,
      error: null,
      commissionNamesError: null,
    } as unknown as ReturnType<typeof useOrgMembers>);
    mockedUseOrgCommissions.mockReturnValue({
      units: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useOrgCommissions>);
  });

  it('reports an explicit access error instead of presenting an anonymous empty graph', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);
    mockedUseCurrentOrg.mockReturnValue({
      orgId: null,
      isLoading: false,
      isError: false,
      hasOrg: false,
    } as unknown as ReturnType<typeof useCurrentOrg>);

    const { result } = renderHook(() => useOrganizationalEcosystemData(), {
      wrapper: wrapperFor(createQueryClient()),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error?.message).toMatch(/Entre no Portal/i);
  });

  it('keeps the cinematic hold while authentication or organization is resolving', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      loading: true,
    } as unknown as ReturnType<typeof useAuth>);
    mockedUseCurrentOrg.mockReturnValue({
      orgId: null,
      isLoading: true,
      isError: false,
      hasOrg: false,
    } as unknown as ReturnType<typeof useCurrentOrg>);

    const { result } = renderHook(() => useOrganizationalEcosystemData(), {
      wrapper: wrapperFor(createQueryClient()),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('surfaces membership failures without leaving the experience loading forever', () => {
    mockedUseCurrentOrg.mockReturnValue({
      orgId: null,
      isLoading: true,
      isError: true,
      hasOrg: false,
    } as unknown as ReturnType<typeof useCurrentOrg>);

    const { result } = renderHook(() => useOrganizationalEcosystemData(), {
      wrapper: wrapperFor(createQueryClient()),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error?.message).toMatch(/validar a organização ativa/i);
  });

  it('retries membership, members, enrichment and organizational units together', async () => {
    const queryClient = createQueryClient();
    const refetch = vi.spyOn(queryClient, 'refetchQueries');
    const { result } = renderHook(() => useOrganizationalEcosystemData(), {
      wrapper: wrapperFor(queryClient),
    });

    await act(async () => result.current.refetch());

    expect(refetch.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      ['my-org-membership'],
      ['org-members'],
      ['org-member-commission-names'],
      ['org-commissions'],
    ]);
  });
});
