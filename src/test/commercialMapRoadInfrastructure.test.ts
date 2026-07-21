import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import {
  CLASSIFICATION_COLORS,
  DEFAULT_REFERENCE_LAYERS,
  ROAD_MATERIAL_COLORS,
  ROAD_SURFACE_PROFILE,
} from '@/features/commercial-map/constants';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import {
  ROAD_INFRASTRUCTURE,
  buildRoadBoundaryRuns,
  buildRoadNetworkGeometries,
  disposeRoadNetworkGeometries,
  findRoadConnections,
  isRoadInfrastructureEntity,
} from '@/features/commercial-map/utils/roadInfrastructure';

function triangleCount(geometry: BufferGeometry | null) {
  if (!geometry) return 0;
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
}

function rgb(hex: string) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

describe('infraestrutura viária do Mapa Comercial', () => {
  const circulation = OFFICIAL_REFERENCE_DATA.entities.filter(isRoadInfrastructureEntity);
  const roads = circulation.filter((entity) => entity.classification === 'ROAD');

  it('preserva o inventário cartográfico oficial sem criar vias artificiais', () => {
    expect(roads).toHaveLength(21);
    expect(circulation.filter((entity) => entity.classification === 'PEDESTRIAN_PATH')).toHaveLength(1);
    expect(circulation.every((entity) => entity.geometry.elevation === 0)).toBe(true);
    expect(roads.every((entity) => entity.geometry.extrusionHeight === ROAD_INFRASTRUCTURE.asphaltHeight)).toBe(true);
  });

  it('usa asfalto cinza-escuro neutro e uma textura otimizada', () => {
    const [red, green, blue] = rgb(ROAD_MATERIAL_COLORS.asphalt);
    const circulationLayer = DEFAULT_REFERENCE_LAYERS.find((layer) => layer.key === 'circulation');

    (['asphalt', 'gutter', 'selected', 'selectionGlow', 'match'] as const).forEach((key) => {
      const [stateRed, stateGreen, stateBlue] = rgb(ROAD_MATERIAL_COLORS[key]);
      expect(stateRed, `${key} não pode puxar para marrom`).toBeLessThanOrEqual(stateGreen);
      expect(stateGreen, `${key} deve manter viés neutro/frio`).toBeLessThanOrEqual(stateBlue);
    });

    expect(red).toBeLessThanOrEqual(green);
    expect(green).toBeLessThanOrEqual(blue);
    expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeLessThanOrEqual(10);
    expect((red + green + blue) / 3).toBeGreaterThanOrEqual(70);
    expect((red + green + blue) / 3).toBeLessThanOrEqual(90);
    expect(CLASSIFICATION_COLORS.ROAD).toBe(ROAD_MATERIAL_COLORS.asphalt);
    expect(circulationLayer?.color).toBe(ROAD_MATERIAL_COLORS.asphalt);
    expect(ROAD_SURFACE_PROFILE.textureSize).toBeLessThanOrEqual(128);
    expect(ROAD_SURFACE_PROFILE.asphaltRoughness).toBeGreaterThanOrEqual(0.9);
    expect(ROAD_SURFACE_PROFILE.asphaltBumpScale).toBeLessThanOrEqual(0.008);
  });

  it('fecha somente as quatro microfrestas validadas entre corredores oficiais', () => {
    const byId = new Map(roads.map((entity) => [entity.id, entity.name]));
    const microGaps = findRoadConnections(roads)
      .filter((connection) => connection.kind === 'micro-gap')
      .map((connection) => [byId.get(connection.firstId), byId.get(connection.secondId)].sort().join(' + '))
      .sort();

    expect(microGaps).toEqual([
      'Rodovia RS 472 + Rua Bruno Schwartz',
      'Rua Argentina + Rua Montevidéu',
      'Rua Gustavo Bessel + Rua Pastor Albert Lehenbauer',
      'Rua Johan Muller + Rua Pastor Albert Lehenbauer',
    ]);
  });

  it('mantém acessos abertos e interrompe meios-fios nas interseções', () => {
    const runs = buildRoadBoundaryRuns(circulation);
    expect(runs.length).toBeGreaterThan(20);
    expect(runs.every((run) => run.from[0] !== run.to[0] || run.from[1] !== run.to[1])).toBe(true);
    expect(runs.every((run) => run.surfaceHeight > 0)).toBe(true);
  });

  it('gera uma rede mesclada dentro do orçamento gráfico e sem mutar os dados oficiais', () => {
    const sourceSnapshot = JSON.stringify(circulation);
    const detailed = buildRoadNetworkGeometries(circulation);
    const reduced = buildRoadNetworkGeometries(circulation, { reducedGraphics: true });

    try {
      expect(detailed.asphalt).not.toBeNull();
      expect(detailed.pedestrian).not.toBeNull();
      expect(detailed.intersections).not.toBeNull();
      expect(detailed.gutters).not.toBeNull();
      expect(detailed.curbs).not.toBeNull();
      expect(detailed.diagnostics).toMatchObject({
        roadCount: 21,
        pedestrianPathCount: 1,
        microGapCount: 4,
      });
      expect(detailed.diagnostics.estimatedBaseDrawCalls)
        .toBeLessThanOrEqual(ROAD_INFRASTRUCTURE.maximumBaseDrawCalls);

      const detailedTriangles = [
        detailed.asphalt,
        detailed.pedestrian,
        detailed.intersections,
        detailed.gutters,
        detailed.curbs,
      ].reduce((total, geometry) => total + triangleCount(geometry), 0);
      const reducedTriangles = [
        reduced.asphalt,
        reduced.pedestrian,
        reduced.intersections,
        reduced.gutters,
        reduced.curbs,
      ].reduce((total, geometry) => total + triangleCount(geometry), 0);

      expect(detailedTriangles).toBeLessThan(5_000);
      expect(reducedTriangles).toBeLessThan(detailedTriangles);
      expect(JSON.stringify(circulation)).toBe(sourceSnapshot);
    } finally {
      disposeRoadNetworkGeometries(detailed);
      disposeRoadNetworkGeometries(reduced);
    }
  });
});
