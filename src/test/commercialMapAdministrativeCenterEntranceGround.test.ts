import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import { PAVILION_COURTYARD } from '@/features/commercial-map/data/pavilionCourtyard';
import { PARK_ACCESS_SPATIAL_PLAN } from '@/features/commercial-map/data/parkAccessSpatialPlan';
import { createAdministrativeCenterEntranceLayout, administrativeEntranceLawnHeight } from '@/features/commercial-map/utils/administrativeCenterEntrance';
import { createAdministrativeCenterEntranceGeometries } from '@/features/commercial-map/components/canvas/AdministrativeCenterEntrance';
import { commercialPavilionModelBounds } from '@/features/commercial-map/utils/commercialPavilions';
import { strategicLandmarkBounds, strategicLandmarkFacingRadians, strategicLandmarkVisualHeight } from '@/features/commercial-map/utils/landmarks';
import { buildVisitWorld } from '@/features/commercial-map/visit/VisitWorld';
import type { MapEntity } from '@/features/commercial-map/types';

const rows = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/validation/pavilion-architecture-2026/persisted-administrative-footprint.json'), 'utf8')).rows;
const source = OFFICIAL_REFERENCE_ENTITIES.find(entity => entity.publicIdentifier === 'B11')!;
const row = rows.find((candidate: { public_identifier: string }) => candidate.public_identifier === 'B11');
const entity: MapEntity = { ...source, geometry: { ...source.geometry, coordinates: row.geometry.coordinates, elevation: Number(row.elevation), extrusionHeight: Number(row.extrusion_height) } };
const bounds = strategicLandmarkBounds(entity), yaw = strategicLandmarkFacingRadians(entity), height = strategicLandmarkVisualHeight(entity)!;
const layout = createAdministrativeCenterEntranceLayout(commercialPavilionModelBounds(bounds, yaw), height);
const c = Math.cos(yaw), s = Math.sin(yaw);
const worldPoint = (x: number, z: number): [number, number] => [bounds.centerX + x * c + z * s, bounds.centerZ - x * s + z * c];
const polygon = (ring: readonly (readonly [number, number])[]): MultiPolygon => [[ring.map(point => [point[0], point[1]])]];
const worldRect = (rect: { minX: number; maxX: number; minZ: number; maxZ: number }) => polygon([[rect.minX, rect.minZ], [rect.maxX, rect.minZ], [rect.maxX, rect.maxZ], [rect.minX, rect.maxZ]].map(([x, z]) => worldPoint(x, z)));

