import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityDetailsPanel } from '@/features/commercial-map/components/panels/MapPanels';
import type { CommercialLot, MapEntity, MapPermissions } from '@/features/commercial-map/types';
import { OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS } from '@/features/commercial-map/data/officialReference2026';

const mocks = vi.hoisted(() => ({
  activity: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
  contracts: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
  saleHistory: vi.fn(() => ({ data: null, isLoading: false, isError: false })),
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
  useLotSaleHistory: mocks.saleHistory,
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
vi.mock('@/features/commercial-map/hooks/useLotPricing2028', () => ({
  useLotPricing2028: () => ({ data: null, isLoading: false, isError: false }),
}));

vi.mock('@/features/commercial-map/state/useCommercialMapStore', () => ({
  useCommercialMapStore: (selector: (state: typeof mocks.store) => unknown) => selector(mocks.store),
}));

vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ orgId: 'test-org' }) }));

const permissions: MapPermissions = {
  canView: true,
  canEdit: true,
  canEditGeometry: true,
  canManageLots: true, canEditPricing: true,
  canManageSales: true,
  canManageContracts: true,
  canManageLayers: true,
  canViewMapAnalytics: true,
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
  it('diferencia lote vendido com a venda canônica e lote disponível sem campos vazios', () => {
    const sold = fixture('A', 0);
    sold.lot.status = 'SOLD';
    sold.lot.currentBuyer = 'BOTOLI';
    sold.lot.saleDate = '2026-09-24';
    sold.lot.salespersonName = 'Leonardo';
    mocks.saleHistory.mockReturnValueOnce({
      data: {
        orderId: 'order-1', buyerName: 'BOTOLI', stage: 'SEGUNDA_ETAPA', paymentType: 'CASH', paymentMethod: 'PIX',
        officialArea: 100, itemTotal: 5921, createdAt: '2026-09-24T17:32:00Z', saleDate: '2026-09-24',
        salespersonName: 'Leonardo', contractNumber: null, installments: [],
      },
      isLoading: false,
      isError: false,
    });
    const view = render(panel(sold));
    const aside = screen.getByRole('complementary');
    expect(within(aside).getByLabelText('Venda confirmada')).toHaveTextContent('BOTOLI');
    expect(within(aside).getByLabelText('Venda confirmada')).toHaveTextContent('24/09/2026');
    expect(within(aside).getByLabelText('Venda confirmada')).toHaveTextContent('2ª Etapa');
    expect(within(aside).getByLabelText('Venda confirmada')).toHaveTextContent('Leonardo');
    expect(within(aside).getByRole('region', { name: 'Contrato da venda' })).toBeVisible();

    view.rerender(panel(first));
    expect(screen.queryByLabelText('Venda confirmada')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Contrato da venda' })).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhum contrato anexado a este lote.')).not.toBeInTheDocument();
  });

  it('oferece uma única entrada para o interior no resumo com identificação e módulos do pavilhão', () => {
    const pavilion = OFFICIAL_REFERENCE_ENTITIES.find((candidate) => candidate.publicIdentifier === 'B1')!;
    render(<EntityDetailsPanel entity={pavilion} entities={OFFICIAL_REFERENCE_ENTITIES}
      lots={OFFICIAL_REFERENCE_LOTS} permissions={permissions} />);
    const aside = screen.getByRole('complementary');
    const summary = within(aside).getByLabelText('Resumo da seleção');
    expect(summary).toHaveTextContent('189 módulos');
    expect(summary).toHaveTextContent('Não comercial');
    expect(aside).toHaveAttribute('data-sheet-state', 'half');
    const interiorAction = within(aside).getByRole('button', { name: /Ver interior de Pavilhão 1/i });
    fireEvent.click(interiorAction);
    expect(mocks.store.enterInterior).toHaveBeenCalledWith(pavilion.id);
    expect(aside.querySelectorAll('[data-commercial-map-interior-trigger]')).toHaveLength(1);
    expect(within(aside).getByText('Planta e áreas oficiais').closest('details')).not.toHaveAttribute('open');
  });

  it('recolhe e restaura o resumo sem apagar a seleção nem entrar no interior', () => {
    render(panel());
    const aside = screen.getByRole('complementary');
    fireEvent.click(within(aside).getByRole('button', { name: 'Recolher detalhes do lote' }));
    expect(aside).toHaveAttribute('data-sheet-state', 'collapsed');
    fireEvent.click(within(aside).getByRole('button', { name: 'Restaurar detalhes do lote' }));
    expect(aside).toHaveAttribute('data-sheet-state', 'half');
    expect(mocks.store.setSelectedEntityId).not.toHaveBeenCalled();
    expect(mocks.store.enterInterior).not.toHaveBeenCalled();
  });

  it('preserva o aside A→B e atualiza os dados comerciais sem expor ações técnicas', () => {
    const view = render(panel());
    const aside = screen.getByRole('complementary');
    expect(within(aside).queryByRole('button', { name: 'Editar lote' })).not.toBeInTheDocument();
    expect(within(aside).queryByRole('button', { name: 'Verificar entidade' })).not.toBeInTheDocument();

    view.rerender(panel(second));

    expect(screen.getByRole('complementary')).toBe(aside);
    expect(aside).toHaveTextContent('LOT-B');
    expect(mocks.activity).toHaveBeenLastCalledWith(second.lot.id);
    expect(mocks.contracts).toHaveBeenLastCalledWith(second.lot.id, true);

    view.rerender(panel(first));
    expect(screen.getByRole('complementary')).toBe(aside);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['Reservar', 'Dividir'])(
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
