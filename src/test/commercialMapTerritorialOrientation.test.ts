import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS } from '@/features/commercial-map/data/officialReference2026';
import { layoutTerritorialOrientation, localRoadLabelAngle, orientationBoxFits, orientationFootprint, orientationFootprintFits, orientationLevel, prepareTerritorialOrientation, roadLabelFits, TERRITORY_SYMBOLS } from '@/features/commercial-map/utils/territorialOrientation';
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
  it('mantém a etiqueta horizontal inteira sobre a superfície da rua, evitando recortes e edificações', () => {
    const road: [number, number][][] = [[[0, 0], [100, 0], [100, 20], [55, 20], [55, 12], [45, 12], [45, 20], [0, 20]]];
    expect(roadLabelFits({ left: 2, right: 38, top: 4, bottom: 11 }, road)).toBe(true);
    expect(roadLabelFits({ left: 35, right: 65, top: 14, bottom: 19 }, road)).toBe(false);
    expect(roadLabelFits({ left: 2, right: 38, top: 4, bottom: 11 }, road,
      [[[[15, 3], [25, 3], [25, 13], [15, 13]]]])).toBe(false);
    expect(roadLabelFits({ left: 2, right: 38, top: 4, bottom: 11 },
      [[[0, 0], [100, 0], [100, 20], [0, 20]], [[20, 3], [30, 3], [30, 12], [20, 12]]])).toBe(false);
    expect(roadLabelFits({ left: 2, right: 38, top: 4, bottom: 11 }, [[[0, 0], [100, 0], [100, 7], [0, 7]]])).toBe(false);
  });
  it('escolhe sempre um trecho cadastral estável para uma via repetida', () => {
    const road = data.find(item => item.kind === 'road' && item.name === 'Rua Bolívia');
    expect(road?.outline).toBeDefined();
    expect(road?.anchor && road.outline && lotPointClearance(road.anchor, road.outline)).toBeGreaterThan(0);
  });
  it('alinha uma curva pelo corredor próximo da âncora, sem usar a maior borda distante', () => {
    const bentRoad: [number, number][][] = [[[0, 0], [100, 0], [100, 10], [10, 10], [10, 60], [0, 60]]];
    expect(localRoadLabelAngle([5, 45], bentRoad)).toBeCloseTo(-Math.PI / 2);
    expect(localRoadLabelAngle([75, 5], bentRoad)).toBeCloseTo(0);
  });
  it('encaixa a extensão orientada da rua diagonal e rejeita obstáculos e buracos cobertos pelo texto', () => {
    const road: [number, number][][] = [[[0, 0], [2, -2], [22, 18], [20, 20]]];
    const footprint = orientationFootprint([11, 9], 12, 1.5, Math.PI / 4);
    expect(orientationFootprintFits(footprint, road)).toBe(true);
    expect(orientationFootprintFits(orientationFootprint([11, 9], 12, 1.5, 0), road)).toBe(false);
    const obstacle: [number, number][][] = [[[10.8, 8.8], [11.2, 8.8], [11.2, 9.2], [10.8, 9.2]]];
    expect(orientationFootprintFits(footprint, road, [obstacle])).toBe(false);
    expect(orientationFootprintFits(footprint, [...road, obstacle[0]])).toBe(false);
  });
  it('prepara dimensões fixas no mundo, conservando as quadras oficiais e todo footprint dentro da área real', () => {
    const ratios = new Map(data.map(item => [item.id, item.name.length * .34]));
    const labels = layoutTerritorialOrientation(data, OFFICIAL_REFERENCE_ENTITIES, ratios);
    expect(labels.filter(item => item.kind === 'block').map(item => item.name).sort())
      .toEqual(data.filter(item => item.kind === 'block').map(item => item.name).sort());
    for (const label of labels) {
      expect(label.width / label.height).toBeCloseTo(ratios.get(label.id)!);
      expect(orientationFootprintFits(label.footprint, label.outline!)).toBe(true);
      expect(Number.isFinite(label.angle)).toBe(true);
    }
    expect(labels.filter(item => item.kind === 'road').map(item => item.name)).toContain('Avenida Tuparendi');
  });
  it('ignora inventário sem geometria utilizável sem interromper os rótulos válidos', () => {
    const valid = OFFICIAL_REFERENCE_ENTITIES.find(entity => entity.publicIdentifier === 'QUADRA-D')!;
    const empty = { ...valid, id: 'empty', geometry: { ...valid.geometry, coordinates: [] } };
    const malformed = { ...valid, id: 'malformed', geometry: { ...valid.geometry, coordinates: [[[NaN, 0]]] as [number, number][][] } };
    const item = data.find(item => item.name === 'Quadra D')!;
    expect(layoutTerritorialOrientation([item], [valid, empty, malformed], new Map([[item.id, 3]]))).toHaveLength(1);
    expect(layoutTerritorialOrientation([{ ...item, outline: [] }], [empty], new Map())).toEqual([]);
  });
});
