import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES, officialPdfPointToLocal } from '@/features/commercial-map/data/officialReference2026';
import { RURAL_PAVILIONS, RURAL_PAVILION_NEIGHBOR_BOUNDS, RURAL_PAVILION_REVISION, reconstructRuralPavilionEntity, ruralSourceBounds, ruralSourceRing } from '@/features/commercial-map/data/ruralPavilionReconstruction';
import { PARK_ACCESS_SPATIAL_PLAN, parkAccessSourcePointToLocal } from '@/features/commercial-map/data/parkAccessSpatialPlan';
import { buildRuralGeometry, ruralBuildingRecipe } from '@/features/commercial-map/utils/ruralArchitecture';
import { buildParkAccessArchitectureModel } from '@/features/commercial-map/utils/parkAccessArchitecture';
import { LIVESTOCK_TENT_LAYOUT, LIVESTOCK_TENT_RENDER_BUDGET, LIVESTOCK_TENT_REVISION, livestockTentModelBounds, livestockTentVisualHeight } from '@/features/commercial-map/utils/livestockTent';
import { resolveStrategicLandmarkKind, strategicLandmarkBounds, strategicLandmarkSupportsInterior } from '@/features/commercial-map/utils/landmarks';

const tent = OFFICIAL_REFERENCE_ENTITIES.find(e => e.publicIdentifier === 'D4')!;
const other = OFFICIAL_REFERENCE_ENTITIES.find(e => e.publicIdentifier === 'D3')!;
const bounds = strategicLandmarkBounds(tent);
const modelBounds = livestockTentModelBounds(bounds);
const recipe = (detail = true, focus = false) => ruralBuildingRecipe('livestock', modelBounds.width, modelBounds.depth, livestockTentVisualHeight(bounds), detail, focus);

