import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PavilionModuleCard } from '@/features/commercial-map/components/panels/PavilionModuleCard';
import { OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS } from '@/features/commercial-map/data/officialReference2026';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import type { MapPermissions } from '@/features/commercial-map/types';
import { COMMERCIAL_PAVILION_MODULE_PLANS } from '@/features/commercial-map/utils/commercialPavilionModules';

const mutation = { isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() };
const contractsQuery: {
  isLoading: boolean;
  isError: boolean;
  data: Array<{
    id: string;
    signedUrl: string;
    originalName: string;
    version: number;
    supersededAt: string | null;
  }>;
} = { isLoading: false, isError: false, data: [] };

vi.mock('@/features/commercial-map/hooks/useCommercialMap', () => ({
  useLotContractVersions: () => contractsQuery,
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
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    useCommercialMapStore.getState().setSelectedModuleId('B6:module:048');
    contractsQuery.isLoading = false;
    contractsQuery.isError = false;
    contractsQuery.data = [];
  });

  it.each([
    { pavilionIdentifier: 'B1' as const, moduleNumber: 58, pavilionNumber: 1 },
    { pavilionIdentifier: 'B2' as const, moduleNumber: 73, pavilionNumber: 14 },
    { pavilionIdentifier: 'B3' as const, moduleNumber: 41, pavilionNumber: 12 },
    { pavilionIdentifier: 'B8' as const, moduleNumber: 81, pavilionNumber: 5 },
  ])('mantém o módulo $pavilionIdentifier neutro e sem área individual inventada', ({
    pavilionIdentifier,
    moduleNumber,
    pavilionNumber,
  }) => {
    const candidatePavilion = OFFICIAL_REFERENCE_ENTITIES.find(
      (entity) => entity.publicIdentifier === pavilionIdentifier,
    )!;
    const publicIdentifier = `${pavilionIdentifier}-M${String(moduleNumber).padStart(3, '0')}`;
    const candidateEntity = OFFICIAL_REFERENCE_ENTITIES.find(
      (entity) => entity.publicIdentifier === publicIdentifier,
    )!;
    const candidateLot = OFFICIAL_REFERENCE_LOTS.find((lot) => lot.entityId === candidateEntity.id)!;
    useCommercialMapStore.getState().setSelectedModuleId(
      `${pavilionIdentifier}:module:${String(moduleNumber).padStart(3, '0')}`,
    );

    render(
      <PavilionModuleCard
        plan={COMMERCIAL_PAVILION_MODULE_PLANS[pavilionIdentifier]}
        pavilion={candidatePavilion}
        entities={[candidatePavilion, candidateEntity]}
        lots={[candidateLot]}
        permissions={permissions}
        source="official-reference"
        onSynchronize={vi.fn()}
      />,
    );

    const card = screen.getByRole('complementary', {
      name: new RegExp(`Módulo ${moduleNumber} do Pavilhão ${pavilionNumber}`, 'i'),
    });
    expect(within(card).getByText('Não informada')).toBeInTheDocument();
    expect(within(card).getByText('Sem vínculo')).toBeInTheDocument();
    expect(card).not.toHaveTextContent(`${COMMERCIAL_PAVILION_MODULE_PLANS[pavilionIdentifier].stats.moduleAreaSquareMeters} m²`);
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
    expect(screen.getByLabelText('Documentos privados do módulo')).toHaveTextContent('Nenhum contrato anexado.');
  });

  it('expõe versões privadas de contrato no próprio cartão do módulo', () => {
    contractsQuery.data = [{
      id: 'contract-version-1',
      signedUrl: 'https://storage.example.test/signed-contract',
      originalName: 'contrato-modulo-048.pdf',
      version: 1,
      supersededAt: null,
    }];
    const persistedEntity = { ...referenceEntity, id: '00000000-0000-0000-0000-000000000248' };
    const persistedLot = {
      ...referenceLot,
      id: '10000000-0000-0000-0000-000000000248',
      entityId: persistedEntity.id,
      status: 'AVAILABLE' as const,
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

    const link = screen.getByRole('link', { name: /contrato-modulo-048\.pdf/i });
    expect(link).toHaveAttribute('href', 'https://storage.example.test/signed-contract');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveTextContent('Versão 1 · ativo');
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
  afterEach(() => vi.unstubAllGlobals());

  it('abre no dock com resumo, expande voluntariamente e descarta formulário ao selecionar outro módulo', () => {
    const persistedEntity = { ...referenceEntity, id: '00000000-0000-0000-0000-000000000348' };
    const persistedLot = {
      ...referenceLot, id: '10000000-0000-0000-0000-000000000348',
      entityId: persistedEntity.id, status: 'AVAILABLE' as const,
    };
    render(
      <PavilionModuleCard embedded plan={COMMERCIAL_PAVILION_MODULE_PLANS.B6} pavilion={pavilion}
        entities={[pavilion, persistedEntity]} lots={[persistedLot]} permissions={permissions} source="database" />,
    );
    const card = screen.getByRole('complementary');
    expect(card).toHaveAttribute('data-sheet-state', 'half');
    expect(within(card).getByText('Área não informada')).toBeVisible();
    expect(within(card).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Recolher detalhes do módulo' })).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Expandir detalhes do módulo' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => useCommercialMapStore.getState().setSelectedModuleId('B6:module:049'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBe(card);
    expect(card).toHaveAttribute('data-sheet-state', 'half');
    expect(card).toHaveTextContent('Módulo 49');
    expect(within(card).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });
});
