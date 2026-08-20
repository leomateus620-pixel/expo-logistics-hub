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

export type CommercialMapDockSection =
  | 'search'
  | 'area'
  | 'segments'
  | 'view'
  | 'filters'
  | 'management';

const DOCK_EXPANDED_STORAGE_KEY = 'commercial-map:dock-expanded';

function readPersistedDockExpanded() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DOCK_EXPANDED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistDockExpanded(expanded: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DOCK_EXPANDED_STORAGE_KEY, String(expanded));
  } catch {
    /* storage unavailable: dock state stays in memory only */
  }
}

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
  hoveredModuleId: string | null;
  selectedModuleId: string | null;
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
  treesVisible: boolean;
  technicalValidationVisible: boolean;
  reducedGraphics: boolean;
  cameraNavigating: boolean;
  dockExpanded: boolean;
  dockSection: CommercialMapDockSection | null;
  setDockExpanded: (expanded: boolean) => void;
  setDockSection: (section: CommercialMapDockSection | null) => void;
  activateScope: (scopeKey: string, segmentId: CommercialMapSegmentId | null) => void;
  setSelectedEntityId: (id: string | null) => void;
  enterInterior: (id: string) => void;
  exitInterior: () => void;
  setInteriorReturnView: (view: CommercialMapCameraView | null) => void;
  setHoveredEntityId: (id: string | null) => void;
  setHoveredModuleId: (id: string | null) => void;
  setSelectedModuleId: (id: string | null) => void;
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
  setTreesVisible: (visible: boolean) => void;
  setTechnicalValidationVisible: (visible: boolean) => void;
  setReducedGraphics: (reduced: boolean) => void;
  setCameraNavigating: (navigating: boolean) => void;
}

export const useCommercialMapStore = create<CommercialMapState>((set, get) => ({
  activeScopeKey: null,
  selectedEntityId: null,
  interiorEntityId: null,
  interiorReturnView: null,
  hoveredEntityId: null,
  hoveredModuleId: null,
  selectedModuleId: null,
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
  // The official raster contains baked-in labels. Keep it available for
  // cartographic calibration, but do not mix those world-space words with the
  // stable semantic annotation layer during normal navigation.
  referenceVisible: false,
  referenceOpacity: 0.18,
  labelsVisible: true,
  treesVisible: true,
  technicalValidationVisible: false,
  reducedGraphics: false,
  cameraNavigating: false,
  dockExpanded: readPersistedDockExpanded(),
  dockSection: null,
  setDockExpanded: (dockExpanded) => {
    persistDockExpanded(dockExpanded);
    set({ dockExpanded, dockSection: dockExpanded ? get().dockSection : null });
  },
  setDockSection: (dockSection) => set((state) => (
    state.dockSection === dockSection ? { dockSection: null } : { dockSection }
  )),
  activateScope: (activeScopeKey, activeSegmentId) => set((state) => {
    if (state.activeScopeKey === activeScopeKey && state.activeSegmentId === activeSegmentId) return state;
    return {
      activeScopeKey,
      activeSegmentId,
      selectedEntityId: null,
      interiorEntityId: null,
      interiorReturnView: null,
      hoveredEntityId: null,
      hoveredModuleId: null,
      selectedModuleId: null,
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
    hoveredModuleId: null,
    selectedModuleId: null,
    interiorEntityId: selectedEntityId,
    interiorReturnView: null,
    activePanel: null,
    workspaceMode: '3d',
    cameraNavigating: false,
    cameraSequence: state.cameraSequence + 1,
  })),
  exitInterior: () => set((state) => ({
    interiorEntityId: null,
    hoveredModuleId: null,
    selectedModuleId: null,
    activePanel: state.selectedEntityId ? 'details' : null,
    workspaceMode: '3d',
    cameraNavigating: false,
    cameraSequence: state.cameraSequence + 1,
  })),
  setInteriorReturnView: (interiorReturnView) => set({ interiorReturnView }),
  setHoveredEntityId: (hoveredEntityId) => set({ hoveredEntityId }),
  setHoveredModuleId: (hoveredModuleId) => set({ hoveredModuleId }),
  setSelectedModuleId: (selectedModuleId) => set({ selectedModuleId }),
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
    hoveredModuleId: null,
    selectedModuleId: null,
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
    hoveredModuleId: null,
    selectedModuleId: null,
    cameraSequence: state.cameraSequence + 1,
    workspaceMode: '3d',
    interiorEntityId: null,
    interiorReturnView: null,
  })),
  requestSegmentFocus: (activeSegmentId) => set((state) => ({
    activeSegmentId,
    selectedEntityId: null,
    hoveredEntityId: null,
    hoveredModuleId: null,
    selectedModuleId: null,
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
  setTreesVisible: (treesVisible) => set({ treesVisible }),
  setTechnicalValidationVisible: (technicalValidationVisible) => set({ technicalValidationVisible }),
  setReducedGraphics: (reducedGraphics) => set({ reducedGraphics }),
  setCameraNavigating: (cameraNavigating) => set({ cameraNavigating }),
}));

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Development-only handle used by automated interaction checks.
  (window as unknown as Record<string, unknown>).__commercialMapStore = useCommercialMapStore;
}
