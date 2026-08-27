import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParkingInspector, type ParkingInspectorBlock } from '@/features/commercial-map/components/panels/ParkingInspector';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';

const blocks: ParkingInspectorBlock[] = [
  { id: 'A1', label: 'A1', group: 'A', rows: [{ id: 'A1-1' }], spaces: [{ id: 'A1-1-001' }] },
  { id: 'B1', label: 'B1', group: 'B', rows: [{ id: 'B1-1' }, { id: 'B1-2' }], spaces: [{ id: 'B1-1-001' }, { id: 'B1-2-001' }] },
  { id: 'C01', label: 'C01', group: 'C', rows: [{ id: 'C01-1' }], spaces: [{ id: 'C01-1-001' }] },
];

beforeEach(() => {
  useCommercialMapStore.setState(useCommercialMapStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('inspeção cartográfica do estacionamento', () => {
  it('oferece entrada compacta, select agrupado e vistas com estado acessível', () => {
    render(<ParkingInspector blocks={blocks} />);
    const launcher = screen.getByRole('button', { name: 'Inspecionar estacionamento posterior' });
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    fireEvent.click(launcher);

    const select = screen.getByRole('combobox', { name: 'Selecionar bloco do estacionamento' });
    expect(select).toHaveFocus();
    expect(screen.getByRole('group', { name: 'Setor A' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Setor B' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Setor C' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visão geral do estacionamento' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Aproximar bloco ou vaga selecionada' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('ocupação não informada');

    fireEvent.change(select, { target: { value: 'B1' } });
    expect(useCommercialMapStore.getState().selectedParkingBlockId).toBe('B1');
    expect(screen.getByRole('button', { name: 'Aproximar bloco ou vaga selecionada' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Vista aérea do estacionamento' }));
    expect(useCommercialMapStore.getState().parkingCameraView).toBe('aerial');
    expect(useCommercialMapStore.getState().selectedParkingBlockId).toBe('B1');

    fireEvent.click(screen.getByRole('button', { name: 'Visão geral do estacionamento' }));
    expect(useCommercialMapStore.getState().selectedParkingBlockId).toBeNull();
    expect(select).toHaveValue('');
  });

  it('apresenta dados somente da seleção sem declarar vagas disponíveis', () => {
    useCommercialMapStore.getState().inspectParkingSpace('B1', 'B1-2-001');
    render(<ParkingInspector blocks={blocks} />);
    expect(screen.getByRole('status')).toHaveTextContent('Vaga B1-2-001 · ocupação não informada');
    fireEvent.click(screen.getByRole('button', { name: 'Ver dados e referências do estacionamento' }));

    expect(screen.getByText('Vagas mapeadas')).toBeInTheDocument();
    expect(screen.getByText(/Vagas mapeadas não indicam ocupação, reserva ou disponibilidade comercial/)).toBeInTheDocument();
    expect(screen.getByText(/Geometria dos anexos 4–6/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Vistas do estacionamento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reservar|comprar|disponível/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Voltar às vistas do estacionamento' }));
    expect(screen.getByRole('group', { name: 'Vistas do estacionamento' })).toBeInTheDocument();
    expect(useCommercialMapStore.getState().selectedParkingSpaceId).toBe('B1-2-001');
  });

  it('fecha por Escape e devolve foco sem mover a câmera ou interceptar gestos do canvas', () => {
    render(<ParkingInspector blocks={blocks} />);
    fireEvent.click(screen.getByRole('button', { name: 'Inspecionar estacionamento posterior' }));
    const sequence = useCommercialMapStore.getState().parkingCameraSequence;
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Inspecionar estacionamento posterior' })).toHaveFocus();
    expect(useCommercialMapStore.getState().parkingInspectionOpen).toBe(false);
    expect(useCommercialMapStore.getState().parkingCameraSequence).toBe(sequence);
    expect(useCommercialMapStore.getState().cameraSequence).toBe(0);
  });

  it('não apresenta interface substituta quando não há blocos da fonte', () => {
    const { container } = render(<ParkingInspector blocks={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('estado efêmero de estacionamento e compatibilidade com o mapa comercial', () => {
  it('abre seleção atomicamente, preserva filtros e nunca grava em storage', () => {
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    useCommercialMapStore.setState({
      selectedEntityId: 'commercial-lot',
      interiorEntityId: 'pavilion',
      interiorReturnView: { position: [1, 2, 3], target: [0, 0, 0] },
      selectedModuleId: 'module',
      selectedHydrologicalElementId: 'water-node',
      hydrologicalModeActive: true,
      search: 'preservar consulta',
      statusFilters: ['AVAILABLE'],
      treesVisible: false,
      labelsVisible: false,
      cameraSequence: 8,
    });
    const transitions: string[] = [];
    const unsubscribe = useCommercialMapStore.subscribe((state) => transitions.push(state.selectedParkingSpaceId ?? 'none'));

    act(() => useCommercialMapStore.getState().inspectParkingSpace('B1', 'B1-2-001'));
    const state = useCommercialMapStore.getState();
    expect(transitions).toEqual(['B1-2-001']);
    expect(state).toMatchObject({
      selectedParkingBlockId: 'B1', selectedParkingSpaceId: 'B1-2-001', parkingInspectionOpen: true,
      parkingCameraView: 'detail', parkingCameraSequence: 1, cameraSequence: 8,
      selectedEntityId: null, interiorEntityId: null, interiorReturnView: null, selectedModuleId: null,
      hydrologicalModeActive: false, selectedHydrologicalElementId: null,
      search: 'preservar consulta', statusFilters: ['AVAILABLE'], treesVisible: false, labelsVisible: false,
    });
    expect(storageSpy).not.toHaveBeenCalled();
    unsubscribe();
  });

  it.each([
    ['entidade comercial', () => useCommercialMapStore.getState().setSelectedEntityId('lot')],
    ['explorador', () => useCommercialMapStore.getState().selectEntityFromExplorer('lot')],
    ['entrada de pavilhão', () => useCommercialMapStore.getState().enterInterior('B5')],
    ['conector de pavilhão', () => useCommercialMapStore.getState().switchInterior('B6')],
    ['saída de pavilhão', () => useCommercialMapStore.getState().exitInterior()],
    ['nova comissão', () => useCommercialMapStore.getState().activateScope('commission:test', 'exporural')],
    ['segmento', () => useCommercialMapStore.getState().requestSegmentFocus('industria-comercio-servicos')],
    ['limpeza de segmento', () => useCommercialMapStore.getState().clearSegmentFocus()],
    ['câmera geral', () => useCommercialMapStore.getState().requestCameraPreset('overview')],
    ['foco comercial', () => useCommercialMapStore.getState().focusSelection()],
    ['lista', () => useCommercialMapStore.getState().setWorkspaceMode('list')],
    ['modo hidrológico', () => useCommercialMapStore.getState().setHydrologicalModeActive(true)],
    ['elemento hidrológico', () => useCommercialMapStore.getState().setSelectedHydrologicalElementId('node')],
    ['painel de camadas', () => useCommercialMapStore.getState().setActivePanel('layers')],
  ])('limpa estacionamento ao navegar para %s', (_name, navigate) => {
    useCommercialMapStore.getState().inspectParkingSpace('B1', 'B1-2-001');
    navigate();
    expect(useCommercialMapStore.getState()).toMatchObject({
      parkingInspectionOpen: false, selectedParkingBlockId: null, selectedParkingSpaceId: null,
    });
  });

  it('retorna à planta completa e limpa vaga antiga ao selecionar outro bloco', () => {
    useCommercialMapStore.getState().inspectParkingSpace('B1', 'B1-2-001');
    useCommercialMapStore.getState().inspectParkingBlock('A1');
    expect(useCommercialMapStore.getState().selectedParkingSpaceId).toBeNull();
    expect(useCommercialMapStore.getState().selectedParkingBlockId).toBe('A1');
    useCommercialMapStore.getState().requestParkingView('overview');
    expect(useCommercialMapStore.getState().selectedParkingBlockId).toBeNull();
    expect(useCommercialMapStore.getState().parkingInspectionOpen).toBe(true);
    useCommercialMapStore.getState().setParkingInspectionOpen(false);
    useCommercialMapStore.getState().setParkingInspectionOpen(true);
    expect(useCommercialMapStore.getState().parkingCameraView).toBe('overview');
  });
});
