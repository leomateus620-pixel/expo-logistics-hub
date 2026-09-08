import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import {
  OFFICIAL_REFERENCE_ENTITIES,
  OFFICIAL_REFERENCE_LOTS,
  OFFICIAL_RENDERED_ENTITIES,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';
import {
  SOY_RESTROOM,
  GATE_NINE_TANKS,
} from '@/features/commercial-map/data/soyGateInfrastructure';
import { hydrologicalPlanPointToWorldXZ } from '@/features/commercial-map/data/hydrologicalInfrastructure';
import { COMMERCIAL_ELECTRICAL_NODES } from '@/features/commercial-map/data/electricalInfrastructure';
import { REAR_PARKING_TREE_CANDIDATES } from '@/features/commercial-map/data/rearParking';
import { resolveElectricalNodePlacements } from '@/features/commercial-map/utils/electricalInfrastructure';
import {
  buildSoyRestroomParts,
  buildGateNineTankParts,
} from '@/features/commercial-map/utils/soyGateArchitecture';
import {
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
} from '@/features/commercial-map/utils/landmarks';
import {
  buildRoadNetworkGeometries,
  disposeRoadNetworkGeometries,
  roadSurfaceHeight,
} from '@/features/commercial-map/utils/roadInfrastructure';
import {
  buildCommercialSiteHardSurfaceMasks,
  commercialSitePolygonInteriorsOverlap,
} from '@/features/commercial-map/utils/commercialSiteEnvironment';
import {
  distanceToPolygon,
  pointInPolygon,
} from '@/features/commercial-map/utils/spatialSurface';

const entity = (id: string) =>
  OFFICIAL_RENDERED_ENTITIES.find((e) => e.publicIdentifier === id)!;

describe('E07 / Montevideo / A9 reference-aligned infrastructure', () => {
  it('preserves every existing entity except the authorized E07 footprint', () => {
    const prior = JSON.parse(
      readFileSync('docs/screenshots/soy-gate9/before-inventory.json', 'utf8'),
    ).entities;
    for (const original of prior) {
      const { source: _source, ...before } = original;
      if (before.publicIdentifier === 'E-07') continue;
      expect(
        OFFICIAL_REFERENCE_ENTITIES.find((e) => e.id === before.id),
        before.publicIdentifier,
      ).toEqual(before);
    }
  });

  it('restores the original sanitary identity and registers a separate noncommercial A9 group', () => {
    expect(entity('E-07')).toMatchObject({
      id: 'reference:2026:e-07',
      classification: 'RESTROOM',
      isSellable: false,
      verificationStatus: 'NEEDS_REVIEW',
    });
    expect(entity('RES-A9')).toMatchObject({
      classification: 'SERVICE',
      isSellable: false,
      metadata: { tankCount: 3, relatedGateIdentifier: 'A9' },
    });
    for (const id of ['E-07', 'RES-A9'])
      expect(
        OFFICIAL_REFERENCE_LOTS.some((l) => l.entityId === entity(id).id),
      ).toBe(false);
    expect(entity('B28')).toBeDefined();
  });

  it('places male reference-left and female reference-right when looking from B7', () => {
    const yaw = strategicLandmarkFacingRadians(entity('E-07'));
    const restroom = strategicLandmarkBounds(entity('E-07'));
    const kitchen = strategicLandmarkBounds(entity('B7'));
    expect(Math.sin(yaw)).toBeCloseTo(1, 10);
    expect(kitchen.centerX).toBeGreaterThan(restroom.centerX);
    // Observer looks toward -X; screen-right is world -Z.
    const maleWorldZ = restroom.centerZ - -0.34 * Math.sin(yaw);
    const femaleWorldZ = restroom.centerZ - 0.34 * Math.sin(yaw);
    expect(maleWorldZ).toBeGreaterThan(femaleWorldZ);
    expect(SOY_RESTROOM.sourceBounds).toEqual([3300, 2498, 3396, 2566]);
  });

  it('joins both existing road boundaries at the same surface height without overlapping asphalt', () => {
    const link = entity('RUA-MONTEVIDEU-COZINHA'),
      bounds = strategicLandmarkBounds(link);
    const paraguai = entity('RUA-PARAGUAI'),
      bolivia = entity('RUA-BOLIVIA');
    expect(bounds.minZ).toBeCloseTo(strategicLandmarkBounds(paraguai).maxZ, 10);
    expect(bounds.maxZ).toBeCloseTo(strategicLandmarkBounds(bolivia).minZ, 10);
    expect(bounds.width).toBeCloseTo(
      strategicLandmarkBounds(entity('RUA-MONTEVIDEU-SUL')).width,
      10,
    );
    for (const street of [paraguai, bolivia]) {
      expect(roadSurfaceHeight(link)).toBe(roadSurfaceHeight(street));
      expect(
        commercialSitePolygonInteriorsOverlap(
          link.geometry.coordinates[0],
          street.geometry.coordinates[0],
        ),
      ).toBe(false);
    }
    const masks = buildCommercialSiteHardSurfaceMasks();
    expect(
      masks.some(
        (m) =>
          m.sourceIdentifier === link.publicIdentifier &&
          m.role === 'OFFICIAL_ROAD',
      ),
    ).toBe(true);
    expect(
      masks.filter((m) => m.id.startsWith('soy-restroom:approach:')),
    ).toHaveLength(2);
    const network = buildRoadNetworkGeometries([link, paraguai, bolivia]);
    expect(network.diagnostics.connectionCount).toBeGreaterThanOrEqual(2);
    expect(network.diagnostics.estimatedBaseDrawCalls).toBeLessThanOrEqual(5);
    disposeRoadNetworkGeometries(network);
  });

  it('keeps new surfaces clear of physical electrical supports and other buildings', () => {
    const road = entity('RUA-MONTEVIDEU-COZINHA');
    const placements = resolveElectricalNodePlacements(
      COMMERCIAL_ELECTRICAL_NODES,
      OFFICIAL_RENDERED_ENTITIES,
      true,
    );
    for (const p of placements) {
      expect(
        distanceToPolygon(p.renderPosition, road.geometry.coordinates[0]),
        p.node.sourceMarkerId,
      ).toBeGreaterThan(p.node.radius);
    }
    const cabinet = placements.find(
      (p) => p.node.sourceMarkerId === 'transformer-ref-007',
    )!;
    expect(cabinet.sourceAnchorPreserved).toBe(true);
    for (const id of ['E-07', 'RES-A9']) {
      const footprint = entity(id).geometry.coordinates[0];
      const neighbors = OFFICIAL_RENDERED_ENTITIES.filter(
        (e) =>
          e.publicIdentifier !== id &&
          [
            'ROAD',
            'PAVILION',
            'BUILDING',
            'RESTROOM',
            'SERVICE',
            'GATE',
          ].includes(e.classification),
      );
      for (const n of neighbors)
        expect(
          commercialSitePolygonInteriorsOverlap(
            footprint,
            n.geometry.coordinates[0],
          ),
          `${id}/${n.publicIdentifier}`,
        ).toBe(false);
    }
  });

  it('places exactly three separate tanks at the hydraulic markers, away from tree trunks', () => {
    const positions = GATE_NINE_TANKS.sourcePagePositions.map((p) =>
      hydrologicalPlanPointToWorldXZ([...p]),
    );
    expect(positions).toHaveLength(3);
    positions.forEach((p, i) => {
      expect(pointInPolygon(p, entity('RES-A9').geometry.coordinates[0])).toBe(
        true,
      );
      if (i)
        expect(
          Math.hypot(p[0] - positions[i - 1][0], p[1] - positions[i - 1][1]),
        ).toBeGreaterThan(GATE_NINE_TANKS.baseSize);
      for (const tree of REAR_PARKING_TREE_CANDIDATES)
        expect(
          Math.hypot(p[0] - tree.position[0], p[1] - tree.position[1]),
          tree.id,
        ).toBeGreaterThan(tree.trunkRadius + GATE_NINE_TANKS.baseSize / 2);
    });
    expect(
      Math.hypot(
        positions[0][0] - strategicLandmarkBounds(entity('B28')).centerX,
        positions[0][1] - strategicLandmarkBounds(entity('B28')).centerZ,
      ),
    ).toBeGreaterThan(25);
  });

  it('merges mixed primitive topologies into finite geometry, with bounded draw calls and grounded bases', () => {
    const bounds = strategicLandmarkBounds(entity('RES-A9'));
    for (const parts of [
      buildSoyRestroomParts(),
      buildGateNineTankParts(bounds),
    ]) {
      expect(parts.length).toBeLessThanOrEqual(7);
      const box = new Box3();
      parts.forEach((p) => {
        expect(p.geometry.index).toBeNull();
        const positions = p.geometry.getAttribute('position');
        const normals = p.geometry.getAttribute('normal');
        expect(normals.count).toBe(positions.count);
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
        p.geometry.computeBoundingBox();
        box.union(p.geometry.boundingBox!);
      });
      expect(box.min.y).toBeCloseTo(-0.08, 6);
      expect(box.getSize(new Vector3()).y).toBeLessThan(1.6);
      parts.forEach((p) => p.geometry.dispose());
    }
    expect(officialPdfPointToLocal(SOY_RESTROOM.sourceCenter)[0]).toBeCloseTo(
      strategicLandmarkBounds(entity('E-07')).centerX,
      10,
    );
  });
});
