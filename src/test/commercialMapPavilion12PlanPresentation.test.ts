import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PAVILION12_COMMERCIAL_MODULE_GAP,
  PAVILION12_COMMERCIAL_REFERENCE,
} from '@/features/commercial-map/data/pavilion12CommercialReference';
import { COMMERCIAL_PAVILION_MODULE_PLANS } from '@/features/commercial-map/utils/commercialPavilionModules';
import {
  commercialPavilionFacingRadians,
  commercialPavilionInteriorViewRotationRadians,
} from '@/features/commercial-map/utils/commercialPavilions';

const read = (path: string) => readFileSync(path, 'utf8');

describe('planta comercial fixa do Pavilhão 12', () => {
  it('preserva a orientação canônica de 180 graus, dimensões, inventário e perfil do B3', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B3;

    expect(commercialPavilionFacingRadians({ publicIdentifier: 'B3' })).toBe(Math.PI);
    expect(commercialPavilionInteriorViewRotationRadians({ publicIdentifier: 'B3' })).toBe(Math.PI);
    expect(PAVILION12_COMMERCIAL_MODULE_GAP).toBe(0);
    expect(PAVILION12_COMMERCIAL_REFERENCE.moduleCount).toBe(257);
    expect(PAVILION12_COMMERCIAL_REFERENCE.modularAreaM2).toBe(771);
    expect(PAVILION12_COMMERCIAL_REFERENCE.totalAreaM2).toBe(1650);
    expect(plan.cells).toHaveLength(257);
    expect(plan.zones.map((zone) => zone.numberRange)).toEqual([
      [1, 22], [23, 40], [41, 82], [83, 124],
      [125, 166], [167, 208], [209, 257],
    ]);
    expect(plan.interiorPresentation).toMatchObject({
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
  });

  it('preserva as arestas locais invertidas e a conexão B3 para B4', () => {
    const accesses = new Map(
      PAVILION12_COMMERCIAL_REFERENCE.wallAccesses.map((access) => [access.id, access]),
    );

    expect([...accesses.keys()]).toEqual([
      'right-central-entry-exit',
      'bottom-central-entry-exit',
      'pavilion-8-connection',
    ]);
    expect(accesses.get('right-central-entry-exit')).toMatchObject({ edges: ['left'] });
    expect(accesses.get('bottom-central-entry-exit')).toMatchObject({ edges: ['rear'] });
    expect(accesses.get('pavilion-8-connection')).toMatchObject({
      edges: ['right'],
      connectsTo: 'B4',
    });
  });

  it('usa a transformação canônica e os controles compartilhados de PAN e zoom', () => {
    const interior = read('src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx');
    const camera = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');

    expect(interior).toContain('facing + interiorViewRotation');
    expect(interior).toContain('position: toWorld(0, layout.interior.floorY + fitDistance');
    expect(interior).toContain('target: toWorld(0, layout.interior.floorY, 0)');
    expect(interior).toContain('const envelopeWidth = layout.width;');
    expect(interior).toContain('const envelopeDepth = layout.depth;');
    expect(interior).toContain('LEFT: THREE.MOUSE.PAN');
    expect(interior).toContain('MIDDLE: THREE.MOUSE.DOLLY');
    expect(interior).toContain('RIGHT: THREE.MOUSE.PAN');
    expect(interior).toContain('TWO: THREE.TOUCH.DOLLY_PAN');
    expect(camera).toContain('fitCameraAboveContextualPanel');
    expect(camera).toContain('readContextualViewportInsets');
    expect(camera).toContain('preserveManualView.current = true');
  });

  it('mantém lotes planos, seleção comercial e atlas numérico único', () => {
    const layer = read('src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx');

    expect(layer).toContain("const flatModules = mode === 'interior'");
    expect(layer).toContain('const heightScale = flatModules ? 1');
    expect(layer).toContain('plan.interiorPresentation?.showAreaInsideModule !== false');
    expect(layer).toContain("plan.interiorPresentation?.numberPriority === 'maximum'");
    expect(layer).toContain('dispatchSalesModuleClick');
    expect(layer).toContain('THREE.InstancedMesh');
    expect(layer).toContain('new THREE.CanvasTexture(canvas)');
    expect(layer).not.toContain('<Text');
    expect(layer).not.toContain('<Html');
  });

  it('não altera os perfis nem as orientações canônicas de B4, B5 e B6', () => {
    const expectedRotation = { B4: 0, B5: 0, B6: Math.PI } as const;
    (['B4', 'B5', 'B6'] as const).forEach((identifier) => {
      expect(COMMERCIAL_PAVILION_MODULE_PLANS[identifier].interiorPresentation).toMatchObject({
        mode: 'plan',
        enableRotate: false,
        enablePan: true,
        flatModules: true,
      });
      expect(commercialPavilionFacingRadians({ publicIdentifier: identifier })).toBe(Math.PI);
      expect(commercialPavilionInteriorViewRotationRadians({ publicIdentifier: identifier }))
        .toBe(expectedRotation[identifier]);
    });
  });
});