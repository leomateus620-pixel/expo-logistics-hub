import { preloadBumperPhysics } from './preloadBumperPhysics';
import { markCommercialMapStage } from './performanceDiagnostics';

let pending: Promise<{ default: typeof import('../components/canvas/CommercialMapCanvas').CommercialMapCanvas }> | undefined;

export function preloadCommercialMapCanvas() {
  // Parse physics during data/GPU preparation, before its first activation.
  void preloadBumperPhysics().catch(() => undefined);
  return pending ??= import('../components/canvas/CommercialMapCanvas').then((module) => {
    markCommercialMapStage('renderer-module-ready');
    return { default: module.CommercialMapCanvas };
  }).catch((error) => {
    pending = undefined;
    throw error;
  });
}
