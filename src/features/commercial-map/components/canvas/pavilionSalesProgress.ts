import { classifyDashboardLot } from '../../dashboard/commercialDashboardClassification';
import type { CommercialLot, MapEntity } from '../../types';
import { commercialPavilionModelBounds, createCommercialPavilionLayout, resolveCommercialPavilionDefinition } from '../../utils/commercialPavilions';
import { resolveCommercialPavilionModulePlan } from '../../utils/commercialPavilionModules';
import { strategicLandmarkBounds, strategicLandmarkFacingRadians, strategicLandmarkVisualHeight } from '../../utils/landmarks';
import { createPavilionArchitectureLayout, pavilionArchitectureHeight } from '../../utils/pavilionArchitectureLayout';

export interface PavilionSalesProgressAnchor {
  id: string;
  publicIdentifier: string;
  position: [number, number, number];
  nearDistance: number;
  farDistance: number;
  sold: number;
  total: number;
}

/** Same active commercial inventory and persisted parent UUIDs as Dashboard. */
export function countPavilionSalesProgress(entities: readonly MapEntity[], lots: readonly CommercialLot[]) {
  const byEntity = new Map(entities.map((entity) => [entity.id, entity]));
  const byPavilion = new Map<string, { sold: number; total: number }>();
  const seen = new Set<string>();
  for (const lot of lots) {
    if (lot.archivedAt || lot.id.startsWith('reference:') || lot.status === 'UNAVAILABLE'
      || lot.commercialUnit === 'FOOD_POINT' || seen.has(lot.id)) continue;
    const entity = byEntity.get(lot.entityId);
    if (!entity || entity.isArchived) continue;
    seen.add(lot.id);
    const result = classifyDashboardLot(entity, lot, byEntity, null);
    const pavilion = result.category === 'internal' ? result.pavilion : null;
    if (!pavilion || pavilion.id.startsWith('reference:') || pavilion.projectId !== entity.projectId) continue;
    const progress = byPavilion.get(pavilion.id) ?? { sold: 0, total: 0 };
    progress.total += 1;
    if (lot.status === 'SOLD') progress.sold += 1;
    byPavilion.set(pavilion.id, progress);
  }
  return byPavilion;
}

/** Centre of the authored roof, with the correct datum for each profile. */
export function pavilionSalesProgressAnchor(entity: MapEntity, progress: { sold: number; total: number }): PavilionSalesProgressAnchor | null {
  const definition = resolveCommercialPavilionDefinition(entity);
  if (!definition || !entity.geometry.coordinates[0]?.length) return null;
  const bounds = strategicLandmarkBounds(entity);
  const span = Math.max(bounds.width, bounds.depth);
  const yaw = strategicLandmarkFacingRadians(entity);
  const layout = createCommercialPavilionLayout(commercialPavilionModelBounds(bounds, yaw), definition,
    strategicLandmarkVisualHeight(entity) ?? undefined, resolveCommercialPavilionModulePlan(entity));
  const roof = layout.exterior.roof;
  const architecture = createPavilionArchitectureLayout(layout, false);
  let localX = 0;
  let localY = roof.ridgeY + roof.thickness;
  if (architecture) {
    const height = pavilionArchitectureHeight(layout);
    // P12's closest sawtooth crest to the centre is the first inner slope.
    // Move just inside its sheet so the beam ends on the roof, never in its gap.
    if (definition.publicIdentifier === 'B3') localX = layout.exterior.shell.width * 0.008;
    localY = architecture.ridgeY + height * 0.02;
  } else if (definition.publicIdentifier === 'B2') {
    // P14 has two offset roofs with a central valley; use the inner-facing ridge of the first bay.
    localX = -roof.width / 4;
  }
  return {
    id: entity.id,
    publicIdentifier: definition.publicIdentifier,
    position: [bounds.centerX + Math.cos(yaw) * localX, entity.geometry.elevation + localY + 0.026,
      bounds.centerZ - Math.sin(yaw) * localX],
    nearDistance: Math.max(21, Math.min(38, span * 2.35)),
    farDistance: Math.max(57, Math.min(74, span * 4.1)),
    ...progress,
  };
}

export function pavilionSalesPercent(sold: number, total: number) {
  if (sold === 0 || total === 0) return 0;
  if (sold === total) return 100;
  return Math.max(1, Math.min(99, Math.round(sold / total * 100)));
}
