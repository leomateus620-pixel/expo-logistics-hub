import { create } from 'zustand';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import type { VisitPOI } from './VisitPOIManager';

export type VisitPhase = 'loading' | 'entering' | 'active' | 'interior' | 'exiting';
export type VisitCameraMode = 'first' | 'third';
export type VisitMobilityMode = 'walk' | 'cart' | 'helicopter';
export type VisitMobilityPhase = 'walk' | 'cart-entering' | 'cart-driving' | 'cart-exiting'
  | 'helicopter-requested' | 'helicopter-arriving' | 'helicopter-landed'
  | 'helicopter-entering' | 'helicopter-flying' | 'helicopter-landing' | 'helicopter-grounded' | 'helicopter-exiting';
type MapState = ReturnType<typeof useCommercialMapStore.getState>;
type ReturnContext = Pick<MapState, 'workspaceMode' | 'activePanel' | 'selectedEntityId' | 'selectedModuleId' | 'hoveredEntityId' | 'hydrologicalModeActive' | 'parkingInspectionOpen' | 'salesPresentationActive' | 'interiorEntityId' | 'interiorReturnView' | 'interiorReturnContext' | 'interiorViewCommand' | 'treesVisible' | 'nightModeActive' | 'rainModeActive'>;
let returnContext: ReturnContext | null = null;

interface VisitState {
  enabled: boolean;
  phase: VisitPhase;
  cameraMode: VisitCameraMode;
  mobilityMode: VisitMobilityMode;
  mobilityPhase: VisitMobilityPhase;
  vehicleNotice: string | null;
  canBoardHelicopter: boolean;
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
  requestCart: () => void;
  requestHelicopter: () => void;
  enterHelicopter: () => void;
  requestHelicopterLanding: () => void;
  cancelHelicopter: () => void;
  exitVehicle: () => void;
  setMobilityPhase: (phase: VisitMobilityPhase) => void;
  setVehicleNotice: (notice: string | null) => void;
  setCanBoardHelicopter: (available: boolean) => void;
  setActivePOI: (poi: VisitPOI | null) => void;
  enterInterior: (id: string) => void;
  leaveInterior: () => void;
}

/** Discrete UI state only. Positions/velocity/input never flow through React. */
export const useVisitStore = create<VisitState>((set, get) => ({
  enabled: false, phase: 'loading', cameraMode: 'first', mobilityMode: 'walk', mobilityPhase: 'walk', vehicleNotice: null, canBoardHelicopter: false, movementMode: 'idle',
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
    set({ enabled: true, phase: 'loading', mobilityMode: 'walk', mobilityPhase: 'walk', vehicleNotice: null, canBoardHelicopter: false, activePOI: null, activeInterior: null,
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
    set({ phase: 'exiting', mobilityMode: 'walk', mobilityPhase: 'walk', vehicleNotice: null, canBoardHelicopter: false, activePOI: null, activeInterior: null, isRunning: false, movementMode: 'idle' });
    useCommercialMapStore.setState({ interiorEntityId: null, activePanel: null });
  },
  finishExit: () => {
    const snapshot = returnContext; returnContext = null;
    if (snapshot) useCommercialMapStore.setState({ ...snapshot, cameraNavigating: false });
    set({ enabled: false, mobilityMode: 'walk', mobilityPhase: 'walk', vehicleNotice: null, canBoardHelicopter: false, activePOI: null, activeInterior: null, movementMode: 'idle', isRunning: false, error: null });
  },
  setCameraMode: (cameraMode) => set({ cameraMode }),
  requestCart: () => {
    if (get().phase !== 'active' || get().mobilityPhase !== 'walk') return;
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
    set({ mobilityMode: 'cart', mobilityPhase: 'cart-entering', cameraMode: 'third', activePOI: null, vehicleNotice: null });
  },
  requestHelicopter: () => {
    if (get().phase !== 'active' || get().mobilityPhase !== 'walk') return;
    if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
    set({ mobilityMode: 'helicopter', mobilityPhase: 'helicopter-requested', activePOI: null, vehicleNotice: null, canBoardHelicopter: false });
  },
  enterHelicopter: () => {
    if (get().phase !== 'active' || get().mobilityPhase !== 'helicopter-landed' || !get().canBoardHelicopter) return;
    set({ mobilityPhase: 'helicopter-entering', cameraMode: 'third', activePOI: null, vehicleNotice: null });
  },
  requestHelicopterLanding: () => {
    if (get().phase !== 'active' || get().mobilityPhase !== 'helicopter-flying') return;
    set({ mobilityPhase: 'helicopter-landing', vehicleNotice: null });
  },
  cancelHelicopter: () => {
    if (!['helicopter-requested', 'helicopter-arriving', 'helicopter-landed'].includes(get().mobilityPhase)) return;
    set({ mobilityMode: 'walk', mobilityPhase: 'walk', vehicleNotice: null, canBoardHelicopter: false });
  },
  exitVehicle: () => {
    if (get().phase !== 'active' || !['cart-driving', 'helicopter-grounded'].includes(get().mobilityPhase)) return;
    set({ mobilityPhase: get().mobilityMode === 'cart' ? 'cart-exiting' : 'helicopter-exiting', activePOI: null, vehicleNotice: null });
  },
  setMobilityPhase: (mobilityPhase) => {
    if (get().mobilityPhase !== mobilityPhase) set({ mobilityPhase });
  },
  setVehicleNotice: (vehicleNotice) => {
    if (get().vehicleNotice !== vehicleNotice) set({ vehicleNotice });
  },
  setCanBoardHelicopter: (canBoardHelicopter) => {
    if (get().canBoardHelicopter !== canBoardHelicopter) set({ canBoardHelicopter });
  },
  // Indexed POIs keep their identity between 10 Hz queries. A refetched
  // canonical snapshot must replace the card even when the entity ID matches.
  setActivePOI: (activePOI) => { if (activePOI !== get().activePOI) set({ activePOI }); },
  enterInterior: (id) => {
    const poi = get().activePOI;
    if (!poi || poi.entity.id !== id || !poi.interiorAvailable || get().phase !== 'active' || get().mobilityMode !== 'walk') return;
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
