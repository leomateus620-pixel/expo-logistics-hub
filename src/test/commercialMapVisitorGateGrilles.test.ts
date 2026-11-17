import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { createExporural2028Preview } from '@/features/commercial-map/data/exporuralReference2028';
import { buildGateNineAccessPresentation } from '@/features/commercial-map/utils/gateNineRoadPresentation';
import { geometryCentroid, polygonInteriorsOverlap } from '@/features/commercial-map/utils/geometry';
import {
  VISITOR_GRILLE_GATE_IDS,
  visitorGateProfile,
  createVisitorGateParts,
  createVisitorFenceRuns,
  createVisitorFenceParts,
} from '@/features/commercial-map/utils/visitorGateArchitecture';
import { buildGrilleBatches } from '@/features/commercial-map/components/canvas/VisitorGateGrilles';
import type { Coordinate } from '@/features/commercial-map/types';

const footprint = (x: number, z: number, w: number, d: number) => ({
  coordinates: [
    [
      [x - w / 2, z - d / 2],
      [x + w / 2, z - d / 2],
      [x + w / 2, z + d / 2],
      [x - w / 2, z + d / 2],
      [x - w / 2, z - d / 2],
    ] as Coordinate[],
  ],
});

describe('portões físicos e cercamento de visitantes', () => {
  it.each(VISITOR_GRILLE_GATE_IDS)(
    '%s mantém o centro cadastral dentro do vão e as folhas fora da passagem',
    (id) => {
      const profile = visitorGateProfile(id)!;
      expect(profile.left).toBeLessThan(0);
      expect(profile.right).toBeGreaterThan(0);
      for (const part of createVisitorGateParts(id)) {
        expect(part.size.every((v) => v > 0 && Number.isFinite(v))).toBe(true);
        expect(part.position[1] - part.size[1] / 2).toBeGreaterThanOrEqual(-1e-8);
        const min = part.position[0] - part.size[0] / 2,
          max = part.position[0] + part.size[0] / 2;
        expect(max <= profile.left + 0.05 || min >= profile.right - 0.05).toBe(true);
      }
      expect(createVisitorGateParts(id, true).length).toBeLessThan(createVisitorGateParts(id).length);
    },
  );
  it.each([
    ['2026', OFFICIAL_REFERENCE_DATA],
    ['2028', createExporural2028Preview()],
  ] as const)('conecta os quatro portões sem entrar nos lotes ou nas vias de %s', (revision, data) => {
    const before = JSON.stringify(data);
    const runs = createVisitorFenceRuns(data.entities);
    expect(runs.length).toBeGreaterThan(10);
    const access = buildGateNineAccessPresentation(data.entities);
    const protectedEntities = [
      ...data.entities.filter((e) => !e.isArchived && (e.isSellable || e.classification === 'ROAD')),
      ...(access ? [access.roadEntity] : []),
    ];
    // A fence on an existing lot/road boundary may straddle that boundary by
    // its half-thickness. Reject penetration beyond a narrow 0.03-unit joint.
    const collisions: string[] = [];
    for (const run of runs)
      for (let i = 0; i <= 20; i++) {
        const x = run.from[0] + ((run.to[0] - run.from[0]) * i) / 20,
          z = run.from[1] + ((run.to[1] - run.from[1]) * i) / 20;
        for (const entity of protectedEntities) {
          if (!polygonInteriorsOverlap(footprint(x, z, 0.002, 0.002), entity.geometry)) continue;
          const ring = entity.geometry.coordinates[0];
          const distance = Math.min(
            ...ring.map((a, j) => {
              const b = ring[(j + 1) % ring.length],
                dx = b[0] - a[0],
                dz = b[1] - a[1];
              const t = Math.max(
                0,
                Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)),
              );
              return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
            }),
          );
          if (distance > 0.03)
            collisions.push(`${entity.publicIdentifier} @ ${x.toFixed(3)},${z.toFixed(3)}`);
        }
      }
    expect(collisions).toEqual([]);
    for (const id of VISITOR_GRILLE_GATE_IDS) {
      const entity = data.entities.find((e) => e.publicIdentifier === id)!;
      const [x, z] = geometryCentroid(entity.geometry),
        p = visitorGateProfile(id, Boolean(access), data.entities)!;
      for (const side of [p.left, p.right])
        expect(
          runs.some((run) =>
            [run.from, run.to].some((point) => Math.hypot(point[0] - x - side, point[1] - z) < 1e-6),
          ),
        ).toBe(true);
    }
    expect(JSON.stringify(data)).toBe(before);
  });
  it('usa no máximo três lotes GPU por conjunto, reduz as grades proporcionalmente e libera só recursos próprios', () => {
    const runs = createVisitorFenceRuns(OFFICIAL_REFERENCE_DATA.entities);
    const detailed = createVisitorFenceParts(runs),
      coarse = createVisitorFenceParts(runs, true);
    expect(coarse.length).toBeLessThan(detailed.length);
    const result = buildGrilleBatches(detailed),
      other = buildGrilleBatches(coarse);
    expect(result.batches.length).toBeLessThanOrEqual(3);
    expect(detailed.length * 12).toBeLessThan(16000);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObjects(result.batches)).toEqual([]);
    let disposed = 0;
    result.batches[0].geometry.addEventListener('dispose', () => disposed++);
    result.dispose();
    expect(disposed).toBe(1);
    expect(other.batches[0].geometry).not.toBe(result.batches[0].geometry);
    other.dispose();
  });
});
