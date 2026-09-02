import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMERCIAL_MAP_TREES, COMMERCIAL_TREE_COUNTS_BY_AREA } from '@/features/commercial-map/data/commercialTrees';
import {
  QUADRAS_AB_GROUND_MATERIALS,
  QUADRAS_AB_SPATIAL_REFERENCE,
} from '@/features/commercial-map/data/quadrasABEnvironment';
import {
  OFFICIAL_REFERENCE_ENTITIES,
  OFFICIAL_REFERENCE_LOTS,
  OFFICIAL_RENDERED_ENTITIES,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';
import { FENASOJA_HEADQUARTERS_LAYOUT } from '@/features/commercial-map/utils/headquarters';
import {
  LACTALIS_STAGE_LAYOUT,
  lactalisStageAudienceApronPolygon,
  lactalisStageFrontVector,
  lactalisStageHeadingToHeadquartersErrorRadians,
  lactalisStageHeadquartersSizeClass,
  lactalisStageLocalToWorld,
  lactalisStageModelDimensions,
  lactalisStagePresentationFootprint,
} from '@/features/commercial-map/utils/lactalisStage';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkFocusDirection,
  strategicLandmarkSearchAliases,
  strategicLandmarkSupportsInterior,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';
import {
  buildCommercialSiteHardSurfaceMasks,
  buildCommercialSiteEnvironmentPlan,
  commercialSiteCellIntersectsHardMask,
  commercialSitePolygonInteriorsOverlap,
} from '@/features/commercial-map/utils/commercialSiteEnvironment';
import { buildQuadrasABEnvironmentPlan } from '@/features/commercial-map/utils/quadrasABEnvironment';
import { distanceToPolygon, pointInPolygon } from '@/features/commercial-map/utils/spatialSurface';

const entity = (publicIdentifier: string) => OFFICIAL_REFERENCE_ENTITIES.find((candidate) => (
  candidate.publicIdentifier === publicIdentifier
))!;

const centroid = (polygon: readonly (readonly [number, number])[]) => {
  const points = polygon.length > 1 && polygon[0][0] === polygon.at(-1)?.[0] && polygon[0][1] === polygon.at(-1)?.[1]
    ? polygon.slice(0, -1)
    : polygon;
  return points.reduce<[number, number]>((sum, [x, z]) => [
    sum[0] + x / points.length,
    sum[1] + z / points.length,
  ], [0, 0]);
};

const expectCoordinatesCloseTo = (
  actual: readonly (readonly [number, number])[],
  expected: readonly (readonly [number, number])[],
) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((point, index) => {
    expect(point[0]).toBeCloseTo(expected[index][0], 10);
    expect(point[1]).toBeCloseTo(expected[index][1], 10);
  });
};

