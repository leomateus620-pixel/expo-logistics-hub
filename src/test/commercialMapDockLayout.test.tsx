import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialMapDock } from '@/features/commercial-map/components/dock/CommercialMapDock';
import { OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS } from '@/features/commercial-map/data/officialReference2026';
import { COMMERCIAL_MAP_SEGMENT_IDS } from '@/features/commercial-map/data/commercialMapSegments';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';

const pavilion = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'B1')!;
let shellWidth = 1200;
const observers: { callback: ResizeObserverCallback; targets: Set<Element> }[] = [];

function DockHarness() {
  const activeSegmentId = useCommercialMapStore((state) => state.activeSegmentId);
  const interiorEntityId = useCommercialMapStore((state) => state.interiorEntityId);
  return <section className="commercial-map-shell">
    <div className="commercial-map-body">
      <CommercialMapDock entities={OFFICIAL_REFERENCE_ENTITIES} lots={OFFICIAL_REFERENCE_LOTS}
        activeSegmentId={activeSegmentId} isCommissionScope={false}
        interiorEntity={interiorEntityId ? pavilion : null}
        onSegmentSelect={useCommercialMapStore.getState().requestSegmentFocus}
        onSegmentClear={useCommercialMapStore.getState().clearSegmentFocus} />
      <div className="commercial-map-viewport"><canvas data-testid="persistent-canvas" /></div>
    </div>
  </section>;
}

function resizeShell(width: number) {
  shellWidth = width;
  const shell = document.querySelector('.commercial-map-shell')!;
  act(() => {
    for (const observer of observers) {
      if (observer.targets.has(shell)) observer.callback([], observer as unknown as ResizeObserver);
    }
  });
}

beforeEach(() => {
  shellWidth = 1200;
  observers.length = 0;
  useCommercialMapStore.setState({ ...useCommercialMapStore.getInitialState(), dockExpanded: true }, true);
  vi.stubGlobal('matchMedia', vi.fn((media: string) => ({
    media, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  vi.stubGlobal('ResizeObserver', class {
    record: typeof observers[number];
    constructor(callback: ResizeObserverCallback) {
      this.record = { callback, targets: new Set() };
      observers.push(this.record);
    }
    observe(target: Element) { this.record.targets.add(target); }
    unobserve(target: Element) { this.record.targets.delete(target); }
    disconnect() { this.record.targets.clear(); }
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('commercial-map-shell') ? shellWidth : 0;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('dock flutuante e largura disponível do mapa comercial', () => {
  it('recolhe o conteúdo mantendo o controle, os filtros e a identidade do canvas', () => {
    useCommercialMapStore.setState({
      activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.industry, statusFilters: ['AVAILABLE'],
      selectedEntityId: 'selected-lot', cameraSequence: 19,
    });
    render(<DockHarness />);
    const canvas = screen.getByTestId('persistent-canvas');
    const toggle = screen.getByRole('button', { name: 'Recolher painel do mapa' });
    toggle.focus();
    fireEvent.click(toggle);

    const dock = screen.getByRole('complementary');
    expect(dock).toHaveClass('is-compact');
    expect(within(dock).getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('group', { name: 'Filtrar mapa por segmento' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expandir painel do mapa' })).toHaveFocus();
    expect(screen.getByTestId('persistent-canvas')).toBe(canvas);
    fireEvent.click(toggle);
    expect(screen.getByRole('group', { name: 'Filtrar mapa por segmento' })).toBeInTheDocument();
    expect(screen.getByTestId('persistent-canvas')).toBe(canvas);
    expect(useCommercialMapStore.getState()).toMatchObject({
      activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.industry, statusFilters: ['AVAILABLE'],
      selectedEntityId: 'selected-lot', cameraSequence: 19,
    });
  });

  it('usa a largura do container e retorna o foco quando a folha remove conteúdo focado', () => {
    render(<DockHarness />);
    const canvas = screen.getByTestId('persistent-canvas');
    screen.getByRole('button', { name: /^Indústria, Comércio e Serviços/ }).focus();
    resizeShell(640);

    const dock = screen.getByRole('complementary');
    expect(dock).toHaveClass('is-mobile');
    expect(dock).toHaveAttribute('data-sheet-state', 'collapsed');
    expect(screen.queryByRole('group', { name: 'Filtrar mapa por segmento' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expandir painel do mapa' })).toHaveFocus();
    expect(useCommercialMapStore.getState().dockExpanded).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Expandir painel do mapa' }));
    expect(screen.getByRole('group', { name: 'Filtrar mapa por segmento' })).toBeInTheDocument();
    expect(screen.getByTestId('persistent-canvas')).toBe(canvas);

    resizeShell(1200);
    expect(dock).not.toHaveClass('is-mobile');
    expect(dock).toHaveClass('is-expanded');
    expect(screen.getByTestId('persistent-canvas')).toBe(canvas);
  });

  it('mantém Voltar ao mapa acessível no interior recolhido e restaura seu contexto', () => {
    useCommercialMapStore.getState().requestSegmentFocus(COMMERCIAL_MAP_SEGMENT_IDS.industry);
    useCommercialMapStore.getState().toggleStatus('BLOCKED');
    useCommercialMapStore.getState().enterInterior(pavilion.id);
    render(<DockHarness />);
    const canvas = screen.getByTestId('persistent-canvas');
    fireEvent.click(screen.getByRole('button', { name: 'Recolher painel do mapa' }));
    const back = screen.getByRole('button', { name: 'Voltar ao mapa' });
    expect(back).toHaveAttribute('aria-keyshortcuts', 'Escape');
    expect(screen.getByRole('button', { name: 'Expandir painel do mapa' })).toBeEnabled();
    expect(screen.getByRole('complementary')).toHaveClass('is-context-interior', 'is-compact');
    expect(useCommercialMapStore.getState().interiorEntityId).toBe(pavilion.id);
    fireEvent.click(back);
    expect(useCommercialMapStore.getState()).toMatchObject({
      interiorEntityId: null, activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.industry,
      statusFilters: ['BLOCKED'],
    });
    expect(screen.getByTestId('persistent-canvas')).toBe(canvas);
  });
});
