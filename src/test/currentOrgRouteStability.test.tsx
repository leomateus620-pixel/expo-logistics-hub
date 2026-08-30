import { useEffect } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useIsFetching } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  auth: {
    user: { id: 'map-user' } as { id: string } | null,
    loading: false,
    signOut: vi.fn(),
  },
  fetchMembership: vi.fn(),
  mounts: 0,
  unmounts: 0,
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => runtime.auth }));
vi.mock('@/pages/LoginPage', () => ({
  default: () => <div data-testid="login-required">Authentication required</div>,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_field: string, userId: string) => ({
          eq: () => runtime.fetchMembership(userId),
        }),
      }),
    }),
  },
}));

import AuthGuard from '@/components/AuthGuard';
import OrgGuard from '@/components/OrgGuard';
import CapabilityGuard from '@/components/CapabilityGuard';
import { CapabilitiesProvider } from '@/contexts/CapabilitiesProvider';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';

const membership = {
  id: 'membership-map-user',
  org_id: 'map-org',
  role: 'admin',
  organizations: { id: 'map-org', nome: 'Fenasoja' },
};
type MembershipResponse = { data: (typeof membership)[] | null; error: Error | null };
const clients = new Set<QueryClient>();

function deferredMembership() {
  let resolve!: (response: MembershipResponse) => void;
  const promise = new Promise<MembershipResponse>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function createClient(cached = true) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  if (cached) client.setQueryData(['my-org-membership', 'map-user'], membership);
  clients.add(client);
  return client;
}

function PersistentMap() {
  useEffect(() => {
    runtime.mounts += 1;
    return () => { runtime.unmounts += 1; };
  }, []);
  return <canvas data-testid="persistent-map" />;
}

function DetailsMembershipObserver() {
  useCurrentOrg();
  return <aside data-testid="details">Structure details</aside>;
}

function MembershipFetchStatus() {
  const fetching = useIsFetching({ queryKey: ['my-org-membership'] });
  return <output data-testid="membership-fetching">{fetching}</output>;
}

function ProtectedMap({ client, details = false }: { client: QueryClient; details?: boolean }) {
  return (
    <QueryClientProvider client={client}>
      <MembershipFetchStatus />
      <CapabilitiesProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthGuard>
            <OrgGuard>
              <CapabilityGuard capability="map.view">
                <PersistentMap />
                {details && <DetailsMembershipObserver />}
              </CapabilityGuard>
            </OrgGuard>
          </AuthGuard>
        </MemoryRouter>
      </CapabilitiesProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  runtime.auth.user = { id: 'map-user' };
  runtime.auth.loading = false;
  runtime.mounts = 0;
  runtime.unmounts = 0;
  runtime.fetchMembership.mockReset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.clear();
});

