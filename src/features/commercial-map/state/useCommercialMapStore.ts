import { create } from 'zustand';
import type {
  CameraPreset,
  CommercialStatus,
  EntitySortOrder,
  EntityTableDensity,
  MapClassification,
  MapPanel,
  MapWorkspaceMode,
  VerificationStatus,
} from '../types';
import type { CommercialMapSegmentId } from '../data/commercialMapSegments';

export interface CommercialMapCameraView {
  position: [number, number, number];
  target: [number, number, number];
}

interface CommercialMapState {
  activeScopeKey: string | null;
  selectedEntityId: string | null;
  interiorEntityId: string | null;
  interiorReturnView: CommercialMapCameraView | null;
  hoveredEntityId: string | null;
  search: string;
  statusFilters: CommercialStatus[];
  classificationFilters: MapClassification[];
  locationFilter: string | null;
  verificationFilters: VerificationStatus[];
  sortOrder: EntitySortOrder;
  tableDensity: EntityTableDensity;
  layerVisibility: Record<string, boolean>;
  layerOpacity: Record<string, number>;
  activePanel: MapPanel;
  workspaceMode: MapWorkspaceMode;
  cameraPreset: CameraPreset;
  cameraSequence: number;
  activeSegmentId: CommercialMapSegmentId | null;
  referenceVisible: boolean;
  referenceOpacity: number;
  labelsVisible: boolean;
  technicalValidationVisible: boolean;
  reducedGraphics: boolean;
  cameraNavigating: boolean;
  activateScope: (scopeKey: string, segmentId: CommercialMapSegmentId | null) => void;
  setSelectedEntityId: (id: string | null) => void;
  enterInterior: (id: string) => void;
  exitInterior: () => void;
  setInteriorReturnView: (view: CommercialMapCameraView | null) => void;
  setHoveredEntityId: (id: string | null) => void;
  setSearch: (search: string) => void;
  toggleStatus: (status: CommercialStatus) => void;
  clearStatuses: () => void;
  toggleClassification: (classification: MapClassification) => void;
  setLocationFilter: (location: string | null) => void;
  toggleVerification: (status: VerificationStatus) => void;
  setSortOrder: (sortOrder: EntitySortOrder) => void;
  setTableDensity: (density: EntityTableDensity) => void;
  clearExplorerFilters: () => void;
  selectEntityFromExplorer: (id: string) => void;
  setLayerVisibility: (layerId: string, visible: boolean) => void;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  initializeLayers: (layers: Array<{ id: string; isVisible: boolean; opacity: number }>) => void;
  setActivePanel: (panel: MapPanel) => void;
  setWorkspaceMode: (mode: MapWorkspaceMode) => void;
  requestCameraPreset: (preset: CameraPreset) => void;
  requestSegmentFocus: (segmentId: CommercialMapSegmentId) => void;
  clearSegmentFocus: () => void;
  focusSelection: () => void;
  setReferenceVisible: (visible: boolean) => void;
  setReferenceOpacity: (opacity: number) => void;
  setLabelsVisible: (visible: boolean) => void;
  setTechnicalValidationVisible: (visible: boolean) => void;
  setReducedGraphics: (reduced: boolean) => void;
  setCameraNavigating: (navigating: boolean) => void;
}

