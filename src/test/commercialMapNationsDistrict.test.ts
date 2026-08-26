import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NATIONS_DISTRICT_LAYOUT,
  NATIONS_DISTRICT_PRESENTATION_SURFACE_IDENTIFIERS,
  NATIONS_DISTRICT_REFERENCE,
  NATIONS_DISTRICT_RENDER_BUDGET,
  NATIONS_DISTRICT_REQUIRED_IDENTIFIERS,
  isNationsDistrictPresentationSurface,
  shouldRenderNationsDistrict,
} from '@/features/commercial-map/data/nationsDistrict';
import {
  COMMERCIAL_MAP_TREES,
  COMMERCIAL_TREE_AREA_SCENE_ANCHORS,
  COMMERCIAL_TREE_COUNTS_BY_AREA,
} from '@/features/commercial-map/data/commercialTrees';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { COMMERCIAL_MAP_SEGMENT_IDS } from '@/features/commercial-map/data/commercialMapSegments';
import { scopeCommercialMapData } from '@/features/commercial-map/utils/areaScope';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkSearchAliases,
  strategicLandmarkSupportsInterior,
} from '@/features/commercial-map/utils/landmarks';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const entity = (publicIdentifier: string) => {
  const match = OFFICIAL_REFERENCE_DATA.entities.find((candidate) => (
    candidate.publicIdentifier === publicIdentifier
  ));
  if (!match) throw new Error(`Entidade oficial ausente: ${publicIdentifier}`);
  return match;
};

