import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PAVILION1_COMMERCIAL_REFERENCE,
  PAVILION1_COMMERCIAL_REFERENCE_PROJECTION,
} from '@/features/commercial-map/data/pavilion1CommercialReference';
import { COMMERCIAL_PAVILION_MODULE_PLANS } from '@/features/commercial-map/utils/commercialPavilionModules';
import {
  commercialPavilionFacingRadians,
  commercialPavilionInteriorViewRotationRadians,
} from '@/features/commercial-map/utils/commercialPavilions';
import { resolveCommercialPavilionWayfindingMarkers } from '@/features/commercial-map/utils/commercialPavilionWayfinding';

const read = (path: string) => readFileSync(path, 'utf8');

describe('planta comercial fixa do Pavilhão 1', () => {
  it('preserva quarter-turn, orientação, dimensões, áreas e os 189 módulos', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B1;

    expect(commercialPavilionFacingRadians({ publicIdentifier: 'B1' })).toBe(Math.PI / 2);
    expect(commercialPavilionInteriorViewRotationRadians({ publicIdentifier: 'B1' })).toBe(Math.PI);
    expect(PAVILION1_COMMERCIAL_REFERENCE_PROJECTION).toEqual({
      coordinateTransform: 'quarter-turn-clockwise',
      fit: 'metric-contain',
      metricWidthM: 52.7,
      metricDepthM: 22.84,
    });
    expect(plan.projection).toEqual(PAVILION1_COMMERCIAL_REFERENCE_PROJECTION);
    expect(PAVILION1_COMMERCIAL_REFERENCE.moduleCount).toBe(189);
    expect(PAVILION1_COMMERCIAL_REFERENCE.modularAreaM2).toBe(587.85);
    expect(plan.cells).toHaveLength(189);
    expect(plan.zones.map((zone) => zone.numberRange)).toEqual([
      [1, 6], [7, 57], [58, 58], [59, 64],
      [65, 102], [103, 140], [141, 141], [142, 189],
    ]);
  });

  it('ativa somente a apresentação plana sem modificar a referência canônica', () => {
    expect(COMMERCIAL_PAVILION_MODULE_PLANS.B1.interiorPresentation).toMatchObject({
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
    expect(PAVILION1_COMMERCIAL_REFERENCE).not.toHaveProperty('interiorPresentation');
  });

  it('preserva o módulo 141 irregular, sua âncora, área e identidade', () => {
    const module141 = COMMERCIAL_PAVILION_MODULE_PLANS.B1.cells.find((cell) => cell.number === 141);

    expect(module141?.id).toBe('B1:module:141');
    expect(module141?.areaM2).toBe(19.35);
    expect(module141?.shape?.footprint).toHaveLength(6);
    expect(module141?.shape?.renderParts).toHaveLength(2);
    expect(module141?.labelAnchor).toEqual(module141?.shape?.labelAnchor);
    expect(module141?.labelAnchor?.[0]).toBeCloseTo(0.02 + (50.35 / 52.7) * 0.96, 12);
    expect(module141?.labelAnchor?.[1]).toBeCloseTo(0.02 + (1.5 / 22.84) * 0.96, 12);
  });

  it('projeta os quatro acessos pela transformação canônica, sem remapeamento manual', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B1;
    const markers = resolveCommercialPavilionWayfindingMarkers(plan, { width: 22.84, depth: 52.7 });

    expect(markers.map((marker) => marker.id)).toEqual([
      'west-upper-exit',
      'west-main-entrance',
      'east-upper-exit',
      'east-lower-exit',
    ]);
    expect(markers.map((marker) => marker.edge)).toEqual(['rear', 'rear', 'front', 'front']);
    expect(markers.map((marker) => marker.kind)).toEqual(['exit', 'entrance', 'exit', 'exit']);
  });

  it('usa a câmera compartilhada com pan, zoom, fit contextual e zero rotação', () => {
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
    expect(interior).not.toContain('DOLLY_ROTATE');
    expect(camera).toContain('fitCameraAboveContextualPanel');
    expect(camera).toContain('readContextualViewportInsets');
    expect(camera).toContain('preserveManualView.current = true');
  });

  it('mantém seleção e Vendas, lotes planos, instancing e atlas numérico único', () => {
    const layer = read('src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx');

    expect(layer).toContain('const heightScale = flatModules ? 1');
    expect(layer).toContain('dispatchSalesModuleClick');
    expect(layer).toContain('THREE.InstancedMesh');
    expect(layer).toContain('new THREE.CanvasTexture(canvas)');
    expect(layer).toContain("plan.interiorPresentation?.numberPriority === 'maximum'");
    expect(layer).toContain('!reducedGraphics && !flatModules');
    expect(layer).not.toContain('<Text');
    expect(layer).not.toContain('<Html');
  });

  it('não altera os perfis e orientações de B2, B3, B4, B5 e B6', () => {
    const expected = {
      B2: [Math.PI / 2, -Math.PI / 2],
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