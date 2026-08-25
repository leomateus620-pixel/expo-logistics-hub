import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('renderer operacional do interior comercial', () => {
  it('aplica situação persistida sem introduzir identidade de expositor', () => {
    const layer = read('src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx');
    const interior = read('src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx');
    const commercial = read('src/features/commercial-map/utils/pavilionModuleCommercial.ts');

    expect(interior).toContain('buildCommercialPavilionModuleVisualStateIndex');
    expect(commercial).toContain('record.lot.status');
    expect(layer).toContain('moduleStateById.get(cell.id)?.status');
    expect(layer).toContain('IN_NEGOTIATION:');
    expect(layer).toContain('UNAVAILABLE:');
    expect(`${layer}\n${interior}`).not.toMatch(/currentBuyer|exhibitorName|companyName/);
  });

  it('mantém circulação fora do picking e protege as plantas oficiais da estrutura genérica', () => {
    const layer = read('src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx');
    const interior = read('src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx');

    expect(layer).toContain('ref={setModuleBaseMesh}');
    expect(layer).toMatch(/ref=\{setCorridorMesh\}[\s\S]*?raycast=\{NO_RAYCAST\}/);
    expect(layer).toContain('isMapSelectionClick(event.delta)');
    expect(interior).toContain("modulePlan.source.interpretation === 'official-reference-runs'");
    expect(interior).toContain('modulePlan.supportSpaces');
    expect(interior).toContain('moduleRenderParts(cell)');
    expect(interior).toContain('buildProtectedPlanRects(modulePlan, layout)');
    expect(interior).toMatch(/layout\.interior\.columns[\s\S]*?rectanglesOverlap/);
    expect(interior).toMatch(/layout\.exterior\.structure\.columnZs[\s\S]*?rectanglesOverlap/);
  });

  it('usa o mesmo frame orientado nos módulos, números, corredores e proteção estrutural', () => {
    const layer = read('src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx');
    const interior = read('src/features/commercial-map/components/canvas/CommercialPavilionInteriorScene.tsx');
    const legend = read('src/features/commercial-map/components/panels/PavilionPlanLegend.tsx');

    expect(layer).toContain('createCommercialPavilionModuleProjectionFrame(plan, footprint)');
    expect(layer).toContain('projectCommercialPavilionReferencePoint(point, projectionFrame)');
    expect(layer).toContain('projectCommercialPavilionModuleRect(part, projectionFrame)');
    expect(layer).toContain('projectCommercialPavilionModuleRect(corridor, projectionFrame)');
    expect(layer).toContain('transformCommercialPavilionReferenceSequenceOrientation');
    expect(interior).toContain('createCommercialPavilionModuleProjectionFrame(plan, footprint)');
    expect(interior).toContain('projectCommercialPavilionModuleRect(part, projectionFrame)');
    expect(legend).not.toContain('createCommercialPavilionModuleProjectionFrame');
  });

  it('renderiza apoios permanentes fora da seleção e mantém partes compostas no mesmo módulo', () => {
    const layer = read('src/features/commercial-map/components/canvas/CommercialPavilionModuleLayer.tsx');

    expect(layer).toContain('projectedModuleParts');
    expect(layer).toContain('part.cell.id');
    expect(layer).toContain('projectedSupportSpaces');
    expect(layer).toContain('ref={setSupportSpaceMesh}');
    expect(layer).toMatch(/ref=\{setSupportSpaceMesh\}[\s\S]*?raycast=\{NO_RAYCAST\}/);
    expect(layer).not.toMatch(/setSelectedModuleId\(supportSpace/);
  });

  it('expõe a legenda de situações comerciais também no interior', () => {
    const page = read('src/features/commercial-map/CommercialMapPage.tsx');
    const interiorBranch = page.slice(
      page.indexOf('{interiorPavilionPlan && ('),
      page.indexOf(') : (', page.indexOf('{interiorPavilionPlan && (')),
    );

    expect(interiorBranch).toContain('<PavilionPlanLegend');
    expect(interiorBranch).toContain('<StatusLegend />');
    expect(interiorBranch).toContain('<PavilionModuleCard');
  });

  it('não desenha os filhos INTERNAL_STAND na cena externa compartilhada', () => {
    const canvas = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');

    expect(canvas).toContain("entity.classification !== 'INTERNAL_STAND'");
    expect(canvas).toContain('commercialPavilionIdentity.ids.has(entity.parentEntityId)');
    expect(canvas).toContain('const exteriorRenderedEntities');
    expect(canvas).toContain('entities={entities}');
    expect(canvas).toContain('lots={lots}');
    expect(canvas).toContain('entities: exteriorRenderedEntities');
  });

  it('reutiliza a situação persistida também no recorte externo do pavilhão', () => {
    const canvas = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
    const landmark = read('src/features/commercial-map/components/canvas/StrategicLandmarks.tsx');
    const pavilion = read('src/features/commercial-map/components/canvas/CommercialPavilion.tsx');

    expect(canvas).toContain('buildCommercialPavilionModuleVisualStateIndex');
    expect(canvas).toContain('moduleStateById={selectedEntityId === entity.id');
    expect(landmark).toContain('moduleStateById={moduleStateById}');
    expect(pavilion).toContain('moduleStateById={moduleStateById}');
  });

  it('abre resultados de módulos dentro do pavilhão e seleciona a célula correspondente', () => {
    const explorer = read('src/features/commercial-map/components/panels/EntityExplorer.tsx');

    expect(explorer).toContain('resolveCommercialPavilionModuleNavigationTarget');
    expect(explorer).toContain('enterInterior(moduleTarget.pavilionEntityId)');
    expect(explorer).toContain('setSelectedModuleId(moduleTarget.moduleId)');
    expect(explorer).toContain('openExplorerEntity(item)');
  });
});
