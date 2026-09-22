import { create } from 'zustand';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import type { VisitPOI } from './VisitPOIManager';

export type VisitPhase = 'loading' | 'entering' | 'active' | 'interior' | 'exiting';
export type VisitCameraMode = 'first' | 'third';
type MapState = ReturnType<typeof useCommercialMapStore.getState>;
type ReturnContext = Pick<MapState, 'workspaceMode' | 'activePanel' | 'selectedEntityId' | 'selectedModuleId' | 'hoveredEntityId' | 'hydrologicalModeActive' | 'parkingInspectionOpen' | 'salesPresentationActive' | 'interiorEntityId' | 'interiorReturnView' | 'interiorReturnContext' | 'interiorViewCommand' | 'treesVisible' | 'nightModeActive' | 'rainModeActive'>;
let returnContext: ReturnContext | null = null;

interface VisitState {
  enabled: boolean;
  phase: VisitPhase;
  cameraMode: VisitCameraMode;
  movementMode: 'idle' | 'walk' | 'run';
  activePOI: VisitPOI | null;
  activeInterior: string | null;
  isRunning: boolean;
  qualityPreset: 'HIGH' | 'BALANCED' | 'PERFORMANCE';
  error: string | null;
  requestedEntityId: string | null;
  session: number;
  requestedAtMs: number;
  start: (options?: { entityId?: string }) => void;
  exit: () => void;
  finishExit: () => void;
  setCameraMode: (mode: VisitCameraMode) => void;
  setActivePOI: (poi: VisitPOI | null) => void;
  enterInterior: (id: string) => void;
  leaveInterior: () => void;
}

/** Discrete UI state only. Positions/velocity/input never flow through React. */
export const useVisitStore = create<VisitState>((set, get) => ({
  enabled: false, phase: 'loading', cameraMode: 'first', movementMode: 'idle',
  activePOI: null, activeInterior: null, isRunning: false, qualityPreset: 'BALANCED',
  error: null, requestedEntityId: null, session: 0, requestedAtMs: 0,
  start: (options) => {
    if (get().enabled) return;
    const m = useCommercialMapStore.getState();
    // A cinematic already owns the lens; the mode selector disables this case.
    if (m.lunarLaunchPhase !== 'idle' || m.lunarLaunchReturning || m.interiorEntityId) return;
    returnContext = {
      workspaceMode: m.workspaceMode, activePanel: m.activePanel,
      selectedEntityId: m.selectedEntityId, selectedModuleId: m.selectedModuleId,
      hoveredEntityId: m.hoveredEntityId, hydrologicalModeActive: m.hydrologicalModeActive,
      parkingInspectionOpen: m.parkingInspectionOpen, salesPresentationActive: m.salesPresentationActive,
      interiorEntityId: m.interiorEntityId, interiorReturnView: m.interiorReturnView,
      interiorReturnContext: m.interiorReturnContext, interiorViewCommand: m.interiorViewCommand,
      treesVisible: m.treesVisible, nightModeActive: m.nightModeActive, rainModeActive: m.rainModeActive,
    };
    set({ enabled: true, phase: 'loading', activePOI: null, activeInterior: null,
      requestedEntityId: options?.entityId ?? null, error: null, session: get().session + 1, requestedAtMs: performance.now() });
    useCommercialMapStore.setState({ workspaceMode: '3d', activePanel: null,
      hoveredEntityId: null, hydrologicalModeActive: false, parkingInspectionOpen: false,
      salesPresentationActive: false, interiorEntityId: null, cameraNavigating: false,
      treesVisible: true });
  },
  exit: () => {
    if (!get().enabled || get().phase === 'exiting') return;
    // No flight exists while the lazy controller/shaders are still pending.
    if (get().error || get().phase === 'loading') { get().finishExit(); return; }
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
    set({ phase: 'exiting', activePOI: null, activeInterior: null, isRunning: false, movementMode: 'idle' });
    useCommercialMapStore.setState({ interiorEntityId: null, activePanel: null });
  },
  finishExit: () => {
    const snapshot = returnContext; returnContext = null;
    if (snapshot) useCommercialMapStore.setState({ ...snapshot, cameraNavigating: false });
    set({ enabled: false, activePOI: null, activeInterior: null, movementMode: 'idle', isRunning: false, error: null });
  },
  setCameraMode: (cameraMode) => set({ cameraMode }),
  // Indexed POIs keep their identity between 10 Hz queries. A refetched
  // canonical snapshot must replace the card even when the entity ID matches.
  setActivePOI: (activePOI) => { if (activePOI !== get().activePOI) set({ activePOI }); },
  enterInterior: (id) => {
    const poi = get().activePOI;
    if (!poi || poi.entity.id !== id || !poi.interiorAvailable || get().phase !== 'active') return;
    if (document.pointerLockElement) document.exitPointerLock();
    set({ activeInterior: id, activePOI: null, phase: 'interior', movementMode: 'idle' });
    useCommercialMapStore.getState().enterInterior(id);
  },
  leaveInterior: () => {
    if (!get().activeInterior) return;
    useCommercialMapStore.getState().exitInterior();
    useCommercialMapStore.setState({ activePanel: null });
    set({ activeInterior: null, phase: 'active' });
  },
}));
