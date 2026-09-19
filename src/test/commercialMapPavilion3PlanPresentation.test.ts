import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAVILION3_COMMERCIAL_REFERENCE } from '@/features/commercial-map/data/pavilion3CommercialReference';
import { COMMERCIAL_PAVILION_MODULE_PLANS } from '@/features/commercial-map/utils/commercialPavilionModules';

const read = (path: string) => readFileSync(path, 'utf8');

describe('planta comercial fixa do Pavilhão 3', () => {
  it('mantém o inventário oficial e ativa o perfil somente no B6', () => {
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B6;
    expect(PAVILION3_COMMERCIAL_REFERENCE.moduleCount).toBe(214);
    expect(PAVILION3_COMMERCIAL_REFERENCE.modularAreaM2).toBe(663);
    expect(plan.cells).toHaveLength(214);
    expect(plan.zones.map((zone) => zone.numberRange)).toEqual([
      [1, 19], [20, 36], [37, 40], [41, 47], [48, 79],
      [80, 111], [112, 143], [144, 175], [176, 214],
    ]);
    expect(plan.interiorPresentation).toMatchObject({
      mode: 'plan',
      navigationMode: 'locked-plan',
      enableRotate: false,
      flatModules: true,
      numberPriority: 'maximum',
      showAreaInsideModule: false,
      boundedPan: true,
      boundedZoom: true,
    });
    (['B1', 'B2', 'B3', 'B8', 'B10'] as const).forEach((identifier) => {
      expect(COMMERCIAL_PAVILION_MODULE_PLANS[identifier].interiorPresentation?.mode)
        .not.toBe('plan');
    });
  });

  it('enquadra o envelope completo, preserva a orientação canônica e converte o arraste em pan', () => {
    const interior = read('src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx');
    const camera = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');

    expect(interior).toContain("plan.interiorPresentation?.mode === 'plan'");
    // O envelope de enquadramento usa o shell completo (acessos e wayfinding),
    // e não apenas o retângulo dos módulos.
    expect(interior).toContain('const envelopeWidth = layout.width;');
    expect(interior).toContain('const envelopeDepth = layout.depth;');
    // Orientação canônica: mesma transformação usada pelo restante da cena.
    expect(interior).toContain('position: toWorld(0, layout.interior.floorY + fitDistance');
    expect(interior).toContain('target: toWorld(0, layout.interior.floorY, 0)');
    expect(interior).toContain('enableRotate: plan.interiorPresentation.enableRotate ?? false');
    expect(interior).toContain('enablePan: true');
    expect(interior).toContain('zoomToCursor: true');
    expect(interior).toContain('LEFT: THREE.MOUSE.PAN');
    expect(interior).toContain('touches: { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }');
    expect(interior).not.toContain('DOLLY_ROTATE');
    expect(camera).toContain('interiorFrame?.enableRotate ?? true');
    expect(camera).toContain('mouseButtons={interiorFrame?.mouseButtons ??');
    expect(camera).toContain('touches={interiorFrame?.touches ??');
  });

  it('mantém o perfil de navegação exclusivo do B6 e o wayfinding renderizado', () => {
    const interior = read('src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx');
    const plan = COMMERCIAL_PAVILION_MODULE_PLANS.B6;

    expect(plan.interiorPresentation).toMatchObject({
      enablePan: true,
      mouseNavigation: 'pan',
      touchNavigation: 'pan-dolly',
      preserveCanonicalOrientation: true,
      includeWayfindingInFit: true,
    });
    expect(interior).toContain('<CommercialPavilionWayfindingLayer');
    (['B1', 'B2', 'B3', 'B8', 'B10'] as const).forEach((identifier) => {
      const other = COMMERCIAL_PAVILION_MODULE_PLANS[identifier].interiorPresentation;
      expect(other?.mouseNavigation).toBeUndefined();
      expect(other?.enableRotate).toBeUndefined();
    });
  });

  it('mantém instancing, remove elevação dinâmica e prioriza números apenas no perfil plano', () => {
    const layer = read('src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx');

    expect(layer).toContain('const flatModules = mode === \'interior\'');
    expect(layer).toContain('const heightScale = flatModules ? 1');
    expect(layer).toContain('plan.interiorPresentation?.showAreaInsideModule !== false');
    expect(layer).toContain("plan.interiorPresentation?.numberPriority === 'maximum'");
    expect(layer).toContain('THREE.InstancedMesh');
    expect(layer).toContain('new THREE.CanvasTexture(canvas)');
    expect(layer).not.toContain('<Text');
    expect(layer).not.toContain('<Html');
  });
});