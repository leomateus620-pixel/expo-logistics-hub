import type { CommercialLot, MapEntity } from '../types';
import type { CommercialMapSegmentId } from '../data/commercialMapSegments';
import { resolveCommercialPavilionDefinition } from '../utils/commercialPavilions';
import type { DashboardLotRecord } from './commercialDashboardTypes';

type Classification = Pick<DashboardLotRecord, 'category' | 'pavilion' | 'blockCode' | 'classificationIssue'>;
const pending = (classificationIssue: string): Classification => ({
  category: 'unclassified', pavilion: null, blockCode: null, classificationIssue,
});

/** Parent UUIDs establish interior ownership, before segment membership is considered.
 * Technical module IDs and P-prefixed block codes never establish a pavilion identity.
 */
export function classifyDashboardLot(
  entity: MapEntity,
  lot: CommercialLot,
  entityById: ReadonlyMap<string, MapEntity>,
  segmentId: CommercialMapSegmentId | null,
): Classification {
  const visited = new Set([entity.id]);
  let parentId = entity.parentEntityId;
  let parentBlock: string | null = null;
  while (parentId) {
    if (visited.has(parentId)) return pending('Vínculo cadastral circular');
    visited.add(parentId);
    const parent = entityById.get(parentId);
    if (!parent) return pending('Entidade pai ausente');
    if (parent.isArchived) return pending('Entidade pai arquivada');
    if (resolveCommercialPavilionDefinition(parent)) {
      return { category: 'internal', pavilion: parent, blockCode: null, classificationIssue: null };
    }
    if (parent.classification === 'PAVILION') return pending('Pavilhão sem referência gerencial');
    if (parent.classification === 'QUADRA') {
      parentBlock = parent.publicIdentifier.match(/^QUADRA-([A-Z]{1,2})$/i)?.[1]?.toUpperCase() ?? null;
    }
    parentId = parent.parentEntityId;
  }
  if (entity.classification === 'INTERNAL_STAND' || entity.classification === 'PAVILION'
    || entity.metadata.pavilionPublicIdentifier || entity.metadata.pavilionModuleKey
    || /^P\d+$/i.test(lot.block ?? '')) return pending('Módulo sem vínculo confirmado com pavilhão');
  if (!segmentId) return pending('Segmento ausente ou ambíguo');
  const registeredBlock = lot.block?.trim().toUpperCase() || null;
  if (parentBlock && registeredBlock && parentBlock !== registeredBlock) return pending('Quadra diverge da entidade pai');
  return { category: 'external', pavilion: null, blockCode: parentBlock ?? registeredBlock, classificationIssue: null };
}
