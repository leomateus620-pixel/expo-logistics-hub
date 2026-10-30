import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import { PAVILION_COURTYARD } from '@/features/commercial-map/data/pavilionCourtyard';
import { buildBrigadaMilitaryWingPresentation, BRIGADA_WING_CONNECTION_OWNER } from '@/features/commercial-map/utils/brigadaMilitaryWingConnection';
import { brigadaWingRoofHeight } from '@/features/commercial-map/utils/brigadaMilitaryWing';
import { buildPavilionConnectedComplex } from '@/features/commercial-map/utils/pavilionConnectedComplex';
import { createPavilionJoinGeometry } from '@/features/commercial-map/components/canvas/pavilions/PavilionConnectedComplex';
import { buildVisitWorld } from '@/features/commercial-map/visit/VisitWorld';
import { strategicLandmarkBounds } from '@/features/commercial-map/utils/landmarks';
import type { MapEntity } from '@/features/commercial-map/types';

const rows = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/validation/pavilion-architecture-2026/persisted-brigada-footprints.json'), 'utf8')).rows;
const entities: MapEntity[] = ['B6', 'B19'].map(id => {
  const entity = OFFICIAL_REFERENCE_ENTITIES.find(candidate => candidate.publicIdentifier === id)!;
  const row = rows.find((candidate: { public_identifier: string }) => candidate.public_identifier === id);
  return { ...entity, classification: row.classification, geometry: { ...entity.geometry, coordinates: row.geometry.coordinates, elevation: Number(row.elevation), extrusionHeight: Number(row.extrusion_height) } };
});
const wing = entities.find(entity => entity.publicIdentifier === 'B19')!, pavilion3 = entities.find(entity => entity.publicIdentifier === 'B6')!;
const polygon = (ring: readonly (readonly [number, number])[]): MultiPolygon => [[ring.map(point => [point[0], point[1]])]];
const rectangle = (minX: number, maxX: number, minZ: number, maxZ: number) => polygon([[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]]);

