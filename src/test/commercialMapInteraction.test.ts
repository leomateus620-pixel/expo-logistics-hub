import { beforeEach, describe, expect, it } from 'vitest';
import {
  CAMERA_NAVIGATION_MIN_DELTA,
  MAP_CLICK_MAX_DELTA,
  isCameraNavigationMovement,
  isMapSelectionClick,
  isSelectableMapClassification,
  selectionFocusProfile,
} from '@/features/commercial-map/utils/interaction';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';

describe('pipeline de seleção do mapa comercial', () => {
  beforeEach(() => {
    useCommercialMapStore.setState({
      selectedEntityId: null,
      interiorEntityId: null,
      interiorReturnView: null,
      hoveredEntityId: null,
      search: '',
      statusFilters: [],
      classificationFilters: [],
      locationFilter: null,
      verificationFilters: [],
      sortOrder: 'relevance',
      activePanel: null,
      workspaceMode: '3d',
      cameraNavigating: false,
    });
  });

  it('aceita clique normal e rejeita deslocamento de arraste', () => {
    expect(isMapSelectionClick(0)).toBe(true);
    expect(isMapSelectionClick(MAP_CLICK_MAX_DELTA)).toBe(true);
    expect(isMapSelectionClick(MAP_CLICK_MAX_DELTA + 0.01)).toBe(false);
  });

  it('só suspende hover depois que a câmera realmente se move', () => {
    expect(isCameraNavigationMovement(CAMERA_NAVIGATION_MIN_DELTA / 2, 0)).toBe(false);
    expect(isCameraNavigationMovement(CAMERA_NAVIGATION_MIN_DELTA, 0)).toBe(true);
    expect(isCameraNavigationMovement(0, CAMERA_NAVIGATION_MIN_DELTA * 2)).toBe(true);
  });

  it('mantém quadras e estruturas selecionáveis sem transformar vias em alvos', () => {
    expect(isSelectableMapClassification('SELLABLE_LOT')).toBe(true);
    expect(isSelectableMapClassification('QUADRA')).toBe(true);
    expect(isSelectableMapClassification('PAVILION')).toBe(true);
    expect(isSelectableMapClassification('LANDMARK')).toBe(true);
    expect(isSelectableMapClassification('ROAD')).toBe(false);
    expect(isSelectableMapClassification('PEDESTRIAN_PATH')).toBe(false);
  });

  it('abre detalhes, troca rapidamente e fecha a seleção de forma determinística', () => {
    const select = useCommercialMapStore.getState().setSelectedEntityId;
    select('entity:lot-1');
    expect(useCommercialMapStore.getState()).toMatchObject({ selectedEntityId: 'entity:lot-1', activePanel: 'details' });

    select('entity:pavilion-1');
    expect(useCommercialMapStore.getState()).toMatchObject({ selectedEntityId: 'entity:pavilion-1', activePanel: 'details' });

    select(null);
    expect(useCommercialMapStore.getState()).toMatchObject({ selectedEntityId: null, activePanel: null });
  });

  it('mantém o estado comercial independente da navegação da câmera', () => {
    useCommercialMapStore.getState().setCameraNavigating(true);
    useCommercialMapStore.getState().setSelectedEntityId('entity:quadra-n');

    expect(useCommercialMapStore.getState()).toMatchObject({
      cameraNavigating: true,
      selectedEntityId: 'entity:quadra-n',
      activePanel: 'details',
    });
  });

  it('leva seleções do explorador ao mapa, abre detalhes e solicita novo foco', () => {
    const initialSequence = useCommercialMapStore.getState().cameraSequence;
    useCommercialMapStore.setState({ workspaceMode: 'list', search: 'Quadra S', statusFilters: ['BLOCKED'] });

    useCommercialMapStore.getState().selectEntityFromExplorer('entity:lot-s-36');

    expect(useCommercialMapStore.getState()).toMatchObject({
      selectedEntityId: 'entity:lot-s-36',
      activePanel: 'details',
      workspaceMode: '3d',
      cameraSequence: initialSequence + 1,
      search: 'Quadra S',
      statusFilters: ['BLOCKED'],
    });
  });

  it('entra e sai do interior preservando seleção, painel e retorno de câmera', () => {
    const initialSequence = useCommercialMapStore.getState().cameraSequence;

    useCommercialMapStore.getState().enterInterior('reference:2026:b12');
    expect(useCommercialMapStore.getState()).toMatchObject({
      selectedEntityId: 'reference:2026:b12',
      interiorEntityId: 'reference:2026:b12',
      hoveredEntityId: null,
      activePanel: null,
      workspaceMode: '3d',
      cameraSequence: initialSequence + 1,
    });

    const returnView = {
      position: [12, 8, 19] as [number, number, number],
      target: [-4, 1, -9] as [number, number, number],
    };
    useCommercialMapStore.getState().setInteriorReturnView(returnView);
    useCommercialMapStore.getState().exitInterior();
    expect(useCommercialMapStore.getState()).toMatchObject({
      selectedEntityId: 'reference:2026:b12',
      interiorEntityId: null,
      activePanel: 'details',
      workspaceMode: '3d',
      cameraSequence: initialSequence + 2,
      interiorReturnView: returnView,
    });

    useCommercialMapStore.getState().enterInterior('reference:2026:b12');
    useCommercialMapStore.getState().setSelectedEntityId('reference:2026:b11');
    expect(useCommercialMapStore.getState()).toMatchObject({
      selectedEntityId: 'reference:2026:b11',
      interiorEntityId: null,
      activePanel: 'details',
    });
  });

  it('aceita a inspeção de B9 sem alterar o contrato genérico de seleção', () => {
    useCommercialMapStore.getState().enterInterior('reference:2026:b9');

    expect(useCommercialMapStore.getState()).toMatchObject({
      selectedEntityId: 'reference:2026:b9',
      interiorEntityId: 'reference:2026:b9',
      activePanel: null,
      workspaceMode: '3d',
    });
  });

  it('limpa todos os filtros sem perder seleção ou preferência de densidade', () => {
    useCommercialMapStore.setState({
      selectedEntityId: 'entity:lot-1',
      search: 'empresa',
      statusFilters: ['AVAILABLE'],
      classificationFilters: ['SELLABLE_LOT'],
      locationFilter: 'block:S',
      verificationFilters: ['VERIFIED'],
      sortOrder: 'status',
      tableDensity: 'compact',
    });

    useCommercialMapStore.getState().clearExplorerFilters();

    expect(useCommercialMapStore.getState()).toMatchObject({
      selectedEntityId: 'entity:lot-1',
      search: '',
      statusFilters: [],
      classificationFilters: [],
      locationFilter: null,
      verificationFilters: [],
      sortOrder: 'relevance',
      tableDensity: 'compact',
    });
  });
});

describe('enquadramento contextual por tipo de entidade', () => {
  it('preserva mais contexto para quadras, estacionamentos e arenas do que para lotes', () => {
    const lot = selectionFocusProfile('SELLABLE_LOT');
    const quadra = selectionFocusProfile('QUADRA');
    const pavilion = selectionFocusProfile('PAVILION');
    const parking = selectionFocusProfile('PARKING');

    expect(quadra.contextRatio).toBeGreaterThan(lot.contextRatio);
    expect(pavilion.contextRatio).toBeGreaterThan(lot.contextRatio);
    expect(parking.contextRatio).toBeGreaterThan(quadra.contextRatio);
    expect(lot.fitPadding).toBeGreaterThan(parking.fitPadding);
    expect(parking.maxDistanceRatio).toBeGreaterThan(pavilion.maxDistanceRatio);
  });
});
