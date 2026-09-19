import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAVILION13_COMMERCIAL_REFERENCE } from '@/features/commercial-map/data/pavilion13CommercialReference';
import { COMMERCIAL_PAVILION_MODULE_PLANS } from '@/features/commercial-map/utils/commercialPavilionModules';
import {
  commercialPavilionFacingRadians,
  commercialPavilionInteriorViewRotationRadians,
} from '@/features/commercial-map/utils/commercialPavilions';

const read = (path: string) => readFileSync(path, 'utf8');

describe('planta comercial fixa do Pavilhão 13', () => {
  it('preserva orientação, dimensões, inventário e perfil canônicos do B5', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B5;

    expect(commercialPavilionFacingRadians({ publicIdentifier: 'B5' })).toBe(Math.PI);
    expect(commercialPavilionInteriorViewRotationRadians({ publicIdentifier: 'B5' })).toBe(0);
    expect(PAVILION13_COMMERCIAL_REFERENCE.projection).toMatchObject({
      coordinateTransform: 'identity',
      metricWidthM: 21,
      metricDepthM: 35.35,
    });
    expect(PAVILION13_COMMERCIAL_REFERENCE.moduleCount).toBe(103);
    expect(PAVILION13_COMMERCIAL_REFERENCE.modularAreaM2).toBe(351.3);
    expect(plan.cells).toHaveLength(103);
    expect(plan.zones.map((zone) => zone.numberRange)).toEqual([
      [1, 15], [16, 24], [25, 25], [26, 26], [27, 29],
      [30, 53], [54, 77], [78, 78], [79, 79], [80, 88], [89, 103],
    ]);
    expect(plan.interiorPresentation).toMatchObject({
      fit: 'official-content',
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

  it('mantém polígonos, divisões diagonais e âncoras dos quatro módulos irregulares', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B5;
    const expectedAnchors = new Map([
      [25, [19.5 / 21, 3.75 / 35.35]],
      [26, [17.5 / 21, 1.45 / 35.35]],
      [78, [3.5 / 21, 1.45 / 35.35]],
      [79, [1.5 / 21, 3.75 / 35.35]],
    ] as const);

    expectedAnchors.forEach((anchor, number) => {
      const cell = plan.cells.find((candidate) => candidate.number === number);
      expect(cell?.shape?.footprint.length).toBeGreaterThanOrEqual(4);
      expect(cell?.shape?.renderParts.length).toBeGreaterThan(1);
      expect(cell?.labelAnchor[0]).toBeCloseTo(anchor[0], 12);
      expect(cell?.labelAnchor[1]).toBeCloseTo(anchor[1], 12);
    });
  });

  it('preserva todos os acessos oficiais e os destinos laterais', () => {
    const accesses = new Map(PAVILION13_COMMERCIAL_REFERENCE.wallAccesses.map((access) => [access.id, access]));

    expect([...accesses.keys()]).toEqual([
      'northwest-exit',
      'northeast-exit',
      'southwest-entrance',
      'southeast-entrance',
      'pavilion-3-connection',
      'pavilion-8-connection',
    ]);
    expect(accesses.get('pavilion-3-connection')).toMatchObject({ connectsTo: 'B6', edges: ['left'] });
    expect(accesses.get('pavilion-8-connection')).toMatchObject({ connectsTo: 'B4', edges: ['right'] });
  });

  it('usa o motor compartilhado para pan, zoom, fit, números e lotes planos', () => {
    const interior = read('src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx');
    const camera = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
    const layer = read('src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx');

    expect(interior).toContain("plan.interiorPresentation?.mode === 'plan'");
    expect(interior).toContain('const envelopeWidth = layout.width;');
    expect(interior).toContain('position: toWorld(0, layout.interior.floorY + fitDistance');
    expect(interior).toContain('LEFT: THREE.MOUSE.PAN');
    expect(interior).toContain('TWO: THREE.TOUCH.DOLLY_PAN');
    expect(interior).toContain('<CommercialPavilionWayfindingLayer');
    expect(camera).toContain('mouseButtons={interiorFrame?.mouseButtons ??');
    expect(camera).toContain('touches={interiorFrame?.touches ??');
    expect(camera).toContain('preserveManualView.current = true');
    expect(layer).toContain('const heightScale = flatModules ? 1');
    expect(layer).toContain("plan.interiorPresentation?.numberPriority === 'maximum'");
    expect(layer).toContain('new THREE.CanvasTexture(canvas)');
    expect(layer).toContain('!reducedGraphics && !flatModules');
  });

  it('não altera o perfil corrigido do B6 nem ativa o modo plano nos demais pavilhões', () => {
    expect(COMMERCIAL_PAVILION_MODULE_PLANS.B6.interiorPresentation).toMatchObject({
      mode: 'plan',
      enableRotate: false,
      enablePan: true,
      mouseNavigation: 'pan',
      touchNavigation: 'pan-dolly',
      preserveCanonicalOrientation: true,
      includeWayfindingInFit: true,
      flatModules: true,
      boundedPan: true,
      boundedZoom: true,
    });
    expect(commercialPavilionFacingRadians({ publicIdentifier: 'B6' })).toBe(Math.PI);
    expect(commercialPavilionInteriorViewRotationRadians({ publicIdentifier: 'B6' })).toBe(Math.PI);

    (['B10'] as const).forEach((identifier) => {
      expect(COMMERCIAL_PAVILION_MODULE_PLANS[identifier].interiorPresentation?.mode)
        .not.toBe('plan');
    });
  });
});