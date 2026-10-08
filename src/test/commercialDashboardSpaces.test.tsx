import { useCallback, useState } from 'react';
import { withDashboardValue } from './helpers/dashboardFinancialFixture';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialDashboard } from '@/features/commercial-map/dashboard/CommercialDashboard';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { COMMERCIAL_MAP_SEGMENTS } from '@/features/commercial-map/data/commercialMapSegments';
import { buildCommercialDashboardSnapshot } from '@/features/commercial-map/dashboard/commercialDashboardAnalytics';
import type { CommercialMapData } from '@/features/commercial-map/types';
import { useCommercialDashboardSync } from '@/features/commercial-map/dashboard/useCommercialDashboardSync';
import { CommercialDashboardSpaces, type CommercialDashboardSpacesMemory } from '@/features/commercial-map/dashboard/CommercialDashboardSpaces';

const snapshot = buildCommercialDashboardSnapshot(OFFICIAL_REFERENCE_DATA);
const sampleRecords = [...snapshot.segments.flatMap((segment) => segment.records.slice(0, 1)),
  ...snapshot.pavilions.flatMap((pavilion) => [8, 13].includes(pavilion.definition.pavilionNumber)
    ? pavilion.records : pavilion.records.slice(-2))];
const ids = new Set(sampleRecords.map(({ entity }) => entity.id));
const data: Pick<CommercialMapData, 'entities' | 'lots'> = {
  entities: OFFICIAL_REFERENCE_DATA.entities.filter((entity) => ids.has(entity.id) || !entity.isSellable),
  lots: sampleRecords.map(({ lot }) => lot),
};
const props = { data, dataUpdatedAt: 1000, isFetching: false, onClose: vi.fn(), onViewLot: vi.fn() };
const originalScreenCTM = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getScreenCTM');
const bounds = (left: number, top: number, width: number, height: number): DOMRect => ({
  x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}),
});
beforeEach(() => {
  const originalBounds = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.classList.contains('commercial-dashboard-pavilion-context-anchor')) return bounds(0, 0, 280, 240);
    if (this.classList.contains('commercial-dashboard-pavilion-frame')
      || (this.classList.contains('commercial-dashboard-map-scroll') && this.closest('.commercial-dashboard-minimap--pavilion'))) return bounds(100, 50, 640, 420);
    return originalBounds.call(this);
  });
  Object.defineProperty(SVGElement.prototype, 'getScreenCTM', { configurable: true,
    value: () => ({ a: .5, b: 0, c: 0, d: .5, e: 100, f: 50 }) });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalScreenCTM) Object.defineProperty(SVGElement.prototype, 'getScreenCTM', originalScreenCTM);
  else Reflect.deleteProperty(SVGElement.prototype, 'getScreenCTM');
});

