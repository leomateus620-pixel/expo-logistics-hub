let pending: Promise<typeof import('../../../pages/CommercialMapPage')> | undefined;
let ready = false;

/** Import-only: no route boot, React mount, renderer, or speculative hard reload. */
export function loadCommercialMapRouteModule() {
  return pending ??= import('../../../pages/CommercialMapPage').then(module => {
    ready = true;
    return module;
  }).catch(error => {
    pending = undefined;
    throw error;
  });
}

export function commercialMapRouteModuleState() { return ready ? 'cached' : pending ? 'prefetched' : 'cold'; }
