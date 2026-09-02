import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARENA_FRONT_LAYOUT,
  ARENA_FRONT_PRIMARY_DRAW_CALL_BUDGET,
  EXPORURAL_SMOOTH_CONCRETE_CORRECTION,
  PARK_ENVIRONMENT_CLASSIFICATION_LABELS,
  PARK_ENVIRONMENT_FEATURES,
  PARK_ENVIRONMENT_REVISION,
  shouldRenderArenaCourts,
  shouldRenderArenaStructures,
  sourceBoundsToLocal,
} from '@/features/commercial-map/data/parkEnvironment';
import { OFFICIAL_REFERENCE_DATA, OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';
import { COMMERCIAL_MAP_SEGMENT_IDS } from '@/features/commercial-map/data/commercialMapSegments';
import { scopeCommercialMapData } from '@/features/commercial-map/utils/areaScope';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

type SourcePoint = readonly [number, number];
type SourceBounds = readonly [number, number, number, number];

function sourcePolygonForEntity(publicIdentifier: string) {
  // Inventário cartográfico completo, inclusive pegadas não permanentes.
  const entity = OFFICIAL_REFERENCE_ENTITIES.find((candidate) => (
    candidate.publicIdentifier === publicIdentifier
  ));
  const polygon = entity?.metadata.sourcePdfPolygon as readonly SourcePoint[] | undefined;
  if (!polygon?.length) throw new Error(`Polígono-fonte ausente para ${publicIdentifier}`);
  return polygon;
}

function sourceBoundsForEntity(publicIdentifier: string) {
  const polygon = sourcePolygonForEntity(publicIdentifier);
  const xs = polygon.map(([x]) => x);
  const zs = polygon.map(([, z]) => z);
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] as const;
}

function sourceBoundsOverlap(
  first: SourceBounds,
  second: SourceBounds,
) {
  return !(
    first[2] <= second[0]
    || first[0] >= second[2]
    || first[3] <= second[1]
    || first[1] >= second[3]
  );
}

