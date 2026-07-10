import { create } from 'zustand';
import type { CameraPreset, CommercialStatus, MapPanel, MapWorkspaceMode } from '../types';

interface CommercialMapState {
  selectedEntityId: string | null;
  hoveredEntityId: string | null;
  search: string;
  statusFilters: CommercialStatus[];
  layerVisibility: Record<string, boolean>;
  layerOpacity: Record<string, number>;
  activePanel: MapPanel;
  workspaceMode: MapWorkspaceMode;
  cameraPreset: CameraPreset;
  cameraSequence: number;
  referenceVisible: boolean;
  referenceOpacity: number;
  labelsVisible: boolean;
  reducedGraphics: boolean;
  setSelectedEntityId: (id: string | null) => void;
  setHoveredEntityId: (id: string | null) => void;
  setSearch: (search: string) => void;
  toggleStatus: (status: CommercialStatus) => void;
  clearStatuses: () => void;
  setLayerVisibility: (layerId: string, visible: boolean) => void;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  initializeLayers: (layers: Array<{ id: string; isVisible: boolean; opacity: number }>) => void;
  setActivePanel: (panel: MapPanel) => void;
  setWorkspaceMode: (mode: MapWorkspaceMode) => void;
  requestCameraPreset: (preset: CameraPreset) => void;
  focusSelection: () => void;
  setReferenceVisible: (visible: boolean) => void;
  setReferenceOpacity: (opacity: number) => void;
  setLabelsVisible: (visible: boolean) => void;
  setReducedGraphics: (reduced: boolean) => void;
}

export const useCommercialMapStore = create<CommercialMapState>((set) => ({
  selectedEntityId: null,
  hoveredEntityId: null,
  search: '',
  statusFilters: [],
  layerVisibility: {},
  layerOpacity: {},
  activePanel: null,
  workspaceMode: '3d',
  cameraPreset: 'overview',
  cameraSequence: 0,
  referenceVisible: true,
  referenceOpacity: 0.28,
  labelsVisible: true,
  reducedGraphics: false,
  setSelectedEntityId: (selectedEntityId) => set({ selectedEntityId, activePanel: selectedEntityId ? 'details' : null }),
  setHoveredEntityId: (hoveredEntityId) => set({ hoveredEntityId }),
  setSearch: (search) => set({ search }),
  toggleStatus: (status) => set((state) => ({
    statusFilters: state.statusFilters.includes(status)
      ? state.statusFilters.filter((candidate) => candidate !== status)
      : [...state.statusFilters, status],
  })),
  clearStatuses: () => set({ statusFilters: [] }),
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
  setWorkspaceMode: (workspaceMode) => set({ workspaceMode }),
  requestCameraPreset: (cameraPreset) => set((state) => ({ cameraPreset, cameraSequence: state.cameraSequence + 1, workspaceMode: '3d' })),
  focusSelection: () => set((state) => ({ cameraSequence: state.cameraSequence + 1, workspaceMode: '3d' })),
  setReferenceVisible: (referenceVisible) => set({ referenceVisible }),
  setReferenceOpacity: (referenceOpacity) => set({ referenceOpacity }),
  setLabelsVisible: (labelsVisible) => set({ labelsVisible }),
  setReducedGraphics: (reducedGraphics) => set({ reducedGraphics }),
}));
