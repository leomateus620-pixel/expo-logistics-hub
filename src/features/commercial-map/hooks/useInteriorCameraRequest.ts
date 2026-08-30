import { createContext, useContext, useLayoutEffect, type Dispatch, type SetStateAction } from 'react';
import type { Vector3 } from 'three';

/** Interior scenes describe a view; only the persistent CameraRig may move it. */
export interface InteriorCameraRequest {
  entityId: string;
  position: Vector3;
  target: Vector3;
  fov: number;
  near: number;
  far: number;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  minAzimuthAngle?: number;
  maxAzimuthAngle?: number;
  dampingFactor?: number;
  enablePan?: boolean;
  zoomToCursor?: boolean;
  panBounds?: {
    center: Vector3;
    facing: number;
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  };
}

export const InteriorCameraRequestContext = createContext<
  Dispatch<SetStateAction<InteriorCameraRequest | null>> | null
>(null);

export function useInteriorCameraRequest(request: InteriorCameraRequest) {
  const publish = useContext(InteriorCameraRequestContext);
  useLayoutEffect(() => {
    publish?.(request);
    // A departing scene must not clear a newer scene's camera request.
    return () => publish?.((current) => current === request ? null : current);
  }, [publish, request]);
}
