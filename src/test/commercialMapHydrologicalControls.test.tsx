import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CommercialMapTopBar } from '@/features/commercial-map/components/controls/CommercialMapTopBar';
import { MapToolbar } from '@/features/commercial-map/components/controls/MapToolbar';
import { HydrologicalNetworkLegend } from '@/features/commercial-map/components/panels/HydrologicalNetworkLegend';
import { HYDROLOGICAL_NODES } from '@/features/commercial-map/data/hydrologicalInfrastructure';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import type { MapPermissions } from '@/features/commercial-map/types';

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

function renderTopBar() {
  return render(
    <TooltipProvider>
      <CommercialMapTopBar
        permissions={permissions}
        hasSelection
        areaScope="park"
        isCommissionScope={false}
      />
    </TooltipProvider>,
  );
}

function renderMobileToolbar() {
  return render(
    <TooltipProvider>
      <MapToolbar
        permissions={permissions}
        hasSelection={false}
        areaScope="park"
      />
    </TooltipProvider>,
  );
}

describe('controles do modo Rede Hidrológica', () => {
  beforeEach(() => {
    useCommercialMapStore.setState({
      hydrologicalModeActive: false,
      selectedHydrologicalElementId: null,
      selectedEntityId: 'entity-commercial',
      interiorEntityId: null,
      hoveredEntityId: 'entity-hovered',
      hoveredModuleId: 'module-hovered',
      selectedModuleId: 'module-selected',
      activePanel: 'details',
      workspaceMode: '3d',
      treesVisible: false,
      labelsVisible: false,
    });
  });

  it('inicia desligado e ativa pela barra desktop sem alterar árvores ou rótulos', () => {
    renderTopBar();

    const toggle = screen.getByRole('button', { name: 'Ativar modo Rede Hidrológica' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);

    const state = useCommercialMapStore.getState();
    expect(state.hydrologicalModeActive).toBe(true);
    expect(state.selectedEntityId).toBeNull();
    expect(state.hoveredEntityId).toBeNull();
    expect(state.hoveredModuleId).toBeNull();
    expect(state.selectedModuleId).toBeNull();
    expect(state.activePanel).toBeNull();
    expect(state.treesVisible).toBe(false);
    expect(state.labelsVisible).toBe(false);
    expect(screen.getByRole('button', { name: 'Sair do modo Rede Hidrológica' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  it('expõe o ícone direto no controle mobile e limpa a inspeção ao desativar', () => {
    useCommercialMapStore.setState({
      hydrologicalModeActive: true,
      selectedHydrologicalElementId: 'hydro-selection',
      cameraSequence: 8,
    });
    renderMobileToolbar();

    const toggle = screen.getByRole('button', { name: 'Sair do modo Rede Hidrológica' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);

    expect(useCommercialMapStore.getState().hydrologicalModeActive).toBe(false);
    expect(useCommercialMapStore.getState().selectedHydrologicalElementId).toBeNull();
    expect(useCommercialMapStore.getState().cameraSequence).toBe(9);
    expect(screen.getByRole('button', { name: 'Ativar modo Rede Hidrológica' }))
      .toHaveAttribute('aria-pressed', 'false');
  });

  it('apresenta legenda técnica PT-BR e inspeciona a ENTRADA CORSAN', () => {
    const corsanEntry = HYDROLOGICAL_NODES.find((node) => node.type === 'corsan_entry');
    expect(corsanEntry).toBeDefined();
    if (!corsanEntry) throw new Error('Dataset sem o nó obrigatório ENTRADA CORSAN');

    render(<HydrologicalNetworkLegend />);

    expect(screen.getByRole('complementary', { name: 'Legenda técnica da Rede Hidrológica' }))
      .toBeInTheDocument();
    expect(screen.getByText('Distribuição de menor vazão')).toBeInTheDocument();
    expect(screen.getByText('Rede principal de hidrantes')).toBeInTheDocument();
    expect(screen.getByText('ENTRADA CORSAN')).toBeInTheDocument();

    act(() => useCommercialMapStore.getState().setSelectedHydrologicalElementId(corsanEntry.id));

    const inspector = screen.getByLabelText('Ponto hidráulico selecionado');
    expect(within(inspector).getByText(corsanEntry.label)).toBeInTheDocument();
    expect(within(inspector).getAllByText('Entrada CORSAN')).toHaveLength(2);

    fireEvent.click(within(inspector).getByRole('button', { name: 'Fechar inspeção do ponto hidráulico' }));
    expect(useCommercialMapStore.getState().selectedHydrologicalElementId).toBeNull();
  });

  it('marca o shell dedicado e substitui a legenda comercial somente durante o modo hídrico', () => {
    const page = readFileSync(
      resolve('src/features/commercial-map/CommercialMapPage.tsx'),
      'utf8',
    );

    expect(page).toContain("hydrologicalModeActive ? 'is-hydrological-mode' : ''");
    expect(page).toMatch(
      /\{hydrologicalModeActive\s*\? <HydrologicalNetworkLegend \/>\s*: <StatusLegend scope=\{areaScope\} \/>\}/,
    );
  });
});
