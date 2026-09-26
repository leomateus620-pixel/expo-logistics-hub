import { useEffect, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PublicAreaMapPage from '@/features/commercial-map/public/PublicAreaMapPage';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import { useSalesStore } from '@/features/commercial-map/sales/useSalesSelection';
import { usePublicMapInventory } from '@/features/commercial-map/public/usePublicMapArea';
import { usePublicScopeRevision } from '@/features/commercial-map/public/usePublicScopeRevision';
import type { PublicMapInventory, PublicLot } from '@/features/commercial-map/public/publicMapTypes';
import type { MapEntity } from '@/features/commercial-map/types';

const mocks = vi.hoisted(() => ({ inventory: vi.fn(), context: vi.fn(), revision: vi.fn(), track: vi.fn(), mount: vi.fn(), props: vi.fn() }));
vi.mock('@/features/commercial-map/public/publicMapService', async (original) => ({
  ...await original<typeof import('@/features/commercial-map/public/publicMapService')>(),
  fetchPublicInventory: mocks.inventory, fetchPublicContext: mocks.context,
  fetchPublicScopeRevision: mocks.revision, trackPublicMapEvent: mocks.track,
}));
vi.mock('@/features/commercial-map/utils/preloadCanvas', () => ({
  preloadCommercialMapCanvas: async () => ({ default: function Canvas(props: unknown) {
    useEffect(() => { mocks.mount(); }, []); mocks.props(props); return <canvas data-testid="scene" />;
  } }),
}));
vi.mock('@/features/commercial-map/hooks/useWebGLAvailability', () => ({ useWebGLAvailability: () => ({ available: true }) }));
vi.mock('@/features/commercial-map/public/usePublicMapRenderState', () => ({ usePublicMapRenderState: () => 'ready' }));
vi.mock('@/features/commercial-map/public/usePublicAutoRefresh', () => ({ usePublicAutoRefresh: () => undefined }));

const entity = { id: 'e-1', publicIdentifier: 'R-01', name: 'Rural 1', classification: 'COMMERCIAL_LOT', metadata: {},
  geometry: { coordinates: [[[0,0],[4,0],[4,4],[0,4],[0,0]]], elevation: 0, extrusionHeight: .02 },
} as unknown as MapEntity;
const lot: PublicLot = {
  id:'l-1', entityId:'e-1', publicIdentifier:'R-01', displayName:'Rural 1', block:'R', lotNumber:'1', levelLabel:null,
  availability:'AVAILABLE', buyerName:null, officialAreaSqm:100, isCorner:false, isCovered:false, infrastructure:[],
  hasElectricity:false, hasWater:false, hasInternet:false,
  pricing:{ resolutionStatus:'OK', renovacaoPricePerSqm:100, renovacaoTotal:10000, renovacaoRuleLabel:'Exporural',
    segundaPricePerSqm:110, segundaTotal:11000, segundaRuleLabel:'Exporural' },
};
const inventory = {
  scope: { slug:'exporural', name:'Exporural', kind:'SEGMENT', lotCount:1, officialAreaSqm:100, pavilionIdentifier:null, segmentSlug:'exporural' },
  entities:[entity], lots:[lot], layers:[], revision:'r1', contextRevision:'c1',
} as PublicMapInventory;
const key = ['public-map','inventory','exporural','test-token'];
let client: QueryClient;
const initialState = useCommercialMapStore.getState();
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
function LinkChange() { const navigate = useNavigate(); return <button onClick={() => navigate('/areas/espaco-automovel/other-token')}>Outro link</button>; }
function page() { return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/areas/exporural/test-token']}>
  <LinkChange /><Routes><Route path="/areas/:slug/:token" element={<PublicAreaMapPage />} /></Routes>
</MemoryRouter></QueryClientProvider>); }
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  useCommercialMapStore.setState(initialState);
  client = new QueryClient({ defaultOptions:{ queries:{ retry:false, gcTime:0 } } });
  mocks.inventory.mockResolvedValue(inventory); mocks.context.mockResolvedValue({ entities:[entity], layers:[], projectId:'p' });
  mocks.revision.mockResolvedValue({ slug:'exporural', revision:'r1', contextRevision:'c1', lotCount:1 });
  mocks.track.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); client.clear(); useCommercialMapStore.setState(initialState); });

