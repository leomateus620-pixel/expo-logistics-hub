import { describe, expect, it } from 'vitest';
import type { CommercialLot, MapEntity } from '../../types';
import {
  buildAutomaticRevisionReason,
  candidateDisabledReason,
  commercialStatusLabel,
  matchesLotSearch,
  scopeForLot,
} from './saleLotRevisionSelection';

const entity = (patch: Partial<MapEntity>): MapEntity => ({
  id: 'entity', projectId: 'project', layerId: 'layer', parentEntityId: null, segmentId: 'segment-a',
  publicIdentifier: 'B5-M064', name: 'Módulo 64', description: null, classification: 'SELLABLE_LOT',
  verificationStatus: 'VERIFIED', isSellable: true, isArchived: false,
  geometry: { id: null, type: 'Polygon', coordinates: [], elevation: 0, extrusionHeight: 0, rotation: 0, geometryVersion: 1, calibrationVersion: null },
  metadata: {}, ...patch,
});

const lot = (patch: Partial<CommercialLot> = {}): CommercialLot => ({
  id: 'lot', entityId: 'entity', publicIdentifier: 'B5-M064', block: 'B5', lotNumber: '64', levelLabel: null,
  displayName: 'Módulo 64', description: null, status: 'AVAILABLE', officialAreaSqm: 4.5, calculatedAreaSqm: null,
  areaValidationStatus: 'VALIDATED', frontageMeters: null, depthMeters: null, pricingMode: 'FIXED_TOTAL', basePrice: null,
  pricePerSqm: null, askingPrice: null, minimumPrice: null, officialPricing2028: null, infrastructure: [], hasElectricity: false,
  hasWater: false, hasInternet: false, isCorner: false, isCovered: true, accessibilityNotes: null, commercialNotes: null,
  internalNotes: null, currentBuyer: null, reservationExpiresAt: null, saleDate: null, salespersonName: null,
  activeContractNumber: null, archivedAt: null, createdBy: null, updatedBy: null, createdAt: null, updatedAt: null, ...patch,
});

describe('seleção de lotes na revisão', () => {
  it('restringe pelo pai persistido quando o lote está em pavilhão', () => {
    const entities = [entity({ id: 'pavilion', name: 'Pavilhão 13', publicIdentifier: 'B5', classification: 'PAVILION' }), entity({ parentEntityId: 'pavilion' })];
    expect(scopeForLot(lot(), entities)).toEqual({ key: 'parent:pavilion', label: 'Pavilhão 13', projectId: 'project' });
  });

  it('usa o segmento persistido para área externa', () => {
    expect(scopeForLot(lot(), [entity({})])?.key).toBe('segment:segment-a');
  });

  it('normaliza acentos e pesquisa número, código e contexto', () => {
    expect(matchesLotSearch(lot(), 'Pavilhão 13', 'pavilhao 13')).toBe(true);
    expect(matchesLotSearch(lot(), 'Pavilhão 13', 'b5-m064')).toBe(true);
    expect(matchesLotSearch(lot(), 'Pavilhão 13', '64')).toBe(true);
  });

  it.each([
    ['AVAILABLE', 'Disponível'], ['SALE_OPEN', 'Venda em aberto'], ['SOLD', 'Vendido'], ['BLOCKED', 'Bloqueado'],
  ] as const)('expõe o estado %s como %s', (status, label) => {
    expect(commercialStatusLabel(lot({ status }))).toBe(label);
  });

  it('só libera disponível com preço oficial', () => {
    expect(candidateDisabledReason(lot(), 2328)).toBeNull();
    expect(candidateDisabledReason(lot(), null)).toBe('Sem preço oficial');
    expect(candidateDisabledReason(lot({ status: 'SOLD' }), 2328)).toBe('Vendido');
  });

  it('gera observação auditável sem texto manual', () => {
    expect(buildAutomaticRevisionReason(['B5-M064'], ['B5-M068'])).toBe('Adicionados: B5-M064; Retirados: B5-M068');
  });
});