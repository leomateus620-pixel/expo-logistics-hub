import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PAVILION8_COMMERCIAL_GEOMETRIC_AREA_M2,
  PAVILION8_COMMERCIAL_REFERENCE,
  PAVILION8_COMMERCIAL_SUPPORT_SPACES,
} from '@/features/commercial-map/data/pavilion8CommercialReference';
import {
  COMMERCIAL_PAVILION_MODULE_PLANS,
  deriveCommercialPavilionOfficialContentEnvelope,
} from '@/features/commercial-map/utils/commercialPavilionModules';
import {
  commercialPavilionFacingRadians,
  commercialPavilionInteriorViewRotationRadians,
} from '@/features/commercial-map/utils/commercialPavilions';

const read = (path: string) => readFileSync(path, 'utf8');

describe('planta comercial fixa do Pavilhão 8', () => {
  it('preserva orientação, dimensões, inventário e perfil canônicos do B4', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B4;

    expect(commercialPavilionFacingRadians({ publicIdentifier: 'B4' })).toBe(Math.PI);
    expect(commercialPavilionInteriorViewRotationRadians({ publicIdentifier: 'B4' })).toBe(0);
    expect(PAVILION8_COMMERCIAL_REFERENCE.projection).toMatchObject({
      coordinateTransform: 'identity',
      metricWidthM: 21.7,
      metricDepthM: 35.4,
    });
    expect(PAVILION8_COMMERCIAL_REFERENCE.moduleCount).toBe(114);
    expect(PAVILION8_COMMERCIAL_REFERENCE.modularAreaM2).toBe(438.5);
    expect(PAVILION8_COMMERCIAL_GEOMETRIC_AREA_M2).toBe(438.5);
    expect(plan.cells).toHaveLength(114);
    expect(plan.zones.map((zone) => zone.numberRange)).toEqual([
      [1, 20], [21, 25], [26, 37], [38, 63],
      [64, 89], [90, 90], [91, 100], [101, 114],
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
      includeSupportSpacesInFit: true,
      flatModules: true,
      numberPriority: 'maximum',
      showAreaInsideModule: false,
      boundedPan: true,
      boundedZoom: true,
    });
  });

  it('preserva a geometria, a área e a âncora oficial do módulo 90', () => {
    const module90 = COMMERCIAL_PAVILION_MODULE_PLANS.B4.cells.find((cell) => cell.number === 90);

    expect(module90?.areaM2).toBe(24.5);
    expect(module90?.shape?.footprint).toHaveLength(6);
    expect(module90?.shape?.renderParts).toHaveLength(2);
    expect(module90?.shape?.labelAnchor[0]).toBeCloseTo(2 / 21.7, 12);
    expect(module90?.shape?.labelAnchor[1]).toBeCloseTo(2.5 / 35.4, 12);
    expect(module90?.labelAnchor).toEqual(module90?.shape?.labelAnchor);
  });

  it('mantém os três apoios no envelope oficial ampliado ao norte', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B4;
    const envelope = deriveCommercialPavilionOfficialContentEnvelope(plan);

    expect(plan.supportSpaces.map((space) => space.label)).toEqual([
      'Sanitários', 'Cozinha', 'Apoio de serviço',
    ]);
    expect(plan.supportSpaces).toEqual(PAVILION8_COMMERCIAL_SUPPORT_SPACES);
    expect(envelope).not.toBeNull();
    expect(envelope?.width).toBeCloseTo(1, 12);
    expect(envelope?.depth).toBeCloseTo((35.4 + 7.4) / 35.4, 12);
    expect((envelope?.centerZ ?? 0) - (envelope?.depth ?? 0) / 2)
      .toBeCloseTo(-7.4 / 35.4, 12);
  });

  it('preserva os cinco acessos e as conexões oficiais', () => {
    const accesses = new Map(PAVILION8_COMMERCIAL_REFERENCE.wallAccesses.map((access) => [access.id, access]));

    expect([...accesses.keys()]).toEqual([
      'rear-emergency-exit',
      'southwest-entry-exit',
      'southeast-entry-exit',
      'pavilion-13-connection',
      'pavilion-12-connection',
    ]);
    expect(accesses.get('pavilion-13-connection')).toMatchObject({ connectsTo: 'B5', edges: ['left'] });
    expect(accesses.get('pavilion-12-connection')).toMatchObject({ connectsTo: 'B3', edges: ['right'] });
  });

  it('usa o motor compartilhado de pan, zoom, fit, números e lotes planos', () => {
    const interior = read('src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx');
    const camera = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
    const layer = read('src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx');

    expect(interior).toContain("plan.interiorPresentation?.mode === 'plan'");
    expect(interior).toContain('const envelopeWidth = layout.width;');
    expect(interior).toContain('const envelopeDepth = layout.depth;');
    expect(interior).toContain('LEFT: THREE.MOUSE.PAN');
    expect(interior).toContain('RIGHT: THREE.MOUSE.PAN');
    expect(interior).toContain('TWO: THREE.TOUCH.DOLLY_PAN');
    expect(interior).toContain('<CommercialPavilionWayfindingLayer');
    expect(camera).toContain('mouseButtons={interiorFrame?.mouseButtons ??');
    expect(camera).toContain('touches={interiorFrame?.touches ??');
    expect(layer).toContain('const heightScale = flatModules ? 1');
    expect(layer).toContain('const labelAnchor = orientedCell.labelAnchor');
    expect(layer).toContain('new THREE.CanvasTexture(canvas)');
    expect(layer).toContain('!reducedGraphics && !flatModules');
  });

  it('mantém B5/B6 fixos e não altera os demais pavilhões', () => {
    (['B5', 'B6'] as const).forEach((identifier) => {
      expect(COMMERCIAL_PAVILION_MODULE_PLANS[identifier].interiorPresentation).toMatchObject({
        mode: 'plan',
        enableRotate: false,
        enablePan: true,
        flatModules: true,
      });
    });
    expect(commercialPavilionInteriorViewRotationRadians({ publicIdentifier: 'B5' })).toBe(0);
    expect(commercialPavilionInteriorViewRotationRadians({ publicIdentifier: 'B6' })).toBe(Math.PI);
    (['B1', 'B2', 'B3', 'B8', 'B10'] as const).forEach((identifier) => {
      expect(COMMERCIAL_PAVILION_MODULE_PLANS[identifier].interiorPresentation?.mode)
        .not.toBe('plan');
    });
  });
});