import { captureCommercialMapStageRecorder, type CommercialMapStageRecorder } from './performanceDiagnostics';
import { preloadHeadquartersGeometry } from '../components/canvas/headquarters/headquartersPreparationResource';

let pending: Promise<{ default: typeof import('../components/canvas/CommercialMapCanvas').CommercialMapCanvas }> | undefined;
let ready = false;

export function preloadCommercialMapCanvas({ prepareHeadquarters = true, recordStage = captureCommercialMapStageRecorder() }:
  { prepareHeadquarters?: boolean; recordStage?: CommercialMapStageRecorder } = {}) {
  if (prepareHeadquarters) void preloadHeadquartersGeometry(recordStage).catch(() => undefined);
  const source = ready ? 'cached' : pending ? 'prefetched' : 'cold';
  recordStage('renderer-module-requested', { source });
  pending ??= import('../components/canvas/CommercialMapCanvas').then((module) => {
    ready = true;
    return { default: module.CommercialMapCanvas };
  }).catch((error) => {
    pending = undefined;
    throw error;
  });
  // Each real boot observes ready even when another operation did the import.
  void pending.then(() => recordStage('renderer-module-ready', { source }), () => undefined);
  return pending;
}
