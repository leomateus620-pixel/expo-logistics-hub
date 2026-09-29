import { _roots } from '@react-three/fiber';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import { useVisitStore } from '../visit/useVisitStore';
import { officialPdfPointToLocal } from '../data/officialReference2026';
import { DIAGNOSTICS_MAP_DATA } from './commercialMapDiagnosticsData';

/** Opt-in fixture only; the normal/public routes never install this probe. */
export function installBenvenutoSurfaceQa() {
  if (!new URLSearchParams(location.search).has('benvenutoQa')) return;
  const timer = window.setInterval(() => {
    const canvas = document.querySelector('canvas');
    const root = canvas && _roots.get(canvas)?.store;
    if (!root) return;
    Object.assign(window, { __benvenutoQa: {
      root, map: useCommercialMapStore, visit: useVisitStore,
      data: DIAGNOSTICS_MAP_DATA,
      point: officialPdfPointToLocal,
    } });
  }, 250);
  return () => {
    window.clearInterval(timer);
    Reflect.deleteProperty(window, '__benvenutoQa');
  };
}
