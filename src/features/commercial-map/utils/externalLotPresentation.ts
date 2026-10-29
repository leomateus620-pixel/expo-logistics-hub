import { resolveCommercialMapSegment, type CommercialMapSegmentDefinition } from '../data/commercialMapSegments';
import type { CommercialLot, CommercialStatus, MapEntity } from '../types';

/** Presentation only. Never changes the persisted four-phase commercial model. */
export const EXTERNAL_LOT_PALETTE = Object.freeze({
  grass: '#739455', lightGrass: '#88A56B', darkGrass: '#5F7D45',
  open: '#D8BD70', sold: '#8FB7D8', check: '#355F82', boundary: '#40513b',
  selection: '#e8f4ef', cart: '#c28bea',
});

const PRESENTATION_EXCLUSIONS = {
  'unresolved-segment': 1 << 0,
  'non-commercial-classification': 1 << 1,
  'not-sellable': 1 << 2,
  'archived-entity': 1 << 3,
  'archived-lot': 1 << 4,
  'covered-lot': 1 << 5,
  'noncanonical-database-segment': 1 << 6,
  'pavilion-identifier': 1 << 7,
  'pavilion-module': 1 << 8,
  'module-number': 1 << 9,
  'interior-only': 1 << 10,
  'lot-entity-mismatch': 1 << 11,
} as const;

function presentationExclusions(
  entity: MapEntity,
  lot: CommercialLot,
  segment: CommercialMapSegmentDefinition | null,
) {
  // Retained rural entities can have isSellable=false after cadastral revisions
  // while still owning an active CommercialLot. The project-scoped DB segment
  // relation identifies their presentation; this never grants sale permission.
  const canonicalRuralLot = segment?.id === 'exporural'
    && entity.segmentSource === 'database' && entity.segmentId === segment.id
    && lot.entityId === entity.id;
  let mask = 0;
  if (!segment) mask |= PRESENTATION_EXCLUSIONS['unresolved-segment'];
  if (entity.classification !== 'SELLABLE_LOT') mask |= PRESENTATION_EXCLUSIONS['non-commercial-classification'];
  if (!entity.isSellable && !canonicalRuralLot) mask |= PRESENTATION_EXCLUSIONS['not-sellable'];
  if (entity.isArchived) mask |= PRESENTATION_EXCLUSIONS['archived-entity'];
  if (lot.archivedAt) mask |= PRESENTATION_EXCLUSIONS['archived-lot'];
  if (lot.isCovered) mask |= PRESENTATION_EXCLUSIONS['covered-lot'];
  if (entity.segmentSource === 'database' && (!segment || entity.segmentId !== segment.id)) mask |= PRESENTATION_EXCLUSIONS['noncanonical-database-segment'];
  if (entity.metadata.pavilionPublicIdentifier) mask |= PRESENTATION_EXCLUSIONS['pavilion-identifier'];
  if (entity.metadata.pavilionModuleKey) mask |= PRESENTATION_EXCLUSIONS['pavilion-module'];
  if (entity.metadata.moduleNumber) mask |= PRESENTATION_EXCLUSIONS['module-number'];
  if (entity.metadata.interiorOnly) mask |= PRESENTATION_EXCLUSIONS['interior-only'];
  if (lot.entityId !== entity.id) mask |= PRESENTATION_EXCLUSIONS['lot-entity-mismatch'];
  return mask;
}

export function isExternalPresentationLot(
  entity: MapEntity,
  lot: CommercialLot,
  segment: CommercialMapSegmentDefinition | null = resolveCommercialMapSegment(entity, lot),
) {
  return presentationExclusions(entity, lot, segment) === 0;
}

/** Explicit reasons for opt-in diagnostics; the renderer avoids array allocation. */
export function externalLotPresentationDecision(
  entity: MapEntity,
  lot: CommercialLot,
  segment: CommercialMapSegmentDefinition | null = resolveCommercialMapSegment(entity, lot),
) {
  const mask = presentationExclusions(entity, lot, segment);
  return {
    eligible: mask === 0,
    reasons: Object.entries(PRESENTATION_EXCLUSIONS).filter(([, bit]) => mask & bit).map(([reason]) => reason),
  };
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
