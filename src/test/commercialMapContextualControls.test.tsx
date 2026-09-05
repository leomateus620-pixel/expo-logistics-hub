import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialMapDock } from '@/features/commercial-map/components/dock/CommercialMapDock';
import { CommercialMapShell } from '@/features/commercial-map/components/shell/CommercialMapShell';
import { CommercialMapHeaderTools } from '@/features/commercial-map/components/shell/CommercialMapHeaderTools';
import { OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS } from '@/features/commercial-map/data/officialReference2026';
import { COMMERCIAL_MAP_SEGMENT_IDS } from '@/features/commercial-map/data/commercialMapSegments';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

const pavilion = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'B1')!;
let mobile = false;

function DockHarness() {
  const activeSegmentId = useCommercialMapStore((state) => state.activeSegmentId);
  const interiorEntityId = useCommercialMapStore((state) => state.interiorEntityId);
  return <section className="commercial-map-shell">
    <CommercialMapDock entities={OFFICIAL_REFERENCE_ENTITIES} lots={OFFICIAL_REFERENCE_LOTS}
      activeSegmentId={activeSegmentId} isCommissionScope={false}
      interiorEntity={interiorEntityId ? pavilion : null}
      onSegmentSelect={useCommercialMapStore.getState().requestSegmentFocus}
      onSegmentClear={useCommercialMapStore.getState().clearSegmentFocus}
      moduleCard={<div role="region" aria-label="Resumo do módulo selecionado">Módulo 01</div>} />
  </section>;
}

