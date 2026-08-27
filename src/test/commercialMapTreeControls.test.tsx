import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CommercialMapTopBar } from '@/features/commercial-map/components/controls/CommercialMapTopBar';
import { MapToolbar } from '@/features/commercial-map/components/controls/MapToolbar';
import { LayersPanel } from '@/features/commercial-map/components/panels/MapPanels';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import type { CommercialMapAreaScope } from '@/features/commercial-map/utils/areaScope';
import type { MapPermissions } from '@/features/commercial-map/types';

vi.mock('@/features/commercial-map/hooks/useCommercialMap', () => ({
  useLotActivity: vi.fn(),
  useLotContractVersions: vi.fn(),
  useMapMutations: () => ({
    layerLock: {
      isPending: false,
      mutate: vi.fn(),
    },
  }),
}));

const permissions: MapPermissions = {
  canView: true,
  canEdit: false,
  canEditGeometry: false,
  canManageLots: false,
  canManageSales: false,
  canManageContracts: false,
  canManageLayers: false,
  isMapAdmin: false,
};

function renderToolbar(areaScope: CommercialMapAreaScope = 'park') {
  return render(
    <TooltipProvider>
      <MapToolbar
        permissions={permissions}
        hasSelection={false}
        areaScope={areaScope}
        showDesktopControls
      />
    </TooltipProvider>,
  );
}

function renderTopBar(areaScope: CommercialMapAreaScope = 'park') {
  return render(
    <TooltipProvider>
      <CommercialMapTopBar
        permissions={permissions}
        hasSelection={false}
        areaScope={areaScope}
        isCommissionScope={areaScope !== 'park'}
      />
    </TooltipProvider>,
  );
}

describe('controle de visibilidade do ambiente e da rede elétrica', () => {
  beforeEach(() => {
    useCommercialMapStore.setState({
      treesVisible: true,
      activePanel: null,
      workspaceMode: '3d',
      search: '',
    });
  });

  it('oferece um toggle PT-BR com estado acessível no mapa completo', () => {
    renderToolbar();
    const toggle = screen.getByRole('button', { name: 'Ocultar árvores e rede elétrica' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(toggle, { key: 'Enter' });
    fireEvent.click(toggle);

    expect(useCommercialMapStore.getState().treesVisible).toBe(false);
    expect(screen.getByRole('button', { name: 'Exibir árvores e rede elétrica' }))
      .toHaveAttribute('aria-pressed', 'false');
  });

  it('reutiliza o mesmo estado na barra superior de Indústria, Comércio e Serviços', () => {
    useCommercialMapStore.getState().setTreesVisible(false);
    renderTopBar('industria-comercio-servicos');
    const toggle = screen.getByRole('button', { name: 'Exibir árvores e rede elétrica' });
    fireEvent.click(toggle);
    expect(useCommercialMapStore.getState().treesVisible).toBe(true);
    expect(screen.getByRole('button', { name: 'Ocultar árvores e rede elétrica' })).toBeInTheDocument();
  });

  it('expõe o mesmo controle combinado no painel de camadas', () => {
    render(
      <LayersPanel
        layers={[]}
        entities={OFFICIAL_REFERENCE_DATA.entities}
        lots={OFFICIAL_REFERENCE_DATA.lots}
        permissions={permissions}
      />,
    );

    expect(screen.getByText('Árvores e rede elétrica')).toBeInTheDocument();
    expect(screen.getByText(
      /240 árvores · 408 postes · 20 transformadores · 325 trechos de fiação aérea/,
    )).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'Árvores e rede elétrica' });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);

    expect(useCommercialMapStore.getState().treesVisible).toBe(false);
    expect(toggle).not.toBeChecked();
  });

  it('oferece o controle nos segmentos em que a rede elétrica está presente', () => {
    const exporuralToolbar = renderToolbar('exporural');
    expect(screen.getByRole('button', { name: 'Ocultar árvores e rede elétrica' })).toBeInTheDocument();
    exporuralToolbar.unmount();

    const automotiveTopBar = renderTopBar('espaco-automovel');
    expect(screen.getByRole('button', { name: 'Ocultar árvores e rede elétrica' })).toBeInTheDocument();
    automotiveTopBar.unmount();
  });
});