describe('protected map lifetime during real React Query membership revalidation', () => {
  it('retains the same child DOM while an already confirmed membership refreshes', async () => {
    const client = createClient();
    const pending = deferredMembership();
    runtime.fetchMembership.mockReturnValue(pending.promise);
    const view = render(<ProtectedMap client={client} />);
    const canvas = view.getByTestId('persistent-map');
    let refresh!: Promise<void>;

    act(() => { refresh = client.refetchQueries({ queryKey: ['my-org-membership'], type: 'active' }); });
    // Wait for the actual React observer notification, not only query state.
    await waitFor(() => expect(view.getByTestId('membership-fetching')).toHaveTextContent('1'));
    expect(client.getQueryState(['my-org-membership', 'map-user'])?.data).toBe(membership);
    expect(view.getByTestId('persistent-map')).toBe(canvas);
    expect(runtime.unmounts).toBe(0);

    await act(async () => {
      pending.resolve({ data: [membership], error: null });
      await refresh;
    });
    expect(view.getByTestId('persistent-map')).toBe(canvas);
    expect(runtime.mounts).toBe(1);
  });

  it('retains the map when a new details observer refetches the 60-second-stale membership', async () => {
    const client = createClient();
    const pending = deferredMembership();
    runtime.fetchMembership.mockReturnValue(pending.promise);
    const view = render(<ProtectedMap client={client} />);
    const canvas = view.getByTestId('persistent-map');
    act(() => {
      client.setQueryData(['my-org-membership', 'map-user'], membership, {
        updatedAt: Date.now() - 60_001,
      });
    });
    expect(runtime.fetchMembership).not.toHaveBeenCalled();

    view.rerender(<ProtectedMap client={client} details />);
    await waitFor(() => expect(runtime.fetchMembership).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.getByTestId('membership-fetching')).toHaveTextContent('1'));
    expect(client.isFetching()).toBe(1);
    expect(view.getByTestId('persistent-map')).toBe(canvas);
    expect(view.getByTestId('details')).toBeInTheDocument();
    expect(runtime.unmounts).toBe(0);

    await act(async () => { pending.resolve({ data: [membership], error: null }); });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(view.getByTestId('persistent-map')).toBe(canvas);
    expect(runtime.mounts).toBe(1);
  });

  it('does not reveal the map before the initial membership resolves', async () => {
    const client = createClient(false);
    const pending = deferredMembership();
    runtime.fetchMembership.mockReturnValue(pending.promise);
    const view = render(<ProtectedMap client={client} />);
    expect(view.queryByTestId('persistent-map')).toBeNull();

    await act(async () => { pending.resolve({ data: [membership], error: null }); });
    await waitFor(() => expect(view.getByTestId('persistent-map')).toBeInTheDocument());
    expect(runtime.mounts).toBe(1);
  });

  it('remains fail-closed while the authentication session is resolving', () => {
    const client = createClient();
    const view = render(<ProtectedMap client={client} />);
    runtime.auth.loading = true;
    view.rerender(<ProtectedMap client={client} />);
    expect(view.queryByTestId('persistent-map')).toBeNull();
    expect(runtime.unmounts).toBe(1);
  });

  it('never reuses another user\'s cached membership after an authentication change', async () => {
    const client = createClient();
    const view = render(<ProtectedMap client={client} />);
    const previousCanvas = view.getByTestId('persistent-map');
    const pending = deferredMembership();
    runtime.fetchMembership.mockReturnValue(pending.promise);
    runtime.auth.user = { id: 'different-user' };
    view.rerender(<ProtectedMap client={client} />);
    expect(view.queryByTestId('persistent-map')).toBeNull();
    await waitFor(() => expect(runtime.fetchMembership).toHaveBeenCalledWith('different-user'));

    await act(async () => {
      pending.resolve({ data: [{ ...membership, id: 'different-membership' }], error: null });
    });
    await waitFor(() => expect(view.getByTestId('persistent-map')).toBeInTheDocument());
    expect(view.getByTestId('persistent-map')).not.toBe(previousCanvas);
  });

  it('removes the protected map immediately when the user signs out', () => {
    const client = createClient();
    const view = render(<ProtectedMap client={client} />);
    runtime.auth.user = null;
    view.rerender(<ProtectedMap client={client} />);
    expect(view.queryByTestId('persistent-map')).toBeNull();
    expect(view.getByTestId('login-required')).toBeInTheDocument();
  });

  it('removes the map when revalidation confirms that membership was revoked', async () => {
    const client = createClient();
    runtime.fetchMembership.mockResolvedValue({ data: [], error: null });
    const view = render(<ProtectedMap client={client} />);

    await act(async () => { await client.refetchQueries({ queryKey: ['my-org-membership'] }); });
    await waitFor(() => expect(view.queryByTestId('persistent-map')).toBeNull());
    expect(view.getByText('Acesso ainda não liberado')).toBeInTheDocument();
    expect(client.getQueryData(['my-org-membership', 'map-user'])).toBeNull();
  });

  it('remains fail-closed after a failed revalidation even with previously cached membership', async () => {
    const client = createClient();
    runtime.fetchMembership.mockResolvedValue({ data: null, error: new Error('membership unavailable') });
    const view = render(<ProtectedMap client={client} />);

    await act(async () => { await client.refetchQueries({ queryKey: ['my-org-membership'] }); });
    await waitFor(() => expect(view.queryByTestId('persistent-map')).toBeNull());
    expect(client.getQueryState(['my-org-membership', 'map-user'])?.status).toBe('error');
    expect(client.getQueryData(['my-org-membership', 'map-user'])).toEqual(membership);
    expect(runtime.fetchMembership).toHaveBeenCalledTimes(3);
  }, 10_000);
});
