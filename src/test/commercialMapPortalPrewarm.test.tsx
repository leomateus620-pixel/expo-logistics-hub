import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { PropsWithChildren } from 'react';
import { MapPinned } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), tasks: vi.fn(), environment: vi.fn() }));
vi.mock('@/features/commercial-map/utils/commercialMapPrewarm', () => ({ createCommercialMapPrewarm: mocks.create, commercialMapPrewarmTasks: mocks.tasks, browserPrewarmEnvironment: mocks.environment }));
import { useCommercialMapPrewarm, type CommercialMapPrewarmAccess } from '@/features/commercial-map/hooks/useCommercialMapPrewarm';
import { PortalPrimaryEntry } from '@/components/portal/PortalPrimaryEntry';
import type { PortalAccessPresentation } from '@/components/portal/portalTypes';

let client: QueryClient;
const sessions: { schedule: ReturnType<typeof vi.fn>; promote: ReturnType<typeof vi.fn>; handoff: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; snapshot: () => { handedOff: boolean } }[] = [];
beforeEach(() => {
  client = new QueryClient(); sessions.length = 0; mocks.create.mockClear(); mocks.tasks.mockClear();
  mocks.environment.mockImplementation(() => ({ visible: () => true, constrained: () => false, schedule: vi.fn(), subscribeVisible: vi.fn() }));
  mocks.create.mockImplementation(() => { let handedOff = false; const session = { schedule: vi.fn(), promote: vi.fn(), handoff: vi.fn(() => { handedOff = true; }), dispose: vi.fn(), snapshot: () => ({ handedOff }) }; sessions.push(session); return session; });
});
afterEach(() => client.clear());
const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const access = { userId: 'u', orgId: 'o', authorized: true };

describe('portal map authorization and lifecycle', () => {
  it('waits for authenticated identity, organization and capability, without a parallel cache', () => {
    const hook = renderHook((props: CommercialMapPrewarmAccess) => useCommercialMapPrewarm(props), { wrapper, initialProps: { ...access, authorized: false } });
    expect(mocks.create).not.toHaveBeenCalled();
    hook.rerender({ ...access, userId: null }); expect(mocks.create).not.toHaveBeenCalled();
    hook.rerender({ ...access, orgId: null }); expect(mocks.create).not.toHaveBeenCalled();
    hook.rerender(access); expect(mocks.tasks).toHaveBeenCalledWith(client, 'u', 'o');
    expect(sessions).toHaveLength(1); hook.unmount();
  });

  it('revokes only the old full identity and creates a new organization owner', () => {
    client.setQueryData(['commercial-map', 'full', 'u', 'o'], { private: true });
    client.setQueryData(['commercial-map', 'commission', 'u', 'o', 'c', 's'], { scoped: true });
    client.setQueryData(['commercial-map', 'full', 'other-user', 'o'], { other: true });
    const hook = renderHook((props: CommercialMapPrewarmAccess) => useCommercialMapPrewarm(props), { wrapper, initialProps: access });
    const previousAllowed = mocks.create.mock.calls[0][0].authorized;
    hook.rerender({ ...access, orgId: 'o2' });
    expect(previousAllowed()).toBe(false);
    expect(sessions[0].dispose).toHaveBeenCalledWith({ abortRunning: true });
    expect(client.getQueryData(['commercial-map', 'full', 'u', 'o'])).toBeUndefined();
    expect(client.getQueryData(['commercial-map', 'commission', 'u', 'o', 'c', 's'])).toEqual({ scoped: true });
    expect(client.getQueryData(['commercial-map', 'full', 'other-user', 'o'])).toEqual({ other: true });
    expect(mocks.tasks).toHaveBeenLastCalledWith(client, 'u', 'o2'); hook.unmount();
  });

  it('keeps shared running work on navigation and pauses admission during the existing ecosystem', () => {
    const hook = renderHook((props: CommercialMapPrewarmAccess) => useCommercialMapPrewarm(props), { wrapper, initialProps: { ...access, paused: true } });
    const environment = mocks.create.mock.calls[0][0].environment;
    expect(environment.visible()).toBe(false);
    hook.rerender({ ...access, paused: false }); expect(environment.visible()).toBe(true);
    act(() => { hook.result.current.onIntent(); hook.result.current.onNavigate(); });
    expect(sessions[0].promote).toHaveBeenCalledTimes(1);
    hook.unmount(); expect(sessions[0].dispose).toHaveBeenCalledWith({ abortRunning: false });
  });
});

describe('map entry intent', () => {
  const entry = { id: 'mapa-comercial' as const, kind: 'direct' as const, title: 'Mapa Comercial', description: 'Espaços do parque', icon: MapPinned };
  it.each(['allowed', 'login', 'setup'] as const)('focus, pointer and touch only prewarm authorized destination: %s', state => {
    const intent = vi.fn(), select = vi.fn();
    const accessPresentation: PortalAccessPresentation = { state, label: state, target: state === 'allowed' ? '/mapa-comercial' : '/login' };
    render(<MemoryRouter><PortalPrimaryEntry entry={entry} index={0} access={accessPresentation} onIntent={intent} onSelect={select} /></MemoryRouter>);
    const link = screen.getByRole('link');
    fireEvent.focus(link); fireEvent.pointerEnter(link); fireEvent.touchStart(link);
    expect(intent).toHaveBeenCalledTimes(state === 'allowed' ? 3 : 0);
    fireEvent.click(link); expect(select).toHaveBeenCalledTimes(1);
  });
});
