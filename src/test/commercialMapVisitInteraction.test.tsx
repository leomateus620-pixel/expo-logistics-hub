import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CommercialLot, MapEntity } from '@/features/commercial-map/types';
import { buildVisitPOIs } from '@/features/commercial-map/visit/VisitPOIManager';
import { VisitInteractionManager } from '@/features/commercial-map/visit/VisitInteractionManager';
import { VisitHUD } from '@/features/commercial-map/visit/VisitHUD';
import { useVisitStore } from '@/features/commercial-map/visit/useVisitStore';
import { visitInput } from '@/features/commercial-map/visit/VisitInputManager';
import type { LotPricing2028 } from '@/features/commercial-map/utils/lotPricing2028';

const pricingQuery = vi.hoisted(() => ({ data: null as unknown, isLoading: false, isError: false }));
vi.mock('@/features/commercial-map/hooks/useLotPricing2028', () => ({ useLotPricing2028: () => pricingQuery }));

function entity(id: string, x = 0, z = 3, classification: MapEntity['classification'] = 'BUILDING'): MapEntity {
  return {
    id, publicIdentifier: id, projectId: 'project', layerId: 'structures', parentEntityId: null,
    name: `Estrutura ${id}`, description: 'Descrição oficial', classification, verificationStatus: 'VERIFIED',
    isSellable: classification === 'SELLABLE_LOT', isArchived: false, metadata: {},
    geometry: {
      id: null, type: 'Polygon', coordinates: [[[x - .5, z - .5], [x + .5, z - .5], [x + .5, z + .5], [x - .5, z + .5], [x - .5, z - .5]]],
      elevation: 0, extrusionHeight: 2, rotation: 0, geometryVersion: 1, calibrationVersion: 1,
    },
  };
}
const position = { x: 0, y: 1.25, z: 0 };
const forward = { x: 0, y: 0, z: 1 };
const visible = { occluded: () => false };

describe('Visit POIs from the canonical authorized map snapshot', () => {
  it('preserves source identity and excludes internal, archived, invalid and non-interactive geometry', () => {
    const lotEntity = entity('Q-A-18', 0, 3, 'SELLABLE_LOT');
    const lot = { id: 'commercial-lot-18', entityId: lotEntity.id, lotNumber: '18', block: 'A', officialAreaSqm: 40, askingPrice: 777, status: 'AVAILABLE' } as CommercialLot;
    const archived = { ...entity('archived'), isArchived: true };
    const invalid = entity('invalid'); invalid.geometry.coordinates[0][0][0] = NaN;
    const entities = [lotEntity, archived, entity('internal', 1, 3, 'INTERNAL_STAND'), entity('road', 2, 3, 'ROAD'), invalid];
    const before = JSON.stringify(entities);
    const pois = buildVisitPOIs(entities, [lot], 1);
    expect(pois).toHaveLength(1);
    expect(pois[0].id).toBe(lotEntity.id);
    expect(pois[0].entity).toBe(lotEntity);
    expect(pois[0].lot).toBe(lot);
    expect(pois[0]).not.toHaveProperty('price');
    expect(pois[0].position).toEqual({ x: 0, y: 1.25, z: 3 });
    expect(JSON.stringify(entities)).toBe(before);
  });

  it('offers an interior only when the canonical architecture actually supports one', () => {
    const headquarters = entity('B12');
    const generic = entity('MY-BUILDING');
    const pois = buildVisitPOIs([headquarters, generic], [], 1);
    expect(pois.find(p => p.id === 'B12')?.interiorAvailable).toBe(true);
    expect(pois.find(p => p.id === generic.id)?.interiorAvailable).toBe(false);
  });
});