describe('reconstrução das Quadras A/B e Palco Cultural Lactalis', () => {
  it('preserva a identidade B13 e alinha o footprint à mesma classe de tamanho da Casa Fenasoja', () => {
    const palco = entity('B13');
    const sede = entity('B12');
    const palcoBefore = JSON.stringify(palco);
    const sedeBefore = JSON.stringify(sede);
    const bounds = strategicLandmarkBounds(palco);
    const headquartersBounds = strategicLandmarkBounds(sede);

    expect(palco).toMatchObject({
      id: 'reference:2026:b13',
      publicIdentifier: 'B13',
      name: 'Palco Cultural Lactalis',
      classification: 'EVENT_VENUE',
      parentEntityId: 'reference:2026:quadra-b',
      isSellable: false,
      isArchived: false,
    });
    expect(palco.metadata).toMatchObject({ parentPublicIdentifier: 'QUADRA-B' });
    expect(LACTALIS_STAGE_LAYOUT.sourceFootprint).toEqual(FENASOJA_HEADQUARTERS_LAYOUT.sourceFootprint);
    expect(LACTALIS_STAGE_LAYOUT.sourceCenter[0]).toBe(FENASOJA_HEADQUARTERS_LAYOUT.sourceCenter[0]);
    expect(bounds.centerX).toBeCloseTo(LACTALIS_STAGE_LAYOUT.worldCenter[0], 8);
    expect(bounds.centerZ).toBeCloseTo(LACTALIS_STAGE_LAYOUT.worldCenter[1], 8);
    expect(bounds.width).toBeCloseTo(headquartersBounds.width, 6);
    expect(bounds.depth).toBeCloseTo(headquartersBounds.depth, 6);
    expect(palco.geometry.rotation).toBe(0);
    expect(palco.geometry.coordinates[0].slice(0, -1)).toEqual(
      LACTALIS_STAGE_LAYOUT.sourceFootprintPolygon.map(officialPdfPointToLocal),
    );
    expect(OFFICIAL_REFERENCE_LOTS.some((lot) => lot.entityId === palco.id)).toBe(false);
    expect(resolveStrategicLandmarkKind(palco)).toBe('lactalis-cultural-stage');
    expect(strategicLandmarkSupportsInterior(palco)).toBe(false);
    expect(strategicLandmarkVisualHeight(palco)).toBe(Math.max(palco.geometry.extrusionHeight, LACTALIS_STAGE_LAYOUT.architecture.ridgeHeight));
    expect(JSON.stringify(palco)).toBe(palcoBefore);
    expect(JSON.stringify(sede)).toBe(sedeBefore);
    expect(resolveStrategicLandmarkKind(sede)).toBe('fenasoja-headquarters');
  });

  it('resolve palco persistido por B13 sem substituir UUID, relações ou metadados de interação', () => {
    const persisted = {
      ...entity('B13'),
      id: 'db:uuid:palco-cultural-lactalis',
      parentEntityId: 'db:uuid:quadra-b',
      metadata: { ...entity('B13').metadata, preservedInteractionMetadata: { labelPriority: 'structure' } },
    };
    const before = JSON.stringify(persisted);
    const focus = strategicLandmarkFocusDirection(persisted)!;
    const front = lactalisStageFrontVector();

    expect(resolveStrategicLandmarkKind(persisted)).toBe('lactalis-cultural-stage');
    expect(strategicLandmarkSearchAliases(persisted)).toContain('Palco Cultural Lactalis');
    expect(strategicLandmarkFacingRadians(persisted)).toBe(LACTALIS_STAGE_LAYOUT.facingRadians);
    expect(strategicLandmarkSupportsInterior(persisted)).toBe(false);
    expect(strategicLandmarkVisualHeight(persisted)).toBe(Math.max(persisted.geometry.extrusionHeight, LACTALIS_STAGE_LAYOUT.architecture.ridgeHeight));
    expect(focus[0] * front[0] + focus[2] * front[1]).toBeGreaterThan(0);
    expect(focus[1]).toBeGreaterThan(0);
    expect(JSON.stringify(persisted)).toBe(before);
  });

  it('orienta o palco reto e paralelo à Casa Fenasoja, sem o yaw diagonal para Q-D-12', () => {
    const palco = entity('B13');
    const sede = entity('B12');
    const palcoCenter = centroid(palco.geometry.coordinates[0]);
    const sedeCenter = centroid(sede.geometry.coordinates[0]);
    const headquartersDelta = [sedeCenter[0] - palcoCenter[0], sedeCenter[1] - palcoCenter[1]] as const;
    const headquartersLength = Math.hypot(...headquartersDelta);
    const headquartersVector = [headquartersDelta[0] / headquartersLength, headquartersDelta[1] / headquartersLength] as const;
    const front = lactalisStageFrontVector();

    expect(LACTALIS_STAGE_LAYOUT.headquartersIdentifier).toBe('B12');
    expect(LACTALIS_STAGE_LAYOUT.targetIdentifier).toBe('Q-D-12');
    expect(strategicLandmarkFacingRadians(palco)).toBe(0);
    expect(LACTALIS_STAGE_LAYOUT.facingRadians).toBe(0);
    expect(Math.abs(LACTALIS_STAGE_LAYOUT.facingDegrees)).toBeLessThan(1);
    expect(Math.abs(strategicLandmarkFacingRadians(sede))).toBeLessThan(Math.PI / 12);
    expect(lactalisStageHeadingToHeadquartersErrorRadians()).toBeLessThan(1e-12);
    expect(front[0]).toBeCloseTo(0, 10);
    expect(front[1]).toBeCloseTo(1, 10);
    expect(front[0] * headquartersVector[0] + front[1] * headquartersVector[1]).toBeGreaterThan(0.8);
  });

  it('mantém o envelope real de cobertura, calhas e apron em B13 e fora das vias/estruturas vizinhas', () => {
    const palco = entity('B13');
    const bounds = strategicLandmarkBounds(palco);
    const model = lactalisStageModelDimensions(bounds.width, bounds.depth);
    const rotation = LACTALIS_STAGE_LAYOUT.facingRadians;
    const axisAlignedWidth = Math.abs(Math.cos(rotation)) * model.width + Math.abs(Math.sin(rotation)) * model.depth;
    const axisAlignedDepth = Math.abs(Math.sin(rotation)) * model.width + Math.abs(Math.cos(rotation)) * model.depth;

    expect(axisAlignedWidth).toBeLessThan(bounds.width);
    expect(axisAlignedDepth).toBeLessThan(bounds.depth);
    expect(model.containmentScale).toBe(1);
    const footprint = lactalisStagePresentationFootprint(bounds.width, bounds.depth);
    const apron = lactalisStageAudienceApronPolygon();
    expect(footprint).toHaveLength(8);
    expectCoordinatesCloseTo(footprint, lactalisStagePresentationFootprint());
    [...footprint, ...apron].forEach((point) => {
      expect(pointInPolygon(point, palco.geometry.coordinates[0]), `envelope ${point.join(',')}`).toBe(true);
      const edgeClearance = Math.min(
        point[0] - bounds.minX, bounds.maxX - point[0],
        point[1] - bounds.minZ, bounds.maxZ - point[1],
      );
      expect(edgeClearance).toBeGreaterThanOrEqual(LACTALIS_STAGE_LAYOUT.architecture.footprintSafetyInset - 1e-8);
    });
    const neighbors = buildCommercialSiteHardSurfaceMasks(OFFICIAL_RENDERED_ENTITIES).filter((mask) => (
      mask.sourceIdentifier !== 'B13'
      && (mask.role === 'OFFICIAL_ROAD' || mask.role === 'OFFICIAL_SOLID_FOOTPRINT')
    ));
    expect(neighbors.some((mask) => mask.sourceIdentifier === 'B12')).toBe(true);
    neighbors.forEach((mask) => {
      expect(commercialSitePolygonInteriorsOverlap(footprint, mask.polygon), mask.sourceIdentifier).toBe(false);
    });
    expect(commercialSitePolygonInteriorsOverlap(footprint, entity('QUADRA-D').geometry.coordinates[0])).toBe(false);
  });

  it('inclui espessura dos telhados e o retângulo exato de acesso no envelope calculado', () => {
    const bounds = strategicLandmarkBounds(entity('B13'));
    const model = lactalisStageModelDimensions(bounds.width, bounds.depth);
    const architecture = LACTALIS_STAGE_LAYOUT.architecture;
    const overhang = model.width * architecture.roofOverhangRatio;
    const rise = architecture.ridgeHeight - architecture.eaveHeight;
    const pitch = Math.atan2(rise, model.width / 2 + overhang);
    const roofSlope = Math.hypot(model.width / 2 + overhang, rise);
    const footprint = lactalisStagePresentationFootprint();

    // Independent projection of all box corners used by the two sloped panels.
    [-1, 1].forEach((side) => [-1, 1].forEach((xSign) => [-1, 1].forEach((ySign) => [-1, 1].forEach((zSign) => {
      const angle = -side * pitch;
      const x = side * (model.width / 4 + overhang / 2)
        + xSign * roofSlope / 2 * Math.cos(angle)
        - ySign * architecture.roofThickness / 2 * Math.sin(angle);
      const z = zSign * (model.depth / 2 + overhang);
      expect(pointInPolygon(lactalisStageLocalToWorld([x, z]), footprint)).toBe(true);
    }))));

    const halfApronWidth = model.width * architecture.audienceApronWidthRatio / 2;
    const front = model.depth / 2;
    const apron = lactalisStageAudienceApronPolygon();
    expectCoordinatesCloseTo(apron, [
      lactalisStageLocalToWorld([-halfApronWidth, front]),
      lactalisStageLocalToWorld([halfApronWidth, front]),
      lactalisStageLocalToWorld([halfApronWidth, front + architecture.audienceApronDepth]),
      lactalisStageLocalToWorld([-halfApronWidth, front + architecture.audienceApronDepth]),
    ]);
    apron.forEach((point) => expect(pointInPolygon(point, footprint)).toBe(true));
    expect(architecture.eaveHeight).toBeGreaterThan(architecture.platformHeight);
    expect(architecture.ridgeHeight).toBeGreaterThan(architecture.eaveHeight);
    expect(LACTALIS_STAGE_LAYOUT.signage.aspectRatio).toBeGreaterThan(2);
    expect(LACTALIS_STAGE_LAYOUT.signage.aspectRatio).toBeLessThan(3.5);
  });

  it('mantém o corpo do palco na mesma classe de tamanho da Casa Fenasoja', () => {
    const sizeClass = lactalisStageHeadquartersSizeClass();
    expect(sizeClass.containmentScale).toBe(1);
    expect(sizeClass.widthRatio).toBeGreaterThan(0.92);
    expect(sizeClass.widthRatio).toBeLessThan(1.08);
    expect(sizeClass.depthRatio).toBeGreaterThan(0.92);
    expect(sizeClass.depthRatio).toBeLessThan(1.08);
    expect(sizeClass.stageHeight).toBeGreaterThan(1.5);
    expect(sizeClass.stageWidth).toBeGreaterThan(2.4);
  });

  it('usa os polígonos cadastrais A/B e ancora clareiras e copas somente dentro dessas quadras', () => {
    const references = [QUADRAS_AB_SPATIAL_REFERENCE.quadraA, QUADRAS_AB_SPATIAL_REFERENCE.quadraB];
    references.forEach((reference) => {
      const official = entity(reference.identifier);
      expect(reference.polygon).toEqual(official.geometry.coordinates[0].slice(0, -1));
      expect(official.classification).toBe('QUADRA');
    });
    expect(entity('QUADRA-A').id).not.toBe(entity('QUADRA-B').id);
    expect(commercialSitePolygonInteriorsOverlap(references[0].polygon, references[1].polygon)).toBe(false);
    QUADRAS_AB_SPATIAL_REFERENCE.satelliteAnchors.forEach((anchor) => {
      const polygon = entity(`QUADRA-${anchor.quadra}`).geometry.coordinates[0];
      expect(pointInPolygon(officialPdfPointToLocal(anchor.sourcePosition), polygon), anchor.id).toBe(true);
    });
  });

  it('gera solo A/B determinístico, PBR, não selecionável e sem sobrepor hard surfaces', () => {
    const original = JSON.stringify(OFFICIAL_RENDERED_ENTITIES);
    const full = buildQuadrasABEnvironmentPlan();
    const repeated = buildQuadrasABEnvironmentPlan();
    const reduced = buildQuadrasABEnvironmentPlan({ reducedGraphics: true });

    expect(full.cells.length).toBeGreaterThan(350);
    expect(full.diagnostics.cellCountByQuadra.A).toBeGreaterThan(full.diagnostics.cellCountByQuadra.B);
    expect(full.diagnostics.deterministicSignature).toBe(repeated.diagnostics.deterministicSignature);
    expect(full.cells.map((cell) => cell.id)).toEqual(repeated.cells.map((cell) => cell.id));
    expect(new Set(full.cells.map((cell) => cell.materialId))).toEqual(new Set(Object.keys(QUADRAS_AB_GROUND_MATERIALS)));
    expect(full.diagnostics).toMatchObject({ withinCellBudget: true, withinDrawCallBudget: true });
    expect(reduced.diagnostics).toMatchObject({ withinCellBudget: true, withinDrawCallBudget: true });
    expect(full.semanticPolicy).toEqual({
      presentationOnly: true,
      mutatesOfficialGeometry: false,
      createsMapEntities: false,
      createsSelectableObjects: false,
    });
    const cellsOutsideQuadra = full.cells.filter((cell) => cell.polygon.some((point) => (
      !pointInPolygon(point, entity(`QUADRA-${cell.quadra}`).geometry.coordinates[0])
    ))).map((cell) => cell.id);
    const hardMaskCollisions = full.cells.flatMap((cell) => full.hardSurfaceMasks.filter((mask) => (
      commercialSiteCellIntersectsHardMask(cell.polygon, mask)
    )).map((mask) => `${cell.id}/${mask.id}`));
    expect(cellsOutsideQuadra).toEqual([]);
    expect(hardMaskCollisions).toEqual([]);
    expect(JSON.stringify(OFFICIAL_RENDERED_ENTITIES)).toBe(original);
  }, 15000);

  it.each([false, true])('não duplica o tratamento validado da sede e distribui detalhes nas duas quadras (reduced=%s)', (reducedGraphics) => {
    const plan = buildQuadrasABEnvironmentPlan({ reducedGraphics });
    const existingSitePlan = buildCommercialSiteEnvironmentPlan({ entities: OFFICIAL_RENDERED_ENTITIES, reducedGraphics });
    const headquartersCells = existingSitePlan.cells.filter((cell) => cell.treatmentId === 'site-environment:B12');
    const headquartersOnlyPlan = buildCommercialSiteEnvironmentPlan({
      entities: OFFICIAL_RENDERED_ENTITIES,
      reducedGraphics,
      treatmentOwnerIdentifiers: ['B12'],
    });
    expect(headquartersCells.length).toBeGreaterThan(0);
    expect(headquartersOnlyPlan.cells).toEqual(headquartersCells);
    expect(headquartersOnlyPlan.hardSurfaceMasks).toEqual(existingSitePlan.hardSurfaceMasks);
    const duplicateCells = plan.cells.flatMap((cell) => headquartersCells.filter((headquartersCell) => (
      commercialSitePolygonInteriorsOverlap(cell.polygon, headquartersCell.polygon)
    )).map((headquartersCell) => `${cell.id}/${headquartersCell.id}`));
    expect(duplicateCells).toEqual([]);
    ['A', 'B'].forEach((quadra) => {
      expect(plan.detailAnchors.some((point) => pointInPolygon(point, entity(`QUADRA-${quadra}`).geometry.coordinates[0])), quadra).toBe(true);
    });
  }, 15000);

  it('mantém o padrão arbóreo irregular dentro das quadras e com folga de vias e prédios', () => {
    const trees = COMMERCIAL_MAP_TREES.filter((tree) => tree.area === 'QUADRA_A' || tree.area === 'QUADRA_B');
    const masks = buildCommercialSiteHardSurfaceMasks(OFFICIAL_RENDERED_ENTITIES).filter((mask) => (
      mask.role === 'OFFICIAL_ROAD' || mask.role === 'OFFICIAL_SOLID_FOOTPRINT'
    ));
    const quadraA = entity('QUADRA-A');
    const quadraB = entity('QUADRA-B');

    expect(COMMERCIAL_TREE_COUNTS_BY_AREA.QUADRA_A).toBeGreaterThanOrEqual(20);
    expect(COMMERCIAL_TREE_COUNTS_BY_AREA.QUADRA_B).toBeGreaterThanOrEqual(10);
    expect(new Set(trees.map((tree) => tree.id)).size).toBe(trees.length);
    expect(new Set(trees.map((tree) => tree.speciesGroup)).size).toBeGreaterThan(1);
    expect(new Set(trees.map((tree) => tree.canopyRadius)).size).toBeGreaterThan(5);
    trees.forEach((tree) => {
      const quadra = tree.area === 'QUADRA_A' ? quadraA : quadraB;
      expect(pointInPolygon(tree.position, quadra.geometry.coordinates[0]), tree.id).toBe(true);
      masks.forEach((mask) => {
        const distance = distanceToPolygon(tree.position, mask.polygon);
        expect(distance, `${tree.id}/${mask.sourceIdentifier}`).toBeGreaterThanOrEqual(tree.canopyRadius + mask.clearance - 0.025);
      });
      expect(tree.verificationStatus).toBe('CLUSTER_INTERPRETED');
      expect(tree.sourceReference).toContain('WhatsApp Image 2026-08-30');
    });
    QUADRAS_AB_SPATIAL_REFERENCE.satelliteAnchors.filter((anchor) => anchor.role === 'CLEARING').forEach((anchor) => {
      const center = officialPdfPointToLocal(anchor.sourcePosition);
      trees.filter((tree) => tree.area === `QUADRA_${anchor.quadra}`).forEach((tree) => {
        const distance = Math.hypot(tree.position[0] - center[0], tree.position[1] - center[1]);
        expect(distance, `${anchor.id}/${tree.id}`).toBeGreaterThan(tree.canopyRadius);
      });
    });
  });

  it('restringe o foco próximo ao B13 e preserva os limites seguros na saída da seleção', () => {
    const source = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    ), 'utf8');

    expect(LACTALIS_STAGE_LAYOUT.camera.minimumDistance).toBe(3.4);
    expect(LACTALIS_STAGE_LAYOUT.camera.focusedDistance).toBe(6.2);
    expect(LACTALIS_STAGE_LAYOUT.camera.focusPortraitMinimumDirectionY).toBe(0.48);
    expect(LACTALIS_STAGE_LAYOUT.camera.focusedDistance).toBeGreaterThan(LACTALIS_STAGE_LAYOUT.camera.minimumDistance);
    expect(source).toContain("const lactalisSelected = !interiorEntity && selectedKind === 'lactalis-cultural-stage';");
    expect(source).toMatch(/const requestedMinimumDistance = lactalisSelected\s*\? LACTALIS_STAGE_LAYOUT\.camera\.minimumDistance\s*:\s*miranteExtent/);
    expect(source).toContain("const compactStage = landmarkKind === 'lactalis-cultural-stage';");
    expect(source).toContain('Math.max(fittedDistance, compactStage ? LACTALIS_STAGE_LAYOUT.camera.focusedDistance : extent.diagonal * focusProfile.contextRatio)');
    expect(source).toContain('compactStage ? LACTALIS_STAGE_LAYOUT.camera.minimumDistance : Math.max(10, extent.diagonal * focusProfile.minDistanceRatio)');
    expect(source).toContain('compactStage && aspect < 0.72');
    expect(source).toContain('LACTALIS_STAGE_LAYOUT.camera.focusPortraitMinimumDirectionY');
    expect(source).toContain("startCameraMove(effectiveControlsMinimumDistance, effectiveControlsMaximumDistance, true, interiorFrame ?? {}, 'safety-limits')");
  });

  it('mantém overlays somente em DEV e integra o palco pelo hitbox oficial existente', () => {
    const canvasSource = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    ), 'utf8');
    const landmarkSource = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/StrategicLandmarks.tsx',
    ), 'utf8');
    const stageSource = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/LactalisCulturalStage.tsx',
    ), 'utf8');

    expect(canvasSource).toContain("import.meta.env.DEV\n  ? lazy(async () => ({ default: (await import('./QuadrasABValidationOverlay'))");
    expect(canvasSource).toContain("new URLSearchParams(window.location.search).has('quadrasABDebug')");
    expect(canvasSource).toContain('<QuadrasABEnvironmentLayer');
    expect(landmarkSource).toContain("kind === 'lactalis-cultural-stage'");
    expect(landmarkSource).toContain('<LactalisCulturalStage');
    expect(stageSource).toContain('palco-cultural-lactalis-architecture');
    expect(stageSource).toContain('corrugated-normal');
    expect(stageSource).toContain('palco-cultural-lactalis-signage');
    expect(stageSource).not.toMatch(/orange|#f28c1b/i);
  });
});
