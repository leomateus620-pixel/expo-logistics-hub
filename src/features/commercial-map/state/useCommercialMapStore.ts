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
import type { ParkingCameraView } from '../utils/parkingViewport';
import type { LunarLaunchPhase } from '../utils/lunarLaunch';

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

interface InteriorReturnContext {
  activeSegmentId: CommercialMapSegmentId | null;
  selectedEntityId: string;
  search: string;
  statusFilters: CommercialStatus[];
  classificationFilters: MapClassification[];
  locationFilter: string | null;
  verificationFilters: VerificationStatus[];
}

// Parking is a cartographic inspection, never a persisted commercial entity.
const CLEARED_PARKING_INSPECTION = {
  selectedParkingBlockId: null,
  selectedParkingSpaceId: null,
  parkingInspectionOpen: false,
} as const;

const PARKING_INSPECTION_MODE = {
  parkingInspectionOpen: true,
  selectedEntityId: null,
  hoveredEntityId: null,
  hoveredModuleId: null,
  selectedModuleId: null,
  interiorEntityId: null,
  interiorReturnView: null,
  interiorReturnContext: null,
  selectedHydrologicalElementId: null,
  hydrologicalModeActive: false,
  activePanel: null,
  workspaceMode: '3d',
  cameraNavigating: false,
} as const;

interface CommercialMapState {
  activeScopeKey: string | null;
  selectedEntityId: string | null;
  interiorEntityId: string | null;
  interiorReturnView: CommercialMapCameraView | null;
  interiorReturnContext: InteriorReturnContext | null;
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
  hydrologicalModeActive: boolean;
  selectedHydrologicalElementId: string | null;
  selectedParkingBlockId: string | null;
  selectedParkingSpaceId: string | null;
  parkingInspectionOpen: boolean;
  parkingCameraView: ParkingCameraView;
  parkingCameraSequence: number;
  technicalValidationVisible: boolean;
  reducedGraphics: boolean;
  cameraNavigating: boolean;
  sunrisePhase: 'idle' | 'running' | 'complete';
  sunriseSequence: number;
  sunriseStartedAt: number | null;
  /** Park-wide Night Mode: darkened atmosphere plus the pole LED network. */
  nightModeActive: boolean;
  lunarLaunchPhase: LunarLaunchPhase;
  lunarLaunchSequence: number;
  lunarLaunchStartedAt: number | null;
  lunarLaunchSkipSequence: number;
  lunarLaunchSkipRequested: boolean;
  lunarLaunchReturnSequence: number;
  lunarLaunchReturnAvailable: boolean;
  lunarLaunchReturning: boolean;
  lunarLaunchPreviousPanel: MapPanel;
  dockExpanded: boolean;
  dockSection: CommercialMapDockSection | null;
  setDockExpanded: (expanded: boolean) => void;
  setDockSection: (section: CommercialMapDockSection | null) => void;
  activateScope: (scopeKey: string, segmentId: CommercialMapSegmentId | null) => void;
  setSelectedEntityId: (id: string | null) => void;
  enterInterior: (id: string) => void;
  switchInterior: (id: string) => void;
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
  setHydrologicalModeActive: (active: boolean) => void;
  toggleHydrologicalMode: () => void;
  setSelectedHydrologicalElementId: (id: string | null) => void;
  inspectParkingBlock: (blockId: string | null) => void;
  inspectParkingSpace: (blockId: string, spaceId: string) => void;
  requestParkingView: (view: ParkingCameraView) => void;
  closeParkingInspection: () => void;
  setParkingInspectionOpen: (open: boolean) => void;
  setTechnicalValidationVisible: (visible: boolean) => void;
  setReducedGraphics: (reduced: boolean) => void;
  setCameraNavigating: (navigating: boolean) => void;
  requestSunrise: () => void;
  completeSunrise: (sequence: number) => void;
  resetSunrise: () => void;
  setNightModeActive: (active: boolean) => void;
  toggleNightMode: () => void;
  requestLunarLaunch: () => void;
  setLunarLaunchPhase: (phase: LunarLaunchPhase, sequence: number) => void;
  requestLunarLaunchSkip: () => void;
  completeLunarLaunch: (skipped: boolean) => void;
  requestLunarLaunchReturn: () => void;
  completeLunarLaunchReturn: () => void;
  resetLunarLaunch: () => void;
}

