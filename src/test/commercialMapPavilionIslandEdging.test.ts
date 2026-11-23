import { describe, expect, it } from 'vitest';
import { COMMERCIAL_PAVILION_MODULE_PLANS, createCommercialPavilionModuleProjectionFrame, projectCommercialPavilionModuleRect } from '@/features/commercial-map/utils/commercialPavilionModules';
import { pavilionIslandRings } from '@/features/commercial-map/components/canvas/pavilions/PavilionInteriorFinishes';
import { pavilionCirculationInfill } from '@/features/commercial-map/utils/pavilionCirculationInfill';
import { pointInPolygon } from '@/features/commercial-map/utils/spatialSurface';

describe('inlaid edges of commercial pavilion islands', () => {
  it.each(Object.values(COMMERCIAL_PAVILION_MODULE_PLANS))('$publicIdentifier keeps the union of recorded rows and the circulation open', plan => {
    const frame = createCommercialPavilionModuleProjectionFrame(plan, { width: 12, depth: 19 });
    const rings = pavilionIslandRings(plan, frame);
    expect(rings.length).toBeGreaterThan(0);
    expect(rings.length).toBeLessThan(plan.cells.length);
    const contains = (x: number, z: number) => rings.some(polygon =>
      pointInPolygon([x, z], polygon[0]) && !polygon.slice(1).some(hole => pointInPolygon([x, z], hole)));
    for (const cell of plan.cells) {
      for (const part of cell.shape?.renderParts ?? [cell]) {
        const rect = projectCommercialPavilionModuleRect(part, frame);
        expect(contains(rect.centerX, rect.centerZ), cell.id).toBe(true);
      }
    }
    for (const cell of plan.cells.filter(cell => cell.metricAspectRatio)) {
      const bounds = projectCommercialPavilionModuleRect({ ...cell, metricAspectRatio: undefined }, frame);
      const actual = projectCommercialPavilionModuleRect(cell, frame);
      const dx = (bounds.width - actual.width) / 4, dz = (bounds.depth - actual.depth) / 4;
      const joint = (plan.moduleGap ?? 0) * Math.max(frame.width, frame.depth) + 1e-6;
      if (dx > joint) expect(contains(actual.centerX + actual.width / 2 + dx, actual.centerZ), cell.id).toBe(false);
      if (dz > joint) expect(contains(actual.centerX, actual.centerZ + actual.depth / 2 + dz), cell.id).toBe(false);
    }
    // The 141 notch is a real L-shaped aisle opening in B1.
    for (const infill of pavilionCirculationInfill(plan)) {
      const { centerX, centerZ } = projectCommercialPavilionModuleRect(infill, frame);
      expect(contains(centerX, centerZ)).toBe(false);
    }
  });
});
