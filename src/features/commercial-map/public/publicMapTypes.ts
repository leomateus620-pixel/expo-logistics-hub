import type { MapEntity, MapLayer } from '../types';
import type { LotPricingResolution } from '../utils/lotPricing2028';

export type PublicLotAvailability = 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'UNAVAILABLE';

export interface PublicLotPricing {
  resolutionStatus: LotPricingResolution;
  renovacaoPricePerSqm: number | null;
  renovacaoTotal: number | null;
  renovacaoRuleLabel: string | null;
  segundaPricePerSqm: number | null;
  segundaTotal: number | null;
  segundaRuleLabel: string | null;
}

/** Allowlist pública: nada de comprador, contrato, reserva nominal ou preço mínimo. */
export interface PublicLot {
  id: string;
  entityId: string;
  publicIdentifier: string;
  block: string | null;
  lotNumber: string | null;
  levelLabel: string | null;
  displayName: string;
  availability: PublicLotAvailability;
  officialAreaSqm: number | null;
  isCorner: boolean;
  isCovered: boolean;
  infrastructure: string[];
  hasElectricity: boolean;
  hasWater: boolean;
  hasInternet: boolean;
  pavilion?: string | null;
  pricing: PublicLotPricing;
}

export interface PublicMapScope {
  slug: string;
  name: string;
  kind: 'PAVILION' | 'SEGMENT' | 'SEGMENT_EXTERNAL' | 'ENTITY_SET';
  lotCount: number;
  officialAreaSqm: number;
  pavilionIdentifier: string | null;
  segmentSlug: string | null;
}

export interface PublicMapInventory {
  revision?: string;
  contextRevision?: string;
  scope: PublicMapScope;
  project: {
    id: string;
    name: string;
    coordinateSystem: 'LOCAL_NORMALIZED' | 'GEOREFERENCED';
    referenceWidth: number;
    referenceHeight: number;
    activeVersion: number;
    referenceRevision: string | null;
  };
  layers: MapLayer[];
  entities: MapEntity[];
  lots: PublicLot[];
}

/** Cenário publicável do parque. Contexto visual, sem nenhum dado comercial. */
export interface PublicMapContext {
  projectId: string;
  layers: MapLayer[];
  entities: MapEntity[];
}

export const PUBLIC_AVAILABILITY_LABEL: Record<PublicLotAvailability, string> = {
  AVAILABLE: 'Disponível',
  RESERVED: 'Sob consulta',
  SOLD: 'Comercializado',
  UNAVAILABLE: 'Indisponível',
};