describe('VisitInteractionManager indexed visibility', () => {
  it('selects only one frontal nearby target, rejecting proximity alone', () => {
    const pois = buildVisitPOIs([entity('ahead'), entity('side', 5, 0), entity('behind', 0, -3)], [], 1);
    const manager = new VisitInteractionManager(pois, 1);
    expect(manager.update(position, forward, visible)?.id).toBe('ahead');
    expect(manager.update(position, { x: 0, y: 0, z: -1 }, visible)?.id).toBe('behind');
    expect(manager.update(position, { x: -1, y: 0, z: 0 }, visible)).toBeNull();
  });

  it('drops the contextual card when occluded and excludes its own target collider', () => {
    const manager = new VisitInteractionManager(buildVisitPOIs([entity('wall')], [], 1), 1);
    const occluded = vi.fn((_from: unknown, _to: unknown, _ignoreId?: string) => false);
    expect(manager.update(position, forward, { occluded })?.id).toBe('wall');
    expect(occluded.mock.calls[0][2]).toBe('wall');
    occluded.mockReturnValue(true);
    expect(manager.update(position, forward, { occluded })).toBeNull();
  });

  it('applies a real vertical direction cone instead of showing a ground lot while looking at the sky', () => {
    const lot = { id: 'lot-row', entityId: 'lot', status: 'AVAILABLE' } as CommercialLot;
    const manager = new VisitInteractionManager(buildVisitPOIs([entity('lot', 0, 3, 'SELLABLE_LOT')], [lot], 1), 1);
    expect(manager.update(position, forward, visible)?.id).toBe('lot');
    expect(manager.update(position, { x: 0, y: 1, z: .05 }, visible)).toBeNull();
  });

  it('targets the nearby facade of a long building even when its centroid is distant', () => {
    const building = entity('long');
    building.geometry.coordinates = [[[-.5, 2], [.5, 2], [.5, 100], [-.5, 100], [-.5, 2]]];
    const manager = new VisitInteractionManager(buildVisitPOIs([building], [], 1), 1);
    expect(manager.update(position, forward, visible)?.id).toBe('long');
    expect(manager.focusPosition.z).toBe(2);
  });

  it('queries only the local spatial cell and removes targets beyond interaction distance', () => {
    const near = entity('near');
    const distant = Array.from({ length: 600 }, (_, i) => entity(`far-${i}`, 1000 + i * 30, 1000));
    const manager = new VisitInteractionManager(buildVisitPOIs([near, ...distant], [], 1), 1);
    expect(manager.update(position, forward, visible)?.id).toBe('near');
    expect(manager.diagnostics.indexedPOIs).toBe(601);
    expect(manager.diagnostics.candidates).toBe(1);
    expect(manager.update({ x: 0, y: 1.25, z: -40 }, forward, visible)).toBeNull();
  });

  it('does not retain a stale target when the direction is invalid or the camera leaves the grid', () => {
    const manager = new VisitInteractionManager(buildVisitPOIs([entity('near')], [], 1), 1);
    expect(manager.update(position, forward, visible)).not.toBeNull();
    expect(manager.update(position, { x: 0, y: 0, z: 0 }, visible)).toBeNull();
    expect(manager.update({ x: 9999, y: 1.25, z: 9999 }, forward, visible)).toBeNull();
  });
});

