import type { CommercialLot, MapEntity } from '../types';
import { resolveCommercialPavilionDefinition } from './commercialPavilions';
import { FENASOJA_RESTAURANT_PRESENTATION_NAME } from './fenasojaRestaurant';

type LotFields = Pick<CommercialLot, 'publicIdentifier' | 'lotNumber' | 'block' | 'displayName' | 'commercialUnit'>;

export interface LotIdentity {
  title: string;
  location: string | null;
  area: string | null;
  full: string;
  number: string | null;
}

/** Presentation only: neither pricing nor the technical identifier is inferred from a code. */
export function resolveLotIdentity(
  lot: LotFields,
  entity?: Pick<MapEntity, 'metadata' | 'parentEntityId' | 'segmentId'> | null,
  pavilion?: (Pick<MapEntity, 'publicIdentifier' | 'id'> & Partial<Pick<MapEntity, 'name'>>) | null,
  scopedArea?: string | null,
): LotIdentity {
  if (lot.commercialUnit === 'FOOD_POINT') {
    const title = lot.displayName.trim() || lot.publicIdentifier;
    const structureName = pavilion?.publicIdentifier === 'C2' ? FENASOJA_RESTAURANT_PRESENTATION_NAME : pavilion?.name;
    const location = pavilion && entity?.parentEntityId === pavilion.id
      ? [structureName, pavilion.publicIdentifier].filter(Boolean).join(' · ') : null;
    return { title, location, area: 'Gastronomia', number: null, full: [title, location, 'Gastronomia'].filter(Boolean).join(' · ') };
  }
  const number = lot.lotNumber == null ? null : String(lot.lotNumber).trim() || null;
  const isModule = Boolean(entity?.parentEntityId && pavilion && entity.parentEntityId === pavilion.id
    && resolveCommercialPavilionDefinition(pavilion));
  const pavilionName = isModule && pavilion ? resolveCommercialPavilionDefinition(pavilion)?.officialName ?? null : null;
  const block = lot.block?.trim() || null;
  const location = pavilionName ?? (block && /^[A-Z]{1,2}$/i.test(block) ? `Quadra ${block}` : null);
  const metadataArea = entity?.metadata.segmentName;
  const area = (entity?.segmentId && typeof metadataArea === 'string' && metadataArea.trim() ? metadataArea.trim() : null)
    ?? (scopedArea?.trim() || null);
  const title = number ? `${isModule ? 'Módulo' : 'Lote'} ${number}` : lot.displayName?.trim() || lot.publicIdentifier;
  return { title, location, area, number, full: [title, location, area && area !== location && !location?.includes(area) ? area : null].filter(Boolean).join(' · ') };
}
