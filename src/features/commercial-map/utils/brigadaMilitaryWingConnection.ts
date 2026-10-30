import type { MapEntity } from '../types';
import { createBrigadaMilitaryWingLayout, brigadaWingRoofHeight, type BrigadaMilitaryWingLayout } from './brigadaMilitaryWing';
import { pavilionArchitectureEaveY } from './pavilionArchitectureLayout';
import type { PavilionConstructionJoin } from './pavilionConnectedComplex';

export const BRIGADA_WING_CONNECTION_OWNER = 'brigada-military-wing:construction-join';
export interface BrigadaMilitaryWingPresentation {
  wing: MapEntity;
  pavilion3: MapEntity;
  layout: BrigadaMilitaryWingLayout;
  join: PavilionConstructionJoin;
}

/** Additional, independently measured annex. The two commercial-pavilion
 * joins retain their original registry and budget. Only supplied scoped,
 * same-project active entities can produce this presentation.
 */
export function buildBrigadaMilitaryWingPresentation(entities: readonly MapEntity[]): BrigadaMilitaryWingPresentation | null {
  const wing = entities.find(entity => entity.publicIdentifier === 'B19' && !entity.isArchived);
  const pavilion3 = entities.find(entity => entity.publicIdentifier === 'B6' && !entity.isArchived);
  if (!wing || !pavilion3) return null;
  const layout = createBrigadaMilitaryWingLayout(wing, pavilion3);
  if (!layout) return null;
  const pb = layout.pavilion3Bounds, pl = layout.pavilion3Layout;
  const minX = pb.centerX + pl.exterior.shell.width / 2, maxX = layout.minX;
  const minZ = layout.frontZ, maxZ = Math.min(layout.maxZ, pb.centerZ + pl.exterior.shell.depth / 2);
  const cadastralGap = layout.minX - pb.maxX, shellGap = maxX - minX;
  if (cadastralGap < -1e-6 || cadastralGap > .35 || shellGap <= 0 || shellGap > .55 || maxZ <= minZ) return null;
  const pavilionEave = pavilion3.geometry.elevation + pavilionArchitectureEaveY(pl);
  return {
    wing, pavilion3, layout,
    join: {
      id: 'p3-brigada', owner: BRIGADA_WING_CONNECTION_OWNER,
      entityIds: [pavilion3.id, wing.id], identifiers: ['B6', 'B19'],
      cadastralGap, shellGap, minX, maxX, minZ, maxZ, floorY: layout.floorY,
      westEaveY: pavilionEave, westRearEaveY: pavilionEave,
      eastEaveY: brigadaWingRoofHeight(layout, maxX, minZ),
      eastRearEaveY: brigadaWingRoofHeight(layout, maxX, maxZ),
      thickness: Math.min(pl.exterior.roof.thickness, layout.roofThickness),
    },
  };
}
