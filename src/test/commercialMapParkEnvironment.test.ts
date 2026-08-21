import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARENA_FRONT_LAYOUT,
  ARENA_FRONT_PRIMARY_DRAW_CALL_BUDGET,
  PARK_ENVIRONMENT_CLASSIFICATION_LABELS,
  PARK_ENVIRONMENT_FEATURES,
  PARK_ENVIRONMENT_REVISION,
  shouldRenderArenaFrontInfrastructure,
  sourceBoundsToLocal,
} from '@/features/commercial-map/data/parkEnvironment';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';
import { COMMERCIAL_MAP_SEGMENT_IDS } from '@/features/commercial-map/data/commercialMapSegments';
import { scopeCommercialMapData } from '@/features/commercial-map/utils/areaScope';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBoundsForEntity(publicIdentifier: string) {
  const entity = OFFICIAL_REFERENCE_DATA.entities.find((candidate) => (
    candidate.publicIdentifier === publicIdentifier
  ));
  const polygon = entity?.metadata.sourcePdfPolygon as readonly (readonly [number, number])[] | undefined;
  if (!polygon?.length) throw new Error(`Polígono-fonte ausente para ${publicIdentifier}`);
  const xs = polygon.map(([x]) => x);
  const zs = polygon.map(([, z]) => z);
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] as const;
}

function sourceBoundsOverlap(
  first: readonly [number, number, number, number],
  second: readonly [number, number, number, number],
) {
  return !(
    first[2] <= second[0]
    || first[0] >= second[2]
    || first[3] <= second[1]
    || first[1] >= second[3]
  );
}

