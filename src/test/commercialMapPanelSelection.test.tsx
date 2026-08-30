import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityDetailsPanel } from '@/features/commercial-map/components/panels/MapPanels';
import type { CommercialLot, MapEntity, MapPermissions } from '@/features/commercial-map/types';

const mocks = vi.hoisted(() => ({
  activity: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
  contracts: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  fetch: vi.fn(),
  store: {
    setSelectedEntityId: vi.fn(),
    focusSelection: vi.fn(),
    enterInterior: vi.fn(),
    setWorkspaceMode: vi.fn(),
  },
}));

vi.mock('@/features/commercial-map/hooks/useCommercialMap', () => ({
  useLotActivity: mocks.activity,
  useLotContractVersions: mocks.contracts,
  useMapMutations: () => {
    const mutation = { isPending: false, mutate: mocks.mutate, mutateAsync: mocks.mutateAsync };
    return {
      lotUpdate: mutation,
      reservation: mutation,
      negotiation: mutation,
      sale: mutation,
      contract: mutation,
      split: mutation,
      merge: mutation,
      verification: mutation,
      layerLock: mutation,
    };
  },
}));

vi.mock('@/features/commercial-map/state/useCommercialMapStore', () => ({
  useCommercialMapStore: (selector: (state: typeof mocks.store) => unknown) => selector(mocks.store),
}));

vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ orgId: 'test-org' }) }));

const permissions: MapPermissions = {
  canView: true,
  canEdit: true,
  canEditGeometry: true,
  canManageLots: true,
  canManageSales: true,
  canManageContracts: true,
  canManageLayers: true,
  isMapAdmin: true,
};

function fixture(suffix: 'A' | 'B', x: number) {
  const entity: MapEntity = {
    id: `entity-${suffix}`, projectId: 'project', layerId: 'lots', parentEntityId: null,
    publicIdentifier: `LOT-${suffix}`, name: `Lote ${suffix}`, description: null,
    classification: 'SELLABLE_LOT', verificationStatus: 'NEEDS_REVIEW',
    isSellable: true, isArchived: false, metadata: {},
    geometry: {
      id: `geometry-${suffix}`, type: 'Polygon',
      coordinates: [[[x, 0], [x + 10, 0], [x + 10, 10], [x, 10], [x, 0]]],
      elevation: 0, extrusionHeight: 0.1, rotation: 0, geometryVersion: 1, calibrationVersion: 1,
    },
  };
  const lot: CommercialLot = {
    id: `lot-${suffix}`, entityId: entity.id, publicIdentifier: entity.publicIdentifier,
    displayName: entity.name, description: `Descrição ${suffix}`, block: suffix, lotNumber: '1',
    levelLabel: null, status: 'AVAILABLE', officialAreaSqm: 100, calculatedAreaSqm: 100,
    areaValidationStatus: 'VALIDATED', frontageMeters: 10, depthMeters: 10,
    pricingMode: 'NEGOTIABLE', basePrice: null, pricePerSqm: null, askingPrice: null,
    minimumPrice: null, infrastructure: [], hasElectricity: false, hasWater: false,
    hasInternet: false, isCorner: false, isCovered: false, accessibilityNotes: null,
    commercialNotes: null, internalNotes: null, currentBuyer: null, reservationExpiresAt: null,
    saleDate: null, salespersonName: null, activeContractNumber: null, archivedAt: null,
    createdBy: null, updatedBy: null, createdAt: '2026-08-30T12:00:00Z', updatedAt: '2026-08-30T12:00:00Z',
  };
  return { entity, lot };
}

const first = fixture('A', 0);
const second = fixture('B', 10);
const entities = [first.entity, second.entity];
const lots = [first.lot, second.lot];
const reactErrors: unknown[][] = [];

