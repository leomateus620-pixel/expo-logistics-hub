import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MapToolbar } from '@/features/commercial-map/components/controls/MapToolbar';
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

function renderToolbar(areaScope: 'park' | 'exporural' | 'industria-comercio-servicos' | 'espaco-automovel' = 'park') {
  return render(
    <TooltipProvider>
      <MapToolbar permissions={permissions} hasSelection={false} areaScope={areaScope} />
    </TooltipProvider>,
  );
}

describe('controle de visibilidade das árvores', () => {
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
    const toggle = screen.getByRole('button', { name: 'Ocultar árvores' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(toggle, { key: 'Enter' });
    fireEvent.click(toggle);

    expect(useCommercialMapStore.getState().treesVisible).toBe(false);
    expect(screen.getByRole('button', { name: 'Exibir árvores' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reutiliza exatamente o mesmo estado no mapa de Indústria, Comércio e Serviços', () => {
    useCommercialMapStore.getState().setTreesVisible(false);
    renderToolbar('industria-comercio-servicos');
    const toggle = screen.getByRole('button', { name: 'Exibir árvores' });
    fireEvent.click(toggle);
    expect(useCommercialMapStore.getState().treesVisible).toBe(true);
    expect(screen.getByRole('button', { name: 'Ocultar árvores' })).toBeInTheDocument();
  });

  it('não oferece um controle vazio nos segmentos sem árvores', () => {
    renderToolbar('exporural');
    expect(screen.queryByRole('button', { name: /árvores/i })).not.toBeInTheDocument();

    renderToolbar('espaco-automovel');
    expect(screen.queryByRole('button', { name: /árvores/i })).not.toBeInTheDocument();
  });
});
