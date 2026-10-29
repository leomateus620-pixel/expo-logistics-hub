import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS } from '@/features/commercial-map/data/officialReference2026';
import { layoutTerritorialOrientation, localRoadLabelAngle, orientationBoxFits, orientationFootprint, orientationFootprintFits, orientationLevel, prepareTerritorialOrientation, roadLabelFits, TERRITORY_SYMBOLS } from '@/features/commercial-map/utils/territorialOrientation';
import { lotPointClearance } from '@/features/commercial-map/utils/soldLotPresentation';
import { COMMERCIAL_MAP_SEGMENT_IDS } from '@/features/commercial-map/data/commercialMapSegments';
import type { Coordinate, MapEntity } from '@/features/commercial-map/types';
import clipping from 'polygon-clipping';

const data = prepareTerritorialOrientation(OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS);
describe('orientação territorial cadastral', () => {
  it('usa quadras externas confirmadas, nomes de vias oficiais e somente três referências territoriais', () => {
    expect(data.filter(item => item.kind === 'segment').map(item => item.segmentId).sort()).toEqual(Object.values(COMMERCIAL_MAP_SEGMENT_IDS).sort());
    expect(data.filter(item => item.kind === 'block').map(item => item.name)).toContain('Quadra R');
    expect(data.filter(item => item.kind === 'road').map(item => item.name)).toContain('Rua Bolívia');
    expect(data.some(item => item.name.includes('M001'))).toBe(false);
    expect(data.filter(item => item.kind === 'block').map(item => item.name).sort()).toEqual(
      ['D', 'E', 'F', 'G', 'I', 'J', 'L', 'M', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V'].map(block => `Quadra ${block}`),
    );
    for (const block of ['Q', 'V']) {
      expect(data.find(item => item.kind === 'block' && item.name === `Quadra ${block}`))
        .toMatchObject({ segmentId: COMMERCIAL_MAP_SEGMENT_IDS.industry });
    }
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
      if (!label.exteriorBlock) expect(orientationFootprintFits(label.footprint, label.outline!)).toBe(true);
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

  it('posiciona o texto inteiro de S acima e R abaixo dos lotes, sem alterar o cadastro', () => {
    const snapshot = JSON.stringify(OFFICIAL_REFERENCE_ENTITIES);
    const labels = layoutTerritorialOrientation(data, OFFICIAL_REFERENCE_ENTITIES, new Map());
    const ruralLots = OFFICIAL_REFERENCE_ENTITIES.filter(entity => /^Q-[RS]-/.test(entity.publicIdentifier));
    const points = ruralLots.flatMap(entity => entity.geometry.coordinates[0]);
    const above = labels.filter(label => label.name === 'Quadra S');
    const below = labels.filter(label => label.name === 'Quadra R');
    expect(above).toHaveLength(1); expect(below).toHaveLength(1);
    expect(Math.max(...above[0].footprint.map(point => point[1]))).toBeLessThan(Math.min(...points.map(point => point[1])));
    const minTextX = Math.min(...below[0].footprint.map(point => point[0]));
    const maxTextX = Math.max(...below[0].footprint.map(point => point[0]));
    const lowerFrontier = ruralLots.flatMap(entity => clipping.intersection(entity.geometry.coordinates,
      [[[minTextX, -1000], [maxTextX, -1000], [maxTextX, 1000], [minTextX, 1000]]]).flat(2));
    expect(Math.min(...below[0].footprint.map(point => point[1]))).toBeGreaterThan(Math.max(...lowerFrontier.map(point => point[1])));
    const terrain: Coordinate[][] = [[[-1000, -1000], [1000, -1000], [1000, 1000], [-1000, 1000]]];
    const blockers = OFFICIAL_REFERENCE_ENTITIES.filter(entity => entity.metadata.renderMode !== 'outline'
      && !['QUADRA', 'GREEN_AREA'].includes(entity.classification)).map(entity => entity.geometry.coordinates);
    for (const label of [...above, ...below]) {
      expect(orientationFootprintFits(label.footprint, terrain, blockers)).toBe(true);
      expect(label.height).toBe(2.05);
    }
    expect(JSON.stringify(OFFICIAL_REFERENCE_ENTITIES)).toBe(snapshot);
  });

  it('desvia o footprint externo de cenografia fornecida pela cena e mantém âncoras determinísticas', () => {
    const ratios = new Map(data.map(item => [item.id, 3.4]));
    const initial = layoutTerritorialOrientation(data, OFFICIAL_REFERENCE_ENTITIES, ratios);
    const old = initial.find(label => label.name === 'Quadra S')!;
    const canopy = [orientationFootprint(old.anchor, old.width + 1, old.height + 1, old.angle)];
    const actual = layoutTerritorialOrientation(data, OFFICIAL_REFERENCE_ENTITIES, ratios, [canopy]);
    const moved = actual.find(label => label.name === 'Quadra S')!;
    expect(moved).toBeDefined(); expect(moved.anchor).not.toEqual(old.anchor);
    expect(orientationFootprintFits(moved.footprint,
      [[[-1000, -1000], [1000, -1000], [1000, 1000], [-1000, 1000]]], [canopy])).toBe(true);
    expect(layoutTerritorialOrientation(data, OFFICIAL_REFERENCE_ENTITIES, ratios, [canopy])).toEqual(actual);
  });

  it('encaixa os glifos e contornos no gramado estreito sem reduzir fonte ou tratar estacionamento como livre', () => {
    const item = data.find(item => item.name === 'Quadra S')!;
    const edge = item.exteriorBlock!.boundaryZ;
    const parking: Coordinate[][] = [[[-100, edge - 20], [100, edge - 20], [100, edge - 1.6], [-100, edge - 1.6]]];
    const labels = layoutTerritorialOrientation([item], OFFICIAL_REFERENCE_ENTITIES, new Map([[item.id, 3.4]]), [], [parking],
      new Map([[item.id, { left: .04, right: .96, top: .2, bottom: .8 }]]));
    expect(labels).toHaveLength(1);
    const label = labels[0];
    expect(label.height).toBe(2.05);
    expect(Math.max(...label.inkFootprint!.map(p => p[1]))).toBeLessThan(edge);
    expect(Math.min(...label.inkFootprint!.map(p => p[1]))).toBeGreaterThan(edge - 1.6);
    expect(label.footprint[0][1]).toBeLessThan(label.inkFootprint![0][1]);
  });

  it('deduplica trechos pela rua canônica, preservando vias distintas com o mesmo nome', () => {
    const original = OFFICIAL_REFERENCE_ENTITIES.find(entity => entity.publicIdentifier === 'RUA-URUGUAI')!;
    const east = OFFICIAL_REFERENCE_ENTITIES.find(entity => entity.publicIdentifier === 'RUA-URUGUAI-LESTE')!;
    const unrelated = { ...original, id: 'other-road', publicIdentifier: 'OTHER-URUGUAI' };
    const roads = prepareTerritorialOrientation([original, east, unrelated], [], [east, original, unrelated]);
    expect(roads).toHaveLength(2);
    expect(roads.every(item => item.name === 'Rua Uruguai')).toBe(true);
    expect(new Set(roads.map(item => item.canonicalRoadId)).size).toBe(2);
    const reversed = prepareTerritorialOrientation([original, east, unrelated], [], [unrelated, original, east]);
    expect(reversed.find(item => item.canonicalRoadId === 'RUA-URUGUAI')?.anchor)
      .toEqual(roads.find(item => item.canonicalRoadId === 'RUA-URUGUAI')?.anchor);
  });

  it('alinha vias paralelas por faixa comum, mantendo cada texto dentro da própria via e longe de cruzamentos', () => {
    const template = OFFICIAL_REFERENCE_ENTITIES.find(entity => entity.classification === 'ROAD')!;
    const road = (id: string, x: number, z: number, width: number, depth: number): MapEntity => ({
      ...template, id, publicIdentifier: id, name: id, metadata: {},
      geometry: { ...template.geometry, coordinates: [[[x, z], [x + width, z], [x + width, z + depth], [x, z + depth]]] },
    });
    const entities = [road('Horizontal A', 0, 0, 40, 2), road('Horizontal B', 0, 8, 40, 2),
      road('Vertical A', 50, 0, 2, 40), road('Vertical B', 58, 0, 2, 40)];
    const items = prepareTerritorialOrientation(entities, []);
    const labels = layoutTerritorialOrientation(items, entities, new Map(items.map(item => [item.id, 4])));
    expect(labels).toHaveLength(4);
    expect(labels[0].anchor[0]).toBeCloseTo(labels[1].anchor[0]);
    expect(labels[2].anchor[1]).toBeCloseTo(labels[3].anchor[1]);
    for (const label of labels) expect(orientationFootprintFits(label.footprint, label.outline!)).toBe(true);
    const crossing = road('Crossing', 19, -1, 2, 12);
    const blocked = layoutTerritorialOrientation(items, [...entities, crossing], new Map(items.map(item => [item.id, 4])));
    expect(blocked[0].anchor[0]).toBeCloseTo(blocked[1].anchor[0]);
    for (const label of blocked.slice(0, 2)) {
      expect(orientationFootprintFits(label.footprint, label.outline!, [crossing.geometry.coordinates])).toBe(true);
      expect(label.height).toBeCloseTo(labels[0].height);
    }
  });

  it('usa a mesma faixa transversal livre em ruas paralelas com copas na margem, sem dispersar nomes ou reduzir fonte', () => {
    const template = OFFICIAL_REFERENCE_ENTITIES.find(entity => entity.classification === 'ROAD')!;
    const entities = [0, 8, 16].map((z, index): MapEntity => ({ ...template, id: `road-${index}`,
      publicIdentifier: `road-${index}`, name: `Rua ${index}`, metadata: {}, geometry: { ...template.geometry,
        coordinates: [[[0, z], [40, z], [40, z + 2], [0, z + 2]]] } }));
    const items = prepareTerritorialOrientation(entities, []);
    const crowns: Coordinate[][][] = [0, 8, 16].map(z => [[[0, z + 1.15], [40, z + 1.15], [40, z + 2], [0, z + 2]]]);
    const labels = layoutTerritorialOrientation(items, entities, new Map(items.map(item => [item.id, 4])), crowns, [],
      new Map(items.map(item => [item.id, { left: .04, right: .96, top: .2, bottom: .8 }])));
    expect(labels).toHaveLength(3);
    for (const [index, label] of labels.entries()) {
      expect(label.anchor[0]).toBeCloseTo(20);
      expect(label.anchor[1] - index * 8).toBeCloseTo(labels[0].anchor[1]);
      expect(label.height).toBeGreaterThan(.819);
      expect(orientationFootprintFits(label.inkFootprint!, label.outline!, crowns)).toBe(true);
    }
  });
});