describe('implantação interpretada da Praça das Nações', () => {
  it('documenta os cinco anexos e explicita o que ainda exige levantamento de campo', () => {
    expect(NATIONS_DISTRICT_REFERENCE.revision).toBe('2026.5-nations.1');
    expect(NATIONS_DISTRICT_REFERENCE.sources.map((item) => item.fileName)).toEqual([
      'IMG_9667.jpeg',
      'IMG_9668.jpeg',
      'IMG_9669.jpeg',
      'IMG_9670 (1).jpeg',
      'IMG_9671.jpeg',
    ]);
    expect(NATIONS_DISTRICT_REFERENCE.sources.filter((item) => item.role === 'current-map')).toHaveLength(3);
    expect(NATIONS_DISTRICT_REFERENCE.sources.filter((item) => item.role === 'satellite')).toHaveLength(1);
    expect(NATIONS_DISTRICT_REFERENCE.sources.filter((item) => item.role === 'interpreted-plan')).toHaveLength(1);
    expect(NATIONS_DISTRICT_REFERENCE.confidence).toEqual({
      existingStructureCenters: 'HIGH',
      stageCenterAndFootprint: 'INTERPRETED_FROM_ANNEX_5',
      individualTreeCenters: 'FIELD_REVIEW_RECOMMENDED',
      altimetry: 'NOT_SURVEYED',
    });
  });

  it('ativa a composição apenas quando todos os marcos oficiais da região estão presentes', () => {
    expect(NATIONS_DISTRICT_REQUIRED_IDENTIFIERS.every((identifier) => (
      OFFICIAL_REFERENCE_DATA.entities.some((candidate) => candidate.publicIdentifier === identifier)
    ))).toBe(true);
    expect(shouldRenderNationsDistrict(OFFICIAL_REFERENCE_DATA.entities)).toBe(true);

    const industry = scopeCommercialMapData(
      OFFICIAL_REFERENCE_DATA,
      COMMERCIAL_MAP_SEGMENT_IDS.industry,
    );
    const exporural = scopeCommercialMapData(
      OFFICIAL_REFERENCE_DATA,
      COMMERCIAL_MAP_SEGMENT_IDS.exporural,
    );
    expect(shouldRenderNationsDistrict(industry.entities)).toBe(false);
    expect(shouldRenderNationsDistrict(exporural.entities)).toBe(false);
  });

  it('preserva superfícies semânticas e substitui somente a apresentação genérica', () => {
    const surfaces = NATIONS_DISTRICT_PRESENTATION_SURFACE_IDENTIFIERS.map(entity);
    expect(surfaces.map((item) => item.publicIdentifier)).toEqual(
      NATIONS_DISTRICT_PRESENTATION_SURFACE_IDENTIFIERS,
    );
    surfaces.forEach((item) => expect(isNationsDistrictPresentationSurface(item)).toBe(true));
    expect(isNationsDistrictPresentationSurface(entity('C7'))).toBe(false);

    const canvas = source('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
    expect(canvas).toContain('isNationsDistrictPresentationSurface(entity)');
    expect(canvas).toContain('<NationsDistrict');
    expect(canvas).toContain('shouldRenderNationsDistrict(entities)');
  });

  it('mantém o eixo norte-sul, o vazio central e a ordem real das edificações', () => {
    const square = strategicLandmarkBounds(entity('B20'));
    const portico = strategicLandmarkBounds(entity('PORTICO-NACOES'));
    const polish = strategicLandmarkBounds(entity('C5'));
    const italian = strategicLandmarkBounds(entity('C6'));
    const german = strategicLandmarkBounds(entity('C8'));
    const african = strategicLandmarkBounds(entity('C7'));
    const rotary = strategicLandmarkBounds(entity('B29'));

    expect(portico.centerZ).toBeLessThan(square.minZ);
    expect(polish.centerX).toBeLessThan(square.centerX);
    expect(italian.centerX).toBeGreaterThan(square.centerX);
    expect(german.centerX).toBeLessThan(square.centerX);
    expect(african.centerX).toBeGreaterThan(square.centerX);
    expect(german.centerZ).toBeGreaterThan(polish.centerZ);
    expect(african.centerZ).toBeGreaterThan(italian.centerZ);
    expect(rotary.centerX).toBeLessThan(square.centerX);
    expect(rotary.centerZ).toBeGreaterThan(square.centerZ);
    expect(NATIONS_DISTRICT_LAYOUT.stage.center[1]).toBeGreaterThan(square.maxZ);
    expect(Math.abs(NATIONS_DISTRICT_LAYOUT.stage.center[0] - square.centerX)).toBeLessThan(0.1);
  });

  it('desenha três ilhas legíveis, abordagens, palco orientado e transições amplas de solo', () => {
    const [north, center, south] = NATIONS_DISTRICT_LAYOUT.islands;
    expect(NATIONS_DISTRICT_LAYOUT.islands).toHaveLength(3);
    expect(north.center[1]).toBeLessThan(center.center[1]);
    expect(center.center[1]).toBeLessThan(south.center[1]);
    NATIONS_DISTRICT_LAYOUT.islands.forEach((island) => {
      expect(island.width).toBeGreaterThan(1.9);
      expect(island.depth).toBeGreaterThan(3.1);
      expect(island.insetScale).toBeGreaterThan(0.5);
      expect(island.stairBands).toBeGreaterThanOrEqual(5);
    });
    expect(NATIONS_DISTRICT_LAYOUT.mainAsphalt).toHaveLength(8);
    expect(NATIONS_DISTRICT_LAYOUT.grassBoundary.length).toBeGreaterThanOrEqual(10);
    expect(NATIONS_DISTRICT_LAYOUT.northApproach).toHaveLength(4);
    expect(NATIONS_DISTRICT_LAYOUT.southApproach).toHaveLength(4);
    expect(NATIONS_DISTRICT_LAYOUT.stage.width).toBeCloseTo(3.97, 1);
    expect(NATIONS_DISTRICT_LAYOUT.stage.depth).toBeCloseTo(2.86, 1);
    expect(NATIONS_DISTRICT_LAYOUT.stage.facingRadians).toBe(Math.PI);
  });

  it('introduz modelos próprios para a Etnia Africana e Casa Rotária sem inventar interiores', () => {
    expect(resolveStrategicLandmarkKind(entity('B20'))).toBe('nations-square');
    expect(resolveStrategicLandmarkKind(entity('C7'))).toBe('african-pavilion');
    expect(resolveStrategicLandmarkKind(entity('B29'))).toBe('rotary-house');
    expect(strategicLandmarkFacingRadians(entity('C7'))).toBe(-Math.PI / 2);
    expect(strategicLandmarkFacingRadians(entity('B29'))).toBe(Math.PI / 2);
    expect(strategicLandmarkSearchAliases(entity('C7'))).toContain('Etnia Africana');
    expect(strategicLandmarkSearchAliases(entity('B29'))).toContain('Casa Rotary');
    expect(strategicLandmarkSupportsInterior(entity('C7'))).toBe(false);
    expect(strategicLandmarkSupportsInterior(entity('B29'))).toBe(false);
  });

  it('adiciona o maciço arbóreo interpretado ao batching compartilhado', () => {
    const districtTrees = COMMERCIAL_MAP_TREES.filter((tree) => tree.area === 'NATIONS_DISTRICT');
    expect(districtTrees).toHaveLength(NATIONS_DISTRICT_LAYOUT.trees.length);
    expect(COMMERCIAL_TREE_COUNTS_BY_AREA.NATIONS_DISTRICT).toBe(25);
    expect(new Set(districtTrees.map((tree) => tree.id)).size).toBe(25);
    districtTrees.forEach((tree) => {
      expect(tree.verificationStatus).toBe('FIELD_REVIEW_RECOMMENDED');
      expect(tree.placement).toBe('LANDSCAPE_MASS');
    });
    expect(COMMERCIAL_TREE_AREA_SCENE_ANCHORS.NATIONS_DISTRICT).toEqual(
      NATIONS_DISTRICT_REQUIRED_IDENTIFIERS,
    );
  });

  it('mantém orçamento estático e não cria luzes, animação contínua ou acesso a banco', () => {
    expect(NATIONS_DISTRICT_RENDER_BUDGET.district).toMatchObject({
      baseDrawCalls: 14,
      detailedDrawCalls: 18,
      treeInstances: 25,
      animatedDrawCalls: 0,
    });
    expect(NATIONS_DISTRICT_RENDER_BUDGET.africanPavilion.detailedDrawCalls).toBeLessThanOrEqual(14);
    expect(NATIONS_DISTRICT_RENDER_BUDGET.rotaryHouse.detailedDrawCalls).toBeLessThanOrEqual(13);

    const renderer = source('src/features/commercial-map/components/canvas/NationsDistrict.tsx');
    const layout = source('src/features/commercial-map/data/nationsDistrict.ts');
    expect(renderer).toContain('InstancedBatch');
    expect(renderer).toContain('raycast={NO_RAYCAST}');
    expect(renderer).toContain('new THREE.DataTexture');
    expect(renderer).toContain('ref={setMesh}');
    expect(renderer).toContain('useMemo(() => createMaterials(), [])');
    expect(renderer).not.toContain('createMaterials(opacity');
    expect(renderer).not.toContain('useFrame');
    expect(renderer).not.toMatch(/<(pointLight|spotLight|directionalLight|ambientLight)\b/);
    expect(`${renderer}\n${layout}`).not.toMatch(/supabase|from\(['"]/i);
  });
});
