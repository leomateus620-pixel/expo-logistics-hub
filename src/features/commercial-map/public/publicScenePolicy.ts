import type { MapEntity } from '../types';
import type { PublicMapInventory } from './publicMapTypes';

export interface PublicFocusBounds {
  minX: number; maxX: number; minZ: number; maxZ: number;
  width: number; depth: number; centerX: number; centerZ: number;
  diagonal: number; maxHeight: number;
}

/** Visual context never grants commercial access. Membership comes from the RPC. */
export interface PublicExternalScenePolicy {
  mode: 'public-external';
  vegetationEnabled: false;
  contextAppearance: 'grayscale';
  activeScope: ReadonlySet<string>;
  interactiveEntityIds: ReadonlySet<string>;
  interactiveLotIds: ReadonlySet<string>;
  focusBounds: PublicFocusBounds;
}

export function createPublicExternalScenePolicy(inventory: PublicMapInventory): PublicExternalScenePolicy | null {
  if (inventory.scope.kind === 'PAVILION') return null;
  const interactiveEntityIds = new Set(inventory.lots.map(lot => lot.entityId));
  const focusEntities = inventory.entities.filter(entity => interactiveEntityIds.has(entity.id));
  const entityById = new Map(inventory.entities.map(entity => [entity.id, entity]));
  const belongsToPavilion = (entity: MapEntity) => {
    const visited = new Set<string>();
    let current: MapEntity | undefined = entity;
    while (current && !visited.has(current.id)) {
      if (current.classification === 'PAVILION') return true;
      visited.add(current.id);
      current = current.parentEntityId ? entityById.get(current.parentEntityId) : undefined;
    }
    return false;
  };
  return {
    mode: 'public-external', vegetationEnabled: false, contextAppearance: 'grayscale',
    activeScope: new Set(inventory.entities.filter(entity => interactiveEntityIds.has(entity.id)
      || (!isSharedCirculation(entity) && !(inventory.scope.kind === 'SEGMENT_EXTERNAL' && belongsToPavilion(entity))))
      .map(entity => entity.id)),
    interactiveEntityIds,
    interactiveLotIds: new Set(inventory.lots.map(lot => lot.id)),
    focusBounds: publicFocusBounds(focusEntities.length ? focusEntities : inventory.entities),
  };
}

export function publicFocusBounds(entities: readonly MapEntity[]): PublicFocusBounds {
  const points = entities.flatMap(entity => entity.geometry.coordinates.flat()).filter(([x, z]) => Number.isFinite(x) && Number.isFinite(z));
  const minX = points.length ? Math.min(...points.map(p => p[0])) : -1;
  const maxX = points.length ? Math.max(...points.map(p => p[0])) : 1;
  const minZ = points.length ? Math.min(...points.map(p => p[1])) : -1;
  const maxZ = points.length ? Math.max(...points.map(p => p[1])) : 1;
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ,
    centerX: (maxX + minX) / 2, centerZ: (maxZ + minZ) / 2,
    diagonal: Math.hypot(maxX - minX, maxZ - minZ),
    maxHeight: Math.max(1, ...entities.map(e => e.geometry.elevation + e.geometry.extrusionHeight)),
  };
}

export function isSharedCirculation(entity: MapEntity) {
  return entity.classification === 'ROAD' || entity.classification === 'PEDESTRIAN_PATH';
}
