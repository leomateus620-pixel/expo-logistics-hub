import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OFFICIAL_REFERENCE_DATA } from '../features/commercial-map/data/officialReference2026';
import { buildVisitSiteGroundSurfaces, VisitGroundingSystem } from '../features/commercial-map/visit/VisitGroundingSystem';
import { VisitCollisionSystem } from '../features/commercial-map/visit/VisitCollisionSystem';
import { buildQuadrasABEnvironmentPlan, quadrasABGroundVertexHeight } from '../features/commercial-map/utils/quadrasABEnvironment';
import { buildCommercialSiteEnvironmentPlan } from '../features/commercial-map/utils/commercialSiteEnvironment';

const entities = OFFICIAL_REFERENCE_DATA.entities;
const reportedHeadquartersPoint = { x: 15.654378, y: -.08, z: 18.145764 };

describe('Visit support on the actual A/B and site-treatment soil', () => {
  it('grounds the recorded headquarters route point on visible soil instead of burying the legs', () => {
    const surfaces = buildVisitSiteGroundSurfaces(entities);
    expect(surfaces.map(surface => surface.id)).toEqual(['quadras-ab:support', 'commercial-site:support']);
    const ground = new VisitGroundingSystem(surfaces);
    const p = { ...reportedHeadquartersPoint };
    expect(ground.heightAt(p.x, p.z)).toBeGreaterThan(.03);
    expect(ground.heightAt(p.x, p.z)).toBeLessThan(.042);
    const physics = new VisitCollisionSystem([], { minX: -77, maxX: 77, minZ: -62, maxZ: 62 });
    physics.move(p, .001, 0, undefined, undefined, ground.heightAt);
    expect(p.y).toBe(ground.heightAt(p.x, p.z));
    expect(p.y - reportedHeadquartersPoint.y).toBeGreaterThan(.11);
    // This is a scoped source adapter, not a large replacement green plane.
    expect(ground.heightAt(-70, -60)).toBe(-.08);
    expect(ground.index.lastCandidateCount).toBeLessThanOrEqual(2);
  }, 15000);

  it('supports every canonical site-treatment cell and interpolates the actual A/B vertex heights', () => {
    const surfaces = buildVisitSiteGroundSurfaces(entities);
    const quadraGround = new VisitGroundingSystem([surfaces[0]], -Infinity);
    const siteGround = new VisitGroundingSystem([surfaces[1]], -Infinity);
    const quadras = buildQuadrasABEnvironmentPlan({ entities, preserveVisitGroundPlacement: true });
    const sites = buildCommercialSiteEnvironmentPlan({ entities, preserveVisitGroundPlacement: true });
    expect(quadras.cells.length).toBeGreaterThan(100);
    expect(sites.cells.length).toBeGreaterThan(100);
    for (const cell of quadras.cells) {
      // The cell centre lies on the renderer's 0→2 diagonal; these two
      // Float32 vertices determine exactly the visible support there.
      const a = cell.polygon[0], c = cell.polygon[2];
      const x = (Math.fround(a[0]) + Math.fround(c[0])) / 2;
      const z = (Math.fround(a[1]) + Math.fround(c[1])) / 2;
      const expected = (Math.fround(quadrasABGroundVertexHeight(...a)) + Math.fround(quadrasABGroundVertexHeight(...c))) / 2;
      expect(quadraGround.heightAt(x, z)).toBeCloseTo(expected, 10);
    }
    for (const cell of sites.cells) expect(siteGround.heightAt(...cell.center)).toBeCloseTo(cell.elevation, 10);
  }, 15000);

  it('preserves the same physical cells through every technical profile in traditional and visit modes', () => {
    const quadraHigh = buildQuadrasABEnvironmentPlan({ entities, reducedGraphics: false, preserveVisitGroundPlacement: true });
    const quadraLow = buildQuadrasABEnvironmentPlan({ entities, reducedGraphics: true, preserveVisitGroundPlacement: true });
    const siteHigh = buildCommercialSiteEnvironmentPlan({ entities, reducedGraphics: false, preserveVisitGroundPlacement: true });
    const siteLow = buildCommercialSiteEnvironmentPlan({ entities, reducedGraphics: true, preserveVisitGroundPlacement: true });
    const normalQuadraLow = buildQuadrasABEnvironmentPlan({ entities, reducedGraphics: true });
    const normalSiteLow = buildCommercialSiteEnvironmentPlan({ entities, reducedGraphics: true });
    expect(quadraLow.cells).toEqual(quadraHigh.cells);
    expect(siteLow.cells).toEqual(siteHigh.cells);
    expect(normalQuadraLow.cells).toEqual(quadraHigh.cells);
    expect(normalSiteLow.cells).toEqual(siteHigh.cells);
    if (process.env.VISIT_COLLISION_AUDIT === '1') {
      const destination = resolve(process.cwd(), 'artifacts/visit-mode');
      mkdirSync(destination, { recursive: true });
      const ground = new VisitGroundingSystem(buildVisitSiteGroundSurfaces(entities));
      writeFileSync(resolve(destination, 'ground-support-audit.json'), JSON.stringify({
        generatedAt: new Date().toISOString(), source: 'official-reference',
        purpose: 'Canonical cell counts and support regression; not measured GPU draw calls or FPS',
        reportedHeadquartersPoint,
        correctedHeadquartersHeight: ground.heightAt(reportedHeadquartersPoint.x, reportedHeadquartersPoint.z),
        broadphaseSupportGroups: ground.surfaces.length,
        fineGridCellSize: .4,
        quadrasAB: { visitCells: quadraHigh.cells.length, traditionalReducedCells: normalQuadraLow.cells.length },
        commercialSite: { visitCells: siteHigh.cells.length, traditionalReducedCells: normalSiteLow.cells.length },
        supportTrianglesAboveTraditionalReduced: 2 * (quadraHigh.cells.length + siteHigh.cells.length - normalQuadraLow.cells.length - normalSiteLow.cells.length),
        addedSupportMaterialGroups: 0,
      }, null, 2));
    }
  }, 15000);
});
