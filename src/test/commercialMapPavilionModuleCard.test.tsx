import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PavilionModuleCard } from '@/features/commercial-map/components/panels/PavilionModuleCard';
import { OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS } from '@/features/commercial-map/data/officialReference2026';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import type { MapPermissions } from '@/features/commercial-map/types';
import { COMMERCIAL_PAVILION_MODULE_PLANS } from '@/features/commercial-map/utils/commercialPavilionModules';

const mutation = { isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() };

vi.mock('@/features/commercial-map/hooks/useCommercialMap', () => ({
  useMapMutations: () => ({
    lotUpdate: mutation,
    lotAvailability: mutation,
    reservation: mutation,
    negotiation: mutation,
    sale: mutation,
    contract: mutation,
  }),
}));

vi.mock('@/hooks/useCurrentOrg', () => ({
  useCurrentOrg: () => ({ orgId: 'org-test' }),
}));

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

const pavilion = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'B6')!;
const referenceEntity = OFFICIAL_REFERENCE_ENTITIES.find((entity) => entity.publicIdentifier === 'B6-M048')!;
const referenceLot = OFFICIAL_REFERENCE_LOTS.find((lot) => lot.entityId === referenceEntity.id)!;

describe('cartão operacional do módulo interno', () => {
  beforeEach(() => {
    useCommercialMapStore.getState().setSelectedModuleId('B6:module:048');
  });

  it('não converte a área modular total em medida individual', () => {
    render(
      <PavilionModuleCard
        plan={COMMERCIAL_PAVILION_MODULE_PLANS.B6}
        pavilion={pavilion}
        entities={[pavilion, referenceEntity]}
        lots={[referenceLot]}
        permissions={permissions}
        source="official-reference"
        onSynchronize={vi.fn()}
      />,
    );

    const card = screen.getByRole('complementary', { name: /Módulo 48 do Pavilhão 3/i });
    expect(within(card).getByText('Área individual')).toBeInTheDocument();
    expect(within(card).getByText('Não informada')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('663 m²');
    expect(within(card).getByText('Sem vínculo')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Sincronizar módulos' })).toBeInTheDocument();
  });

  it('oferece somente operações válidas para um módulo disponível e persistido', () => {
    const persistedEntity = { ...referenceEntity, id: '00000000-0000-0000-0000-000000000048' };
    const persistedLot = {
      ...referenceLot,
      id: '10000000-0000-0000-0000-000000000048',
      entityId: persistedEntity.id,
      status: 'AVAILABLE' as const,
      updatedAt: '2026-08-23T12:00:00.000Z',
    };

    render(
      <PavilionModuleCard
        plan={COMMERCIAL_PAVILION_MODULE_PLANS.B6}
        pavilion={pavilion}
        entities={[pavilion, persistedEntity]}
        lots={[persistedLot]}
        permissions={permissions}
        source="database"
      />,
    );

    const actions = screen.getByLabelText('Operações comerciais do módulo');
    expect(within(actions).getByRole('button', { name: /Editar/i })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: /Situação/i })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: /Reservar/i })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: /Negociar/i })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: /Vender/i })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: /Contrato/i })).toBeInTheDocument();
  });

  it('não oferece venda direta enquanto o módulo permanece bloqueado', () => {
    const persistedEntity = { ...referenceEntity, id: '00000000-0000-0000-0000-000000000148' };
    const persistedLot = {
      ...referenceLot,
      id: '10000000-0000-0000-0000-000000000148',
      entityId: persistedEntity.id,
      status: 'BLOCKED' as const,
      updatedAt: '2026-08-23T12:00:00.000Z',
    };

    render(
      <PavilionModuleCard
        plan={COMMERCIAL_PAVILION_MODULE_PLANS.B6}
        pavilion={pavilion}
        entities={[pavilion, persistedEntity]}
        lots={[persistedLot]}
        permissions={permissions}
        source="database"
      />,
    );

    const actions = screen.getByLabelText('Operações comerciais do módulo');
    expect(within(actions).getByRole('button', { name: /Situação/i })).toBeInTheDocument();
    expect(within(actions).queryByRole('button', { name: /Reservar|Negociar|Vender/i })).not.toBeInTheDocument();
  });
});