describe('managerial scopes in the existing dashboard', () => {
  it('retains scope, selected lot and chart metric when the dedicated sales view temporarily unmounts the workspace', () => {
    const currentSnapshot = buildCommercialDashboardSnapshot(data);
    const stateMemory: CommercialDashboardSpacesMemory = { current: null };
    const workspaceProps = { snapshot: currentSnapshot, data, onViewLot: vi.fn(), stateMemory };
    const { unmount } = render(<CommercialDashboardSpaces {...workspaceProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exporural' }));
    const map = screen.getByRole('region', { name: 'Mini mapa comercial: Exporural' });
    const expected = sampleRecords.find((record) => record.category === 'external' && record.segmentId === 'exporural')!;
    fireEvent.change(within(map).getByRole('combobox'), { target: { value: expected.entity.id } });
    fireEvent.click(within(screen.getByRole('group', { name: 'Métrica de distribuição' })).getByRole('button', { name: 'Área oficial' }));
    unmount();
    render(<CommercialDashboardSpaces {...workspaceProps} />);
    expect(screen.getByRole('button', { name: 'Exporural' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('region', { name: 'Mini mapa comercial: Exporural' })).getByRole('combobox')).toHaveValue(expected.entity.id);
    expect(within(screen.getByRole('group', { name: 'Métrica de distribuição' })).getByRole('button', { name: 'Área oficial' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('explicitly restores a former internal aggregate scope to all external areas without choosing an arbitrary pavilion', () => {
    const currentSnapshot = buildCommercialDashboardSnapshot(data);
    const stateMemory: CommercialDashboardSpacesMemory = { current: { requestedScopeId: 'internal:all', selections: {}, metric: 'lots' } };
    render(<CommercialDashboardSpaces snapshot={currentSnapshot} data={data} onViewLot={vi.fn()} stateMemory={stateMemory} />);
    expect(screen.getByRole('button', { name: 'Todas as áreas' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('group', { name: 'Selecionar pavilhão' })).queryByRole('button', { pressed: true })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Mini mapa comercial: Todas as áreas externas' })).toBeInTheDocument();
    expect(stateMemory.current?.requestedScopeId).toBe('external:all');
    expect(currentSnapshot.internal.totalLots).toBeGreaterThan(0);
  });

  it('focuses all three external areas, retains the selected lot, and opens its cadastral entity', () => {
    const onViewLot = vi.fn();
    render(<CommercialDashboard {...props} onViewLot={onViewLot} />);
    const selectors = screen.getByRole('group', { name: 'Selecionar área externa' });
    for (const segment of COMMERCIAL_MAP_SEGMENTS) {
      fireEvent.click(within(selectors).getByRole('button', { name: segment.name }));
      const map = screen.getByRole('region', { name: `Mini mapa comercial: ${segment.name}` });
      const expected = sampleRecords.find((record) => record.category === 'external' && record.segmentId === segment.id)!;
      fireEvent.change(within(map).getByRole('combobox'), { target: { value: expected.entity.id } });
      fireEvent.click(within(map).getByRole('button', { name: 'Ver no mapa' }));
      expect(onViewLot).toHaveBeenLastCalledWith(expected.entity.id);
      expect(within(map).getAllByRole('button', { pressed: true })).toHaveLength(1);
    }
    fireEvent.click(within(selectors).getByRole('button', { name: 'Exporural' }));
    expect(within(screen.getByRole('region', { name: 'Mini mapa comercial: Exporural' })).getByRole('button', { name: 'Ver no mapa' })).toBeVisible();
  });

  it('selects every pavilion from the common selector, including the official Pavilion 13 B5 identity', async () => {
    const onViewLot = vi.fn();
    const { container } = render(<CommercialDashboard {...props} onViewLot={onViewLot} />);
    const selectors = screen.getByRole('group', { name: 'Selecionar pavilhão' });
    expect(within(selectors).getAllByRole('button', { name: /^Pavilhão \d+/ })).toHaveLength(snapshot.pavilions.length);
    expect(within(selectors).queryByRole('button', { name: 'Todos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Consultar Pavilhão 13' })).not.toBeInTheDocument();
    for (const pavilion of snapshot.pavilions) {
      const button = within(selectors).getByRole('button', { name: pavilion.definition.officialName });
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'true');
      const map = await screen.findByRole('region', { name: `Mini mapa comercial: ${pavilion.definition.officialName}` }, { timeout: 5000 });
      expect(container.querySelectorAll('[data-dashboard-pavilion]')).toHaveLength(1);
      const expected = sampleRecords.filter((record) => record.pavilion?.publicIdentifier === pavilion.definition.publicIdentifier)[0];
      const module = map.querySelector(`path[data-entity-id="${expected.entity.id}"]`)!;
      expect(module).toHaveAccessibleName(new RegExp(`Módulo ${expected.lot.lotNumber}`));
      expect(map.querySelectorAll('[data-access-kind]').length).toBeGreaterThan(0);
      fireEvent.focus(module);
      fireEvent.keyDown(module, { key: 'Enter' });
      fireEvent.click(within(map).getByRole('button', { name: 'Ver no mapa' }));
      expect(onViewLot).toHaveBeenLastCalledWith(expected.entity.id);
    }
    fireEvent.click(within(selectors).getByRole('button', { name: /^Pavilhão 13(?: |$)/ }));
    expect(await screen.findByRole('region', { name: /Mini mapa comercial: Pavilhão 13/ })).toBeVisible();
    expect(container.querySelector('[data-dashboard-pavilion="B5"]')).toBeInTheDocument();
  });

  it('refreshes selected module status, area, price, geometry and timestamp together without losing scope', async () => {
    const { rerender } = render(<CommercialDashboard {...props} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Selecionar pavilhão' })).getByRole('button', { name: /^Pavilhão 7(?: |$)/ }));
    const map = await screen.findByRole('region', { name: /Mini mapa comercial: Pavilhão 7/ });
    const module = sampleRecords.find((record) => record.pavilion?.publicIdentifier === 'B10')!;
    fireEvent.change(within(map).getByRole('combobox'), { target: { value: module.entity.id } });
    const oldPath = map.querySelector(`path[data-entity-id="${module.entity.id}"]`)!.getAttribute('d');
    const next = {
      entities: data.entities.map((entity) => entity.id === module.entity.id ? { ...entity, geometry: { ...entity.geometry,
        coordinates: entity.geometry.coordinates.map((ring) => ring.map(([x, y]) => [x + 0.01, y] as [number, number])) } } : entity),
      lots: data.lots.map((lot) => lot.id === module.lot.id ? withDashboardValue({ ...lot, status: 'SOLD', officialAreaSqm: 72 }, 15000) : lot),
    };
    rerender(<CommercialDashboard {...props} data={next} dataUpdatedAt={2000} />);
    const path = map.querySelector(`path[data-entity-id="${module.entity.id}"]`)!;
    expect(path).toHaveAttribute('aria-pressed', 'true');
    expect(path).toHaveAttribute('data-status', 'SOLD');
    expect(path.getAttribute('d')).not.toBe(oldPath);
    expect(within(map).getByRole('article', { name: /^Dados de/ })).toHaveTextContent('72,00 m²');
    expect(within(map).getByRole('article', { name: /^Dados de/ })).toHaveTextContent('15.000,00');
    expect(within(screen.getByRole('group', { name: 'Selecionar pavilhão' })).getByRole('button', { name: /^Pavilhão 7(?: |$)/ })).toHaveAttribute('aria-pressed', 'true');
    const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(2000);
    expect(screen.getByText(`Atualizado às ${time}`)).toBeInTheDocument();
    rerender(<CommercialDashboard {...props} data={{ ...next, lots: next.lots.filter((lot) => lot.id !== module.lot.id) }} />);
    expect(within(map).queryByRole('button', { name: 'Ver no mapa' })).not.toBeInTheDocument();
  });

  it('polling and focus propagate a refreshed snapshot into metrics and the selected external polygon', async () => {
    vi.useFakeTimers();
    const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const target = sampleRecords.find((record) => record.category === 'external')!;
    let calls = 0;
    function LiveQueryFixture() {
      const [current, setCurrent] = useState(data);
      const [updatedAt, setUpdatedAt] = useState(1000);
      const refetch = useCallback(async () => {
        calls += 1;
        setCurrent({
          entities: data.entities.map((entity) => entity.id !== target.entity.id ? entity : { ...entity,
            geometry: { ...entity.geometry, coordinates: entity.geometry.coordinates.map((ring) => ring.map(([x, y]) => [x + calls * 0.01, y] as [number, number])) } }),
          lots: data.lots.map((lot) => lot.id !== target.lot.id ? lot : withDashboardValue({ ...lot, status: 'SOLD',
            officialAreaSqm: 70 + calls }, 1000 * calls)),
        });
        setUpdatedAt(Date.now());
        return {};
      }, []);
      useCommercialDashboardSync({ open: true, enabled: true, isFetching: false, refetch });
      return <CommercialDashboard {...props} data={current} dataUpdatedAt={updatedAt} />;
    }
    try {
      render(<LiveQueryFixture />);
      const map = screen.getByRole('region', { name: 'Mini mapa comercial: Todas as áreas externas' });
      fireEvent.change(within(map).getByRole('combobox'), { target: { value: target.entity.id } });
      const pathBefore = map.querySelector(`path[data-entity-id="${target.entity.id}"]`)!.getAttribute('d');
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(calls).toBe(1);
      expect(within(map).getByRole('status')).toHaveTextContent('71,00 m²');
      expect(within(map).getByRole('status')).toHaveTextContent('1.000,00');
      expect(map.querySelector(`path[data-entity-id="${target.entity.id}"]`)).toHaveAttribute('data-status', 'SOLD');
      expect(map.querySelector(`path[data-entity-id="${target.entity.id}"]`)!.getAttribute('d')).not.toBe(pathBefore);
      await act(async () => { window.dispatchEvent(new Event('focus')); });
      expect(calls).toBe(2);
      expect(within(map).getByRole('status')).toHaveTextContent('72,00 m²');
      expect(within(map).getByRole('status')).toHaveTextContent('2.000,00');
      expect(within(map).getByRole('combobox')).toHaveValue(target.entity.id);
    } finally {
      if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility);
      else Reflect.deleteProperty(document, 'visibilityState');
    }
  });
});
