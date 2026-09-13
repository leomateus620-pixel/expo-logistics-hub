import { markCommercialMapStage } from './performanceDiagnostics';
import { prepareHydrologyCoordinates, unpackHydrologyCoordinates, type HydrologyPreparationInput,
  type PackedHydrologyPreparation } from './hydrologyPreparation';

type Prepared = ReturnType<typeof unpackHydrologyCoordinates>;
interface Resource {
  input: HydrologyPreparationInput;
  promise: Promise<void>;
  controller: AbortController;
  owners: Set<object>;
  state: 'pending' | 'ready' | 'failed';
  value?: Prepared;
  error?: unknown;
}
const cache = new WeakMap<HydrologyPreparationInput['surfaces'], Resource[]>();
const ownerResources = new WeakMap<object, Set<Resource>>();
const closedOwners = new WeakSet<object>();
const cancelledError = () => new DOMException('Hydrology preparation cancelled', 'AbortError');

/** Canvas lifetime includes children that suspended before committing. Completed
 * data remains cached, but abandoned pending work cannot block the next route. */
export function retainHydrologyPreparationOwner(owner: object) {
  closedOwners.delete(owner);
  if (!ownerResources.has(owner)) ownerResources.set(owner, new Set());
  return () => {
    closedOwners.add(owner);
    const resources = ownerResources.get(owner);
    ownerResources.delete(owner);
    resources?.forEach((resource) => {
      resource.owners.delete(owner);
      if (resource.state !== 'pending' || resource.owners.size) return;
      const cached = cache.get(resource.input.surfaces);
      const index = cached?.indexOf(resource) ?? -1;
      if (index >= 0) cached!.splice(index, 1);
      resource.controller.abort();
    });
  };
}

function deferredFallback(input: HydrologyPreparationInput, signal: AbortSignal) {
  return new Promise<PackedHydrologyPreparation>((resolve, reject) => {
    if (signal.aborted) { reject(cancelledError()); return; }
    const abort = () => { clearTimeout(timer); reject(cancelledError()); };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) { reject(cancelledError()); return; }
      try { resolve(prepareHydrologyCoordinates(input)); } catch (error) { reject(error); }
    }, 0);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function prepareInWorker(input: HydrologyPreparationInput, signal: AbortSignal): Promise<PackedHydrologyPreparation> {
  if (signal.aborted) return Promise.reject(cancelledError());
  if (typeof Worker === 'undefined') return deferredFallback(input, signal);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./hydrologyPreparation.worker.ts', import.meta.url), { type: 'module' });
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      return true;
    };
    const abort = () => { if (finish()) reject(cancelledError()); };
    const timeout = setTimeout(() => {
      if (finish()) reject(new Error('Hydrology preparation worker timed out'));
    }, 30000);
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<PackedHydrologyPreparation>) => { if (finish()) resolve(event.data); };
    worker.onerror = (event) => { if (finish()) reject(new Error(event.message)); };
    try {
      // The worker receives geometry/classification, never commercial relations.
      worker.postMessage({ ...input, surfaces: input.surfaces.map((surface) => ({
        id: surface.id, classification: surface.classification, geometry: surface.geometry,
      })) });
    } catch (error) { if (finish()) reject(error); }
  });
}

/** Suspense resource cached by the exact immutable inventory and quality. */
export function readPreparedHydrology(input: HydrologyPreparationInput, owner?: object): Prepared {
  if (owner && closedOwners.has(owner)) throw cancelledError();
  let resources = cache.get(input.surfaces);
  if (!resources) { resources = []; cache.set(input.surfaces, resources); }
  let resource = resources.find((candidate) => candidate.input.nodes === input.nodes
    && candidate.input.segments === input.segments && candidate.input.reducedGraphics === input.reducedGraphics);
  if (!resource) {
    const startedAt = performance.now();
    markCommercialMapStage('hydrology-cpu:start');
    resource = { input, promise: Promise.resolve(), controller: new AbortController(), owners: new Set(), state: 'pending' };
    const target = resource;
    target.promise = prepareInWorker(input, target.controller.signal).catch((error) => {
      if (target.controller.signal.aborted) throw error;
      markCommercialMapStage('hydrology-worker-fallback');
      return deferredFallback(input, target.controller.signal);
    }).then((packed) => {
      if (target.controller.signal.aborted) return;
      target.value = unpackHydrologyCoordinates(input, packed);
      target.state = 'ready';
      markCommercialMapStage('hydrology-cpu:end', performance.now() - startedAt);
    }, (error) => {
      target.state = 'failed';
      target.error = error;
      if (!target.controller.signal.aborted) markCommercialMapStage('hydrology-cpu:end', performance.now() - startedAt, true);
    });
    resources.push(target);
  }
  if (owner) {
    let owned = ownerResources.get(owner);
    if (!owned) { owned = new Set(); ownerResources.set(owner, owned); }
    owned.add(resource);
    resource.owners.add(owner);
  }
  if (resource.state === 'failed') throw resource.error;
  if (!resource.value) throw resource.promise;
  return resource.value;
}
