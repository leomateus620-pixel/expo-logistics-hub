import { describe, expect, it } from 'vitest';
import {
  PUBLIC_MAP_AREAS,
  PUBLIC_MAP_EXCLUDED_PAVILIONS,
  getPublicArea,
  isPublicAreaSlug,
  publicAreaUrl,
} from '@/features/commercial-map/public/publicAreaRegistry';
import { findPavilionEntity, toCanvasLot } from '@/features/commercial-map/public/publicMapService';
import { interactionRate } from '@/features/commercial-map/public/publicMapAdminService';
import type { PublicLot } from '@/features/commercial-map/public/publicMapTypes';
import type { MapEntity } from '@/features/commercial-map/types';

const lot: PublicLot = {
  id: 'lot-1',
  entityId: 'entity-1',
  publicIdentifier: 'B1-M063',
  displayName: 'Módulo 63',
  block: null,
  lotNumber: '63',
  levelLabel: null,
  pavilion: 'B1',
  availability: 'AVAILABLE',
  officialAreaSqm: 3,
  isCorner: false,
  isCovered: true,
  hasElectricity: true,
  hasWater: false,
  hasInternet: false,
  infrastructure: ['Energia'],
  pricing: {
    resolutionStatus: 'OK',
    renovacaoPricePerSqm: 776,
    renovacaoTotal: 2328,
    segundaPricePerSqm: 854,
    segundaTotal: 2562,
  },
};

describe('registry público das dez áreas', () => {
  it('expõe exatamente dez escopos, sem Pavilhão 7', () => {
    expect(PUBLIC_MAP_AREAS).toHaveLength(10);
    expect(PUBLIC_MAP_EXCLUDED_PAVILIONS).toContain('B10');
    expect(PUBLIC_MAP_AREAS.some((area) => area.pavilionIdentifier === 'B10')).toBe(false);
    expect(PUBLIC_MAP_AREAS.map((area) => area.slug)).toEqual([
      'pavilhao-1',
      'pavilhao-3',
      'pavilhao-5',
      'pavilhao-8',
      'pavilhao-12',
      'pavilhao-13',
      'pavilhao-14',
      'exporural',
      'industria-comercio-servicos-externo',
      'espaco-automovel',
    ]);
  });

  it('mapeia pavilhão → identificador canônico', () => {
    expect(getPublicArea('pavilhao-12')?.pavilionIdentifier).toBe('B3');
    expect(getPublicArea('pavilhao-14')?.pavilionIdentifier).toBe('B2');
    expect(getPublicArea('pavilhao-3')?.pavilionIdentifier).toBe('B6');
    expect(getPublicArea('pavilhao-5')?.pavilionIdentifier).toBe('B8');
  });

  it('rejeita slug fora do registro', () => {
    expect(isPublicAreaSlug('pavilhao-7')).toBe(false);
    expect(isPublicAreaSlug('parque')).toBe(false);
    expect(getPublicArea('pavilhao-7')).toBeUndefined();
  });

  it('monta o endereço com escopo e chave', () => {
    expect(publicAreaUrl('exporural', 'abc123')).toContain('/areas/exporural/abc123');
  });
});

describe('payload público não vaza dado interno', () => {
  it('converte para o canvas mantendo campos internos nulos', () => {
    const canvasLot = toCanvasLot(lot);
    expect(canvasLot.status).toBe('AVAILABLE');
    expect(canvasLot.officialAreaSqm).toBe(3);
    expect(canvasLot.currentBuyer).toBeNull();
    expect(canvasLot.activeContractNumber).toBeNull();
    expect(canvasLot.minimumPrice).toBeNull();
    expect(canvasLot.internalNotes).toBeNull();
    expect(canvasLot.commercialNotes).toBeNull();
    expect(canvasLot.salespersonName).toBeNull();
  });

  it('indisponível público vira bloqueado no canvas, sem comprador', () => {
    const canvasLot = toCanvasLot({ ...lot, availability: 'UNAVAILABLE' });
    expect(canvasLot.status).toBe('BLOCKED');
    expect(canvasLot.currentBuyer).toBeNull();
  });
});

describe('entrada direta no pavilhão', () => {
  it('encontra a entidade canônica do pavilhão', () => {
    const entities = [
      { publicIdentifier: 'B1', id: 'e1' },
      { publicIdentifier: 'B3', id: 'e2' },
    ] as unknown as MapEntity[];
    expect(findPavilionEntity(entities, 'B3')?.id).toBe('e2');
    expect(findPavilionEntity(entities, null)).toBeNull();
    expect(findPavilionEntity(entities, 'B10')).toBeNull();
  });
});

describe('taxa de interação do painel', () => {
  it('é sessões com seleção sobre sessões com visita', () => {
    expect(interactionRate({ sessions: 10, sessionsWithSelection: 4 })).toBe(0.4);
    expect(interactionRate({ sessions: 0, sessionsWithSelection: 0 })).toBe(0);
  });
});
