import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  OFFICIAL_REFERENCE_ENTITIES,
  OFFICIAL_REFERENCE_LOTS,
  OFFICIAL_RESTROOM_CENTERS_2026,
} from '@/features/commercial-map/data/officialReference2026';
import {
  EXPORURAL_STEAKHOUSE_LAYOUT,
  EXPORURAL_STEAKHOUSE_RENDER_BUDGET,
  EXPORURAL_STEAKHOUSE_REVISION,
  EXPORURAL_STEAKHOUSE_VISIBILITY_THRESHOLD,
  exporuralSteakhouseRenderDiagnostics,
  isExporuralSteakhousePresentationAvailable,
  isExporuralSteakhouseRestroomAnnex,
  resolveExporuralSteakhouseDimensions,
  resolveExporuralSteakhousePresentationExtent,
  resolveExporuralSteakhouseRestroomPresentationLift,
} from '@/features/commercial-map/utils/exporuralSteakhouse';
import { isSelectableMapClassification, selectionFocusProfile } from '@/features/commercial-map/utils/interaction';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkFocusDirection,
  strategicLandmarkSearchAliases,
  strategicLandmarkSupportsInterior,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';
import { pointInPolygon } from '@/features/commercial-map/utils/spatialSurface';

const steakhouse = OFFICIAL_REFERENCE_ENTITIES.find(
  (entity) => entity.publicIdentifier === 'C4',
);

if (!steakhouse) throw new Error('A referência oficial deve conter a Churrascaria Exporural C4.');

const componentSource = readFileSync(resolve(
  'src/features/commercial-map/components/canvas/ExporuralSteakhouse.tsx',
), 'utf8');
const landmarkRendererSource = readFileSync(resolve(
  'src/features/commercial-map/components/canvas/StrategicLandmarks.tsx',
), 'utf8');
const canvasSource = readFileSync(resolve(
  'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
), 'utf8');

function fittedDistanceForPortrait(
  extent: { width: number; depth: number; maxHeight: number },
  direction: THREE.Vector3,
  padding: number,
) {
  const verticalFov = THREE.MathUtils.degToRad(38);
  const aspect = 360 / 780;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(aspect, 0.35));
  const cameraDirection = direction.clone().normalize();
  const viewDirection = cameraDirection.clone().negate();
  const right = new THREE.Vector3().crossVectors(viewDirection, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, viewDirection).normalize();
  let distance = 0;

  for (const x of [-extent.width / 2, extent.width / 2]) {
    for (const y of [0, extent.maxHeight]) {
      for (const z of [-extent.depth / 2, extent.depth / 2]) {
        const point = new THREE.Vector3(x, y, z);
        const depthOffset = point.dot(cameraDirection);
        distance = Math.max(
          distance,
          depthOffset + Math.abs(point.dot(right)) / Math.tan(horizontalFov / 2),
          depthOffset + Math.abs(point.dot(up)) / Math.tan(verticalFov / 2),
        );
      }
    }
  }

  return Math.max(distance * padding, extent.maxHeight * 3 + 4);
}