describe('D4 and Test Drive photographic architecture publication', () => {
  it('keeps D4 cadastral identity, registered centre, parent and interaction semantics', () => {
    expect(tent).toMatchObject({ id: 'reference:2026:d4', publicIdentifier: 'D4', name: 'Tenda da Pecuária',
      classification: 'LIVESTOCK_AREA', parentEntityId: 'reference:2026:quadra-n',
      metadata: { ruralReconstructionRevision: RURAL_PAVILION_REVISION, officialMeasurements: false } });
    const centre = officialPdfPointToLocal(RURAL_PAVILIONS.livestock.sourceCenter);
    expect(bounds.centerX).toBeCloseTo(centre[0], 8);
    expect(bounds.centerZ).toBeCloseTo(centre[1], 8);
    expect(resolveStrategicLandmarkKind(tent)).toBe('livestock-tent');
    expect(strategicLandmarkSupportsInterior(tent)).toBe(false);
  });

  it('derives the visible footprint from the same canonical specification', () => {
    const expected = ruralSourceRing(RURAL_PAVILIONS.livestock);
    expect(tent.metadata.sourcePdfPolygon).toEqual(expected);
    expect(tent.geometry.coordinates[0]).toEqual(expected.map(officialPdfPointToLocal));
    expect(LIVESTOCK_TENT_LAYOUT.sourceFootprint).toEqual([157, 132]);
    expect(LIVESTOCK_TENT_REVISION).toBe(RURAL_PAVILION_REVISION);
  });

  it('preserves the street-facing boundary and trims only the rear away from B28, including all roof vertices', () => {
    const spec = RURAL_PAVILIONS.livestock;
    const source = ruralSourceBounds(spec);
    const neighbor = OFFICIAL_REFERENCE_ENTITIES.find(entity => entity.publicIdentifier === 'B28')!;
    expect(neighbor.metadata.sourcePdfPolygon).toEqual([
      [3000, 2480], [3220, 2480], [3220, 2570], [3000, 2570],
    ]);
    expect(source[0]).toBe(2840);
    expect(source[2]).toBe(RURAL_PAVILION_NEIGHBOR_BOUNDS.B28[0] - spec.rearClearanceSource);
    expect(spec.sourceCenter).toEqual([2918.5, 2525]);
    const neighborMinX = Math.min(...neighbor.geometry.coordinates[0].map(p => p[0]));
    expect(bounds.maxX).toBeLessThan(neighborMinX);
    const g = buildRuralGeometry(recipe(true, true));
    const yaw = LIVESTOCK_TENT_LAYOUT.facingRadians;
    try {
      for (const geometry of Object.values(g)) {
        const positions = geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          const worldX = bounds.centerX + positions.getX(i) * Math.cos(yaw) + positions.getZ(i) * Math.sin(yaw);
          expect(worldX).toBeLessThan(neighborMinX);
        }
      }
    } finally { Object.values(g).forEach(geometry => geometry.dispose()); }
  });

  it('does not overwrite a stamped later edit and leaves all other entities intact', () => {
    expect(reconstructRuralPavilionEntity(other)).toBe(other);
    const edited = { ...tent, geometry: { ...tent.geometry, elevation: 0.13 } };
    expect(reconstructRuralPavilionEntity(edited)).toBe(edited);
    const old = { ...tent, metadata: { ...tent.metadata, ruralReconstructionRevision: 'old' } };
    const updated = reconstructRuralPavilionEntity(old);
    expect(updated.id).toBe(old.id);
    expect(reconstructRuralPavilionEntity(updated)).toBe(updated);
  });

  it('preserves the west-facing front and swaps only model axes', () => {
    expect(LIVESTOCK_TENT_LAYOUT.facingRadians).toBeCloseTo(-Math.PI / 2, 8);
    expect(modelBounds.width).toBe(bounds.depth);
    expect(modelBounds.depth).toBe(bounds.width);
    expect(livestockTentModelBounds(bounds, 0)).toBe(bounds);
  });

  it('has a semi-open front, real rear wing openings, brick piers and gable', () => {
    const r = recipe();
    expect(LIVESTOCK_TENT_LAYOUT.enclosure).toBe('semi-open-pavilion');
    expect(r.boxes.filter(p => p.id.startsWith('brick-pier-'))).toHaveLength(2);
    expect(r.boxes.filter(p => p.id.startsWith('open-column-'))).toHaveLength(6);
    expect(r.boxes.filter(p => p.id.startsWith('low-wall-'))).toHaveLength(2);
    expect(r.windowCount).toBe(6);
    expect(r.wallFront).toBeLessThan(0);
    expect(r.gables).toHaveLength(2);
    expect(r.eave / (r.eave + r.rise)).toBeCloseTo(0.70, 8);
  });

  it('retains the existing Test Drive anchor and updates the environmental exclusion polygon', () => {
    const setting = PARK_ACCESS_SPATIAL_PLAN.costeirosSetting;
    expect(RURAL_PAVILIONS.testDrive.sourceCenter).toEqual([917.5, 2972.5]);
    expect(setting.sourcePdfBuildingPolygon).toEqual(ruralSourceRing(RURAL_PAVILIONS.testDrive));
    expect(setting.buildingAnchor).toEqual(parkAccessSourcePointToLocal(RURAL_PAVILIONS.testDrive.sourceCenter));
    expect(RURAL_PAVILIONS.testDrive.sourceDepth / RURAL_PAVILIONS.testDrive.sourceWidth).toBeGreaterThan(2.8);
  });

  it('replaces the old Costeiros box in the existing instanced architecture batches', () => {
    const r = buildParkAccessArchitectureModel([], { anchor: [0,0], rotationRadians: 0, width: 1.85, depth: 5.39 });
    const ids = [...r.opaque, ...r.glass, ...r.metal].map(p => p.featureId);
    expect(ids).not.toContain('costeiros:walls');
    expect(ids).toContain('costeiros:porch-post--1');
    expect(ids).toContain('costeiros:porch-post-1');
    expect(ids).toContain('costeiros:door');
    expect(r.glass).toHaveLength(14);
    expect(r.diagnostics.estimatedDrawCalls).toBe(4);
    r.gables?.dispose();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each([[false,false], [true,false], [true,true]])('measures the actual merged geometry budget at detail=%s focus=%s', (detail, focus) => {
    const g = buildRuralGeometry(recipe(detail, focus));
    try {
      const budget = focus ? LIVESTOCK_TENT_RENDER_BUDGET.focused : detail ? LIVESTOCK_TENT_RENDER_BUDGET.detailed : LIVESTOCK_TENT_RENDER_BUDGET.overview;
      let triangles = detail ? 12 : 0;
      for (const geometry of Object.values(g)) {
        triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
        expect(Array.from(geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
        expect(geometry.boundingBox!.min.x).toBeGreaterThanOrEqual(-modelBounds.width / 2);
        expect(geometry.boundingBox!.max.x).toBeLessThanOrEqual(modelBounds.width / 2);
        expect(geometry.boundingBox!.min.z).toBeGreaterThanOrEqual(-modelBounds.depth / 2);
        expect(geometry.boundingBox!.max.z).toBeLessThanOrEqual(modelBounds.depth / 2);
      }
      expect(triangles).toBeLessThanOrEqual(budget.maximumRenderedTriangles);
      expect(Object.keys(g).length + (detail ? 1 : 0)).toBeLessThanOrEqual(budget.maximumPrimaryDrawCalls);
    } finally { Object.values(g).forEach(geometry => geometry.dispose()); }
  });

  it('retains the same roof and footprint across detail levels', () => {
    const roof = (detail:boolean) => recipe(detail).boxes.filter(p => p.id.startsWith('roof-'));
    expect(roof(false)).toEqual(roof(true));
  });

  it('rejects invalid dimensions before allocating GPU buffers', () => {
    expect(() => ruralBuildingRecipe('testDrive', NaN, 2, 1)).toThrow('Invalid rural building envelope');
  });

  it('keeps runtime cleanup and contains no per-frame React work', () => {
    const source = readFileSync('src/features/commercial-map/components/canvas/LivestockTent.tsx','utf8');
    expect(source).toContain('name="tenda-pecuaria-d4"');
    expect(source).toContain('g.dispose()');
    expect(source).toContain('texture?.dispose()');
    expect(source).not.toMatch(/useFrame|setInterval|setTimeout/);
    expect(source).toContain("fillText('TENDA DA'");
    expect(source).toContain("fillText('PECUÁRIA'");
  });
});
