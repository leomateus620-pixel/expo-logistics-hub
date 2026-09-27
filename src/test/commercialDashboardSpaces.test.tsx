import { useCallback, useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommercialDashboard } from '@/features/commercial-map/dashboard/CommercialDashboard';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { COMMERCIAL_MAP_SEGMENTS } from '@/features/commercial-map/data/commercialMapSegments';
import { buildCommercialDashboardSnapshot } from '@/features/commercial-map/dashboard/commercialDashboardAnalytics';
import type { CommercialMapData } from '@/features/commercial-map/types';
import { useCommercialDashboardSync } from '@/features/commercial-map/dashboard/useCommercialDashboardSync';

const snapshot = buildCommercialDashboardSnapshot(OFFICIAL_REFERENCE_DATA);
const sampleRecords = [...snapshot.segments.flatMap((segment) => segment.records.slice(0, 1)),
  ...snapshot.pavilions.flatMap((pavilion) => pavilion.records.slice(-2))];
const ids = new Set(sampleRecords.map(({ entity }) => entity.id));
const data: Pick<CommercialMapData, 'entities' | 'lots'> = {
  entities: OFFICIAL_REFERENCE_DATA.entities.filter((entity) => ids.has(entity.id) || !entity.isSellable),
  lots: sampleRecords.map(({ lot }) => lot),
};
const props = { data, dataUpdatedAt: 1000, isFetching: false, onClose: vi.fn(), onViewLot: vi.fn() };
afterEach(() => { vi.useRealTimers(); });

describe('managerial scopes in the existing dashboard', () => {
  it('focuses all three external areas, retains the selected lot, and opens its cadastral entity', () => {
    const onViewLot = vi.fn();
    render(<CommercialDashboard {...props} onViewLot={onViewLot} />);
    const selectors = screen.getByRole('group', { name: 'Selecionar área externa' });
    for (const segment of COMMERCIAL_MAP_SEGMENTS) {
      fireEvent.click(within(selectors).getByRole('button', { name: new RegExp(segment.name) }));
      const map = screen.getByRole('region', { name: `Mini mapa comercial: ${segment.name}` });
      const expected = sampleRecords.find((record) => record.category === 'external' && record.segmentId === segment.id)!;
      fireEvent.change(within(map).getByRole('combobox'), { target: { value: expected.entity.id } });
      fireEvent.click(within(map).getByRole('button', { name: 'Ver no mapa' }));
      expect(onViewLot).toHaveBeenLastCalledWith(expected.entity.id);
      expect(within(map).getAllByRole('button', { pressed: true })).toHaveLength(1);
    }
    fireEvent.click(within(selectors).getByRole('button', { name: /Exporural/ }));
    expect(within(screen.getByRole('region', { name: 'Mini mapa comercial: Exporural' })).getByRole('button', { name: 'Ver no mapa' })).toBeVisible();
  });

  it('selects the seven accessible pavilion icons, shows registered numbers/accesses and keeps B13 explicit', async () => {
    const onViewLot = vi.fn();
    const { container } = render(<CommercialDashboard {...props} onViewLot={onViewLot} />);
    const selectors = screen.getByRole('group', { name: 'Selecionar pavilhão' });
    expect(within(selectors).getAllByRole('button')).toHaveLength(8);
    expect(screen.getByText(/Pavilhão 13: 2 módulos ativos/)).toBeInTheDocument();
    for (const pavilion of snapshot.pavilions.filter((item) => item.definition.pavilionNumber !== 13)) {
      const button = within(selectors).getByRole('button', { name: pavilion.definition.officialName });
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'true');
      const map = await screen.findByRole('region', { name: `Mini mapa comercial: ${pavilion.definition.officialName}` });
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
    fireEvent.click(screen.getByRole('button', { name: 'Consultar Pavilhão 13' }));
    expect(await screen.findByRole('region', { name: /Mini mapa comercial: Pavilhão 13/ })).toBeVisible();
  });

  it('refreshes selected module status, area, price, geometry and timestamp together without losing scope', async () => {
    const { rerender } = render(<CommercialDashboard {...props} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Selecionar pavilhão' })).getByRole('button', { name: /Pavilhão 7/ }));
    const map = await screen.findByRole('region', { name: /Mini mapa comercial: Pavilhão 7/ });
    const module = sampleRecords.find((record) => record.pavilion?.publicIdentifier === 'B10')!;
    fireEvent.change(within(map).getByRole('combobox'), { target: { value: module.entity.id } });
    const oldPath = map.querySelector(`path[data-entity-id="${module.entity.id}"]`)!.getAttribute('d');
    const next = {
      entities: data.entities.map((entity) => entity.id === module.entity.id ? { ...entity, geometry: { ...entity.geometry,
        coordinates: entity.geometry.coordinates.map((ring) => ring.map(([x, y]) => [x + 0.01, y] as [number, number])) } } : entity),
      lots: data.lots.map((lot) => lot.id === module.lot.id ? { ...lot, status: 'SOLD' as const, pricingMode: 'FIXED_TOTAL' as const, officialAreaSqm: 72, askingPrice: 15000 } : lot),
    };
    rerender(<CommercialDashboard {...props} data={next} dataUpdatedAt={2000} />);
    const path = map.querySelector(`path[data-entity-id="${module.entity.id}"]`)!;
    expect(path).toHaveAttribute('aria-pressed', 'true');
    expect(path).toHaveAttribute('data-status', 'SOLD');
    expect(path.getAttribute('d')).not.toBe(oldPath);
    expect(within(map).getByRole('status')).toHaveTextContent('72,00 m²');
    expect(within(map).getByRole('status')).toHaveTextContent('15.000,00');
    expect(within(screen.getByRole('group', { name: 'Selecionar pavilhão' })).getByRole('button', { name: /Pavilhão 7/ })).toHaveAttribute('aria-pressed', 'true');
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
          lots: data.lots.map((lot) => lot.id !== target.lot.id ? lot : { ...lot, status: 'SOLD' as const,
            pricingMode: 'FIXED_TOTAL' as const, officialAreaSqm: 70 + calls, askingPrice: 1000 * calls }),
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
