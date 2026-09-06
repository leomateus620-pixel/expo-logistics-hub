import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapListView } from '@/features/commercial-map/components/panels/EntityExplorer';
import { useMapEntityFilter } from '@/features/commercial-map/hooks/useCommercialMap';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';

const permissions = { canView: true, canEdit: false, canEditGeometry: false, canManageLots: false, canManageSales: false, canManageContracts: false, canManageLayers: false, isMapAdmin: false };
function Harness() {
  const explorer = useMapEntityFilter(OFFICIAL_REFERENCE_DATA.entities, OFFICIAL_REFERENCE_DATA.lots);
  return <MapListView explorer={explorer} permissions={permissions} />;
}

beforeEach(() => {
  useCommercialMapStore.setState(useCommercialMapStore.getInitialState(), true);
  Element.prototype.scrollIntoView = vi.fn();
});
describe('tabela comercial com trabalho de DOM limitado', () => {
  it('abre a página do registro selecionado ao retornar à tabela', () => {
    const selected = OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.publicIdentifier === 'B2-M186')!;
    useCommercialMapStore.setState({ selectedEntityId: selected.id });
    render(<Harness />);
    expect(screen.getByRole('row', { selected: true })).toHaveTextContent('B2-M186');
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled();
    expect(screen.getAllByRole('row').length).toBeLessThanOrEqual(51);
  });
  it('mantém no máximo 50 linhas e pesquisa o índice inteiro depois de mudar de página', async () => {
    render(<Harness />);
    expect(screen.getAllByRole('row')).toHaveLength(51);
    const firstPage = screen.getAllByRole('row')[1].textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(screen.getAllByRole('row')).toHaveLength(51);
    expect(screen.getAllByRole('row')[1].textContent).not.toBe(firstPage);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar entidades do parque' }), { target: { value: 'B2-M186' } });
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2));
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('B2-M186');
    expect(screen.queryByRole('navigation', { name: 'Páginas de entidades' })).not.toBeInTheDocument();
  }, 15_000);
});
