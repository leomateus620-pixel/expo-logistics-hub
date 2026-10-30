import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import { BRIGADA_MILITARY_WING_REFERENCE } from '@/features/commercial-map/data/brigadaMilitaryWingReference';
import { PHOTOGRAPHED_PAVILION_IDS } from '@/features/commercial-map/data/pavilionArchitecture2026';
import { createBrigadaMilitaryWingLayout, brigadaWingRoofHeight } from '@/features/commercial-map/utils/brigadaMilitaryWing';
import { strategicLandmarkBounds } from '@/features/commercial-map/utils/landmarks';
import { createBrigadaMilitaryWingGeometries } from '@/features/commercial-map/components/canvas/pavilions/BrigadaMilitaryWing';
import { resolveCommercialPavilionDefinition } from '@/features/commercial-map/utils/commercialPavilions';
import { resolveCommercialPavilionModulePlan } from '@/features/commercial-map/utils/commercialPavilionModules';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '@/features/commercial-map/constants';

const wing = OFFICIAL_REFERENCE_ENTITIES.find(entity => entity.publicIdentifier === 'B19')!;
const pavilion3 = OFFICIAL_REFERENCE_ENTITIES.find(entity => entity.publicIdentifier === 'B6')!;

describe('ala física B19 da Brigada Militar junto ao Pavilhão 3', () => {
  it('preserva B19 como SECURITY selecionável separadamente e não cria outro pavilhão ou planta', () => {
    const before = JSON.stringify([wing, pavilion3, resolveCommercialPavilionModulePlan(pavilion3)]);
    const layout = createBrigadaMilitaryWingLayout(wing, pavilion3)!;
    expect(layout.entityId).toBe(wing.id);
    expect(layout.pavilion3EntityId).toBe(pavilion3.id);
    expect(layout.entityIds).toEqual([wing.id, pavilion3.id]);
    expect(wing.classification).toBe('SECURITY');
    expect(resolveCommercialPavilionDefinition(wing)).toBeNull();
    expect(resolveCommercialPavilionModulePlan(wing)).toBeNull();
    expect(PHOTOGRAPHED_PAVILION_IDS).not.toContain('B19');
    expect(JSON.stringify([wing, pavilion3, resolveCommercialPavilionModulePlan(pavilion3)])).toBe(before);
  });

  it('precisa dos dois proprietários já autorizados, ativos e do mesmo projeto', () => {
    expect(createBrigadaMilitaryWingLayout(wing, null)).toBeNull();
    expect(createBrigadaMilitaryWingLayout({ ...wing, publicIdentifier: 'B17' }, pavilion3)).toBeNull();
    expect(createBrigadaMilitaryWingLayout({ ...wing, isArchived: true }, pavilion3)).toBeNull();
    expect(createBrigadaMilitaryWingLayout(wing, { ...pavilion3, isArchived: true })).toBeNull();
    expect(createBrigadaMilitaryWingLayout(wing, { ...pavilion3, projectId: 'other-project' })).toBeNull();
  });

  it('alinha só a frente de apresentação com P3 e mantém o recuo da Rua Argentina', () => {
    const layout = createBrigadaMilitaryWingLayout(wing, pavilion3)!;
    const wb = strategicLandmarkBounds(wing), pb = strategicLandmarkBounds(pavilion3);
    expect(layout.frontZ).toBe(pb.centerZ - layout.pavilion3Layout.exterior.shell.depth / 2);
    expect(layout.minX).toBe(wb.minX);
    expect(layout.maxX).toBe(wb.maxX);
    expect(layout.maxZ).toBe(wb.maxZ);
    expect(layout.frontZ).toBeGreaterThan(wb.minZ);
    expect(layout.canopyFrontZ).toBeGreaterThan(17.563636);
    expect(layout.apronMinZ).toBe(pb.minZ);
    expect(layout.apronMaxZ).toBe(layout.frontZ);
    expect(layout.floorY).toBe(pavilion3.geometry.elevation + layout.pavilion3Layout.interior.floorY);
    expect(layout.canopyMinX).toBe(pb.centerX + layout.pavilion3Layout.exterior.shell.width / 2);
    expect(layout.apronMinX).toBe(layout.canopyMinX);
  });

  it('continua a testeira na borda do P3 e fornece alturas exatas para o único fechamento lateral', () => {
    const layout = createBrigadaMilitaryWingLayout(wing, pavilion3)!;
    expect(layout.fasciaInnerY).toBeCloseTo(pavilion3.geometry.elevation + layout.pavilion3Height * .87, 12);
    expect(brigadaWingRoofHeight(layout, layout.minX, layout.frontZ)).toBe(layout.frontRoofY);
    expect(brigadaWingRoofHeight(layout, layout.minX, layout.maxZ)).toBe(layout.rearRoofY);
    expect(brigadaWingRoofHeight(layout, layout.maxX, layout.frontZ)).toBeGreaterThan(layout.frontRoofY);
    expect(layout.frontRoofY).toBeGreaterThan(layout.rearRoofY);
    expect(layout.banner.z).toBeLessThan(layout.frontZ);
    expect(layout.banner.y + layout.banner.height / 2).toBeLessThan(layout.eaveY - layout.fasciaHeight);
  });

  it('limita a ala a quatro batches geométricos e uma faixa contextual, com recursos finitos', () => {
    const layout = createBrigadaMilitaryWingLayout(wing, pavilion3)!;
    const geometry = createBrigadaMilitaryWingGeometries(layout);
    try {
      expect(Object.keys(geometry).length + 1).toBeLessThanOrEqual(BRIGADA_MILITARY_WING_REFERENCE.maxColorBatches);
      expect(Object.keys(geometry)).toEqual(['wall', 'structure', 'roof', 'glass']);
      for (const part of Object.values(geometry)) {
        expect(part).toBeTruthy();
        const positions = part.getAttribute('position');
        expect(positions.count).toBeGreaterThan(0);
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
        expect(part.boundingBox!.min.x).toBeGreaterThanOrEqual(layout.canopyMinX - .01);
        expect(part.boundingBox!.max.x).toBeLessThanOrEqual(layout.maxX + .01);
        expect(part.boundingBox!.min.z).toBeGreaterThan(17.563636);
        expect(part.boundingBox!.max.z).toBeLessThanOrEqual(layout.maxZ + .01);
      }
      expect(geometry.glass.getAttribute('position').count).toBe(24);
      expect(geometry.roof.boundingBox!.min.y).toBeGreaterThan(layout.floorY + .2);
      expect(geometry.wall.boundingBox!.min.y).toBeCloseTo(COMMERCIAL_MAP_GROUND_ELEVATION, 6);
      const wallColors = Array.from(geometry.wall.getAttribute('color').array);
      expect(wallColors.every(value => value > 0 && value <= 1)).toBe(true);
      expect(Math.min(...wallColors)).toBeLessThan(.7);
      expect(Math.max(...wallColors)).toBe(1);
    } finally { Object.values(geometry).forEach(part => part.dispose()); }
  });
});