beforeEach(() => {
  mobile = false;
  useCommercialMapStore.setState({ ...useCommercialMapStore.getInitialState(), dockExpanded: true }, true);
  vi.stubGlobal('matchMedia', vi.fn((media: string) => ({
    media, matches: mobile, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('integração dos controles contextuais', () => {
  it('mostra nomes completos ao abrir, filtra pela legenda e limpa somente o segmento', () => {
    render(<DockHarness />);
    const segments = screen.getByRole('group', { name: 'Filtrar mapa por segmento' });
    const industry = within(segments).getByRole('button', { name: /^Indústria, Comércio e Serviços/ });
    expect(within(segments).getByRole('button', { name: /^Espaço do Automóvel/ })).toBeInTheDocument();
    expect(within(segments).getByRole('button', { name: /^Exporural/ })).toBeInTheDocument();
    expect(screen.queryByText('Área do mapa')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gestão' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lista e tabela' })).not.toBeInTheDocument();

    fireEvent.click(industry);
    expect(industry).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /^Disponível:/ }));
    const clear = screen.getByRole('button', { name: 'Limpar segmento' });
    expect(clear).toBeEnabled();
    fireEvent.click(clear);
    expect(useCommercialMapStore.getState().activeSegmentId).toBeNull();
    expect(useCommercialMapStore.getState().statusFilters).toEqual(['AVAILABLE']);
    expect(industry).toHaveAttribute('aria-pressed', 'false');
    expect(clear).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Disponível:/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('abre segmentos com um único comando no mobile, sem acordeão intermediário', () => {
    mobile = true;
    render(<DockHarness />);
    expect(screen.queryByRole('group', { name: 'Filtrar mapa por segmento' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expandir painel do mapa' }));
    const segments = screen.getByRole('group', { name: 'Filtrar mapa por segmento' });
    expect(within(segments).getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Limpar segmento' })).toBeVisible();
  });

  it('oculta o dock enquanto filtros estão abertos no mobile e restaura-o ao fechar', () => {
    mobile = true;
    render(<DockHarness />);
    const dock = screen.getByRole('complementary');
    act(() => useCommercialMapStore.getState().setActivePanel('results'));
    expect(dock).not.toBeVisible();
    expect(useCommercialMapStore.getState().selectedEntityId).toBeNull();
    act(() => useCommercialMapStore.getState().setActivePanel(null));
    expect(dock).toBeVisible();
  });

  it('recolhe o painel ao abrir a lista no mobile e preserva o contexto ao retornar ao mapa', () => {
    mobile = true;
    useCommercialMapStore.getState().requestSegmentFocus(COMMERCIAL_MAP_SEGMENT_IDS.industry);
    useCommercialMapStore.getState().toggleStatus('BLOCKED');
    useCommercialMapStore.getState().enterInterior(pavilion.id);
    useCommercialMapStore.getState().setSelectedModuleId('B1:module:001');
    render(<><DockHarness /><CommercialMapHeaderTools /></>);
    const dock = screen.getByRole('complementary');
    fireEvent.click(screen.getByRole('button', { name: 'Expandir painel do mapa' }));
    expect(dock).toHaveAttribute('data-sheet-state', 'expanded');

    fireEvent.click(screen.getByRole('button', { name: 'Lista e tabela' }));
    expect(dock).toHaveAttribute('data-sheet-state', 'collapsed');
    expect(useCommercialMapStore.getState()).toMatchObject({
      workspaceMode: 'list', interiorEntityId: pavilion.id, selectedModuleId: 'B1:module:001',
      activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.industry, statusFilters: ['BLOCKED'],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Lista e tabela' }));
    expect(dock).toHaveAttribute('data-sheet-state', 'collapsed');
    expect(screen.getByRole('button', { name: 'Voltar ao mapa' })).toBeVisible();
    expect(useCommercialMapStore.getState()).toMatchObject({
      workspaceMode: '3d', interiorEntityId: pavilion.id, selectedModuleId: 'B1:module:001',
      activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.industry, statusFilters: ['BLOCKED'],
    });
  });

  it('prioriza interior e módulo, mantém voltar recolhido e restaura filtros anteriores', () => {
    mobile = true;
    useCommercialMapStore.getState().requestSegmentFocus(COMMERCIAL_MAP_SEGMENT_IDS.industry);
    useCommercialMapStore.getState().toggleStatus('BLOCKED');
    useCommercialMapStore.getState().enterInterior(pavilion.id);
    render(<DockHarness />);
    expect(screen.queryByRole('group', { name: 'Filtrar mapa por segmento' })).not.toBeInTheDocument();
    const legend = screen.getByRole('region', { name: /Legenda de Pavilhão 1/ });
    expect(legend).toHaveAttribute('data-context-kind', 'interior');
    expect(legend).toHaveTextContent('189');
    expect(legend).not.toHaveTextContent('1.577');

    act(() => useCommercialMapStore.getState().setSelectedModuleId('B1:module:001'));
    expect(screen.queryByRole('region', { name: /Legenda de/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Resumo do módulo selecionado' })).toBeInTheDocument();
    const module = screen.getByRole('region', { name: 'Resumo do módulo selecionado' });
    act(() => module.dispatchEvent(new Event('commercial-map-expand-context', { bubbles: true })));
    expect(screen.getByRole('complementary')).toHaveAttribute('data-sheet-state', 'expanded');
    fireEvent.click(screen.getByRole('button', { name: 'Recolher painel do mapa' }));
    const back = screen.getByRole('button', { name: 'Voltar ao mapa' });
    expect(back).toBeVisible();
    expect(back).toHaveAttribute('aria-keyshortcuts', 'Escape');
    fireEvent.click(back);
    expect(useCommercialMapStore.getState().interiorEntityId).toBeNull();
    expect(useCommercialMapStore.getState().selectedModuleId).toBeNull();
    expect(useCommercialMapStore.getState().activeSegmentId).toBe(COMMERCIAL_MAP_SEGMENT_IDS.industry);
    expect(useCommercialMapStore.getState().statusFilters).toEqual(['BLOCKED']);
  });

  it('mantém legenda interior acessível durante a seleção, expandindo somente por ação voluntária', async () => {
    mobile = true;
    useCommercialMapStore.getState().requestSegmentFocus(COMMERCIAL_MAP_SEGMENT_IDS.industry);
    useCommercialMapStore.getState().enterInterior(pavilion.id);
    useCommercialMapStore.getState().setSelectedModuleId('B1:module:001');
    useCommercialMapStore.getState().toggleStatus('BLOCKED');
    render(<DockHarness />);
    expect(screen.getByRole('complementary')).toHaveAttribute('data-sheet-state', 'summary');
    expect(screen.getByText('Filtro: Bloqueado')).toBeVisible();
    expect(screen.queryByRole('region', { name: /Legenda de/ })).not.toBeInTheDocument();
    const trigger = screen.getByText('Legenda do pavilhão');
    expect(trigger).toBeVisible();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('complementary')).toHaveAttribute('data-sheet-state', 'expanded'));
    const legend = screen.getByRole('region', { name: /Legenda de Pavilhão 1/ });
    expect(legend).toHaveAttribute('data-context-kind', 'interior');
    expect(legend).toHaveTextContent('189');
    expect(legend).not.toHaveTextContent('1.577');
    expect(within(legend).queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Resumo do módulo selecionado' })).toBeVisible();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.queryByRole('region', { name: /Legenda de/ })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtro de situação comercial' }));
    expect(useCommercialMapStore.getState()).toMatchObject({
      selectedModuleId: 'B1:module:001', interiorEntityId: pavilion.id,
      activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.industry, statusFilters: [],
    });
    expect(screen.queryByText('Filtro: Bloqueado')).not.toBeInTheDocument();
  });

  it('publica ferramentas no cabeçalho antes da edição e preserva interior ao alternar lista/mapa', () => {
    const manage = vi.fn();
    useCommercialMapStore.getState().requestSegmentFocus(COMMERCIAL_MAP_SEGMENT_IDS.industry);
    useCommercialMapStore.getState().enterInterior(pavilion.id);
    render(<MemoryRouter><CommercialMapShell>
      <CommercialMapHeaderTools managementActions={<button type="button" onClick={manage}>Calibrar mapa</button>} />
    </CommercialMapShell></MemoryRouter>);
    const header = screen.getByRole('banner');
    const management = within(header).getByRole('button', { name: 'Gestão' });
    const list = within(header).getByRole('button', { name: 'Lista e tabela' });
    const edition = within(header).getByText('FENASOJA 2028');
    expect(management.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list.compareDocumentPosition(edition) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('main').querySelector('.commercial-map-header-tools')).toBeNull();

    fireEvent.click(management);
    fireEvent.click(screen.getByRole('button', { name: 'Calibrar mapa' }));
    expect(manage).toHaveBeenCalledOnce();
    fireEvent.click(management);
    fireEvent.click(list);
    expect(list).toHaveAttribute('aria-pressed', 'true');
    expect(useCommercialMapStore.getState().interiorEntityId).toBe(pavilion.id);
    fireEvent.click(list);
    expect(list).toHaveAttribute('aria-pressed', 'false');
    expect(useCommercialMapStore.getState().workspaceMode).toBe('3d');
    expect(useCommercialMapStore.getState().activeSegmentId).toBe(COMMERCIAL_MAP_SEGMENT_IDS.industry);
    expect(useCommercialMapStore.getState().interiorEntityId).toBe(pavilion.id);
  });

  it('oculta gestão quando o workspace não fornece ações autorizadas', () => {
    render(<CommercialMapHeaderTools />);
    expect(screen.queryByRole('button', { name: 'Gestão' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lista e tabela' })).toBeEnabled();
  });
});