describe('existing Brigada Militar annex joined to Pavilion 3', () => {
  it('uses current persisted bounds without changing B19 SECURITY or B6 commercial records', () => {
    const before = JSON.stringify(entities), presentation = buildBrigadaMilitaryWingPresentation(entities)!;
    expect(presentation).not.toBeNull();
    expect(presentation.wing).toBe(wing); expect(presentation.pavilion3).toBe(pavilion3);
    expect(presentation.wing.classification).toBe('SECURITY');
    expect(presentation.wing.geometry.extrusionHeight).toBe(.62);
    expect(presentation.layout.minX).toBe(strategicLandmarkBounds(wing).minX);
    expect(presentation.layout.maxX).toBe(strategicLandmarkBounds(wing).maxX);
    expect(presentation.layout.maxZ).toBe(strategicLandmarkBounds(wing).maxZ);
    expect(presentation.join.cadastralGap).toBe(0);
    expect(presentation.join.shellGap).toBeCloseTo(.1145454545, 8);
    expect(presentation.join.owner).toBe(BRIGADA_WING_CONNECTION_OWNER);
    expect(JSON.stringify(entities)).toBe(before);
    const originalFamily = OFFICIAL_REFERENCE_ENTITIES.filter(entity => ['B4', 'B5', 'B6', 'B19'].includes(entity.publicIdentifier));
    expect(buildPavilionConnectedComplex(originalFamily).map(join => join.id)).toEqual(['p8-p13', 'p13-p3']);
  });

  it('declines missing, archived, unauthorized-project or incompatible owners', () => {
    expect(buildBrigadaMilitaryWingPresentation([wing])).toBeNull();
    expect(buildBrigadaMilitaryWingPresentation([pavilion3])).toBeNull();
    expect(buildBrigadaMilitaryWingPresentation([{ ...wing, isArchived: true }, pavilion3])).toBeNull();
    expect(buildBrigadaMilitaryWingPresentation([wing, { ...pavilion3, isArchived: true }])).toBeNull();
    expect(buildBrigadaMilitaryWingPresentation([{ ...wing, projectId: `${wing.projectId}:other` }, pavilion3])).toBeNull();
    expect(buildBrigadaMilitaryWingPresentation([{ ...wing, classification: 'BUILDING' }, pavilion3])).toBeNull();
    const moved = { ...wing, geometry: { ...wing.geometry, coordinates: wing.geometry.coordinates.map(ring => ring.map(([x, z]) => [x + 2, z] as [number, number])) } };
    expect(buildBrigadaMilitaryWingPresentation([moved, pavilion3])).toBeNull();
  });

  it('closes the measured shell seam and matches both roof endpoints without side duplicates', () => {
    const { layout, join } = buildBrigadaMilitaryWingPresentation(entities)!;
    expect(join.minX).toBe(layout.canopyMinX);
    expect(join.maxX).toBe(layout.minX);
    expect(join.minZ).toBe(layout.frontZ);
    expect(join.maxZ).toBe(layout.maxZ);
    expect(join.eastEaveY).toBe(brigadaWingRoofHeight(layout, join.maxX, join.minZ));
    expect(join.eastRearEaveY).toBe(brigadaWingRoofHeight(layout, join.maxX, join.maxZ));
    const geometry = createPavilionJoinGeometry(join);
    for (const part of Object.values(geometry)) {
      const positions = part.getAttribute('position');
      for (let offset = 0; offset < positions.count; offset += 3) {
        const xs = [0, 1, 2].map(index => positions.getX(offset + index));
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0);
      }
      expect(Array.from(part.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
      part.dispose();
    }
  });

  it('recesses the photographed body and keeps its apron and canopy clear of roads, modules and tree holes', () => {
    const { layout, join } = buildBrigadaMilitaryWingPresentation(entities)!;
    const pb = layout.pavilion3Bounds;
    expect(layout.frontZ).toBe(pb.centerZ - layout.pavilion3Layout.exterior.shell.depth / 2);
    expect(layout.frontZ).toBeGreaterThan(strategicLandmarkBounds(wing).minZ);
    const footprints = [
      rectangle(layout.minX, layout.maxX, layout.minZ, layout.maxZ),
      rectangle(join.minX, join.maxX, join.minZ, join.maxZ),
      rectangle(layout.apronMinX, layout.apronMaxX, layout.apronMinZ, layout.apronMaxZ),
      rectangle(layout.canopyMinX, layout.canopyMaxX, layout.canopyFrontZ, layout.frontZ),
    ];
    for (const protectedEntity of OFFICIAL_REFERENCE_ENTITIES.filter(entity => entity.classification === 'ROAD' || entity.parentEntityId === pavilion3.id)) {
      for (const footprint of footprints) expect(polygonClipping.intersection(footprint, polygon(protectedEntity.geometry.coordinates[0])), protectedEntity.publicIdentifier).toEqual([]);
    }
    for (const tree of PAVILION_COURTYARD.trees) for (const footprint of footprints) expect(polygonClipping.intersection(footprint, polygon(tree.rootOpening))).toEqual([]);
  });

  it('gives the same apron support and solid annex/joint to visit without colliders per architectural detail', () => {
    const { layout, join } = buildBrigadaMilitaryWingPresentation(entities)!;
    const world = buildVisitWorld({ entities, trees: [], includeContext: false });
    expect(world.collisions.colliders.filter(collider => collider.id === wing.id)).toHaveLength(1);
    expect(world.collisions.colliders.filter(collider => collider.id === join.owner)).toHaveLength(1);
    const x = (layout.minX + layout.maxX) / 2, z = (layout.apronMinZ + layout.apronMaxZ) / 2;
    expect(world.ground.heightAt(x, z)).toBe(layout.floorY);
    expect(world.collisions.isFree({ x, y: layout.floorY, z })).toBe(true);
    expect(world.collisions.isFree({ x, y: layout.floorY, z: (layout.frontZ + layout.maxZ) / 2 })).toBe(false);
    expect(world.collisions.isFree({ x: (join.minX + join.maxX) / 2, y: layout.floorY, z: (join.minZ + join.maxZ) / 2 })).toBe(false);
    const isolated = buildVisitWorld({ entities: [wing], trees: [], includeContext: false });
    expect(isolated.ground.surfaces.some(surface => surface.id === 'brigada-military-wing:front-apron')).toBe(false);
    expect(isolated.collisions.colliders.find(collider => collider.id === wing.id)?.maxY).toBe(wing.geometry.elevation + wing.geometry.extrusionHeight);
  });
});
