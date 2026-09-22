/** Camera handoff protocol. Only the persistent CameraRig applies this pose. */
export const visitCameraFrame = {
  ready: false, restored: false,
  position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: -1 },
  fov: 65, near: 0.008, far: 180,
  initial: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 38, near: 0.05, far: 500, captured: false },
};
export const visitRuntime = { moving: false, paused: false, renderingActive: false };
