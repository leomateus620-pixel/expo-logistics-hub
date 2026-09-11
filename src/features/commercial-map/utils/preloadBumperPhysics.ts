let pending: Promise<typeof import('../components/canvas/AmusementParkPhysics')> | undefined;
export function preloadBumperPhysics() {
  return pending ??= import('../components/canvas/AmusementParkPhysics').catch((error) => {
    pending = undefined;
    throw error;
  });
}
