import type { MapEntity } from '../types';
import { BRIGADA_MILITARY_WING_REFERENCE } from '../data/brigadaMilitaryWingReference';
import { commercialPavilionModelBounds, createCommercialPavilionLayout, resolveCommercialPavilionDefinition, type CommercialPavilionLayout } from './commercialPavilions';
import { strategicLandmarkBounds, strategicLandmarkFacingRadians, strategicLandmarkVisualHeight, type StrategicLandmarkBounds } from './landmarks';
import { pavilionArchitectureCanopyProjection, pavilionArchitectureHeight } from './pavilionArchitectureLayout';

export interface BrigadaMilitaryWingLayout {
  publicIdentifier: 'B19';
  entityId: string;
  pavilion3EntityId: string;
  entityIds: readonly [string, string];
  /** Body envelope in world coordinates; no change to either persisted footprint. */
  minX: number; maxX: number; minZ: number; maxZ: number;
  frontZ: number;
  floorY: number;
  eaveY: number;
  frontRoofY: number;
  rearRoofY: number;
  roofGradientX: number;
  roofThickness: number;
  fasciaInnerY: number;
  fasciaOuterY: number;
  fasciaHeight: number;
  canopyMinX: number;
  canopyMaxX: number;
  canopyFrontZ: number;
  apronMinZ: number;
  apronMaxZ: number;
  apronMinX: number;
  apronMaxX: number;
  /** Height of the presentation above the existing B19 entity elevation. */
  height: number;
  pavilion3Height: number;
  pavilion3Elevation: number;
  pavilion3Layout: CommercialPavilionLayout;
  pavilion3Bounds: StrategicLandmarkBounds;
  banner: { x: number; y: number; z: number; width: number; height: number };
}

/** Supplied scoped entities only. Missing/archived/other-project owners never load a neighbor. */
export function createBrigadaMilitaryWingLayout(wing: MapEntity, pavilion3: MapEntity | null | undefined): BrigadaMilitaryWingLayout | null {
  if (wing.publicIdentifier !== BRIGADA_MILITARY_WING_REFERENCE.publicIdentifier || wing.classification !== 'SECURITY' || wing.isArchived
    || !pavilion3 || pavilion3.publicIdentifier !== BRIGADA_MILITARY_WING_REFERENCE.pavilionIdentifier || pavilion3.isArchived
    || wing.projectId !== pavilion3.projectId || Math.abs(strategicLandmarkFacingRadians(pavilion3) - Math.PI) > .001) return null;
  const definition = resolveCommercialPavilionDefinition(pavilion3);
  if (!definition) return null;
  const wb = strategicLandmarkBounds(wing), pb = strategicLandmarkBounds(pavilion3);
  const pavilion3Layout = createCommercialPavilionLayout(commercialPavilionModelBounds(pb, Math.PI), definition, strategicLandmarkVisualHeight(pavilion3) ?? undefined);
  const h = pavilionArchitectureHeight(pavilion3Layout), elevation = pavilion3.geometry.elevation;
  const frontZ = pb.centerZ - pavilion3Layout.exterior.shell.depth / 2;
  const canopyMinX = pb.centerX + pavilion3Layout.exterior.shell.width / 2;
  // Decline a changed implantation rather than pulling the real entities into a new layout.
  if (Math.abs(wb.minX - pb.maxX) > .35 || wb.minX < canopyMinX || wb.maxX <= canopyMinX || wb.maxZ <= frontZ
    || frontZ < wb.minZ || frontZ - wb.minZ > .6) return null;
  const fasciaInnerY = elevation + h * .87, fasciaOuterY = elevation + h * .89;
  const roofGradientX = (fasciaOuterY - fasciaInnerY) / (wb.maxX - canopyMinX);
  const eaveY = fasciaInnerY + (wb.minX - canopyMinX) * roofGradientX;
  const floorY = elevation + pavilion3Layout.interior.floorY;
  const width = wb.width;
  return {
    publicIdentifier: 'B19', entityId: wing.id, pavilion3EntityId: pavilion3.id, entityIds: [wing.id, pavilion3.id],
    minX: wb.minX, maxX: wb.maxX, minZ: frontZ, maxZ: wb.maxZ, frontZ, floorY, eaveY,
    frontRoofY: eaveY - h * .032, rearRoofY: eaveY - h * .085, roofGradientX, roofThickness: h * .015,
    fasciaInnerY, fasciaOuterY, fasciaHeight: h * .115,
    canopyMinX, canopyMaxX: wb.maxX, canopyFrontZ: frontZ - pavilionArchitectureCanopyProjection(pavilion3Layout),
    apronMinZ: pb.minZ, apronMaxZ: frontZ, apronMinX: canopyMinX, apronMaxX: wb.maxX,
    height: Math.max(fasciaInnerY, fasciaOuterY) + h * .06 - wing.geometry.elevation,
    pavilion3Height: h, pavilion3Elevation: elevation, pavilion3Layout, pavilion3Bounds: pb,
    banner: { x: wb.minX + width * .61, y: floorY + h * .46, z: frontZ - h * .025, width: width * .61, height: h * .075 },
  };
}

export function brigadaWingRoofHeight(layout: BrigadaMilitaryWingLayout, x: number, z: number): number {
  const t = Math.max(0, Math.min(1, (z - layout.frontZ) / (layout.maxZ - layout.frontZ)));
  return layout.frontRoofY + (layout.rearRoofY - layout.frontRoofY) * t + (x - layout.minX) * layout.roofGradientX;
}