export const useCommercialMapStore = create<CommercialMapState>((set) => ({
  activeScopeKey: null,
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
  tableDensity: 'comfortable',
  layerVisibility: {},
  layerOpacity: {},
  activePanel: null,
  workspaceMode: '3d',
  cameraPreset: 'overview',
  cameraSequence: 0,
  activeSegmentId: null,
  referenceVisible: true,
  referenceOpacity: 0.18,
  labelsVisible: true,
  technicalValidationVisible: false,
  reducedGraphics: false,
  cameraNavigating: false,
  activateScope: (activeScopeKey, activeSegmentId) => set((state) => {
    if (state.activeScopeKey === activeScopeKey && state.activeSegmentId === activeSegmentId) return state;
    return {
      activeScopeKey,
      activeSegmentId,
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
      layerVisibility: {},
      layerOpacity: {},
      activePanel: null,
      workspaceMode: '3d',
      cameraPreset: activeSegmentId === 'exporural' ? 'exporural' : 'overview',
      cameraSequence: state.cameraSequence + 1,
      technicalValidationVisible: false,
      cameraNavigating: false,
    };
  }),
  setSelectedEntityId: (selectedEntityId) => set((state) => ({
    selectedEntityId,
    interiorEntityId: state.interiorEntityId === selectedEntityId ? state.interiorEntityId : null,
    interiorReturnView: state.interiorEntityId === selectedEntityId ? state.interiorReturnView : null,
    activePanel: selectedEntityId ? 'details' : null,
  })),
  enterInterior: (selectedEntityId) => set((state) => ({
    selectedEntityId,
    hoveredEntityId: null,
    interiorEntityId: selectedEntityId,
    interiorReturnView: null,
    activePanel: null,
    workspaceMode: '3d',
    cameraNavigating: false,
    cameraSequence: state.cameraSequence + 1,
  })),
  exitInterior: () => set((state) => ({
    interiorEntityId: null,
    activePanel: state.selectedEntityId ? 'details' : null,
    workspaceMode: '3d',
    cameraNavigating: false,
    cameraSequence: state.cameraSequence + 1,
  })),
  setInteriorReturnView: (interiorReturnView) => set({ interiorReturnView }),
  setHoveredEntityId: (hoveredEntityId) => set({ hoveredEntityId }),
  setSearch: (search) => set({ search }),
  toggleStatus: (status) => set((state) => ({
    statusFilters: state.statusFilters.includes(status)
      ? state.statusFilters.filter((candidate) => candidate !== status)
      : [...state.statusFilters, status],
  })),
  clearStatuses: () => set({ statusFilters: [] }),
  toggleClassification: (classification) => set((state) => ({
    classificationFilters: state.classificationFilters.includes(classification)
      ? state.classificationFilters.filter((candidate) => candidate !== classification)
      : [...state.classificationFilters, classification],
  })),
  setLocationFilter: (locationFilter) => set({ locationFilter }),
  toggleVerification: (status) => set((state) => ({
    verificationFilters: state.verificationFilters.includes(status)
      ? state.verificationFilters.filter((candidate) => candidate !== status)
      : [...state.verificationFilters, status],
  })),
  setSortOrder: (sortOrder) => set({ sortOrder }),
  setTableDensity: (tableDensity) => set({ tableDensity }),
  clearExplorerFilters: () => set({
    search: '',
    statusFilters: [],
    classificationFilters: [],
    locationFilter: null,
    verificationFilters: [],
    sortOrder: 'relevance',
    activeSegmentId: null,
  }),
  selectEntityFromExplorer: (selectedEntityId) => set((state) => ({
    selectedEntityId,
    hoveredEntityId: null,
    interiorEntityId: null,
    interiorReturnView: null,
    activePanel: 'details',
    workspaceMode: '3d',
    cameraSequence: state.cameraSequence + 1,
  })),
  setLayerVisibility: (layerId, visible) => set((state) => ({ layerVisibility: { ...state.layerVisibility, [layerId]: visible } })),
  setLayerOpacity: (layerId, opacity) => set((state) => ({ layerOpacity: { ...state.layerOpacity, [layerId]: opacity } })),
  initializeLayers: (layers) => set((state) => {
    const visibility = { ...state.layerVisibility };
    const opacity = { ...state.layerOpacity };
    layers.forEach((layer) => {
      if (visibility[layer.id] === undefined) visibility[layer.id] = layer.isVisible;
      if (opacity[layer.id] === undefined) opacity[layer.id] = layer.opacity;
    });
    return { layerVisibility: visibility, layerOpacity: opacity };
  }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setWorkspaceMode: (workspaceMode) => set((state) => ({
    workspaceMode,
    interiorEntityId: workspaceMode === '3d' ? state.interiorEntityId : null,
    interiorReturnView: workspaceMode === '3d' ? state.interiorReturnView : null,
  })),
  requestCameraPreset: (cameraPreset) => set((state) => ({
    cameraPreset,
    cameraSequence: state.cameraSequence + 1,
    workspaceMode: '3d',
    interiorEntityId: null,
    interiorReturnView: null,
  })),
  requestSegmentFocus: (activeSegmentId) => set((state) => ({
    activeSegmentId,
    selectedEntityId: null,
    hoveredEntityId: null,
    activePanel: null,
    workspaceMode: state.workspaceMode === 'list' ? 'list' : '3d',
    interiorEntityId: null,
    interiorReturnView: null,
    cameraNavigating: false,
    cameraSequence: state.workspaceMode === 'list' ? state.cameraSequence : state.cameraSequence + 1,
  })),
  clearSegmentFocus: () => set((state) => ({
    activeSegmentId: null,
    cameraSequence: state.workspaceMode === 'list' ? state.cameraSequence : state.cameraSequence + 1,
  })),
  focusSelection: () => set((state) => ({ cameraSequence: state.cameraSequence + 1, workspaceMode: '3d' })),
  setReferenceVisible: (referenceVisible) => set({ referenceVisible }),
  setReferenceOpacity: (referenceOpacity) => set({ referenceOpacity }),
  setLabelsVisible: (labelsVisible) => set({ labelsVisible }),
  setTechnicalValidationVisible: (technicalValidationVisible) => set({ technicalValidationVisible }),
  setReducedGraphics: (reducedGraphics) => set({ reducedGraphics }),
  setCameraNavigating: (cameraNavigating) => set({ cameraNavigating }),
}));