function monotonicNow() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

export const useCommercialMapStore = create<CommercialMapState>((set, get) => ({
  activeScopeKey: null,
  selectedEntityId: null,
  interiorEntityId: null,
  interiorReturnView: null,
  interiorReturnContext: null,
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
  hydrologicalModeActive: false,
  selectedHydrologicalElementId: null,
  ...CLEARED_PARKING_INSPECTION,
  parkingCameraView: 'overview',
  parkingCameraSequence: 0,
  technicalValidationVisible: false,
  reducedGraphics: false,
  cameraNavigating: false,
  sunrisePhase: 'idle',
  sunriseSequence: 0,
  sunriseStartedAt: null,
  nightModeActive: false,
  lunarLaunchPhase: 'idle',
  lunarLaunchSequence: 0,
  lunarLaunchStartedAt: null,
  lunarLaunchSkipSequence: 0,
  lunarLaunchSkipRequested: false,
  lunarLaunchReturnSequence: 0,
  lunarLaunchReturnAvailable: false,
  lunarLaunchReturning: false,
  lunarLaunchPreviousPanel: null,
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
      ...CLEARED_PARKING_INSPECTION,
      activeScopeKey,
      activeSegmentId,
      selectedEntityId: null,
      interiorEntityId: null,
      interiorReturnView: null,
      interiorReturnContext: null,
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
      hydrologicalModeActive: false,
      selectedHydrologicalElementId: null,
      technicalValidationVisible: false,
      cameraNavigating: false,
      sunrisePhase: 'idle',
      sunriseStartedAt: null,
      nightModeActive: false,
      lunarLaunchPhase: 'idle',
      lunarLaunchStartedAt: null,
      lunarLaunchSkipRequested: false,
      lunarLaunchReturnAvailable: false,
      lunarLaunchReturning: false,
      lunarLaunchPreviousPanel: null,
    };
  }),
  setSelectedEntityId: (selectedEntityId) => set((state) => (
    state.lunarLaunchPhase !== 'idle' || state.lunarLaunchReturning
      ? state
      : {
          ...CLEARED_PARKING_INSPECTION,
          selectedEntityId,
          interiorEntityId: state.interiorEntityId === selectedEntityId ? state.interiorEntityId : null,
          interiorReturnView: state.interiorEntityId === selectedEntityId ? state.interiorReturnView : null,
          interiorReturnContext: state.interiorEntityId === selectedEntityId ? state.interiorReturnContext : null,
          activePanel: selectedEntityId ? 'details' : null,
          // A new tap cancels the running flight before its click is handled.
          // Repeating an exterior selection must explicitly request that focus
          // again; interior selection keeps its existing view/return contract.
          cameraSequence: selectedEntityId !== null
            && selectedEntityId === state.selectedEntityId
            && state.interiorEntityId === null
            ? state.cameraSequence + 1
            : state.cameraSequence,
        }
  )),
  enterInterior: (selectedEntityId) => set((state) => (
    state.lunarLaunchPhase !== 'idle' || state.lunarLaunchReturning
      ? state
      : {
          ...CLEARED_PARKING_INSPECTION,
          selectedEntityId,
          hoveredEntityId: null,
          hoveredModuleId: null,
          selectedModuleId: null,
          interiorEntityId: selectedEntityId,
          interiorReturnView: state.interiorEntityId ? state.interiorReturnView : null,
          interiorReturnContext: state.interiorReturnContext ?? {
            activeSegmentId: state.activeSegmentId,
            selectedEntityId,
            search: state.search,
            statusFilters: state.statusFilters,
            classificationFilters: state.classificationFilters,
            locationFilter: state.locationFilter,
            verificationFilters: state.verificationFilters,
          },
          activePanel: null,
          workspaceMode: '3d',
          cameraNavigating: false,
          cameraSequence: state.cameraSequence + 1,
        }
  )),
  switchInterior: (selectedEntityId) => set((state) => ({
    ...CLEARED_PARKING_INSPECTION,
    selectedEntityId,
    hoveredEntityId: null,
    hoveredModuleId: null,
    selectedModuleId: null,
    interiorEntityId: selectedEntityId,
    // Keep the camera captured on the first interior entry so a chain such as
    // P13 -> P8 -> P12 still returns to the exact same map view.
    interiorReturnView: state.interiorReturnView,
    activePanel: null,
    workspaceMode: '3d',
    cameraNavigating: false,
    cameraSequence: state.cameraSequence + 1,
  })),
  exitInterior: () => set((state) => ({
    ...CLEARED_PARKING_INSPECTION,
    ...state.interiorReturnContext,
    interiorEntityId: null,
    interiorReturnContext: null,
    hoveredModuleId: null,
    selectedModuleId: null,
    activePanel: state.selectedEntityId ? 'details' : null,
    workspaceMode: '3d',
    cameraNavigating: false,
    cameraSequence: state.cameraSequence + 1,
  })),
  setInteriorReturnView: (interiorReturnView) => set({ interiorReturnView }),
  setHoveredEntityId: (hoveredEntityId) => set((state) => (
    state.lunarLaunchPhase !== 'idle' || state.lunarLaunchReturning ? state : { hoveredEntityId }
  )),
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
    ...CLEARED_PARKING_INSPECTION,
    search: '',
    statusFilters: [],
    classificationFilters: [],
    locationFilter: null,
    verificationFilters: [],
    sortOrder: 'relevance',
    activeSegmentId: null,
  }),
  selectEntityFromExplorer: (selectedEntityId) => set((state) => ({
    ...CLEARED_PARKING_INSPECTION,
    selectedEntityId,
    hoveredEntityId: null,
    hoveredModuleId: null,
    selectedModuleId: null,
    interiorEntityId: null,
    interiorReturnView: null,
    interiorReturnContext: null,
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
  setActivePanel: (activePanel) => set((state) => (
    state.lunarLaunchPhase !== 'idle' || state.lunarLaunchReturning
      ? state
      : {
          ...(activePanel ? CLEARED_PARKING_INSPECTION : {}),
          activePanel,
        }
  )),
  setWorkspaceMode: (workspaceMode) => set((state) => ({
    ...(workspaceMode === '3d' ? {} : CLEARED_PARKING_INSPECTION),
    workspaceMode,
    // Map and table are views of the same navigation context. The persistent
    // canvas resumes this exact interior and camera after visiting the table.
    interiorEntityId: workspaceMode === '3d' || workspaceMode === 'list' ? state.interiorEntityId : null,
    interiorReturnView: workspaceMode === '3d' || workspaceMode === 'list' ? state.interiorReturnView : null,
    interiorReturnContext: workspaceMode === '3d' || workspaceMode === 'list' ? state.interiorReturnContext : null,
  })),
  requestCameraPreset: (cameraPreset) => set((state) => ({
    ...CLEARED_PARKING_INSPECTION,
    cameraPreset,
    hoveredModuleId: null,
    selectedModuleId: null,
    cameraSequence: state.cameraSequence + 1,
    workspaceMode: '3d',
    interiorEntityId: null,
    interiorReturnView: null,
    interiorReturnContext: null,
  })),
  requestSegmentFocus: (activeSegmentId) => set((state) => ({
    ...CLEARED_PARKING_INSPECTION,
    activeSegmentId,
    selectedEntityId: null,
    hoveredEntityId: null,
    hoveredModuleId: null,
    selectedModuleId: null,
    activePanel: null,
    workspaceMode: state.workspaceMode === 'list' ? 'list' : '3d',
    interiorEntityId: null,
    interiorReturnView: null,
    interiorReturnContext: null,
    cameraNavigating: false,
    cameraSequence: state.workspaceMode === 'list' ? state.cameraSequence : state.cameraSequence + 1,
  })),
  clearSegmentFocus: () => set((state) => ({
    ...CLEARED_PARKING_INSPECTION,
    activeSegmentId: null,
    selectedEntityId: null,
    hoveredEntityId: null,
    hoveredModuleId: null,
    selectedModuleId: null,
    interiorEntityId: null,
    interiorReturnView: null,
    interiorReturnContext: null,
    activePanel: null,
    cameraPreset: 'overview',
    cameraNavigating: false,
    cameraSequence: state.workspaceMode === 'list' ? state.cameraSequence : state.cameraSequence + 1,
  })),
  focusSelection: () => set((state) => ({
    ...CLEARED_PARKING_INSPECTION,
    cameraSequence: state.cameraSequence + 1,
    workspaceMode: '3d',
  })),
  setReferenceVisible: (referenceVisible) => set({ referenceVisible }),
  setReferenceOpacity: (referenceOpacity) => set({ referenceOpacity }),
  setLabelsVisible: (labelsVisible) => set({ labelsVisible }),
  setTreesVisible: (treesVisible) => set({ treesVisible }),
  setHydrologicalModeActive: (hydrologicalModeActive) => set((state) => {
    if (state.hydrologicalModeActive === hydrologicalModeActive) return state;
    if (!hydrologicalModeActive) {
      return {
        ...CLEARED_PARKING_INSPECTION,
        hydrologicalModeActive: false,
        selectedHydrologicalElementId: null,
        cameraSequence: state.cameraSequence + 1,
        cameraNavigating: false,
      };
    }

    return {
      ...CLEARED_PARKING_INSPECTION,
      hydrologicalModeActive: true,
      selectedHydrologicalElementId: null,
      selectedEntityId: null,
      interiorEntityId: null,
      interiorReturnView: null,
      interiorReturnContext: null,
      hoveredEntityId: null,
      hoveredModuleId: null,
      selectedModuleId: null,
      activePanel: null,
      workspaceMode: '3d',
      cameraPreset: state.activeSegmentId === 'exporural' ? 'exporural' : 'overview',
      cameraSequence: state.cameraSequence + 1,
      cameraNavigating: false,
    };
  }),
  toggleHydrologicalMode: () => get().setHydrologicalModeActive(!get().hydrologicalModeActive),
  setSelectedHydrologicalElementId: (selectedHydrologicalElementId) => set({
    ...CLEARED_PARKING_INSPECTION,
    selectedHydrologicalElementId,
  }),
  inspectParkingBlock: (selectedParkingBlockId) => set((state) => (
    state.lunarLaunchPhase !== 'idle' || state.lunarLaunchReturning
      ? state
      : {
          ...PARKING_INSPECTION_MODE,
          selectedParkingBlockId,
          selectedParkingSpaceId: null,
          parkingCameraView: selectedParkingBlockId ? 'detail' : 'overview',
          parkingCameraSequence: state.parkingCameraSequence + 1,
        }
  )),
  inspectParkingSpace: (selectedParkingBlockId, selectedParkingSpaceId) => {
    // One atomic update avoids an intermediate block camera movement.
    set((state) => (
      state.lunarLaunchPhase !== 'idle' || state.lunarLaunchReturning
        ? state
        : {
            ...PARKING_INSPECTION_MODE,
            selectedParkingBlockId,
            selectedParkingSpaceId,
            parkingCameraView: 'detail',
            parkingCameraSequence: state.parkingCameraSequence + 1,
          }
    ));
  },
  requestParkingView: (parkingCameraView) => set((state) => (
    state.lunarLaunchPhase !== 'idle' || state.lunarLaunchReturning
      ? state
      : {
          ...PARKING_INSPECTION_MODE,
          parkingCameraView,
          parkingCameraSequence: state.parkingCameraSequence + 1,
          selectedParkingBlockId: parkingCameraView === 'overview' ? null : state.selectedParkingBlockId,
          selectedParkingSpaceId: parkingCameraView === 'overview' ? null : state.selectedParkingSpaceId,
        }
  )),
  closeParkingInspection: () => set(CLEARED_PARKING_INSPECTION),
  setParkingInspectionOpen: (open) => {
    if (!open) get().closeParkingInspection();
    else if (
      get().lunarLaunchPhase === 'idle'
      && !get().lunarLaunchReturning
      && !get().parkingInspectionOpen
    ) get().inspectParkingBlock(get().selectedParkingBlockId);
  },
  setTechnicalValidationVisible: (technicalValidationVisible) => set({ technicalValidationVisible }),
  setReducedGraphics: (reducedGraphics) => set({ reducedGraphics }),
  setCameraNavigating: (cameraNavigating) => set({ cameraNavigating }),
  // The sunrise is the natural way out of the night: replaying it always
  // restores daylight instead of animating a sun nobody can see.
  requestSunrise: () => set((state) => ({
    sunrisePhase: 'running',
    sunriseSequence: state.sunriseSequence + 1,
    sunriseStartedAt: monotonicNow(),
    nightModeActive: false,
  })),
  completeSunrise: (sequence) => set((state) => (
    state.sunrisePhase === 'running' && state.sunriseSequence === sequence
      ? { sunrisePhase: 'complete', sunriseStartedAt: null }
      : state
  )),
  resetSunrise: () => set((state) => ({
    sunrisePhase: 'idle',
    sunriseSequence: state.sunriseSequence + 1,
    sunriseStartedAt: null,
  })),
  setNightModeActive: (nightModeActive) => set((state) => (
    state.nightModeActive === nightModeActive ? state : { nightModeActive }
  )),
  toggleNightMode: () => get().setNightModeActive(!get().nightModeActive),
  requestLunarLaunch: () => set((state) => {
    if (state.lunarLaunchPhase !== 'idle' || state.lunarLaunchReturning) return state;
    return {
      ...CLEARED_PARKING_INSPECTION,
      lunarLaunchPhase: 'ignition',
      lunarLaunchSequence: state.lunarLaunchSequence + 1,
      lunarLaunchStartedAt: monotonicNow(),
      lunarLaunchSkipRequested: false,
      lunarLaunchReturnAvailable: false,
      lunarLaunchPreviousPanel: state.activePanel,
      activePanel: null,
      hoveredEntityId: null,
      cameraNavigating: true,
    };
  }),
  setLunarLaunchPhase: (lunarLaunchPhase, sequence) => set((state) => (
    state.lunarLaunchSequence === sequence
      && state.lunarLaunchPhase !== 'idle'
      && state.lunarLaunchPhase !== lunarLaunchPhase
      ? { lunarLaunchPhase }
      : state
  )),
  requestLunarLaunchSkip: () => set((state) => {
    if (state.lunarLaunchPhase === 'idle' || state.lunarLaunchSkipRequested) return state;
    return {
      lunarLaunchPhase: 'cleanup',
      lunarLaunchSkipSequence: state.lunarLaunchSkipSequence + 1,
      lunarLaunchSkipRequested: true,
      cameraNavigating: true,
    };
  }),
  completeLunarLaunch: (skipped) => set((state) => ({
    lunarLaunchPhase: 'idle',
    lunarLaunchStartedAt: null,
    lunarLaunchSkipRequested: false,
    lunarLaunchReturnAvailable: !skipped,
    lunarLaunchReturning: false,
    activePanel: skipped ? state.lunarLaunchPreviousPanel : null,
    lunarLaunchPreviousPanel: skipped ? null : state.lunarLaunchPreviousPanel,
    cameraNavigating: false,
  })),
  requestLunarLaunchReturn: () => set((state) => {
    if (!state.lunarLaunchReturnAvailable || state.lunarLaunchPhase !== 'idle') return state;
    return {
      ...CLEARED_PARKING_INSPECTION,
      lunarLaunchReturnAvailable: false,
      lunarLaunchReturning: true,
      lunarLaunchReturnSequence: state.lunarLaunchReturnSequence + 1,
      activePanel: null,
      cameraNavigating: true,
    };
  }),
  completeLunarLaunchReturn: () => set((state) => ({
    lunarLaunchReturning: false,
    lunarLaunchReturnAvailable: false,
    activePanel: state.lunarLaunchPreviousPanel,
    lunarLaunchPreviousPanel: null,
    cameraNavigating: false,
  })),
  resetLunarLaunch: () => set({
    lunarLaunchPhase: 'idle',
    lunarLaunchStartedAt: null,
    lunarLaunchSkipRequested: false,
    lunarLaunchReturnAvailable: false,
    lunarLaunchReturning: false,
    lunarLaunchPreviousPanel: null,
    cameraNavigating: false,
  }),
}));

if (import.meta.env.DEV && typeof window !== 'undefined') {
  // Development-only handle used by automated interaction checks.
  (window as unknown as Record<string, unknown>).__commercialMapStore = useCommercialMapStore;
}
