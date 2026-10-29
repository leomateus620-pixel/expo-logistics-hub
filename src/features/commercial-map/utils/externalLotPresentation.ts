import { resolveCommercialMapSegment, type CommercialMapSegmentDefinition } from '../data/commercialMapSegments';
import type { CommercialLot, CommercialStatus, MapEntity } from '../types';

/** Presentation only. Never changes the persisted four-phase commercial model. */
export const EXTERNAL_LOT_PALETTE = Object.freeze({
  grass: '#739455', lightGrass: '#88A56B', darkGrass: '#5F7D45',
  open: '#D8BD70', sold: '#8FB7D8', check: '#355F82', boundary: '#40513b',
  selection: '#e8f4ef', cart: '#c28bea',
});

export function isExternalPresentationLot(
  entity: MapEntity,
  lot: CommercialLot,
  segment: CommercialMapSegmentDefinition | null = resolveCommercialMapSegment(entity, lot),
) {
  return Boolean(segment && entity.classification === 'SELLABLE_LOT' && entity.isSellable
    && !entity.isArchived && !lot.archivedAt && !lot.isCovered
    && (entity.segmentSource !== 'database' || entity.segmentId === segment.id)
    && !entity.metadata.pavilionPublicIdentifier && !entity.metadata.pavilionModuleKey
    && !entity.metadata.moduleNumber && !entity.metadata.interiorOnly);
}

export function externalLotUsesGrass(status: CommercialStatus) {
  return status === 'AVAILABLE' || status === 'SALE_OPEN' || status === 'SOLD';
}

export function externalLotFrameColor(status: CommercialStatus) {
  return status === 'SALE_OPEN' ? EXTERNAL_LOT_PALETTE.open
    : status === 'SOLD' ? EXTERNAL_LOT_PALETTE.sold : null;
}

/** Shared by the surface, frame, logo and confirmation; never a cadastral move. */
export function lotPresentationLift(selected: boolean, hovered: boolean, inCart = false) {
  return inCart ? 0.09 : selected ? 0.055 : hovered ? 0.035 : 0;
}

export function lotPresentationTop(entity: MapEntity) {
  const height = Math.max(0.025, entity.geometry.extrusionHeight);
  const bevel = height >= 0.35 ? Math.min(0.065, height * 0.05) : 0;
  return entity.geometry.elevation + height + bevel;
}
