import type { CommercialLot, MapEntity } from '../types';
import { geometryCentroid } from '../utils/geometry';
import { strategicLandmarkFocusDirection } from '../utils/landmarks';
import { defaultVisitSpawn, type VisitWorld } from './VisitWorld';
import { PARK_ACCESS_SPATIAL_PLAN } from '../data/parkAccessSpatialPlan';

export interface VisitSpawnRequest { entityId?: string; spawnId?: string }
/** Registry targets canonical IDs; adding an entry never duplicates a model. */
export const VISIT_SPAWN_POINTS = {
  entrance: 'A1',
  brasilia: 'RUA-BRASILIA',
  exporural: 'Q-R-02',
  ics: 'QUADRA-E',
  pavilion: 'B1',
  headquarters: 'B12',
  restaurant: 'C2',
  arena: 'F',
  exterior: 'AV-IMIGRANTES',
  livestockPavilion: 'PAVILHAO-09',
  stage: 'B13',
} as const;
export type VisitSpawnId = keyof typeof VISIT_SPAWN_POINTS;
export const VISIT_SPAWN_LABELS: Record<VisitSpawnId, string> = {
  entrance: 'Entrada · Portão 1', brasilia: 'Rua Brasília', exporural: 'Exporural · R-02',
  ics: 'ICS · Quadra E', pavilion: 'Pavilhão 1', headquarters: 'Casa Fenasoja',
  restaurant: 'Restaurante', arena: 'Arena Sicredi - Icatu', exterior: 'Exterior · Avenida dos Imigrantes',
  livestockPavilion: 'Pavilhão 09', stage: 'Palco Cultural Lactalis',
};

/** Never resolve a registry entry against a second, broader map data source. */
export function visitSpawnEntity(spawnId: string, entities: readonly MapEntity[]): MapEntity | null {
  if (!Object.prototype.hasOwnProperty.call(VISIT_SPAWN_POINTS, spawnId)) return null;
  const identifier = VISIT_SPAWN_POINTS[spawnId as VisitSpawnId];
  return entities.find(entity => entity.publicIdentifier === identifier && !entity.isArchived) ?? null;
}

/** Future deep links are resolved strictly inside the authorized data snapshot. */
export function resolveVisitDeepLink(query: URLSearchParams, entities: readonly MapEntity[], lots: readonly CommercialLot[]): VisitSpawnRequest | null {
  if (query.get('mode') !== 'visit') return null;
  const id = query.get('lot');
  if (!id) return visitSpawnEntity('entrance', entities) ? { spawnId: 'entrance' }
    : entities.some(entity => !entity.isArchived && entity.classification !== 'INTERNAL_STAND') ? {} : null;
  const lot = lots.find(l => l.id === id && !l.archivedAt);
  const entity = lot && entities.find(e => e.id === lot.entityId && !e.isArchived);
  // An internal stand is reached only through the explicit interior action.
  return entity && entity.classification !== 'INTERNAL_STAND' ? { entityId: entity.id } : null;
}

export function resolveVisitSpawn(request: VisitSpawnRequest, entities: readonly MapEntity[], world: VisitWorld) {
  const requested = request.entityId ? entities.find(e => e.id === request.entityId && !e.isArchived)
    : request.spawnId ? visitSpawnEntity(request.spawnId, entities) : undefined;
  if ((request.entityId || request.spawnId) && !requested) throw new Error('Este ponto de visita não está disponível no mapa autorizado.');
  if (requested?.classification === 'INTERNAL_STAND') throw new Error('Acesse este espaço pela entrada explícita do interior.');
  if (requested?.publicIdentifier === 'A2') {
    // A2's cadastral diamond is a point marker, not the gatehouse footprint.
    // Arriving beside that tiny diamond put the visitor behind the service wall.
    // Use the existing architecture's avenue-facing right passage for all callers.
    const gate2 = PARK_ACCESS_SPATIAL_PLAN.gates.gate2;
    const yaw = gate2.facadeRotationRadians;
    const cosine = Math.cos(yaw), sine = Math.sin(yaw);
    const passageX = gate2.width * .36;
    const arrivalZ = gate2.depth / 2 + .36;
    const position = world.resolveSpawn({
      x: gate2.anchor[0] + passageX * cosine + arrivalZ * sine,
      z: gate2.anchor[1] - passageX * sine + arrivalZ * cosine,
    });
    // Face through the covered passage toward the internal woodland connector.
    return { position, yaw: -yaw };
  }
  const gate = visitSpawnEntity('entrance', entities);
  if (gate && (!requested || requested.id === gate.id)) {
    const position = world.resolveSpawn(defaultVisitSpawn());
    const road = visitSpawnEntity('brasilia', entities);
    const anchor = geometryCentroid((road ?? gate).geometry);
    // The arrival is already inside the gate. Face circulation into the park,
    // never back toward the gate facade and the external avenue.
    const dx = road ? anchor[0] - position.x : position.x - anchor[0];
    const dz = road ? anchor[1] - position.z : position.z - anchor[1];
    return { position, yaw: Math.atan2(dx, -dz) };
  }
  const entity = requested ?? entities.find(e => !e.isArchived && e.classification === 'ROAD')
    ?? entities.find(e => !e.isArchived && e.classification !== 'INTERNAL_STAND');
  if (!entity) throw new Error('Não há uma área externa disponível para iniciar a visita.');
  const anchor = geometryCentroid(entity.geometry);
  // Start just outside a footprint edge, facing the selected lot/structure.
  let x = anchor[0], z = anchor[1];
  const ring = entity.geometry.coordinates[0];
  if (ring && ring.length >= 2) {
    const facing = strategicLandmarkFocusDirection(entity);
    let edge = 0, bestAlignment = -Infinity;
    if (facing) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      const dx = (a[0] + b[0]) / 2 - anchor[0], dz = (a[1] + b[1]) / 2 - anchor[1];
      const alignment = (dx * facing[0] + dz * facing[2]) / (Math.hypot(dx, dz) || 1);
      if (alignment > bestAlignment) { bestAlignment = alignment; edge = i; }
    }
    const a = ring[edge], b = ring[(edge + 1) % ring.length]; const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const length = Math.hypot(mx - x, mz - z) || 1;
    x = mx + (mx - x) / length * .2; z = mz + (mz - z) / length * .2;
  }
  const position = world.resolveSpawn({ x, z });
  return { position, yaw: Math.atan2(anchor[0] - position.x, -(anchor[1] - position.z)) };
}