describe('Administrative Center B11 photographed entrance and ground', () => {
  it('projects from the short local +X end toward Argentina without rotating the registered building', () => {
    const before = JSON.stringify(entity);
    expect(yaw).toBe(Math.PI / 2);
    const start = worldPoint(layout.canopy.minX, layout.door.centerZ), end = worldPoint(layout.canopy.maxX, layout.door.centerZ);
    expect(end[0]).toBeCloseTo(start[0], 12);
    expect(end[1]).toBeLessThan(start[1]);
    expect(layout.canopy.maxX - layout.body.endX).toBeCloseTo(1.5, 10);
    expect(start[1]).toBeGreaterThan(bounds.minZ);
    const curb = worldPoint(layout.steps[0].maxX, layout.door.centerZ);
    expect(curb[1]).toBeCloseTo(layout.streetEdgeZ, 10);
    expect(JSON.stringify(entity)).toBe(before);
  });

  it('has one adjacent pavement owner up to the street, clear of roads, other buildings, existing sidewalks and root holes', () => {
    const pavement = [layout.walkway, ...layout.steps].map(worldRect);
    expect(polygonClipping.intersection(pavement[0], pavement[1])).toEqual([]);
    expect(layout.walkway.maxX).toBe(layout.steps[0].minX);
    expect(layout.walkway.elevation).toBe(.068);
    expect(layout.steps[0].elevation).toBe(layout.walkway.elevation);
    const all = polygonClipping.union(pavement[0], ...pavement.slice(1), worldRect(layout.canopy), worldRect(layout.lawn));
    for (const protectedEntity of OFFICIAL_REFERENCE_ENTITIES.filter(candidate => candidate.classification === 'ROAD' || (candidate.id !== entity.id && ['PAVILION', 'SECURITY', 'ADMINISTRATION'].includes(candidate.classification)))) {
      expect(polygonClipping.intersection(all, polygon(protectedEntity.geometry.coordinates[0])), protectedEntity.publicIdentifier).toEqual([]);
    }
    for (const sidewalk of PARK_ACCESS_SPATIAL_PLAN.sidewalkSurfaces) expect(polygonClipping.intersection(all, polygon(sidewalk.polygon)), sidewalk.id).toEqual([]);
    for (const tree of PAVILION_COURTYARD.trees) expect(polygonClipping.intersection(all, polygon(tree.rootOpening))).toEqual([]);
    // The paved strip starts exactly at the actual end wall, rather than at a
    // detached cadastral marker or on the opposite longitudinal elevation.
    expect(layout.walkway.minX).toBe(layout.body.endX);
  });

  it('renders the pavement at its declared top and retains the same roofs/path at reduced detail', () => {
    const detailed = createAdministrativeCenterEntranceGeometries(layout, true), reduced = createAdministrativeCenterEntranceGeometries(layout, false);
    detailed.platform.computeBoundingBox();
    expect(detailed.platform.boundingBox!.max.y).toBeCloseTo(Math.max(layout.walkway.elevation, ...layout.steps.map(step => step.elevation)), 7);
    // Pavement and the raised .09 threshold have distinct, intentional solid
    // volumes; each visible top must exist at the same numerical support Y.
    const platformPositions = detailed.platform.getAttribute('position');
    for (const top of new Set([layout.walkway.elevation, ...layout.steps.map(step => step.elevation)])) {
      expect(Array.from(platformPositions.array).some((value, index) => index % 3 === 1 && Math.abs(value - top) < 1e-7)).toBe(true);
    }
    for (const key of ['platform', 'roof', 'hedge'] as const) expect(Array.from(reduced[key].getAttribute('position').array)).toEqual(Array.from(detailed[key].getAttribute('position').array));
    Object.values(detailed).forEach(geometry => geometry.dispose()); Object.values(reduced).forEach(geometry => geometry.dispose());
  });

  it('walks from Argentina through the cadastral forecourt to the closed doorway at the same numerical floor level', () => {
    const road = OFFICIAL_REFERENCE_ENTITIES.find(entity => entity.publicIdentifier === 'RUA-ARGENTINA')!;
    const world = buildVisitWorld({ entities: [entity, road], trees: [], includeContext: false });
    for (const x of [layout.body.endX + .08, (layout.walkway.minX + layout.walkway.maxX) / 2, layout.steps[0].maxX - .025]) {
      const p = worldPoint(x, layout.door.centerZ), y = world.ground.heightAt(...p);
      const supportY = Math.max(...[layout.walkway, ...layout.steps].filter(rect => x >= rect.minX && x <= rect.maxX && layout.door.centerZ >= rect.minZ && layout.door.centerZ <= rect.maxZ).map(rect => rect.elevation));
      expect(y).toBeCloseTo(supportY, 10);
      expect(world.collisions.isFree({ x: p[0], y, z: p[1] })).toBe(true);
    }
    const body = worldPoint(0, layout.body.centerZ);
    expect(world.collisions.isFree({ x: body[0], y: layout.walkway.elevation, z: body[1] })).toBe(false);
    expect(world.collisions.colliders.filter(collider => collider.id.includes(':entrance-post:'))).toHaveLength(layout.posts.length);
    expect(world.collisions.colliders.filter(collider => collider.id.includes(':entrance-hedge:'))).toHaveLength(layout.hedgeRows.length);
    const underRoof = worldPoint((layout.canopy.minX + layout.canopy.maxX) / 2, layout.door.centerZ);
    expect(world.cameraProbe({ x: underRoof[0], y: .4, z: underRoof[1] }, { x: underRoof[0], y: .8, z: underRoof[1] })).toBeLessThan(1);
  });

  it('grounds the graded lawn and all bases on its shared piecewise plane while cutting pavement holes', () => {
    const world = buildVisitWorld({ entities: [entity], trees: [], includeContext: false });
    const lawn = world.ground.surfaces.find(surface => surface.id === 'B11:entrance-lawn')!;
    expect(lawn.holes).toHaveLength(1 + layout.steps.length);
    const x = (layout.canopy.minX + layout.canopy.maxX) / 2;
    for (const z of [layout.lawn.minZ, layout.lawn.minZ + .05, layout.lawn.minZ + .14, layout.tree.z, layout.lawn.maxZ - .05, layout.lawn.maxZ]) {
      const p = worldPoint(x, z);
      expect(world.ground.heightAt(...p)).toBeCloseTo(administrativeEntranceLawnHeight(layout, x, z), 10);
    }
    for (const [px, pz] of layout.posts) {
      const p = worldPoint(px, pz);
      expect(world.ground.heightAt(...p)).toBeCloseTo(layout.hedgeRows[0].elevation, 10);
    }
    const t = worldPoint(layout.tree.x, layout.tree.z);
    expect(world.ground.heightAt(...t)).toBeCloseTo(layout.tree.groundY, 10);
  });

  it('adds one photo-derived tree outside all protected geometry with matching trunk and crown physics', () => {
    const tree = layout.tree, [x, z] = worldPoint(tree.x, tree.z);
    expect(x).toBeCloseTo(8.85, 2); expect(z).toBeCloseTo(18.5, 2);
    const crownBounds = polygon([[x - tree.crownRadius, z - tree.crownRadius], [x + tree.crownRadius, z - tree.crownRadius],
      [x + tree.crownRadius, z + tree.crownRadius], [x - tree.crownRadius, z + tree.crownRadius]]);
    for (const protectedEntity of OFFICIAL_REFERENCE_ENTITIES.filter(candidate => ['ROAD', 'PAVILION', 'SECURITY', 'ADMINISTRATION'].includes(candidate.classification))) {
      expect(polygonClipping.intersection(crownBounds, polygon(protectedEntity.geometry.coordinates[0])), protectedEntity.publicIdentifier).toEqual([]);
    }
    expect(polygonClipping.intersection(crownBounds, worldRect(layout.walkway))).toEqual([]);
    expect(polygonClipping.intersection(crownBounds, worldRect(layout.canopy))).toEqual([]);
    const world = buildVisitWorld({ entities: OFFICIAL_REFERENCE_ENTITIES, trees: [], includeContext: true });
    const trunk = world.collisions.colliders.find(collider => collider.id === `${entity.id}:entrance-tree`)!;
    const crown = world.collisions.colliders.find(collider => collider.id === `${entity.id}:entrance-tree:crown`)!;
    expect(trunk).toMatchObject({ kind: 'circle', x, z, radius: tree.trunkRadius, minY: tree.groundY, maxY: tree.groundY + tree.trunkHeight });
    expect(crown).toMatchObject({ kind: 'circle', x, z, radius: tree.crownRadius, cameraOnly: true,
      minY: tree.crownCenterY - tree.crownHalfHeight, maxY: tree.crownCenterY + tree.crownHalfHeight });
    expect(world.collisions.colliders.filter(collider => collider.id === `${entity.id}:entrance-tree`)).toHaveLength(1);
    expect(world.ground.heightAt(x, z)).toBeCloseTo(tree.groundY, 7);
  });

});
