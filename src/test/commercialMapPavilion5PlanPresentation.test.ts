import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PAVILION5_COMMERCIAL_REFERENCE,
  PAVILION5_COMMERCIAL_REFERENCE_CELLS,
  PAVILION5_COMMERCIAL_REFERENCE_CORRIDORS,
  PAVILION5_COMMERCIAL_REFERENCE_PROJECTION,
  PAVILION5_COMMERCIAL_SUPPORT_SPACES,
} from '@/features/commercial-map/data/pavilion5CommercialReference';
import {
  COMMERCIAL_PAVILION_MODULE_PLANS,
  deriveCommercialPavilionOfficialContentEnvelope,
} from '@/features/commercial-map/utils/commercialPavilionModules';
import {
  commercialPavilionFacingRadians,
  commercialPavilionInteriorViewRotationRadians,
} from '@/features/commercial-map/utils/commercialPavilions';
import { resolveCommercialPavilionWayfindingMarkers } from '@/features/commercial-map/utils/commercialPavilionWayfinding';

const read = (path: string) => readFileSync(path, 'utf8');

describe('planta comercial fixa do Pavilhão 5', () => {
  it('preserva orientação identity, dimensões, áreas e os 81 módulos', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B8;

    expect(commercialPavilionFacingRadians({ publicIdentifier: 'B8' })).toBe(0);
    expect(commercialPavilionInteriorViewRotationRadians({ publicIdentifier: 'B8' })).toBe(0);
    expect(PAVILION5_COMMERCIAL_REFERENCE_PROJECTION).toEqual({
      coordinateTransform: 'identity',
      fit: 'metric-contain',
      metricWidthM: 25.5,
      metricDepthM: 43.5,
      alignX: 'center',
      alignZ: 'end',
    });
    expect(plan.projection).toEqual(PAVILION5_COMMERCIAL_REFERENCE_PROJECTION);
    expect(PAVILION5_COMMERCIAL_REFERENCE_CELLS).toHaveLength(81);
    expect(plan.zones.map((zone) => zone.numberRange)).toEqual([
      [1, 1], [2, 43], [44, 62], [63, 81],
    ]);
    expect(PAVILION5_COMMERCIAL_REFERENCE.modularAreaM2).toBe(244.5);
    expect(PAVILION5_COMMERCIAL_REFERENCE.exhibitionAreaM2).toBe(508.95);
    expect(PAVILION5_COMMERCIAL_REFERENCE.totalAreaM2).toBe(841.53);
  });

  it('ativa o perfil plano sem alterar a referência oficial', () => {
    expect(COMMERCIAL_PAVILION_MODULE_PLANS.B8.interiorPresentation).toMatchObject({
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
    expect(PAVILION5_COMMERCIAL_REFERENCE.interiorPresentation).toEqual({
      fit: 'official-content',
    });
  });

  it('mantém a ala de apoio permanente, não comercial e dentro do fit oficial', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B8;
    const envelope = deriveCommercialPavilionOfficialContentEnvelope(plan);

    expect(plan.supportSpaces).toEqual(PAVILION5_COMMERCIAL_SUPPORT_SPACES);
    expect(plan.supportSpaces.map((space) => space.id)).toEqual([
      'deposito-fenasoja',
      'deposito-hortigranjeiros',
      'alojamento-peoes',
      'alojamento-peoas',
    ]);
    expect(plan.supportSpaces.map((space) => space.label)).toEqual([
      'Depósito Fenasoja',
      'Depósito Hortigranjeiros',
      'Alojamento Peões',
      'Alojamento Peoas',
    ]);
    plan.supportSpaces.forEach((space) => {
      expect(space.type).toBe('permanent-non-commercial');
      expect(space).not.toHaveProperty('number');
      expect(space).not.toHaveProperty('status');
    });
    expect(envelope).toEqual({ centerX: 0.5, centerZ: 0.5, width: 1, depth: 1 });
  });

  it('preserva corredor, abertura oeste e os três acessos oficiais', () => {
    expect(PAVILION5_COMMERCIAL_REFERENCE_CORRIDORS.map((corridor) => corridor.id)).toEqual([
      'central-commercial-aisle',
      'west-cross-access',
      'support-north-access',
      'support-south-access',
    ]);
    const markers = resolveCommercialPavilionWayfindingMarkers(
      COMMERCIAL_PAVILION_MODULE_PLANS.B8,
      { width: 25.5, depth: 43.5 },
    );
    expect(markers.map((marker) => marker.id)).toEqual([
      'north-central-exit',
      'west-central-entrance',
      'south-central-exit',
    ]);
    expect(markers.map((marker) => marker.edge)).toEqual(['rear', 'left', 'front']);
    expect(markers.map((marker) => marker.kind)).toEqual(['exit', 'entrance', 'exit']);
  });

  it('mantém a discrepância documental do módulo 28 fora do status comercial', () => {
    const module28 = COMMERCIAL_PAVILION_MODULE_PLANS.B8.cells.find((cell) => cell.number === 28);

    expect(module28?.id).toBe('B8:module:028');
    expect(module28?.areaM2).toBe(3);
    expect(module28?.source?.discrepancy).toBe('manual-confirmation-required');
    expect(module28).not.toHaveProperty('status');
  });

  it('usa câmera compartilhada, PAN/zoom e compensação do painel sem rotação', () => {
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

  it('preserva apoios legíveis, lotes planos, seleção, Vendas e renderização eficiente', () => {
    const layer = read('src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx');

    expect(layer).toContain('compactSupportLabelLines');
    expect(layer).toContain('SUPPORT_SPACE_COLORS');
    expect(layer).toContain('context.setLineDash');
    expect(layer).toContain('const heightScale = flatModules ? 1');
    expect(layer).toContain('dispatchSalesModuleClick');
    expect(layer).toContain('THREE.InstancedMesh');
    expect(layer).toContain('new THREE.CanvasTexture(canvas)');
    expect(layer).toContain("plan.interiorPresentation?.numberPriority === 'maximum'");
    expect(layer).toContain('!reducedGraphics && !flatModules');
    expect(layer).not.toContain('<Text');
    expect(layer).not.toContain('<Html');
  });

  it('não altera orientações e perfis de B1 a B6', () => {
    const expected = {
      B1: [Math.PI / 2, Math.PI],
      B2: [Math.PI / 2, -Math.PI / 2],
      B3: [Math.PI, Math.PI],
      B4: [Math.PI, 0],
      B5: [Math.PI, 0],
      B6: [Math.PI, Math.PI],
    } as const;
    (Object.keys(expected) as Array<keyof typeof expected>).forEach((identifier) => {
      expect(COMMERCIAL_PAVILION_MODULE_PLANS[identifier].interiorPresentation).toMatchObject({
        mode: 'plan', enableRotate: false, enablePan: true, flatModules: true,
      });
      expect(commercialPavilionFacingRadians({ publicIdentifier: identifier }))
        .toBe(expected[identifier][0]);
      expect(commercialPavilionInteriorViewRotationRadians({ publicIdentifier: identifier }))
        .toBe(expected[identifier][1]);
    });
  });
});