function panel(selection = first) {
  return (
    <div className="commercial-map-viewport" data-testid="viewport">
      <EntityDetailsPanel {...selection} entities={entities} lots={lots} permissions={permissions} />
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  reactErrors.length = 0;
  vi.spyOn(console, 'error').mockImplementation((...args) => { reactErrors.push(args); });
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  try {
    cleanup();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(reactErrors).toEqual([]);
  } finally {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

describe('seleção no painel persistente do mapa comercial', () => {
  it('preserva o aside A→B, fecha a edição aberta e inicia o draft real de LotEditDialog com os dados de B', () => {
    const view = render(panel());
    const aside = screen.getByRole('complementary');
    fireEvent.click(within(aside).getByRole('button', { name: 'Editar lote' }));
    const firstDialog = screen.getByRole('dialog', { name: 'Editar LOT-A' });
    fireEvent.change(within(firstDialog).getByLabelText('Identificador público *'), {
      target: { value: 'RASCUNHO-EXCLUSIVO-A' },
    });
    fireEvent.change(within(firstDialog).getByLabelText('Nome de exibição *'), {
      target: { value: 'Nome não salvo de A' },
    });

    view.rerender(panel(second));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBe(aside);
    expect(aside).toHaveTextContent('LOT-B');
    expect(mocks.activity).toHaveBeenLastCalledWith(second.lot.id);
    expect(mocks.contracts).toHaveBeenLastCalledWith(second.lot.id, true);

    fireEvent.click(within(aside).getByRole('button', { name: 'Editar lote' }));
    const secondDialog = screen.getByRole('dialog', { name: 'Editar LOT-B' });
    expect(within(secondDialog).getByLabelText('Identificador público *')).toHaveValue('LOT-B');
    expect(within(secondDialog).getByLabelText('Nome de exibição *')).toHaveValue('Lote B');
    expect(within(secondDialog).getByLabelText('Descrição')).toHaveValue('Descrição B');
    expect(screen.queryByDisplayValue('RASCUNHO-EXCLUSIVO-A')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Nome não salvo de A')).not.toBeInTheDocument();

    view.rerender(panel(first));
    expect(screen.getByRole('complementary')).toBe(aside);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(within(aside).getByRole('button', { name: 'Editar lote' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Identificador público *')).toHaveValue('LOT-A');
  });

  it.each(['Reservar', 'Dividir', 'Verificar entidade'])(
    'fecha o modal de %s ao trocar a entidade sem substituir o painel',
    (action) => {
      const view = render(panel());
      const aside = screen.getByRole('complementary');
      fireEvent.click(within(aside).getByRole('button', { name: action }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      view.rerender(panel(second));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('complementary')).toBe(aside);
      expect(aside).toHaveTextContent('LOT-B');
    },
  );

  it('limpa altura transitória e estado do sheet na seleção e no unmount', () => {
    const view = render(panel());
    const aside = screen.getByRole('complementary');
    const viewport = screen.getByTestId('viewport');
    fireEvent.click(within(aside).getByRole('button', { name: 'Expandir detalhes do lote' }));
    expect(aside).toHaveAttribute('data-sheet-state', 'expanded');
    viewport.classList.add('is-detail-sheet-dragging');
    viewport.style.setProperty('--commercial-map-detail-sheet-height', '321px');

    view.rerender(panel(second));

    expect(screen.getByRole('complementary')).toBe(aside);
    expect(aside).toHaveAttribute('data-sheet-state', 'half');
    expect(viewport).not.toHaveClass('is-detail-sheet-dragging');
    expect(viewport.style.getPropertyValue('--commercial-map-detail-sheet-height')).toBe('');

    viewport.classList.add('is-detail-sheet-dragging');
    viewport.style.setProperty('--commercial-map-detail-sheet-height', '456px');
    view.unmount();
    expect(viewport).not.toHaveClass('is-detail-sheet-dragging');
    expect(viewport.style.getPropertyValue('--commercial-map-detail-sheet-height')).toBe('');
  });
});
