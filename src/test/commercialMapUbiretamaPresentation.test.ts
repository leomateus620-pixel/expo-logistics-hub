import { describe, expect, it } from 'vitest';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import * as THREE from 'three';
import { OFFICIAL_REFERENCE_DATA, officialPdfPointToLocal } from '@/features/commercial-map/data/officialReference2026';
import { createExporural2028Preview } from '@/features/commercial-map/data/exporuralReference2028';
import { buildUbiretamaRoadPresentation, UBIRETAMA_PRESENTATION_MASK, UBIRETAMA_LEGACY_FOOTPRINT,
  UBIRETAMA_PRESENTATION_HANDOFF, createUbiretamaRoadPresentationResolver, ubiretamaPresentationDistance } from '@/features/commercial-map/utils/ubiretamaRoadPresentation';
import { buildTerritoryRoadGeometry, integrateGroundWithTerritory, territoryRoadClearance } from '@/features/commercial-map/utils/territorialRoadGeometry';
import { buildRoadBoundaryRuns, createRoadSurfaceGeometry, findRoadConnections } from '@/features/commercial-map/utils/roadInfrastructure';
import { integrateGroundGeometryWithRearRoads } from '@/features/commercial-map/utils/rearRoadGroundIntegration';
import { selectRearRoadCompatibleTreesForPresentation } from '@/features/commercial-map/utils/rearRoadTreeClearance';
import { buildVisitGroundSurfaces } from '@/features/commercial-map/visit/VisitGroundingSystem';
import type { MapEntity } from '@/features/commercial-map/types';

const area = (polygons: MultiPolygon) => polygons.reduce((sum, rings) => sum + rings.reduce((value, ring, index) => value
  + (index === 0 ? 1 : -1) * Math.abs(ring.reduce((a, p, i) => {
    const next = ring[(i + 1) % ring.length]; return a + p[0] * next[1] - next[0] * p[1];
  }, 0)) / 2, 0), 0);
const polygon = (entity: MapEntity): MultiPolygon => [entity.geometry.coordinates];
const revisions = [['2026', OFFICIAL_REFERENCE_DATA], ['2028', createExporural2028Preview()]] as const;
const transverseIds = ['RUA-BRUNO-SCHWARTZ', 'RUA-JOHAN-MULLER', 'RUA-GUSTAVO-BESSEL', 'RUA-EMANUEL-BRACHMANN'];

