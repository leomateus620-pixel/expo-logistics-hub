import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PAVILION14_COMMERCIAL_GEOMETRIC_AREA_M2,
  PAVILION14_COMMERCIAL_REFERENCE,
  PAVILION14_COMMERCIAL_REFERENCE_PROJECTION,
} from '@/features/commercial-map/data/pavilion14CommercialReference';
import { COMMERCIAL_PAVILION_MODULE_PLANS } from '@/features/commercial-map/utils/commercialPavilionModules';
import {
  COMMERCIAL_PAVILION_DEFINITIONS,
  commercialPavilionFacingRadians,
  commercialPavilionInteriorViewRotationRadians,
  createCommercialPavilionLayout,
} from '@/features/commercial-map/utils/commercialPavilions';

const read = (path: string) => readFileSync(path, 'utf8');

describe('planta comercial fixa do Pavilhão 14', () => {
  it('preserva quarter-turn, orientação, dimensões, áreas e os 186 módulos', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B2;

    expect(commercialPavilionFacingRadians({ publicIdentifier: 'B2' })).toBe(Math.PI / 2);
    expect(commercialPavilionInteriorViewRotationRadians({ publicIdentifier: 'B2' }))
      .toBe(-Math.PI / 2);
    expect(PAVILION14_COMMERCIAL_REFERENCE_PROJECTION).toEqual({
      coordinateTransform: 'quarter-turn-clockwise',
      fit: 'metric-contain',
      metricWidthM: 35,
      metricDepthM: 33,
      alignX: 'center',
      alignZ: 'center',
    });
    expect(plan.projection).toEqual(PAVILION14_COMMERCIAL_REFERENCE_PROJECTION);
    expect(PAVILION14_COMMERCIAL_REFERENCE.moduleCount).toBe(186);
    expect(PAVILION14_COMMERCIAL_REFERENCE.modularAreaM2).toBe(616.16);
    expect(PAVILION14_COMMERCIAL_GEOMETRIC_AREA_M2).toBe(616);
    expect(plan.cells).toHaveLength(186);
    expect(plan.zones.map((zone) => zone.numberRange)).toEqual([
      [1, 35], [36, 64], [65, 93], [94, 122], [123, 151], [152, 186],
    ]);
  });

  it('ativa somente a apresentação plana sem modificar a cartografia canônica', () => {
    expect(COMMERCIAL_PAVILION_MODULE_PLANS.B2.interiorPresentation).toMatchObject({
      mode: 'plan',
      navigationMode: 'locked-plan',
      enableRotate: false,
      enablePan: true,
      mouseNavigation: 'pan',
      touchNavigation: 'pan-dolly',
      preserveCanonicalOrientation: true,
      includeWayfindingInFit: true,
      flatModules: true,
      numberPriority: 'maximum',
      showAreaInsideModule: false,
      boundedPan: true,
      boundedZoom: true,
    });
    expect(PAVILION14_COMMERCIAL_REFERENCE).not.toHaveProperty('interiorPresentation');
  });

  it('projeta as laterais esquerda/direita do PDF nas paredes rear/front pelo quarter-turn', () => {
    const layout = createCommercialPavilionLayout(
      { width: 35, depth: 33 },
      COMMERCIAL_PAVILION_DEFINITIONS.B2,
      undefined,
      COMMERCIAL_PAVILION_MODULE_PLANS.B2,
    );
    const left = layout.exterior.facade.rearEntrances;
    const right = layout.exterior.facade.entrances;

    expect(left.map((access) => access.id)).toEqual([
      'north-transverse-access:left',
      'central-transverse-access:left',
      'south-transverse-access:left',
    ]);
    expect(right.map((access) => access.id)).toEqual([
      'north-transverse-access:right',
      'central-transverse-access:right',
      'south-transverse-access:right',
    ]);
    expect(left.map((access) => access.edge)).toEqual(['rear', 'rear', 'rear']);
    expect(right.map((access) => access.edge)).toEqual(['front', 'front', 'front']);
    expect(left.map((access) => access.centerX)).toEqual([...right.map((access) => access.centerX)]);
    expect(left[0].centerX).toBeGreaterThan(left[1].centerX);
    expect(left[1].centerX).toBeGreaterThan(left[2].centerX);
  });

  it('usa câmera e controles compartilhados sem rotação nem recentralização manual', () => {
    const interior = read('src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx');
    const camera = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');

    expect(interior).toContain('facing + interiorViewRotation');
    expect(interior).toContain('const envelopeWidth = layout.width;');
    expect(interior).toContain('const envelopeDepth = layout.depth;');
    expect(interior).toContain('LEFT: THREE.MOUSE.PAN');
    expect(interior).toContain('MIDDLE: THREE.MOUSE.DOLLY');
    expect(interior).toContain('RIGHT: THREE.MOUSE.PAN');
    expect(interior).toContain('ONE: THREE.TOUCH.PAN');
    expect(interior).toContain('TWO: THREE.TOUCH.DOLLY_PAN');
    expect(camera).toContain('fitCameraAboveContextualPanel');
    expect(camera).toContain('readContextualViewportInsets');
    expect(camera).toContain('preserveManualView.current = true');
  });

  it('mantém seleção comercial, lotes planos, instancing e atlas único sem labels DOM', () => {
    const layer = read('src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx');

    expect(layer).toMatch(/heightScale: flatModules\s+\? 1/);
    expect(layer).toContain('dispatchSalesModuleClick');
    expect(layer).toContain('THREE.InstancedMesh');
    expect(layer).toContain('new THREE.CanvasTexture(canvas)');
    expect(layer).toContain("plan.interiorPresentation?.numberPriority === 'maximum'");
    expect(layer).not.toContain('<Text');
    expect(layer).not.toContain('<Html');
  });

  it('não altera os perfis e orientações de B3, B4, B5 e B6', () => {
    const expected = {
      B3: [Math.PI, Math.PI],
      B4: [Math.PI, 0],
      B5: [Math.PI, 0],
      B6: [Math.PI, Math.PI],
    } as const;
    (Object.keys(expected) as Array<keyof typeof expected>).forEach((identifier) => {
      expect(COMMERCIAL_PAVILION_MODULE_PLANS[identifier].interiorPresentation).toMatchObject({
        mode: 'plan',
        enableRotate: false,
        enablePan: true,
        flatModules: true,
      });
      expect(commercialPavilionFacingRadians({ publicIdentifier: identifier }))
        .toBe(expected[identifier][0]);
      expect(commercialPavilionInteriorViewRotationRadians({ publicIdentifier: identifier }))
        .toBe(expected[identifier][1]);
    });
  });
});
