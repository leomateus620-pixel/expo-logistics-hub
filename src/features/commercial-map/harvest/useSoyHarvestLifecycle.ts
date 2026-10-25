import { useEffect, useRef } from 'react';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import { useVisitStore } from '../visit/useVisitStore';
import type { MapPanel } from '../types';
import { setSoyHarvestStartGuard, useSoyHarvestStore } from './useSoyHarvestStore';
import { soyHarvestUnavailableReason } from './SoyHarvestButton';

/** Keep UI context local. No commercial reads/writes or persisted playback state. */
export function useSoyHarvestLifecycle(available: boolean, presentationVisible: boolean) {
  const savedPanel = useRef<{ panel: MapPanel } | null>(null);
  const availability = useRef(available); availability.current = available;
  useEffect(() => {
    setSoyHarvestStartGuard(() => !availability.current ? 'A lavoura não está disponível nesta área.' : soyHarvestUnavailableReason());
    const unsubscribe = useSoyHarvestStore.subscribe((state, previous) => {
      if (state.enabled && !previous.enabled) {
        const map = useCommercialMapStore.getState();
        savedPanel.current = {panel: map.activePanel};
        useCommercialMapStore.setState({activePanel:null, hoveredEntityId:null});
      }
      if (!state.enabled && previous.enabled && savedPanel.current) {
        useCommercialMapStore.setState({activePanel:savedPanel.current.panel}); savedPanel.current=null;
      }
    });
    const stopOnContextChange = useCommercialMapStore.subscribe((state, previous) => {
      if (!useSoyHarvestStore.getState().enabled) return;
      if (state.activeScopeKey !== previous.activeScopeKey || state.activeSegmentId !== previous.activeSegmentId
        || state.workspaceMode !== previous.workspaceMode || state.interiorEntityId !== previous.interiorEntityId
        || state.hydrologicalModeActive !== previous.hydrologicalModeActive
        || state.salesPresentationActive !== previous.salesPresentationActive
        || state.search !== previous.search || state.statusFilters !== previous.statusFilters
        || state.layerVisibility !== previous.layerVisibility || state.parkingInspectionOpen
        || state.lunarLaunchPhase !== 'idle' || state.lunarLaunchReturning) useSoyHarvestStore.getState().cancel();
    });
    const visit = useVisitStore.subscribe(state => { if (state.enabled && useSoyHarvestStore.getState().enabled) useSoyHarvestStore.getState().cancel(); });
    return () => {
      setSoyHarvestStartGuard(null);
      unsubscribe(); stopOnContextChange(); visit();
      useSoyHarvestStore.getState().restoreField(); useSoyHarvestStore.getState().finishRestore();
      savedPanel.current=null;
    };
  }, []);
  useEffect(() => {
    if (!available) { useSoyHarvestStore.getState().restoreField(); return; }
    if (!presentationVisible) useSoyHarvestStore.getState().pause();
  }, [available, presentationVisible]);
}
