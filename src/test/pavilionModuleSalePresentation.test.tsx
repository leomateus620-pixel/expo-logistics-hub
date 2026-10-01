import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PavilionModuleCard } from '@/features/commercial-map/components/panels/PavilionModuleCard';
import { OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS } from '@/features/commercial-map/data/officialReference2026';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import { COMMERCIAL_PAVILION_MODULE_PLANS } from '@/features/commercial-map/utils/commercialPavilionModules';
import type { MapPermissions } from '@/features/commercial-map/types';

vi.mock('@/features/commercial-map/hooks/useCommercialMap', () => ({
  useLotContractVersions: () => ({ data: [], isLoading: false, isError: false }),
  useLotSaleHistory: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/features/commercial-map/hooks/useLotPricing2028', () => ({
  useLotPricing2028: () => ({ data: null, isLoading: false, isError: false }),
  useLotPriceOverride: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ orgId: 'org-test' }) }));
vi.mock('@/features/commercial-map/sales/components/SaleOpenSection', () => ({
  SaleOpenSection: ({ canManageSales }: { canManageSales: boolean }) => (
    <section aria-label="Venda em aberto" data-can-manage-sales={String(canManageSales)}>
      <button disabled={!canManageSales}>Confirmar contrato assinado</button>
    </section>
  ),
}));
vi.mock('@/features/commercial-map/sales/components/LotSaleHistoryCard', () => ({
  LotSaleHistoryCard: () => <section aria-label="Histórico da venda" />,
}));

const pavilion = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'B6');
const entity = OFFICIAL_REFERENCE_ENTITIES.find((item) => item.publicIdentifier === 'B6-M048');
const lot = OFFICIAL_REFERENCE_LOTS.find((item) => item.entityId === entity?.id);
const permissions = {
  canView: true, canEdit: false, canEditGeometry: false, canManageLots: false,
  canEditPricing: false, canManageSales: false, canManageContracts: false,
  canManageLayers: false, canViewMapAnalytics: false, isMapAdmin: false,
} satisfies MapPermissions;

describe('ficha comercial do módulo', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    useCommercialMapStore.getState().setSelectedModuleId('B6:module:048');
  });

  it.each(['SALE_OPEN', 'SOLD'] as const)('destaca %s antes das medidas e valores no resumo', (status) => {
    if (!pavilion || !entity || !lot) throw new Error('Referência do módulo não encontrada');
    const currentLot = { ...lot, id: 'persisted-lot', status, currentBuyer: 'BOLEIROS E GIRLS STORE' };
    render(<PavilionModuleCard embedded plan={COMMERCIAL_PAVILION_MODULE_PLANS.B6}
      pavilion={pavilion} entities={[pavilion, entity]} lots={[currentLot]}
      permissions={permissions} source="database" />);

    const card = screen.getByRole('complementary');
    const sale = within(card).getByRole('region', { name: status === 'SALE_OPEN' ? 'Venda em aberto' : 'Venda confirmada' });
    expect(sale.compareDocumentPosition(within(card).getByRole('button', { name: 'Expandir detalhes do módulo' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(card).getByText('Valores oficiais 2028')).not.toBeVisible();
    if (status === 'SALE_OPEN') {
      expect(sale).toHaveAttribute('data-can-manage-sales', 'false');
      expect(within(sale).getByRole('button', { name: 'Confirmar contrato assinado' })).toBeDisabled();
    } else {
      expect(within(sale).getByText('BOLEIROS E GIRLS STORE')).toBeInTheDocument();
    }

    fireEvent.click(within(card).getByRole('button', { name: 'Expandir detalhes do módulo' }));
    expect(within(card).getByText('Valores oficiais 2028')).toBeVisible();
  });
});