describe('Churrascaria Exporural C4 e catavento moderno', () => {
  it('substitui somente a apresentação genérica e preserva o cadastro oficial de C4', () => {
    const before = JSON.stringify(steakhouse);

    expect(steakhouse).toMatchObject({
      id: 'reference:2026:c4',
      publicIdentifier: 'C4',
      name: 'Churrascaria Exporural',
      classification: 'RESTAURANT',
      layerId: 'reference:food',
      parentEntityId: 'reference:2026:quadra-r',
      isSellable: false,
    });
    expect(steakhouse.geometry.extrusionHeight).toBeCloseTo(0.95, 8);
    expect(OFFICIAL_REFERENCE_LOTS.some((lot) => lot.entityId === steakhouse.id)).toBe(false);
    expect(resolveStrategicLandmarkKind(steakhouse)).toBe('exporural-restaurant');
    expect(strategicLandmarkSupportsInterior(steakhouse)).toBe(false);
    expect(JSON.stringify(steakhouse)).toBe(before);
  });

  it('mantém o footprint oficial e deriva dele a composição assimétrica do anexo e turbina', () => {
    const bounds = strategicLandmarkBounds(steakhouse);
    const dimensions = resolveExporuralSteakhouseDimensions(bounds);

    expect(bounds.width).toBeCloseTo(2.6182, 4);
    expect(bounds.depth).toBeCloseTo(2.4, 4);
    expect(dimensions.mainWidth).toBeLessThan(bounds.width);
    expect(dimensions.mainDepth).toBeLessThan(bounds.depth);
    expect(dimensions.annexCenterX + dimensions.annexWidth / 2)
      .toBeLessThan(dimensions.mainOffsetX - dimensions.mainWidth / 2);
    expect(dimensions.turbineCenterX)
      .toBeLessThan(dimensions.annexCenterX - dimensions.annexWidth / 2);
    expect(dimensions.turbineCenterZ).toBeLessThan(dimensions.annexCenterZ);
    expect(dimensions.visualHeight).toBeCloseTo(
      dimensions.turbineFoundationHeight
        + dimensions.turbineTowerHeight
        + dimensions.turbineRotorRadius,
      10,
    );
    expect(dimensions.visualHeight).toBeGreaterThan(
      (dimensions.mainWallHeight + dimensions.mainRoofRise) * 3,
    );
    expect(strategicLandmarkVisualHeight(steakhouse)).toBeCloseTo(dimensions.visualHeight, 10);
  });

  it('enquadra a composição C4 + anexo + rotor em viewport portrait', () => {
    const bounds = strategicLandmarkBounds(steakhouse);
    const extent = resolveExporuralSteakhousePresentationExtent(bounds);

    expect(extent.minX).toBeLessThan(-bounds.width / 2);
    expect(extent.centerOffsetX).toBeLessThan(0);
    expect(extent.width).toBeGreaterThan(bounds.width * 2);
    expect(extent.maxHeight).toBeCloseTo(strategicLandmarkVisualHeight(steakhouse)!, 10);
    expect(canvasSource).toContain('resolveExporuralSteakhousePresentationExtent(officialBounds)');
    expect(canvasSource).toContain('officialBounds.centerX + presentationExtent.centerOffsetX');
    expect(canvasSource).toContain('officialBounds.centerZ + presentationExtent.centerOffsetZ');

    const direction = new THREE.Vector3(...EXPORURAL_STEAKHOUSE_LAYOUT.focusDirection).normalize();
    const profile = selectionFocusProfile(steakhouse.classification);
    const distance = fittedDistanceForPortrait(extent, direction, profile.fitPadding);
    const target = new THREE.Vector3(
      extent.centerOffsetX,
      extent.maxHeight * 0.28,
      extent.centerOffsetZ,
    );
    const camera = new THREE.PerspectiveCamera(38, 360 / 780, 0.035, 1_000);
    camera.position.copy(target).add(direction.multiplyScalar(distance));
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const projectedCorners = [extent.minX, extent.maxX].flatMap((x) => (
      [0, extent.maxHeight].flatMap((y) => (
        [extent.minZ, extent.maxZ].map((z) => new THREE.Vector3(x, y, z).project(camera))
      ))
    ));
    projectedCorners.forEach((point) => {
      expect(Math.abs(point.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(point.y)).toBeLessThanOrEqual(1);
      expect(point.z).toBeGreaterThanOrEqual(-1);
      expect(point.z).toBeLessThanOrEqual(1);
    });
  });

  it('cobre só a interseção do catavento com Q-R-27 sem alterar lote ou âncora x/z', () => {
    const hostLot = OFFICIAL_REFERENCE_ENTITIES.find(
      (entity) => entity.publicIdentifier === 'Q-R-27',
    );
    expect(hostLot).toBeDefined();
    if (!hostLot) return;
    const officialLotSnapshot = JSON.stringify(hostLot);
    const bounds = strategicLandmarkBounds(steakhouse);
    const dimensions = resolveExporuralSteakhouseDimensions(bounds);
    const turbineAnchor = [
      bounds.centerX + dimensions.turbineCenterX,
      bounds.centerZ + dimensions.turbineCenterZ,
    ] as const;
    const hostLotBounds = strategicLandmarkBounds(hostLot);

    expect(pointInPolygon(turbineAnchor, hostLot.geometry.coordinates[0] ?? [])).toBe(true);
    expect(dimensions.turbineFoundationHeight).toBeGreaterThan(hostLot.geometry.extrusionHeight);
    expect(dimensions.turbineFoundationDiameter).toBeLessThan(hostLotBounds.width / 2);
    expect(componentSource).toContain('plinto-circular-catavento-sobre-lote-q-r-27');
    expect(componentSource).toContain('position={[0, foundationHeight / 2, 0]}');
    expect(componentSource).toContain('position={[position[0], 0, position[1]]}');
    expect(JSON.stringify(hostLot)).toBe(officialLotSnapshot);
  });

  it('registra o banheiro a oeste como referência sem duplicar nem mover sua entidade oficial', () => {
    const restroomAnnex = OFFICIAL_REFERENCE_ENTITIES.find(
      (entity) => entity.publicIdentifier === 'E-06',
    );

    expect(restroomAnnex).toBeDefined();
    if (!restroomAnnex) return;
    const steakhouseBounds = strategicLandmarkBounds(steakhouse);
    const restroomBounds = strategicLandmarkBounds(restroomAnnex);
    const dimensions = resolveExporuralSteakhouseDimensions(steakhouseBounds);

    expect(EXPORURAL_STEAKHOUSE_LAYOUT.sourcePdfFootprint).toEqual([4980, 2370, 5100, 2480]);
    expect(EXPORURAL_STEAKHOUSE_LAYOUT.sourcePdfRestroomAnchor).toEqual([4931, 2427]);
    expect(EXPORURAL_STEAKHOUSE_LAYOUT.officialRestroomEntityIdentifier).toBe('E-06');
    expect(OFFICIAL_RESTROOM_CENTERS_2026).toContainEqual(
      EXPORURAL_STEAKHOUSE_LAYOUT.sourcePdfRestroomAnchor,
    );
    expect(restroomAnnex).toMatchObject({
      id: 'reference:2026:e-06',
      classification: 'RESTROOM',
      isSellable: false,
    });
    expect(dimensions.annexCenterX).toBeCloseTo(
      restroomBounds.centerX - steakhouseBounds.centerX,
      10,
    );
    expect(dimensions.annexCenterZ).toBeCloseTo(
      restroomBounds.centerZ - steakhouseBounds.centerZ,
      10,
    );
    expect(isExporuralSteakhouseRestroomAnnex(restroomAnnex)).toBe(true);
    expect(isSelectableMapClassification(restroomAnnex.classification)).toBe(true);
    expect(canvasSource).toContain('selected || hovered ? edges : null');
    expect(canvasSource).toContain('<meshBasicMaterial visible={false} />');
    expect(canvasSource).toContain('isRestroom && !usesExporuralSteakhouseAnnexPresentation');
    expect(OFFICIAL_REFERENCE_ENTITIES.filter((entity) => entity.publicIdentifier === 'C4'))
      .toHaveLength(1);
  });

  it('só assume a apresentação de E-06 enquanto C4 está realmente visível', () => {
    expect(isExporuralSteakhousePresentationAvailable({
      presentInRenderedEntities: true,
      selected: false,
      layerOpacity: 1,
    })).toBe(true);
    expect(isExporuralSteakhousePresentationAvailable({
      presentInRenderedEntities: true,
      selected: false,
      layerOpacity: EXPORURAL_STEAKHOUSE_VISIBILITY_THRESHOLD,
    })).toBe(false);
    expect(isExporuralSteakhousePresentationAvailable({
      presentInRenderedEntities: true,
      selected: true,
      layerOpacity: 0,
    })).toBe(true);
    expect(isExporuralSteakhousePresentationAvailable({
      presentInRenderedEntities: false,
      selected: true,
      layerOpacity: 1,
    })).toBe(false);
    expect(resolveExporuralSteakhouseRestroomPresentationLift(true, 1.08)).toBe(0);
    expect(resolveExporuralSteakhouseRestroomPresentationLift(false, 1.08)).toBe(1.08);
    expect(canvasSource).toContain(
      'exporuralSteakhousePresentationAvailable={exporuralSteakhousePresentationAvailable}',
    );
    expect(canvasSource).toContain('resolveExporuralSteakhouseRestroomPresentationLift(');
  });

  it('orienta o foco pelo noroeste e mantém aliases úteis sem renomear C4', () => {
    expect(strategicLandmarkFacingRadians(steakhouse)).toBe(0);
    expect(strategicLandmarkFocusDirection(steakhouse)).toEqual([-0.86, 0.54, -0.62]);
    expect(strategicLandmarkSearchAliases(steakhouse)).toEqual(expect.arrayContaining([
      'Churrascaria da Expo Rural',
      'Restaurante Exporural',
      'Catavento da Exporural',
    ]));
    expect(steakhouse.name).toBe('Churrascaria Exporural');
  });

  it('modela turbina moderna cilíndrica com nacelle, três pás e pontas vermelhas', () => {
    expect(EXPORURAL_STEAKHOUSE_LAYOUT.windTurbine.bladeAngles).toHaveLength(3);
    expect(EXPORURAL_STEAKHOUSE_LAYOUT.palette.accent).toBe('#b73532');
    expect(componentSource).toContain('new THREE.CylinderGeometry');
    expect(componentSource).toContain('nacelle-branca-catavento');
    expect(componentSource).toContain('tres-pas-brancas-catavento');
    expect(componentSource).toContain('tres-pontas-vermelhas-catavento');
    expect(componentSource).toContain("featureType: 'MODERN_THREE_BLADE_WIND_TURBINE'");
    expect(componentSource).toContain('hit-volume-anexo-churrascaria-exporural');
    expect(componentSource).toContain('hit-volume-torre-catavento-exporural');
    expect(componentSource).toContain('hit-volume-rotor-catavento-exporural');
    expect(componentSource).toContain('selectsOfficialEntityIdentifier');
    expect(landmarkRendererSource).toContain('compoundOnClick={handleClick}');
    expect(landmarkRendererSource).toContain('compoundOnDoubleClick={handleDoubleClick}');
    expect(componentSource).not.toMatch(/useFrame|setInterval|setTimeout|treliç|trelic/i);
  });

  it('preserva as duas seções de cobertura, o anexo, janelas e acabamento charcoal', () => {
    expect(componentSource).toContain('cobertura-norte-metal-cinza-escuro');
    expect(componentSource).toContain('cobertura-sul-e-anexo-bege');
    expect(componentSource).toContain('paredes-cinza-escuras-churrascaria-e-banheiro');
    expect(componentSource).toContain('empenas-fechadas-churrascaria-e-banheiro');
    expect(componentSource).toContain('janelas-churrascaria-exporural');
    expect(componentSource).toContain('fascias-portas-e-caixilhos-charcoal');
    expect(landmarkRendererSource).toContain("kind === 'exporural-restaurant'");
    expect(landmarkRendererSource).toContain('<ExporuralSteakhouse');
    expect(landmarkRendererSource).toContain('{...modelProps}');
  });

  it('descarta buffers instanciados sem invalidar geometrias e materiais compartilhados', () => {
    expect(componentSource).toContain('return () => disposeInstancedMesh(mesh);');
    expect(componentSource).not.toContain('mesh?.dispose');
    expect(componentSource).toContain('[geometry, instanceCount, material]');
    expect(componentSource).toContain('dispose={null}');
    expect(componentSource).toContain('const dimensions = useMemo(');
    expect(componentSource).toContain('[boundsDepth, boundsWidth]');
    expect(componentSource).toContain('useOwnedDisposable(unitBox);');
    expect(componentSource).toContain('useOwnedDisposable(gableGeometry);');
    expect(componentSource).not.toContain('unitBox.dispose();\n    gableGeometry.dispose();');
  });

  it('usa as duas referências locais e mantém budgets estáticos em ambos os níveis', () => {
    expect(EXPORURAL_STEAKHOUSE_REVISION).toBe('2026.9-c4-reference.1');
    EXPORURAL_STEAKHOUSE_LAYOUT.references.forEach((reference) => {
      const path = resolve(reference);
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(0);
    });

    const reduced = exporuralSteakhouseRenderDiagnostics(false);
    const detailed = exporuralSteakhouseRenderDiagnostics(true);
    expect(reduced).toMatchObject({
      primaryDrawCalls: 15,
      renderedTriangles: 888,
      shadowDrawCalls: 11,
      bladeCount: 3,
      withinBudget: true,
    });
    expect(detailed).toMatchObject({
      primaryDrawCalls: 17,
      renderedTriangles: 1344,
      shadowDrawCalls: 11,
      bladeCount: 3,
      withinBudget: true,
    });
    expect(reduced.primaryDrawCalls)
      .toBeLessThanOrEqual(EXPORURAL_STEAKHOUSE_RENDER_BUDGET.reduced.maximumPrimaryDrawCalls);
    expect(detailed.primaryDrawCalls)
      .toBeLessThanOrEqual(EXPORURAL_STEAKHOUSE_RENDER_BUDGET.detailed.maximumPrimaryDrawCalls);
  });
});
