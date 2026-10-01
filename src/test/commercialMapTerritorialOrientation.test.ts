import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS } from '@/features/commercial-map/data/officialReference2026';
import { orientationBoxFits, orientationLevel, prepareTerritorialOrientation, TERRITORY_SYMBOLS } from '@/features/commercial-map/utils/territorialOrientation';
import { lotPointClearance } from '@/features/commercial-map/utils/soldLotPresentation';
import { COMMERCIAL_MAP_SEGMENT_IDS } from '@/features/commercial-map/data/commercialMapSegments';

const data = prepareTerritorialOrientation(OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS);
describe('orientação territorial cadastral', () => {
  it('usa quadras externas confirmadas, nomes de vias oficiais e somente três referências territoriais', () => {
    expect(data.filter(item => item.kind === 'segment').map(item => item.segmentId).sort()).toEqual(Object.values(COMMERCIAL_MAP_SEGMENT_IDS).sort());
    expect(data.filter(item => item.kind === 'block').map(item => item.name)).toContain('Quadra R');
    expect(data.filter(item => item.kind === 'road').map(item => item.name)).toContain('Rua Bolívia');
    expect(data.some(item => item.name.includes('M001'))).toBe(false);
    expect(data.filter(item => item.kind === 'block').length).toBe(14);
    expect(Object.values(TERRITORY_SYMBOLS).map(value => value.pattern)).toEqual(['none', '8 4', '2 4']);
  });
  it('mantém todas as âncoras de quadra dentro da área real, inclusive com recortes', () => {
    for (const item of data.filter(item => item.kind === 'block')) {
      expect(lotPointClearance(item.anchor, item.outline ?? [])).toBeGreaterThan(0);
    }
  });
  it('não inventa associação quando há vínculo cadastral ambíguo e não mostra ruas ausentes do escopo', () => {
    const original = OFFICIAL_REFERENCE_ENTITIES.find(entity => entity.publicIdentifier === 'QUADRA-R');
    if (!original) throw new Error('Quadra R ausente na referência');
    const conflicting = { ...original, segmentId: null, segmentSource: 'derived' as const,
      metadata: { ...original.metadata, segmentId: 'exporural', segmentCode: 'ESPACO_AUTOMOVEL' } };
    expect(prepareTerritorialOrientation([conflicting], [], []).filter(item => item.kind === 'block')).toHaveLength(0);
    expect(prepareTerritorialOrientation([original], [], []).some(item => item.kind === 'road')).toBe(false);
  });
  it('reserva obstáculos de interface e mantém histerese entre níveis de aproximação', () => {
    const box = { left: 10, right: 70, top: 10, bottom: 30 };
    expect(orientationBoxFits(box, [{ left: 76, right: 120, top: 10, bottom: 30 }])).toBe(true);
    expect(orientationBoxFits(box, [{ left: 75, right: 120, top: 10, bottom: 30 }])).toBe(false);
    expect(orientationLevel(35, 'far')).toBe('far');
    expect(orientationLevel(35, 'medium')).toBe('medium');
    expect(orientationLevel(115, 'near')).toBe('near');
    expect(orientationLevel(115, 'medium')).toBe('medium');
  });
});
