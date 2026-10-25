import { useSoyHarvestStore } from './useSoyHarvestStore';
import { soyHarvestCameraFrame } from './SoyHarvestCamera';

/** A read-only guard, with no dependency on the map/visit stores. */
export const isSoyHarvestCameraOwned = () => {
  const state = useSoyHarvestStore.getState();
  // Error dispatch can precede CameraRig's synchronous layout restoration.
  // Keep the lease until its snapshot is released, including that commit gap.
  return state.enabled || state.status === 'restoring' || soyHarvestCameraFrame.initial.captured;
};
