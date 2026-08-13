import { useCommercialMapStore } from '../../../state/useCommercialMapStore';

export function resetExecutiveExperienceState(experienceAvailable?: boolean) {
  useCommercialMapStore.setState({
    cameraNavigating: false,
    executiveFocusActive: false,
    executiveTarget: null,
    executiveCameraOffset: null,
    executiveInteractionPhase: 'walking',
    executiveInteractionEnabled: false,
    ...(experienceAvailable === undefined
      ? {}
      : { executiveExperienceAvailable: experienceAvailable }),
  });
}
