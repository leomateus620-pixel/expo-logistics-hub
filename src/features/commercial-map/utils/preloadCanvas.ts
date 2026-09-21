import { markCommercialMapStage } from './performanceDiagnostics';
import { preloadHeadquartersGeometry } from '../components/canvas/headquarters/headquartersPreparationResource';

let pending: Promise<{ default: typeof import('../components/canvas/CommercialMapCanvas').CommercialMapCanvas }> | undefined;

export function preloadCommercialMapCanvas({ prepareHeadquarters = true }: { prepareHeadquarters?: boolean } = {}) {
  if (prepareHeadquarters) void preloadHeadquartersGeometry().catch(() => undefined);
  markCommercialMapStage('renderer-module-requested');
  return pending ??= import('../components/canvas/CommercialMapCanvas').then((module) => {
    markCommercialMapStage('renderer-module-ready');
    return { default: module.CommercialMapCanvas };
  }).catch((error) => {
    pending = undefined;
    throw error;
  });
}
