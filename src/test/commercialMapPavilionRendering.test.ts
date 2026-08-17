import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('renderização compartilhada dos módulos internos', () => {
  it('usa instancing e um atlas numérico único em vez de centenas de textos DOM', () => {
    const layer = read('src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx');

    expect(layer).toContain('THREE.InstancedMesh');
    expect(layer).toContain('new THREE.CanvasTexture(canvas)');
    expect(layer).toContain('plan.cells.forEach');
    expect(layer).toContain('context.fillText(cell.label');
    expect(layer).toContain('moduleMesh.current.instanceColor.needsUpdate = true');
    expect(layer).toContain('corridorMesh.current.instanceColor.needsUpdate = true');
    expect(layer).not.toContain('<Html');
    expect(layer).not.toContain('<Text');
    expect(layer).not.toMatch(/exhibitorName|companyName|currentBuyer/);
  });

  it('libera recursos por camada sem descartar materiais estáveis ao trocar o atlas', () => {
    const layer = read('src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx');
    const interior = read('src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx');

    expect(layer).toContain('unitBoxGeometry.dispose()');
    expect(layer).toContain('labelGeometry.dispose()');
    expect(layer).toContain('previous.dispose()');
    expect(layer).toMatch(/numberTexture\?\.dispose\(\);[\s\S]*?labelMaterial\.dispose\(\);/);
    expect(layer).toMatch(/moduleMaterial\.dispose\(\);[\s\S]*?corridorMaterial\.dispose\(\);/);
    expect(layer).toContain('object.scale.set(corridor.projected.width, 0.008, corridor.projected.depth)');
    expect(interior).toContain('unitBoxGeometry.dispose()');
    expect(interior).toContain('floorGeometry?.dispose()');
    expect(interior).toContain('previous.dispose()');
    expect(interior).not.toContain('const UNIT_BOX =');
  });

  it('reutiliza a mesma camada no cutaway exterior e na cena interna', () => {
    const exterior = read('src/features/commercial-map/components/canvas/CommercialPavilion.tsx');
    const interior = read('src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx');
    const page = read('src/features/commercial-map/CommercialMapPage.tsx');
    const panels = read('src/features/commercial-map/components/panels/MapPanels.tsx');

    expect(exterior).toContain('<CommercialPavilionModuleLayer');
    expect(exterior).toContain('mode="cutaway"');
    expect(interior).toContain('<CommercialPavilionModuleLayer');
    expect(interior).toContain('touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}');
    expect(interior).toContain('setCameraNavigating(true)');
    expect(interior).toContain('setCameraNavigating(false)');
    expect(interior).toContain('mode="interior"');
    expect(interior).toContain('minDistance={maximumDimension * 0.2}');
    expect(page).toContain('<PavilionPlanLegend plan={interiorPavilionPlan} variant="interior" />');
    expect(panels).toContain('<PavilionPlanLegend plan={pavilionPlan} />');
  });
});