describe('Visit HUD official values and independent touch controls', () => {
  beforeEach(() => {
    useVisitStore.setState({ enabled: true, phase: 'active', activeInterior: null, activePOI: null, error: null, cameraMode: 'first' });
    visitInput.reset();
    pricingQuery.data = null; pricingQuery.isError = false; pricingQuery.isLoading = false;
  });
  afterEach(() => { cleanup(); visitInput.reset(); useVisitStore.setState({ enabled: false, activePOI: null, activeInterior: null }); vi.useRealTimers(); });
  function showLot() {
    const sourceEntity = entity('Q-A-18', 0, 3, 'SELLABLE_LOT');
    const lot = { id: 'lot-18', entityId: sourceEntity.id, lotNumber: '18', block: 'A', officialAreaSqm: 39, askingPrice: 777, status: 'AVAILABLE' } as CommercialLot;
    useVisitStore.setState({ activePOI: buildVisitPOIs([sourceEntity], [lot], 1)[0] });
    return render(<VisitHUD />);
  }
  it('displays the same official area and stage totals without recalculating or using asking price', () => {
    pricingQuery.data = { resolutionStatus: 'OK', officialAreaSqm: 40, segundaTotal: 12345, segundaPricePerSqm: 308.625,
      renovacaoTotal: 10000, renovacaoPricePerSqm: 250 } as LotPricing2028;
    showLot();
    expect(screen.getByRole('heading', { name: 'Lote 18' })).toBeInTheDocument();
    expect(screen.getByText('Q-A-18')).toBeInTheDocument();
    expect(screen.getByText('40,00 m²')).toBeInTheDocument();
    expect(screen.getByText(/12\.345,00/)).toBeInTheDocument();
    expect(screen.queryByText(/777,00/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Valores e detalhes' }));
    expect(screen.getByText('Renovação')).toBeInTheDocument();
    expect(screen.getByText(/10\.000,00/)).toBeInTheDocument();
  });
  it('never displays a total from a pending official pricing resolution', () => {
    pricingQuery.data = { resolutionStatus: 'SEM_AREA', officialAreaSqm: null, segundaTotal: 98765 } as LotPricing2028;
    showLot();
    expect(screen.getByText('Valor pendente de conferência')).toBeInTheDocument();
    expect(screen.queryByText(/98\.765/)).not.toBeInTheDocument();
    expect(screen.queryByText(/777/)).not.toBeInTheDocument();
  });
  it('removes the single card after a short fade when focus is lost', () => {
    vi.useFakeTimers();
    const rendered = showLot();
    expect(rendered.container.querySelectorAll('[data-visit-poi-card]')).toHaveLength(1);
    act(() => useVisitStore.setState({ activePOI: null }));
    expect(rendered.container.querySelector('[data-visit-poi-card]')).toHaveAttribute('aria-hidden', 'true');
    act(() => vi.advanceTimersByTime(170));
    expect(rendered.container.querySelectorAll('[data-visit-poi-card]')).toHaveLength(0);
  });
  it('only exposes explicit interior access for an available canonical interior', () => {
    const poi = buildVisitPOIs([entity('B12')], [], 1)[0];
    useVisitStore.setState({ activePOI: poi });
    const rendered = render(<VisitHUD />);
    fireEvent.click(screen.getByRole('button', { name: 'Acessar interior' }));
    expect(useVisitStore.getState().phase).toBe('interior');
    expect(useVisitStore.getState().activeInterior).toBe('B12');
    rendered.unmount();
    useVisitStore.setState({ phase: 'active', activeInterior: null, activePOI: buildVisitPOIs([entity('generic')], [], 1)[0] });
    render(<VisitHUD />);
    expect(screen.queryByRole('button', { name: 'Acessar interior' })).not.toBeInTheDocument();
  });
  it('keeps movement and run pointers independent and clears cancellation and unmount', () => {
    const pointer = (element: HTMLElement, name: string, id: number) => {
      const event = new Event(name, { bubbles: true });
      Object.assign(event, { pointerId: id, button: 0, pointerType: 'touch' });
      fireEvent(element, event);
    };
    const rendered = render(<VisitHUD />);
    const forwardButton = screen.getByRole('button', { name: 'Avançar' });
    const backButton = screen.getByRole('button', { name: 'Voltar' });
    const runButton = screen.getByRole('button', { name: 'Correr' });
    pointer(forwardButton, 'pointerdown', 11);
    pointer(runButton, 'pointerdown', 12);
    expect(visitInput.forward).toBe(1); expect(visitInput.run).toBe(true);
    pointer(runButton, 'pointerup', 12);
    expect(visitInput.forward).toBe(1); expect(visitInput.run).toBe(false);
    pointer(backButton, 'pointerdown', 13);
    expect(visitInput.forward).toBe(0);
    pointer(forwardButton, 'pointercancel', 11);
    expect(visitInput.forward).toBe(-1);
    rendered.unmount();
    expect(visitInput.forward).toBe(0); expect(visitInput.run).toBe(false);
  });
});