describe('Rua Ubiretama presentation follows current cadastral geometry', () => {
  for (const [revision, data] of revisions) {
    it(`connects all four transverse streets in ${revision}, without changing any entity or lot`, () => {
      const before = JSON.stringify(data);
      const plan = buildUbiretamaRoadPresentation(data.entities)!;
      expect(plan).not.toBeNull();
      const road = data.entities.find(e => e.publicIdentifier === 'RUA-UBIRETAMA')!;
      expect(plan.entityId).toBe(road.id);
      expect(area(polygonClipping.xor(plan.cadastralFootprint, polygon(road)))).toBeLessThan(1e-9);
      for (const id of transverseIds) {
        const transverse = data.entities.find(e => e.publicIdentifier === id)!;
        expect(findRoadConnections([road, transverse]), id).toHaveLength(1);
        if (revision === '2028') expect(area(polygonClipping.intersection(plan.footprint, polygon(transverse))), id).toBeGreaterThan(1e-4);
      }
      for (const lot of data.entities.filter(e => e.classification === 'SELLABLE_LOT')) {
        expect(area(polygonClipping.intersection(plan.footprint, polygon(lot))), lot.publicIdentifier).toBeLessThan(1e-8);
      }
      expect(plan.footprint).toHaveLength(1);
      expect(JSON.stringify(data)).toBe(before);
    });

    it(`preserves the entire Arena/A5 continuation and exterior network in ${revision}`, () => {
      const plan = buildUbiretamaRoadPresentation(data.entities)!;
      const oldSouth = polygonClipping.difference(UBIRETAMA_LEGACY_FOOTPRINT, UBIRETAMA_PRESENTATION_MASK);
      const newSouth = polygonClipping.difference(plan.footprint, UBIRETAMA_PRESENTATION_MASK);
      expect(area(polygonClipping.xor(oldSouth, newSouth))).toBeLessThan(1e-9);
      const before = buildTerritoryRoadGeometry(), after = buildTerritoryRoadGeometry(plan);
      try {
        expect(area(polygonClipping.difference(polygonClipping.xor(before.footprint, after.footprint), UBIRETAMA_PRESENTATION_MASK))).toBeLessThan(1e-9);
        expect(after.edgeLines.getAttribute('position').array).toEqual(before.edgeLines.getAttribute('position').array);
        expect(after.centerLines.getAttribute('position').array).toEqual(before.centerLines.getAttribute('position').array);
      } finally {
        for (const network of [before, after]) Object.values(network).forEach(g => { if (g instanceof THREE.BufferGeometry) g.dispose(); });
      }
    }, 30_000);
  }

  it('opens transverse curb runs at the current road mouth instead of closing the junction', () => {
    const data = createExporural2028Preview(), plan = buildUbiretamaRoadPresentation(data.entities)!;
    const roads = data.entities.filter(e => transverseIds.includes(e.publicIdentifier));
    const runs = buildRoadBoundaryRuns(roads, .04, plan);
    for (const run of runs) {
      const midpoint: [number, number] = [(run.from[0] + run.to[0]) / 2, (run.from[1] + run.to[1]) / 2];
      expect(ubiretamaPresentationDistance(midpoint, plan)).toBeGreaterThan(.04);
    }
  });

  it('cuts the actual lateral terrain and retains ground over the obsolete road location', () => {
    const plan = buildUbiretamaRoadPresentation(createExporural2028Preview().entities)!;
    const current = officialPdfPointToLocal([5937, 1500]), obsolete = officialPdfPointToLocal([5987, 1500]);
    const ground = new THREE.PlaneGeometry(2.8, 1.2, 8, 4);
    ground.rotateX(-Math.PI / 2); ground.translate((current[0] + obsolete[0]) / 2, .052, current[1]);
    integrateGroundGeometryWithRearRoads(ground, plan);
    const mesh = new THREE.Mesh(ground, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const ray = (p: readonly [number, number]) => new THREE.Raycaster(new THREE.Vector3(p[0], 2, p[1]), new THREE.Vector3(0, -1, 0)).intersectObject(mesh);
    try {
      expect(ray(current)).toHaveLength(0);
      expect(ray(obsolete).length).toBeGreaterThan(0);
      expect(ubiretamaPresentationDistance(current, plan)).toBeLessThan(0);
      expect(ubiretamaPresentationDistance(obsolete, plan)).toBeGreaterThan(0);
    } finally { ground.dispose(); mesh.material.dispose(); }
  });

  it('uses the presentation for vegetation and visit support, with no generated lateral left behind', () => {
    const data = createExporural2028Preview(), plan = buildUbiretamaRoadPresentation(data.entities)!;
    const current = officialPdfPointToLocal([5937, 1500]), obsolete = officialPdfPointToLocal([5987, 1500]);
    const trees = [{ id: 'current', position: current, canopyRadius: .02 }, { id: 'obsolete', position: obsolete, canopyRadius: .02 }];
    expect(selectRearRoadCompatibleTreesForPresentation(trees, plan).map(t => t.id)).toEqual(['obsolete']);
    const supports = buildVisitGroundSurfaces(data.entities, true, data.entities, plan);
    expect(supports.some(s => s.id.startsWith('ubiretama-presentation:'))).toBe(true);
    expect(supports.some(s => s.id.startsWith('ubiretama-registered-north:'))).toBe(false);
    expect(supports.some(s => s.id.startsWith('portao5-north-approach:'))).toBe(false);
  });

  it('retains existing behavior when the current snapshot has no usable Ubiretama geometry', () => {
    expect(buildUbiretamaRoadPresentation([])).toBeNull();
    expect(buildUbiretamaRoadPresentation(OFFICIAL_REFERENCE_DATA.entities.map(e => e.publicIdentifier === 'RUA-UBIRETAMA' ? { ...e, isArchived: true } : e))).toBeNull();
    const road = OFFICIAL_REFERENCE_DATA.entities.find(e => e.publicIdentifier === 'RUA-UBIRETAMA')!;
    for (const coordinates of [[], [[]], [[[0, 0], [1, 0], [NaN, 1], [0, 0]]],
      [road.geometry.coordinates[0], [[0, 0], [1, 0], [Infinity, 1], [0, 0]]]]) {
      expect(buildUbiretamaRoadPresentation([{ ...road, geometry: { ...road.geometry, coordinates: coordinates as [number, number][][] } }])).toBeNull();
    }
  });

  it('retains holes in the persisted street, its ground cuts and rendered pavement', () => {
    const road = createExporural2028Preview().entities.find(e => e.publicIdentifier === 'RUA-UBIRETAMA')!;
    const hole = [[5930, 1450], [5940, 1450], [5940, 1500], [5930, 1500], [5930, 1450]]
      .map(p => officialPdfPointToLocal(p as [number, number]));
    const holedRoad = { ...road, geometry: { ...road.geometry, coordinates: [road.geometry.coordinates[0], hole] } };
    const plan = buildUbiretamaRoadPresentation([holedRoad])!;
    expect(plan.cadastralFootprint[0]).toHaveLength(2);
    expect(area(polygonClipping.intersection(plan.footprint, [[hole]]))).toBeLessThan(1e-9);
    const center = officialPdfPointToLocal([5935, 1475]);
    expect(ubiretamaPresentationDistance(center, plan)).toBeGreaterThan(0);
    const network = buildTerritoryRoadGeometry(plan);
    const mesh = new THREE.Mesh(network.pavement, new THREE.MeshBasicMaterial());
    try {
      expect(new THREE.Raycaster(new THREE.Vector3(center[0], 1, center[1]), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)).toHaveLength(0);
    } finally {
      Object.values(network).forEach(g => { if (g instanceof THREE.BufferGeometry) g.dispose(); });
      mesh.material.dispose();
    }
  });

  it('has one asphalt surface at the revised lateral, southern bridge and preserved approach', () => {
    const data = createExporural2028Preview();
    const plan = buildUbiretamaRoadPresentation(data.entities)!;
    const network = buildTerritoryRoadGeometry(plan);
    const mesh = new THREE.Mesh(network.pavement, new THREE.MeshBasicMaterial());
    const officialGeometry = createRoadSurfaceGeometry(data.entities.filter(e => transverseIds.includes(e.publicIdentifier)))!;
    const officialMesh = new THREE.Mesh(officialGeometry, new THREE.MeshBasicMaterial());
    try {
      for (const mouth of plan.transverseMouths) {
        expect(area(polygonClipping.intersection(network.footprint, mouth))).toBeLessThan(1e-9);
      }
      for (const cut of plan.groundCuts) {
        const center = cut.polygon.reduce((p, v) => [p[0] + v[0] / 3, p[1] + v[1] / 3], [0, 0]);
        const hits = new THREE.Raycaster(new THREE.Vector3(center[0], 1, center[1]), new THREE.Vector3(0, -1, 0)).intersectObjects([mesh, officialMesh]);
        expect(hits, `${center}`).toHaveLength(1);
      }
    } finally {
      Object.values(network).forEach(g => { if (g instanceof THREE.BufferGeometry) g.dispose(); });
      mesh.material.dispose();
      officialGeometry.dispose(); officialMesh.material.dispose();
    }
  });

  it('preserves southern terrain clipping, grading and vegetation clearance exactly', () => {
    const plan = buildUbiretamaRoadPresentation(createExporural2028Preview().entities)!;
    for (const source of [[5602, 2980], [5480, 3524], [5660, 2795]]) {
      const point = officialPdfPointToLocal(source as [number, number]);
      for (const adapter of [integrateGroundWithTerritory, integrateGroundGeometryWithRearRoads]) {
        const before = new THREE.PlaneGeometry(2, .15, 8, 2);
        before.rotateX(-Math.PI / 2); before.translate(point[0], .052, point[1]);
        const after = before.clone();
        adapter(before); adapter(after, plan);
        for (const key of Object.keys(before.attributes)) expect(after.getAttribute(key).array).toEqual(before.getAttribute(key).array);
        before.dispose(); after.dispose();
      }
      for (let dx = -1; dx <= 1; dx += .1) {
        const sample: [number, number] = [point[0] + dx, point[1]];
        expect(territoryRoadClearance(sample, plan)).toBe(territoryRoadClearance(sample));
      }
    }
    // A single terrain primitive straddles the handoff: its southern heights
    // still come from the complete old grading, not a new artificial cap.
    const point = UBIRETAMA_PRESENTATION_HANDOFF;
    const before = new THREE.PlaneGeometry(4, 2, 16, 8);
    before.rotateX(-Math.PI / 2); before.translate(point[0], .052, point[1]);
    const after = before.clone();
    integrateGroundGeometryWithRearRoads(before); integrateGroundGeometryWithRearRoads(after, plan);
    const beforeMesh = new THREE.Mesh(before, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const afterMesh = new THREE.Mesh(after, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    for (let dx = -.9; dx <= .9; dx += .1) for (const dz of [.02, .12, .32, .6]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(point[0] + dx, 1, point[1] + dz), new THREE.Vector3(0, -1, 0));
      const oldHit = ray.intersectObject(beforeMesh)[0], newHit = ray.intersectObject(afterMesh)[0];
      expect(Boolean(newHit)).toBe(Boolean(oldHit));
      if (oldHit) expect(newHit.point.y).toBeCloseTo(oldHit.point.y, 6);
    }
    before.dispose(); after.dispose(); beforeMesh.material.dispose(); afterMesh.material.dispose();
  });

  it('retains plan identity for metadata refreshes and rebuilds for geometry/archive changes', () => {
    const entities = createExporural2028Preview().entities;
    const resolve = createUbiretamaRoadPresentationResolver();
    const before = resolve(entities);
    const refreshed = entities.map(e => ({ ...e, name: `${e.name} refreshed`, metadata: { ...e.metadata, refreshed: true } })).reverse();
    expect(resolve(refreshed)).toBe(before);
    const changed = refreshed.map(e => e.publicIdentifier === 'RUA-UBIRETAMA'
      ? { ...e, geometry: { ...e.geometry, coordinates: e.geometry.coordinates.map(r => r.map(p => [p[0] + .01, p[1]] as [number, number])) } } : e);
    expect(resolve(changed)).not.toBe(before);
    expect(resolve(changed.map(e => e.publicIdentifier === 'RUA-UBIRETAMA' ? { ...e, isArchived: true } : e))).toBeNull();
  });
});