function pointInPolygon([x, z]: SourcePoint, polygon: readonly SourcePoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [xi, zi] = polygon[index];
    const [xj, zj] = polygon[previous];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function sourceBoundsOverlapPolygon(bounds: SourceBounds, polygon: readonly SourcePoint[]) {
  const corners: SourcePoint[] = [
    [bounds[0], bounds[1]],
    [bounds[2], bounds[1]],
    [bounds[2], bounds[3]],
    [bounds[0], bounds[3]],
  ];
  if (corners.some((corner) => pointInPolygon(corner, polygon))) return true;
  if (polygon.some(([x, z]) => (
    x > bounds[0] && x < bounds[2] && z > bounds[1] && z < bounds[3]
  ))) return true;

  const cross = (start: SourcePoint, end: SourcePoint, point: SourcePoint) => (
    (end[0] - start[0]) * (point[1] - start[1])
    - (end[1] - start[1]) * (point[0] - start[0])
  );
  const onSegment = (start: SourcePoint, end: SourcePoint, point: SourcePoint) => (
    Math.abs(cross(start, end, point)) < Number.EPSILON
    && point[0] >= Math.min(start[0], end[0])
    && point[0] <= Math.max(start[0], end[0])
    && point[1] >= Math.min(start[1], end[1])
    && point[1] <= Math.max(start[1], end[1])
  );
  const segmentsIntersect = (
    firstStart: SourcePoint,
    firstEnd: SourcePoint,
    secondStart: SourcePoint,
    secondEnd: SourcePoint,
  ) => {
    const firstA = cross(firstStart, firstEnd, secondStart);
    const firstB = cross(firstStart, firstEnd, secondEnd);
    const secondA = cross(secondStart, secondEnd, firstStart);
    const secondB = cross(secondStart, secondEnd, firstEnd);
    if (firstA * firstB < 0 && secondA * secondB < 0) return true;
    return onSegment(firstStart, firstEnd, secondStart)
      || onSegment(firstStart, firstEnd, secondEnd)
      || onSegment(secondStart, secondEnd, firstStart)
      || onSegment(secondStart, secondEnd, firstEnd);
  };
  const rectangleEdges = corners.map((corner, index) => (
    [corner, corners[(index + 1) % corners.length]] as const
  ));
  const polygonEdges = polygon.map((point, index) => (
    [point, polygon[(index + 1) % polygon.length]] as const
  ));
  return rectangleEdges.some(([rectangleStart, rectangleEnd]) => (
    polygonEdges.some(([polygonStart, polygonEnd]) => (
      segmentsIntersect(rectangleStart, rectangleEnd, polygonStart, polygonEnd)
    ))
  ));
}

describe('infraestrutura ambiental do parque', () => {
  it('mantém inventário ambiental versionado, explícito e fora das métricas comerciais', () => {
    expect(PARK_ENVIRONMENT_REVISION).toBe('2026.9-anexo3-west-field.1');
    expect(PARK_ENVIRONMENT_FEATURES).toHaveLength(10);
    expect(new Set(PARK_ENVIRONMENT_FEATURES.map((feature) => feature.id)).size)
      .toBe(PARK_ENVIRONMENT_FEATURES.length);
    expect(new Set(PARK_ENVIRONMENT_FEATURES.map((feature) => feature.classification))).toEqual(new Set([
      'PAVED_PUBLIC_AREA',
      'CONCRETE_STAIRS',
      'SPORTS_COURT',
      'LANDSCAPE_FEATURE',
      'NATURAL_TERRAIN',
      'SPORTS_FIELD',
      'PEDESTRIAN_PATH',
      'NON_COMMERCIAL_STRUCTURE',
    ]));
    PARK_ENVIRONMENT_FEATURES.forEach((feature) => {
      expect(feature.isSellable, feature.id).toBe(false);
      expect(feature.contributesToCommercialMetrics, feature.id).toBe(false);
      expect(feature.sourceReferences.length, feature.id).toBeGreaterThanOrEqual(
        feature.id === 'arena-front-covered-access' ? 2 : 4,
      );
      expect(feature.notes.length, feature.id).toBeGreaterThan(40);
      expect(PARK_ENVIRONMENT_CLASSIFICATION_LABELS[feature.classification], feature.id).toBeTruthy();
      expect(OFFICIAL_REFERENCE_DATA.lots.some((lot) => lot.publicIdentifier === feature.id), feature.id).toBe(false);
    });
  });

  it('orienta a escadaria para a Arena e ancora as quadras junto à borda sul da Exporural', () => {
    const stairs = ARENA_FRONT_LAYOUT.stairs.sourceBounds;
    const footballField = ARENA_FRONT_LAYOUT.footballField.sourceBounds;
    const multiSport = ARENA_FRONT_LAYOUT.multiSportCourt.sourceBounds;
    const volleyball = ARENA_FRONT_LAYOUT.sandVolleyballCourt.sourceBounds;
    const localStairs = sourceBoundsToLocal(stairs);
    const localMultiSport = sourceBoundsToLocal(multiSport);
    const localVolleyball = sourceBoundsToLocal(volleyball);

    expect(ARENA_FRONT_LAYOUT.stairs.stepCount).toBe(18);
    expect(ARENA_FRONT_LAYOUT.stairs.bankCount).toBe(3);
    expect(ARENA_FRONT_LAYOUT.stairs).toMatchObject({
      runAxis: 'x',
      highEdge: 'west',
      lowEdge: 'east',
    });
    expect(stairs[0]).toBeGreaterThan(4100); // fora de D3
    expect(stairs[2]).toBeLessThan(4900); // fora do footprint F
    expect(stairs[3]).toBeLessThan(3106); // termina antes da Rua Brasil
    expect(multiSport[3]).toBeLessThan(2682); // quadras ficam ao norte da praça
    expect(volleyball[3]).toBeLessThan(2682);
    expect(volleyball[2]).toBeLessThan(4900);
    expect(localStairs.width).toBeGreaterThan(localStairs.depth);
    expect(localMultiSport.depth).toBeGreaterThan(localMultiSport.width);
    expect(localVolleyball.depth).toBeGreaterThan(localVolleyball.width);
    expect(ARENA_FRONT_LAYOUT.multiSportCourt.longAxis).toBe('z');
    expect(ARENA_FRONT_LAYOUT.sandVolleyballCourt.longAxis).toBe('z');
    expect(localVolleyball.centerX).toBeLessThan(localMultiSport.centerX);
    expect(localVolleyball.maxX).toBeLessThan(localMultiSport.minX);
    expect(localMultiSport.maxZ).toBeLessThan(localStairs.minZ);
    expect(footballField).toEqual([4660, 2860, 4880, 3200]);
    expect(footballField[2]).toBeLessThan(4900);
    expect(footballField[0]).toBeGreaterThan(stairs[2]);
    expect(footballField[3] - footballField[1]).toBeGreaterThan(footballField[2] - footballField[0]);
    expect(ARENA_FRONT_LAYOUT.footballField.markings).toBe(false);
    expect(PARK_ENVIRONMENT_FEATURES.filter((feature) => feature.classification === 'SPORTS_FIELD'))
      .toHaveLength(1);
    expect(sourceBoundsOverlapPolygon(footballField, ARENA_FRONT_LAYOUT.plaza.sourcePolygon)).toBe(false);
    expect(ARENA_FRONT_LAYOUT.walkways.some((walkway) => (
      walkway.sourcePath.some(([x, z]) => (
        x > footballField[0] && x < footballField[2]
        && z > footballField[1] && z < footballField[3]
      ))
    ))).toBe(false);

    const protectedIdentifiers = ['D3', 'B16', 'B17', 'F', 'C1', 'RUA-BRASIL', 'E-10', 'E-13'];
    const infrastructureBounds = [
      ARENA_FRONT_LAYOUT.stairs.sourceBounds,
      ARENA_FRONT_LAYOUT.northBerm.sourceBounds,
      ARENA_FRONT_LAYOUT.southBerm.sourceBounds,
      ARENA_FRONT_LAYOUT.multiSportCourt.sourceBounds,
      ARENA_FRONT_LAYOUT.sandVolleyballCourt.sourceBounds,
    ];
    infrastructureBounds.forEach((bounds) => {
      protectedIdentifiers.forEach((identifier) => {
        expect(sourceBoundsOverlap(bounds, sourceBoundsForEntity(identifier)), `${identifier}: ${bounds.join(',')}`)
          .toBe(false);
      });
    });
    ['QUADRA-R', 'EXPORURAL'].forEach((identifier) => {
      const polygon = sourcePolygonForEntity(identifier);
      infrastructureBounds.forEach((bounds) => {
        expect(sourceBoundsOverlapPolygon(bounds, polygon), `${identifier}: ${bounds.join(',')}`)
          .toBe(false);
      });
    });

    [
      'F', 'D3', 'D1', 'C1', 'RUA-BRASILIA', 'RUA-BRASIL',
    ].forEach((identifier) => {
      expect(
        sourceBoundsOverlap(footballField, sourceBoundsForEntity(identifier)),
        `${identifier}: ${footballField.join(',')}`,
      ).toBe(false);
    });
    [stairs, multiSport, volleyball].forEach((bounds) => {
      expect(sourceBoundsOverlap(footballField, bounds), `campo: ${bounds.join(',')}`).toBe(false);
    });
  });

  it('pavimenta o concreto liso a leste de C4 sem invadir o campo oeste nem o envelope de C4', () => {
    const concrete = EXPORURAL_SMOOTH_CONCRETE_CORRECTION.sourcePolygon;
    const concreteBounds = [5100, 2372, 5375, 2500] as const;
    const steakhouse = sourceBoundsForEntity('C4');
    const footballField = ARENA_FRONT_LAYOUT.footballField.sourceBounds;
    const feature = PARK_ENVIRONMENT_FEATURES.find((candidate) => (
      candidate.id === 'exporural-smooth-concrete-c4'
    ));

    expect(EXPORURAL_SMOOTH_CONCRETE_CORRECTION.officialOwnerIdentifier).toBe('C4');
    expect(EXPORURAL_SMOOTH_CONCRETE_CORRECTION.elevation).toBe(0.06);
    expect(EXPORURAL_SMOOTH_CONCRETE_CORRECTION.surface).toBe('concrete');
    expect(EXPORURAL_SMOOTH_CONCRETE_CORRECTION.tileWorldSize).toBe(1.7);
    expect(EXPORURAL_SMOOTH_CONCRETE_CORRECTION.baseColor).toBe('#c6c7c2');
    expect(EXPORURAL_SMOOTH_CONCRETE_CORRECTION.roughness).toBe(0.94);
    expect(concrete).toEqual([
      [5100, 2372],
      [5360, 2372],
      [5375, 2388],
      [5375, 2482],
      [5358, 2500],
      [5100, 2500],
    ]);
    expect(feature, 'feature ambiental do concreto liso').toBeDefined();
    expect(feature!.classification).toBe('PAVED_PUBLIC_AREA');
    expect(feature!.isSellable).toBe(false);
    expect(feature!.contributesToCommercialMetrics).toBe(false);
    expect(concreteBounds[0]).toBe(steakhouse[2]);
    expect(sourceBoundsOverlap(concreteBounds, steakhouse)).toBe(false);
    expect(sourceBoundsOverlap(concreteBounds, footballField)).toBe(false);
    expect(sourceBoundsOverlap(concreteBounds, sourceBoundsForEntity('C1'))).toBe(false);
    expect(sourceBoundsOverlap(concreteBounds, sourceBoundsForEntity('F'))).toBe(false);
    expect(sourceBoundsOverlapPolygon(ARENA_FRONT_LAYOUT.footballField.sourceBounds, concrete)).toBe(false);
    expect(pointInPolygon([5230, 2430], concrete)).toBe(true);
    expect(pointInPolygon([5040, 2425], concrete)).toBe(false);
    expect(ARENA_FRONT_LAYOUT.footballField.turfColor).toBe('#7f9a5c');
  });

  it('renderiza a infraestrutura no mapa persistido por âncoras, sem depender do seed oficial', () => {
    expect(shouldRenderArenaStructures(OFFICIAL_REFERENCE_DATA.entities)).toBe(true);
    expect(shouldRenderArenaCourts(OFFICIAL_REFERENCE_DATA.entities)).toBe(true);
    const sceneAnchors = new Set<string>([
      ...ARENA_FRONT_LAYOUT.arenaStructureAnchors,
      ...ARENA_FRONT_LAYOUT.courtAnchors,
    ]);
    const databaseShapedEntities = OFFICIAL_REFERENCE_DATA.entities
      .filter((entity) => sceneAnchors.has(entity.publicIdentifier))
      .map((entity) => ({ ...entity, id: `database:${entity.publicIdentifier}`, projectId: 'database:project' }));
    expect(shouldRenderArenaStructures(databaseShapedEntities)).toBe(true);
    expect(shouldRenderArenaCourts(databaseShapedEntities)).toBe(true);
    expect(shouldRenderArenaStructures(
      databaseShapedEntities.filter((entity) => entity.publicIdentifier !== 'F'),
    )).toBe(false);
    expect(shouldRenderArenaCourts(
      databaseShapedEntities.filter((entity) => entity.publicIdentifier !== 'QUADRA-R'),
    )).toBe(false);
    expect(ARENA_FRONT_LAYOUT.arenaStructureOwners).toEqual(['F']);
    expect(ARENA_FRONT_LAYOUT.courtOwners).toEqual(['QUADRA-R', 'EXPORURAL']);

    const exporural = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA, COMMERCIAL_MAP_SEGMENT_IDS.exporural);
    expect(shouldRenderArenaStructures(exporural.entities)).toBe(false);
    expect(shouldRenderArenaCourts(exporural.entities)).toBe(true);
    const industry = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA, COMMERCIAL_MAP_SEGMENT_IDS.industry);
    expect(shouldRenderArenaStructures(industry.entities)).toBe(false);
    expect(shouldRenderArenaCourts(industry.entities)).toBe(false);
  });

  it('usa geometria estrutural e instancing dentro do orçamento, sem capturar interação do mapa', () => {
    const renderer = source('src/features/commercial-map/components/canvas/ArenaFrontInfrastructure.tsx');
    const canvas = source('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
    const primaryDrawCalls = (renderer.match(/<(?:mesh|instancedMesh|lineSegments)\b/g) ?? []).length;
    const metalPasses = (renderer.match(/<MetalInfrastructure\b/g) ?? []).length;
    const fullSceneDrawCalls = primaryDrawCalls + metalPasses - 1;
    expect(ARENA_FRONT_PRIMARY_DRAW_CALL_BUDGET).toBe(18);
    expect(primaryDrawCalls).toBe(16);
    expect(fullSceneDrawCalls).toBe(17);
    expect(fullSceneDrawCalls).toBeLessThanOrEqual(ARENA_FRONT_PRIMARY_DRAW_CALL_BUDGET);
    expect(renderer.match(/<instancedMesh/g)?.length).toBeGreaterThanOrEqual(5);
    expect(renderer).toContain('degraus-concreto-arena');
    expect(renderer).toContain('redes-volei-arena');
    expect(renderer).toContain('tabelas-basquete-arena');
    expect(renderer).toContain('campo-gramado-sem-marcacoes-arena');
    expect(renderer).toContain('piso-concreto-liso-exporural-c4');
    expect(renderer).toContain('createWorldTiledHorizontalPolygonGeometry');
    expect(renderer).toContain('EXPORURAL_SMOOTH_CONCRETE_CORRECTION');
    expect(renderer).toContain('gramado-sem-marcacoes-arena');
    expect(renderer).not.toContain('footballFieldLineGeometry');
    expect(renderer).not.toContain('marcacoes-campo-arena');
    expect(renderer).not.toContain("'pitchTurf'");
    expect(renderer).toContain('raycast={NO_RAYCAST}');
    expect(renderer).toContain('reducedGraphics');
    expect(renderer).toContain('userData={STAIRS_USER_DATA}');
    expect(renderer).toContain('intermediateLandingSteps');
    expect(renderer).toContain('let cursorX = bounds.maxX - config.lowerLandingDepth');
    expect(renderer).toContain('const railZs =');
    expect(renderer).toContain('[x, bottomY, bounds.centerZ]');
    expect(canvas).toContain('<ArenaFrontInfrastructure');
    expect(canvas).toContain('showArenaStructures={arenaFrontInfrastructurePresentation.arenaStructures.visible}');
    expect(canvas).toContain('showCourts={arenaFrontInfrastructurePresentation.courts.visible}');
    expect(canvas).toContain('ARENA_FRONT_LAYOUT.arenaStructureOwners');
    expect(canvas).toContain('ARENA_FRONT_LAYOUT.courtOwners');
    expect(canvas).toContain('layerVisibility[entity.layerId] === false');
  });

  it('substitui o bloco genérico G por uma árvore-marco selecionável', () => {
    const lunarTree = OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.publicIdentifier === 'G')!;
    const renderer = source('src/features/commercial-map/components/canvas/StrategicLandmarks.tsx');
    expect(resolveStrategicLandmarkKind(lunarTree)).toBe('lunar-tree');
    expect(strategicLandmarkVisualHeight(lunarTree)).toBeGreaterThan(3.5);
    expect(renderer).toContain("kind === 'lunar-tree'");
    expect(renderer).toContain('<LunarTree {...modelProps} />');
    expect(renderer).toContain("kind === 'lunar-tree' ? LUNAR_MEMORIAL_HIT_SCALE : 1");
  });
});
