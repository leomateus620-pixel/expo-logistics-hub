import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GastronomyStructurePanel } from '@/features/commercial-map/components/panels/GastronomyStructurePanel';
import { OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS } from '@/features/commercial-map/data/officialReference2026';
import type { LotContractHistoryDocument } from '@/features/commercial-map/services/commercialMapService';
import type { CommercialLot } from '@/features/commercial-map/types';

const useLotContractHistory = vi.hoisted(() => vi.fn());
vi.mock('@/features/commercial-map/hooks/useCommercialMap', () => ({ useLotContractHistory }));
vi.mock('@/features/commercial-map/sales/components/SaleOpenSection', () => ({ SaleOpenSection: () => null }));
vi.mock('@/features/commercial-map/components/commercial/LotContractFileButton', () => ({
  LotContractFileButton: ({ children }: { children: string }) => <button type="button">{children}</button>,
}));
vi.mock('@/features/commercial-map/components/commercial/LotWorkflowDialog', () => ({
  LotWorkflowDialog: ({ lot, contractTarget }: { lot: CommercialLot; contractTarget: { saleId: string; mode: string } }) => (
    <div role="dialog">{lot.publicIdentifier} · {contractTarget.saleId} · {contractTarget.mode}</div>
  ),
}));

const structure = OFFICIAL_REFERENCE_ENTITIES.find(({ publicIdentifier }) => publicIdentifier === 'C2')!;
const points = ['Restaurante Central', 'Pizzaria'].map((name, index) => {
  const id = `GAST-C2-0${index + 1}`;
  return {
    entity: { ...structure, id, name, classification: 'FOOD_POINT' as const, parentEntityId: structure.id },
    lot: { ...OFFICIAL_REFERENCE_LOTS[0], id, entityId: id, publicIdentifier: id, displayName: name, status: 'SALE_OPEN' as const },
  };
});
const mapData = { lots: points.map(({ lot }) => lot), entities: [structure, ...points.map(({ entity }) => entity)] };
const canManage = { canManageSales: true, canManageContracts: true };
const file = {
  id: 'version', version: 1, storagePath: 'private/central.pdf', originalName: 'central.pdf', mimeType: 'application/pdf',
  fileSize: 64, uploadedAt: '2026-11-12T22:10:00.000Z', supersededAt: null,
};
const document: LotContractHistoryDocument = {
  contractId: 'contract', scope: 'LOT', contractNumber: '2028-11', activeVersion: 1, createdAt: file.uploadedAt,
  lotIds: [points[0].lot.id], versions: [file], saleId: 'central-sale', orderId: 'central-order', isCurrent: true,
};

function pointResponse(overrides: Partial<{
  saleId: string | null; orderId: string | null; canUpload: boolean; documentsAccessible: boolean;
  contracts: LotContractHistoryDocument[];
}> = {}) {
  return { data: {
    saleId: 'central-sale', orderId: 'central-order', canUpload: false, documentsAccessible: true,
    contracts: [], history: [], canViewHistory: true, ...overrides,
  } };
}

function panel(permissions = canManage) {
  return <GastronomyStructurePanel structure={structure} points={points} canSell={permissions.canManageSales}
    permissions={permissions} mapData={mapData} onClose={() => {}} />;
}

function expand(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
}

beforeEach(() => useLotContractHistory.mockReset());
afterEach(cleanup);

describe('contratos no card de um ponto de Gastronomia', () => {
  it('carrega o ponto expandido e exibe a anexação assim que a venda é elegível no servidor', () => {
    useLotContractHistory.mockReturnValue(pointResponse());
    const view = render(panel());
    expect(useLotContractHistory).not.toHaveBeenCalled();
    expand('Restaurante Central');
    expect(useLotContractHistory).toHaveBeenLastCalledWith('GAST-C2-01');
    expect(screen.getByText('Nenhum contrato vigente anexado.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Anexar contrato' })).not.toBeInTheDocument();

    useLotContractHistory.mockReturnValue(pointResponse({ canUpload: true }));
    view.rerender(panel());
    fireEvent.click(screen.getByRole('button', { name: 'Anexar contrato' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('GAST-C2-01 · central-sale · upload');

    useLotContractHistory.mockReturnValue(pointResponse({ canUpload: true, saleId: 'pizza-sale', orderId: 'pizza-order' }));
    expand('Pizzaria');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useLotContractHistory).toHaveBeenLastCalledWith('GAST-C2-02');
    fireEvent.click(screen.getByRole('button', { name: 'Anexar contrato' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('GAST-C2-02 · pizza-sale · upload');
  });

  it('mantém versões antigas no histórico da origem e exige permissão para exibir arquivos', () => {
    useLotContractHistory.mockReturnValue(pointResponse({ contracts: [{ ...document, isCurrent: false }] }));
    const view = render(panel());
    expand('Restaurante Central');
    const current = screen.getByRole('region', { name: 'Contratos do ponto' });
    expect(within(current).queryByText('central.pdf')).not.toBeInTheDocument();
    expect(within(current).queryByRole('button', { name: 'Substituir contrato' })).not.toBeInTheDocument();
    const details = screen.getByText('Histórico de contratos').closest('details')!;
    fireEvent.click(within(details).getByText('Histórico de contratos'));
    expect(within(details).getByText('PV-CENTRAL-')).toBeVisible();
    expect(within(details).getByText('central.pdf')).toBeVisible();

    view.rerender(panel({ ...canManage, canManageContracts: false }));
    expect(screen.queryByText('central.pdf')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir contrato' })).not.toBeInTheDocument();
  });
});
