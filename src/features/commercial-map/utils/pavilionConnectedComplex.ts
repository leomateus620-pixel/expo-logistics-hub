import type { MapEntity } from '../types';
import { PAVILION_CONNECTED_COMPLEX } from '../data/pavilionConnectedComplex';
import { commercialPavilionModelBounds, createCommercialPavilionLayout, resolveCommercialPavilionDefinition } from './commercialPavilions';
import { pavilionArchitectureEaveY } from './pavilionArchitectureLayout';
import { strategicLandmarkBounds, strategicLandmarkFacingRadians, strategicLandmarkVisualHeight } from './landmarks';

export interface PavilionConstructionJoin {
  id: string;
  owner: string;
  entityIds: readonly [string, string];
  identifiers: readonly [string, string];
  cadastralGap: number;
  shellGap: number;
  minX: number; maxX: number; minZ: number; maxZ: number;
  floorY: number;
  westEaveY: number;
  eastEaveY: number;
  /** Optional rear corners for a conservative transition to a sloping annex. */
  westRearEaveY?: number;
  eastRearEaveY?: number;
  thickness: number;
}

/** Uses only the supplied, already scoped, active entities. The official
 * fixture is never imported here, and missing neighbors do not trigger reads.
 * Every join has one owner outside either pavilion's commercial identity.
 */
export function buildPavilionConnectedComplex(entities: readonly MapEntity[]): PavilionConstructionJoin[] {
  const byIdentifier = new Map(entities.filter(entity => !entity.isArchived).map(entity => [entity.publicIdentifier, entity]));
  return PAVILION_CONNECTED_COMPLEX.pairs.flatMap(pair => {
    const west = byIdentifier.get(pair.west), east = byIdentifier.get(pair.east);
    if (!west || !east) return [];
    const westDefinition = resolveCommercialPavilionDefinition(west), eastDefinition = resolveCommercialPavilionDefinition(east);
    if (!westDefinition || !eastDefinition) return [];
    // This source family faces local +Z toward Argentina after yaw PI.
    // Decline an incompatible new implantation instead of forcing an X join.
    if (Math.abs(strategicLandmarkFacingRadians(west) - Math.PI) > 0.001
      || Math.abs(strategicLandmarkFacingRadians(east) - Math.PI) > 0.001) return [];
    const wb = strategicLandmarkBounds(west), eb = strategicLandmarkBounds(east);
    const wl = createCommercialPavilionLayout(commercialPavilionModelBounds(wb, Math.PI), westDefinition, strategicLandmarkVisualHeight(west) ?? undefined);
    const el = createCommercialPavilionLayout(commercialPavilionModelBounds(eb, Math.PI), eastDefinition, strategicLandmarkVisualHeight(east) ?? undefined);
    const minX = wb.centerX + wl.exterior.shell.width / 2;
    const maxX = eb.centerX - el.exterior.shell.width / 2;
    const minZ = Math.max(wb.centerZ - wl.exterior.shell.depth / 2, eb.centerZ - el.exterior.shell.depth / 2);
    const maxZ = Math.min(wb.centerZ + wl.exterior.shell.depth / 2, eb.centerZ + el.exterior.shell.depth / 2);
    const cadastralGap = eb.minX - wb.maxX, shellGap = maxX - minX;
    if (cadastralGap < 0 || cadastralGap > PAVILION_CONNECTED_COMPLEX.maximumCadastralGap
      || shellGap <= 0 || shellGap > PAVILION_CONNECTED_COMPLEX.maximumShellGap || maxZ <= minZ) return [];
    return [{
      id: pair.id, owner: pair.owner, entityIds: [west.id, east.id] as const,
      identifiers: [pair.west, pair.east] as const, cadastralGap, shellGap,
      minX, maxX, minZ, maxZ,
      floorY: Math.max(west.geometry.elevation + wl.interior.floorY, east.geometry.elevation + el.interior.floorY),
      westEaveY: west.geometry.elevation + pavilionArchitectureEaveY(wl),
      eastEaveY: east.geometry.elevation + pavilionArchitectureEaveY(el),
      thickness: Math.min(wl.exterior.roof.thickness, el.exterior.roof.thickness),
    }];
  });
}