describe('public page lifecycle', () => {
  it('keeps the same Canvas, policy, camera state and selected lot on commercial revision', async () => {
    page(); await screen.findByTestId('scene');
    act(() => useCommercialMapStore.getState().setSelectedEntityId('e-1'));
    await screen.findByRole('complementary', { name:'Lote 1 · Quadra R · Exporural' });
    const canvas = screen.getByTestId('scene');
    const policy = mocks.props.mock.calls.at(-1)?.[0].publicScenePolicy;
    const selectionEvents = () => mocks.track.mock.calls.filter(call => call[2].eventType === 'lot_selected').length;
    expect(selectionEvents()).toBe(1);
    await act(async () => client.setQueryData(key, { ...inventory, lots:[{ ...lot, availability:'SOLD', buyerName:'Leonardo', pricing:{ ...lot.pricing, renovacaoTotal:12000 } }] }));
    await waitFor(() => expect(screen.getByRole('complementary')).toHaveTextContent('Comercializado'));
    expect(screen.getByRole('complementary')).toHaveTextContent('Comprador');
    expect(screen.getByRole('complementary')).toHaveTextContent('Leonardo');
    expect(screen.getByTestId('scene')).toBe(canvas);
    expect(mocks.mount).toHaveBeenCalledTimes(1);
    expect(mocks.props.mock.calls.at(-1)?.[0].publicScenePolicy).toBe(policy);
    expect(screen.getByRole('complementary')).toHaveTextContent('Comercializado');
    expect(selectionEvents()).toBe(1);
    expect(useCommercialMapStore.getState().selectedEntityId).toBe('e-1');
    fireEvent.click(screen.getByRole('button', { name:'Lista' }));
    fireEvent.click(screen.getByRole('button', { name:'Mapa' }));
    expect(screen.getByTestId('scene')).toBe(canvas);
    expect(mocks.mount).toHaveBeenCalledTimes(1);
  });
  it('closes a removed lot with an explanation without rebuilding the Canvas', async () => {
    page(); await screen.findByTestId('scene');
    act(() => useCommercialMapStore.getState().setSelectedEntityId('e-1'));
    await screen.findByRole('complementary');
    await act(async () => client.setQueryData(key, { ...inventory, lots:[] }));
    await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull());
    expect(screen.getByText('Este lote não está mais disponível para consulta nesta área.')).toBeInTheDocument();
    expect(mocks.mount).toHaveBeenCalledTimes(1);
  });
  it('cannot show the previous link inventory while another authorized request is pending', async () => {
    page(); await screen.findByTestId('scene');
    mocks.inventory.mockImplementation(() => new Promise(() => undefined));
    mocks.context.mockImplementation(() => new Promise(() => undefined));
    fireEvent.click(screen.getByRole('button', { name:'Outro link' }));
    expect(screen.queryByTestId('scene')).toBeNull();
    expect(screen.getByRole('heading', { name:'Espaço do Automóvel' })).toBeInTheDocument();
    expect(screen.queryByText('Rural 1')).toBeNull();
  });
  it('does not inherit Sales or an administrative interior and restores its owner on unmount', async () => {
    useCommercialMapStore.setState({ interiorEntityId:'admin-pavilion', selectedEntityId:'other', salesPresentationActive:true });
    useSalesStore.setState({ salesModeActive:true });
    const rendered = page(); await screen.findByTestId('scene');
    expect(useCommercialMapStore.getState().interiorEntityId).toBeNull();
    expect(useSalesStore.getState().salesModeActive).toBe(false);
    rendered.unmount();
    expect(useCommercialMapStore.getState().interiorEntityId).toBe('admin-pavilion');
    expect(useSalesStore.getState().salesModeActive).toBe(true);
    useSalesStore.setState({ salesModeActive:false });
  });
  it('does not keep another area as placeholder data in the query hook', async () => {
    const hook = renderHook(({slug}) => usePublicMapInventory(slug, 'token'), { wrapper, initialProps:{slug:'exporural'} });
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    mocks.inventory.mockImplementation(() => new Promise(() => undefined));
    hook.rerender({slug:'espaco-automovel'});
    expect(hook.result.current.data).toBeUndefined();
  });
});

describe('independent public revisions', () => {
  it('updates commercial inventory without reloading context, then updates context on its own revision', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    renderHook(() => usePublicScopeRevision('exporural','token','r1','c1'), {wrapper});
    expect(mocks.revision).not.toHaveBeenCalled();
    await act(async () => client.setQueryData(['public-map','revision','exporural','token'], { revision:'r2', contextRevision:'c1' }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    const predicate = invalidate.mock.calls[0][0]?.predicate;
    expect(predicate?.({queryKey:['public-map','inventory','exporural','token']} as never)).toBe(true);
    expect(predicate?.({queryKey:['public-map','inventory','espaco-automovel','token']} as never)).toBe(false);
    invalidate.mockClear();
    await act(async () => client.setQueryData(['public-map','revision','exporural','token'], { revision:'r2', contextRevision:'c2' }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({queryKey:['public-map','context','exporural','token']}));
  });
});
