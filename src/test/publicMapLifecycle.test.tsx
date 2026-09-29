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
import { PUBLIC_MAP_AREAS } from '@/features/commercial-map/public/publicAreaRegistry';

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
function page(slug = 'exporural') { return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/areas/${slug}/test-token`]}>
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
    await waitFor(() => expect(screen.getByRole('complementary')).toHaveTextContent('Vendido'));
    expect(screen.getByRole('complementary')).toHaveTextContent('Comprador');
    expect(screen.getByRole('complementary')).toHaveTextContent('Leonardo');
    expect(screen.getByTestId('scene')).toBe(canvas);
    expect(mocks.mount).toHaveBeenCalledTimes(1);
    expect(mocks.props.mock.calls.at(-1)?.[0].publicScenePolicy).toBe(policy);
    expect(screen.getByRole('complementary')).toHaveTextContent('Vendido');
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

describe('direct pavilion inspection without leaving the interior', () => {
  it.each(PUBLIC_MAP_AREAS.filter(area => area.kind === 'PAVILION'))('$slug: X, another module, Escape, revision and tab return preserve the parent and camera command', async area => {
    const parent = { ...entity, id:'pavilion', publicIdentifier:area.pavilionIdentifier!, classification:'PAVILION', name:area.name } as MapEntity;
    const entities = [1,2].map(n => ({ ...entity, id:`e-${n}`, parentEntityId:parent.id, publicIdentifier:`${area.pavilionIdentifier}-M00${n}`, classification:'INTERNAL_STAND',
      metadata:{ pavilionPublicIdentifier:area.pavilionIdentifier, pavilionModuleKey:`${area.pavilionIdentifier}:module:00${n}` } } as MapEntity));
    const lots=[1,2].map(n=>({...lot,id:`l-${n}`,entityId:`e-${n}`,lotNumber:String(n),block:null}));
    const data={...inventory,scope:{...inventory.scope,slug:area.slug,name:area.name,kind:'PAVILION' as const,pavilionIdentifier:area.pavilionIdentifier!,lotCount:2},entities:[parent,...entities],lots};
    mocks.inventory.mockResolvedValue(data);
    page(area.slug);await screen.findByTestId('scene');
    expect(mocks.context).not.toHaveBeenCalled();
    expect(useCommercialMapStore.getState().interiorEntityId).toBe(parent.id);
    act(()=>useCommercialMapStore.getState().requestInteriorView(parent.id,'horizontal'));
    const before=useCommercialMapStore.getState();
    const canvas=screen.getByTestId('scene');
    for(const n of [1,2]) {
      if(n===1) {
        fireEvent.click(screen.getByRole('button',{name:'Lista'}));
        fireEvent.click(screen.getAllByRole('button').find(button=>button.textContent?.startsWith('Lote 1'))!);
        fireEvent.click(screen.getByRole('button',{name:'Mapa'}));
      } else act(()=>useCommercialMapStore.getState().setSelectedModuleId(`${area.pavilionIdentifier}:module:002`));
      await screen.findByRole('complementary');
      if(n===1) fireEvent.click(screen.getByRole('button',{name:'Fechar ficha do lote'}));
      else fireEvent.keyDown(window,{key:'Escape'});
      expect(screen.queryByRole('complementary')).toBeNull();
      expect(useCommercialMapStore.getState()).toMatchObject({interiorEntityId:parent.id,selectedEntityId:parent.id,selectedModuleId:null,
        interiorViewOrientation:'horizontal',cameraSequence:before.cameraSequence,interiorViewCommand:before.interiorViewCommand,interiorReturnView:before.interiorReturnView});
    }
    await act(async()=>client.setQueryData(['public-map','inventory',area.slug,'test-token'],{...data,revision:'r2',lots:lots.map(l=>({...l,pricing:{...l.pricing,renovacaoTotal:12000}}))}));
    fireEvent(document,new Event('visibilitychange'));fireEvent(window,new Event('focus'));
    expect(useCommercialMapStore.getState().interiorEntityId).toBe(parent.id);
    expect(useCommercialMapStore.getState().cameraSequence).toBe(before.cameraSequence);
    expect(screen.getByTestId('scene')).toBe(canvas);expect(mocks.mount).toHaveBeenCalledTimes(1);
    // The administrative setter retains its explicit deselection/exit semantics.
    act(()=>useCommercialMapStore.getState().setSelectedEntityId(null));
    expect(useCommercialMapStore.getState().interiorEntityId).toBeNull();
  });
});
