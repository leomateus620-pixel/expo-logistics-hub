import { describe, expect, it } from 'vitest';
import { COMMERCIAL_PAVILION_MODULE_PLANS as plans } from '@/features/commercial-map/utils/commercialPavilionModules';
import { PAVILION_DIMENSION_ANNOTATIONS } from '@/features/commercial-map/data/pavilionDimensionAnnotations';
import { layoutDimensionOnScreen, resolvePavilionDimensions } from '@/features/commercial-map/utils/pavilionDimensions';
import { projectCommercialPavilionReferencePoint, createCommercialPavilionReferenceProjectionFrame } from '@/features/commercial-map/data/commercialPavilionReference';

describe('cotas auxiliares, sem contrato comercial', () => {
  it.each([['B1', 189], ['B6', 214], ['B8', 81], ['B4', 114], ['B3', 257], ['B2', 186]] as const)('%s mantém os %i boxes e todos os dados intactos ao resolver cotas', (id, count) => {
    const plan = plans[id]; const before = JSON.stringify(plan);
    const dimensions = resolvePavilionDimensions(plan, { width: 33, depth: 50 });
    expect(dimensions.length).toBeGreaterThan(0);
    expect(dimensions.length).toBeLessThanOrEqual(6);
    expect(plan.cells).toHaveLength(count);
    expect(JSON.stringify(plan)).toBe(before);
    expect(new Set(dimensions.map(d => d.id)).size).toBe(dimensions.length);
    expect(dimensions.every(d => [...d.startPoint, ...d.endPoint].every(Number.isFinite))).toBe(true);
    expect(plan).not.toHaveProperty('dimensionAnnotations');
    expect(dimensions.every(d => !('areaM2' in d) && !('price' in d) && !('lotId' in d))).toBe(true);
  });
  it('não acrescenta nenhuma anotação ao Pavilhão 13 ou 7', () => {
    expect(resolvePavilionDimensions(plans.B5, { width: 20, depth: 40 })).toEqual([]);
    expect(resolvePavilionDimensions(plans.B10, { width: 20, depth: 40 })).toEqual([]);
  });
  it('segue os extremos do corredor e a mesma transformação de quarto de volta dos módulos', () => {
    const plan = plans.B2; const footprint = { width: 33, depth: 35 };
    const corridor = plan.corridors.find(c => c.id === 'central-distribution')!;
    const frame = createCommercialPavilionReferenceProjectionFrame(plan.projection, footprint);
    const dimension = resolvePavilionDimensions(plan, footprint).find(d => d.id.endsWith(':central-aisle'))!;
    expect(dimension.startPoint).toEqual(projectCommercialPavilionReferencePoint([corridor.centerX, corridor.centerZ - corridor.depth / 2], frame));
    expect(dimension.endPoint).toEqual(projectCommercialPavilionReferencePoint([corridor.centerX, corridor.centerZ + corridor.depth / 2], frame));
    expect(dimension.label).toBe('5,00 m');
  });
  it('preserva 5,60 do PDF sem corrigir o corredor histórico de 5,70 ou calcular área', () => {
    const plan = plans.B8;
    const dimension = resolvePavilionDimensions(plan, { width: 25.5, depth: 43.5 })[0];
    expect(dimension.label).toBe('5,60 m');
    expect(Math.abs(dimension.endPoint[0] - dimension.startPoint[0])).toBeCloseTo(5.7);
  });
  it('distingue profundidade de 4 m e corredores de 3,35 m no Pavilhão 8', () => {
    const annotations = PAVILION_DIMENSION_ANNOTATIONS.filter(d => d.pavilionId === 'B4');
    expect(annotations.filter(d => d.value === '3,35').every(d => d.anchor.kind === 'corridor')).toBe(true);
    expect(annotations.find(d => d.value === '4,00')?.anchor.kind).toBe('cell-edge');
  });
  it('coloca o Bosque fora da lateral esquerda da planta, usando a projeção oficial', () => {
    const dimensions = resolvePavilionDimensions(plans.B2, { width: 33, depth: 35 });
    const context = dimensions.find(d => d.type === 'context-label')!;
    // Source left becomes local rear after the same clockwise projection.
    expect(context.startPoint[1]).toBeLessThan(-35 / 2);
    expect(context.endPoint[1]).toBeLessThan(-35 / 2);
  });
});

describe('leitura e colisão das cotas em tela', () => {
  const input = { dimension: { type: 'linear' as const, label: '5,00 m', priority: 1 as 1 | 2 | 3 }, start: [100, 100] as const, end: [200, 100] as const, modulePixels: 10, width: 390, height: 800, obstacles: [] };
  it('mantém textos legíveis depois de inverter ou rotacionar os extremos', () => {
    for (const end of [[200, 100], [0, 100], [100, 200], [100, 20]] as const) {
      const result = layoutDimensionOnScreen({ ...input, end })!;
      expect(Math.abs(result.angle)).toBeLessThanOrEqual(90);
    }
  });
  it('reduz informação por zoom e aplica histerese sem depender da largura da viewport', () => {
    expect(layoutDimensionOnScreen(input)).not.toBeNull();
    expect(layoutDimensionOnScreen({ ...input, dimension: { ...input.dimension, priority: 3 } })).toBeNull();
    expect(layoutDimensionOnScreen({ ...input, dimension: { ...input.dimension, priority: 3 }, modulePixels: 30 })).not.toBeNull();
    expect(layoutDimensionOnScreen({ ...input, dimension: { ...input.dimension, priority: 2 }, modulePixels: 8, previouslyVisible: true })).not.toBeNull();
  });
  it('usa texto perpendicular à linha em um corredor estreito sem encobrir as fileiras', () => {
    const result = layoutDimensionOnScreen({ ...input, start: [140, 100], end: [170, 100], obstacles: [
      { left: 0, right: 139, top: 0, bottom: 800 },
      { left: 171, right: 390, top: 0, bottom: 800 },
    ] });
    expect(result).not.toBeNull();
    expect(Math.abs(result!.textRotation)).toBe(90);
  });
  it('oculta cotas sob lotes, números, controles, tooltips e painel em vez de deslocá-las', () => {
    expect(layoutDimensionOnScreen({ ...input, obstacles: [{ left: 140, right: 180, top: 90, bottom: 120 }] })).toBeNull();
    expect(layoutDimensionOnScreen({ ...input, width: 155 })).toBeNull();
    expect(layoutDimensionOnScreen({ ...input, start: [-20, 20], end: [20, 20] })).toBeNull();
  });
});
