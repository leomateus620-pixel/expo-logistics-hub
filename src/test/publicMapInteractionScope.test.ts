import { describe, expect, it } from 'vitest';
import {
  buildPublicInteractionScope,
  canInspectLot,
  canInspectLotId,
} from '@/features/commercial-map/public/publicInteractionScope';
import type { PublicLot } from '@/features/commercial-map/public/publicMapTypes';
import type { MapEntity } from '@/features/commercial-map/types';

function lot(id: string, entityId: string): PublicLot {
  return {
    id,
    entityId,
    publicIdentifier: id.toUpperCase(),
    displayName: id,
    block: null,
    lotNumber: null,
    levelLabel: null,
    pavilion: null,
    availability: 'AVAILABLE',
    buyerName: null,
    officialAreaSqm: 100,
    isCorner: false,
    isCovered: false,
    hasElectricity: false,
    hasWater: false,
    hasInternet: false,
    infrastructure: [],
    pricing: {
      resolutionStatus: 'OK',
      renovacaoPricePerSqm: 100,
      renovacaoTotal: 10000,
      renovacaoRuleLabel: 'Área externa',
      segundaPricePerSqm: 110,
      segundaTotal: 11000,
      segundaRuleLabel: 'Área externa',
    },
  };
}

const scopeLots = [lot('lote-a', 'entity-a'), lot('lote-b', 'entity-b')];
const scope = buildPublicInteractionScope(scopeLots);

describe('escopo de interação da consulta pública', () => {
  it('autoriza apenas os lotes entregues pelo link', () => {
    expect(canInspectLot(scope, 'entity-a')).toBe(true);
    expect(canInspectLot(scope, 'entity-b')).toBe(true);
  });

  it('nega qualquer entidade de entorno, inclusive pavilhões e ruas', () => {
    expect(canInspectLot(scope, 'entity-pavilhao-1')).toBe(false);
    expect(canInspectLot(scope, 'rua-brasil')).toBe(false);
    expect(canInspectLot(scope, null)).toBe(false);
    expect(canInspectLot(scope, undefined)).toBe(false);
  });

  it('mantém mapa administrativo, comissões e vendas sem restrição', () => {
    expect(canInspectLot(null, 'qualquer-entidade')).toBe(true);
    expect(canInspectLot(undefined, 'qualquer-entidade')).toBe(true);
  });

  it('valida lista, busca e URL pelo identificador do lote', () => {
    expect(canInspectLotId(scopeLots, 'lote-a')).toBe(true);
    expect(canInspectLotId(scopeLots, 'lote-de-outra-area')).toBe(false);
    expect(canInspectLotId(scopeLots, null)).toBe(false);
  });
});

describe('contexto visual do parque', () => {
  const contextEntity = (id: string): MapEntity => ({
    id,
    layerId: 'layer-1',
    publicIdentifier: id,
    name: id,
    classification: 'STRUCTURE',
    verificationStatus: 'VERIFIED',
    parentEntityId: null,
    segmentId: null,
    metadata: {},
    geometry: { kind: 'RECTANGLE', x: 0, y: 0, width: 1, height: 1, rotation: 0, elevation: 0 },
  } as unknown as MapEntity);

  it('o entorno nunca carrega campo comercial', () => {
    const entity = contextEntity('rua-brasil');
    const keys = Object.keys(entity);
    ['price', 'buyer', 'contract', 'availability', 'officialAreaSqm'].forEach((forbidden) => {
      expect(keys).not.toContain(forbidden);
    });
  });

  it('a união contexto + escopo preserva a entidade oficial do escopo', () => {
    const merged = new Map<string, MapEntity>();
    [contextEntity('entity-a'), contextEntity('rua-brasil')].forEach((e) => merged.set(e.id, e));
    const official = { ...contextEntity('entity-a'), name: 'Lote oficial' } as MapEntity;
    merged.set(official.id, official);
    expect(merged.get('entity-a')?.name).toBe('Lote oficial');
    expect(merged.size).toBe(2);
  });
});