describe('infraestrutura ambiental do parque', () => {
  it('mantém inventário ambiental versionado, explícito e fora das métricas comerciais', () => {
    expect(PARK_ENVIRONMENT_REVISION).toBe('2026.5-park-realism.1');
    expect(PARK_ENVIRONMENT_FEATURES).toHaveLength(5);
    expect(new Set(PARK_ENVIRONMENT_FEATURES.map((feature) => feature.id)).size)
      .toBe(PARK_ENVIRONMENT_FEATURES.length);
    expect(new Set(PARK_ENVIRONMENT_FEATURES.map((feature) => feature.classification))).toEqual(new Set([
      'PAVED_PUBLIC_AREA',
      'CONCRETE_STAIRS',
      'SPORTS_COURT',
      'LANDSCAPE_FEATURE',
    ]));
    PARK_ENVIRONMENT_FEATURES.forEach((feature) => {
      expect(feature.isSellable, feature.id).toBe(false);
      expect(feature.contributesToCommercialMetrics, feature.id).toBe(false);
      expect(feature.sourceReferences).toHaveLength(3);
      expect(feature.notes.length, feature.id).toBeGreaterThan(40);
      expect(PARK_ENVIRONMENT_CLASSIFICATION_LABELS[feature.classification], feature.id).toBeTruthy();
      expect(OFFICIAL_REFERENCE_DATA.lots.some((lot) => lot.publicIdentifier === feature.id), feature.id).toBe(false);
    });
  });

  it('ancora praça, escadaria e quadras entre D3, Arena, C1 e Rua Brasil', () => {
    const stairs = ARENA_FRONT_LAYOUT.stairs.sourceBounds;
    const multiSport = ARENA_FRONT_LAYOUT.multiSportCourt.sourceBounds;
    const volleyball = ARENA_FRONT_LAYOUT.sandVolleyballCourt.sourceBounds;
    const localStairs = sourceBoundsToLocal(stairs);
    const localMultiSport = sourceBoundsToLocal(multiSport);
    const localVolleyball = sourceBoundsToLocal(volleyball);

    expect(ARENA_FRONT_LAYOUT.stairs.stepCount).toBe(18);
    expect(ARENA_FRONT_LAYOUT.stairs.bankCount).toBe(3);
    expect(stairs[0]).toBeGreaterThan(4100); // fora de D3
    expect(stairs[2]).toBeLessThan(4900); // fora do footprint F
    expect(multiSport[3]).toBeLessThan(3106); // termina antes da Rua Brasil
    expect(volleyball[3]).toBeLessThan(3106);
    expect(volleyball[2]).toBeLessThan(4900);
    expect(localStairs.width).toBeGreaterThan(localStairs.depth);
    expect(localMultiSport.centerX).toBeLessThan(localVolleyball.centerX);
    expect(localMultiSport.maxX).toBeLessThan(localVolleyball.minX);
    expect(localStairs.maxZ).toBeLessThan(localMultiSport.minZ);

    const protectedIdentifiers = ['QUADRA-R', 'D3', 'F', 'C1', 'RUA-BRASIL', 'E-10', 'E-13'];
    const infrastructureBounds = [
      ARENA_FRONT_LAYOUT.stairs.sourceBounds,
      ARENA_FRONT_LAYOUT.westBerm.sourceBounds,
      ARENA_FRONT_LAYOUT.eastBerm.sourceBounds,
      ARENA_FRONT_LAYOUT.multiSportCourt.sourceBounds,
      ARENA_FRONT_LAYOUT.sandVolleyballCourt.sourceBounds,
    ];
    infrastructureBounds.forEach((bounds) => {
      protectedIdentifiers.forEach((identifier) => {
        expect(sourceBoundsOverlap(bounds, sourceBoundsForEntity(identifier)), `${identifier}: ${bounds.join(',')}`)
          .toBe(false);
      });
    });
  });

  it('renderiza a infraestrutura no mapa persistido por âncoras, sem depender do seed oficial', () => {
    expect(shouldRenderArenaFrontInfrastructure(OFFICIAL_REFERENCE_DATA.entities)).toBe(true);
    const databaseShapedEntities = OFFICIAL_REFERENCE_DATA.entities
      .filter((entity) => ARENA_FRONT_LAYOUT.sceneAnchors.includes(entity.publicIdentifier as never))
      .map((entity) => ({ ...entity, id: `database:${entity.publicIdentifier}`, projectId: 'database:project' }));
    expect(shouldRenderArenaFrontInfrastructure(databaseShapedEntities)).toBe(true);
    expect(shouldRenderArenaFrontInfrastructure(
      databaseShapedEntities.filter((entity) => entity.publicIdentifier !== 'F'),
    )).toBe(false);
    const industry = scopeCommercialMapData(OFFICIAL_REFERENCE_DATA, COMMERCIAL_MAP_SEGMENT_IDS.industry);
    expect(shouldRenderArenaFrontInfrastructure(industry.entities)).toBe(false);
  });

  it('usa geometria estrutural e instancing dentro do orçamento, sem capturar interação do mapa', () => {
    const renderer = source('src/features/commercial-map/components/canvas/ArenaFrontInfrastructure.tsx');
    const canvas = source('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
    const primaryDrawCalls = (renderer.match(/<(?:mesh|instancedMesh|lineSegments)\b/g) ?? []).length;
    expect(ARENA_FRONT_PRIMARY_DRAW_CALL_BUDGET).toBe(12);
    expect(primaryDrawCalls).toBe(10);
    expect(primaryDrawCalls).toBeLessThanOrEqual(ARENA_FRONT_PRIMARY_DRAW_CALL_BUDGET);
    expect(renderer.match(/<instancedMesh/g)?.length).toBeGreaterThanOrEqual(5);
    expect(renderer).toContain('degraus-concreto-arena');
    expect(renderer).toContain('redes-volei-arena');
    expect(renderer).toContain('tabelas-basquete-arena');
    expect(renderer).toContain('raycast={NO_RAYCAST}');
    expect(renderer).toContain('reducedGraphics');
    expect(renderer).toContain('userData={STAIRS_USER_DATA}');
    expect(renderer).toContain('intermediateLandingSteps');
    expect(canvas).toContain('<ArenaFrontInfrastructure');
    expect(canvas).toContain('opacity={arenaFrontInfrastructurePresentation.opacity}');
    expect(canvas).toContain('layerVisibility[arenaEntity.layerId] === false');
  });

  it('substitui o bloco genérico G por uma árvore-marco selecionável', () => {
    const lunarTree = OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.publicIdentifier === 'G')!;
    const renderer = source('src/features/commercial-map/components/canvas/StrategicLandmarks.tsx');
    expect(resolveStrategicLandmarkKind(lunarTree)).toBe('lunar-tree');
    expect(strategicLandmarkVisualHeight(lunarTree)).toBeGreaterThan(3.5);
    expect(renderer).toContain("kind === 'lunar-tree'");
    expect(renderer).toContain('<LunarTree {...modelProps} />');
    expect(renderer).toContain("kind === 'lunar-tree' ? 1.65 : 1");
  });
});
