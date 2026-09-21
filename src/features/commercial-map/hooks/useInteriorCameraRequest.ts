import { createContext, useContext, useLayoutEffect, type Dispatch, type SetStateAction } from 'react';
import type { Vector3 } from 'three';

export type InteriorViewAction = 'vertical' | 'horizontal' | 'inspect';
export interface InteriorViewCommand {
  entityId: string;
  action: InteriorViewAction;
  requestId: number;
}
export interface PavilionCameraGeometry {
  key: string;
  facing: number;
  defaultRotation: number;
  readingAxis: 'x' | 'z';
  width: number;
  depth: number;
  modules: readonly { id: string; center: Vector3; width: number; depth: number }[];
}

/** Interior scenes describe a view; only the persistent CameraRig may move it. */
export interface InteriorCameraRequest {
  entityId: string;
  pavilion?: PavilionCameraGeometry;
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
  enableRotate?: boolean;
  zoomToCursor?: boolean;
  mouseButtons?: { LEFT: number; MIDDLE: number; RIGHT: number };
  touches?: { ONE: number; TWO: number };
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
