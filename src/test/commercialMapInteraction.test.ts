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
import { COMMERCIAL_MAP_SEGMENT_IDS } from '@/features/commercial-map/data/commercialMapSegments';

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
      activeSegmentId: null,
      treesVisible: true,
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
    useCommercialMapStore.getState().switchInterior('reference:2026:b4');
    expect(useCommercialMapStore.getState()).toMatchObject({
      selectedEntityId: 'reference:2026:b4',
      interiorEntityId: 'reference:2026:b4',
      interiorReturnView: returnView,
      activePanel: null,
      cameraSequence: initialSequence + 2,
    });
    useCommercialMapStore.getState().switchInterior('reference:2026:b3');
    expect(useCommercialMapStore.getState()).toMatchObject({
      selectedEntityId: 'reference:2026:b3',
      interiorEntityId: 'reference:2026:b3',
      interiorReturnView: returnView,
      cameraSequence: initialSequence + 3,
    });
    useCommercialMapStore.getState().exitInterior();
    expect(useCommercialMapStore.getState()).toMatchObject({
      selectedEntityId: 'reference:2026:b3',
      interiorEntityId: null,
      activePanel: 'details',
      workspaceMode: '3d',
      cameraSequence: initialSequence + 4,
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
      activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.automotive,
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
      activeSegmentId: null,
    });
  });

  it('mantém o filtro de segmento ao alternar vistas e o limpa somente por ação explícita', () => {
    const initialSequence = useCommercialMapStore.getState().cameraSequence;

    useCommercialMapStore.getState().requestSegmentFocus(COMMERCIAL_MAP_SEGMENT_IDS.industry);
    expect(useCommercialMapStore.getState()).toMatchObject({
      activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.industry,
      activePanel: null,
      cameraSequence: initialSequence + 1,
    });

    useCommercialMapStore.getState().requestCameraPreset('top');
    expect(useCommercialMapStore.getState()).toMatchObject({
      activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.industry,
      cameraPreset: 'top',
      cameraSequence: initialSequence + 2,
    });

    useCommercialMapStore.getState().clearSegmentFocus();
    expect(useCommercialMapStore.getState()).toMatchObject({
      activeSegmentId: null,
      cameraSequence: initialSequence + 3,
    });
  });

  it('filtra a lista por segmento sem expulsar o usuário para o canvas 3D', () => {
    const initialSequence = useCommercialMapStore.getState().cameraSequence;
    useCommercialMapStore.setState({ workspaceMode: 'list' });

    useCommercialMapStore.getState().requestSegmentFocus(COMMERCIAL_MAP_SEGMENT_IDS.automotive);

    expect(useCommercialMapStore.getState()).toMatchObject({
      activeSegmentId: COMMERCIAL_MAP_SEGMENT_IDS.automotive,
      workspaceMode: 'list',
      cameraSequence: initialSequence,
    });

    useCommercialMapStore.getState().clearSegmentFocus();

    expect(useCommercialMapStore.getState()).toMatchObject({
      activeSegmentId: null,
      workspaceMode: 'list',
      cameraSequence: initialSequence,
    });
  });

  it('preserva a preferência ambiental ao alternar entre mapa geral e comissão', () => {
    useCommercialMapStore.getState().setTreesVisible(false);
    useCommercialMapStore.getState().activateScope('full', null);
    useCommercialMapStore.getState().activateScope(
      'commission:industria-comercio-servicos',
      COMMERCIAL_MAP_SEGMENT_IDS.industry,
    );

    expect(useCommercialMapStore.getState().treesVisible).toBe(false);

    useCommercialMapStore.getState().setTreesVisible(true);
    useCommercialMapStore.getState().activateScope('full:retorno', null);
    expect(useCommercialMapStore.getState().treesVisible).toBe(true);
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
