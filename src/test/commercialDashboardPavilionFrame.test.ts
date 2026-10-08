import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { buildCommercialDashboardSnapshot } from '@/features/commercial-map/dashboard/commercialDashboardAnalytics';
import { buildDashboardPavilionGeometry } from '@/features/commercial-map/dashboard/commercialDashboardPavilionGeometry';
import { COMMERCIAL_PAVILION_MODULE_PLANS } from '@/features/commercial-map/utils/commercialPavilionModules';
import type { CommercialPavilionDashboardSnapshot } from '@/features/commercial-map/dashboard/commercialDashboardTypes';
import type { Coordinate, MapEntity } from '@/features/commercial-map/types';
import { createDashboardPersistedPavilionFixture, dashboardPersistedPavilionFrame } from './helpers/dashboardPersistedPavilionFixture';

const seed = buildCommercialDashboardSnapshot(OFFICIAL_REFERENCE_DATA);
const persistedData = createDashboardPersistedPavilionFixture();
const persisted = buildCommercialDashboardSnapshot(persistedData);
const pavilion = (id: string, source = persisted) => source.pavilions.find(({ definition }) => definition.publicIdentifier === id)!;
const hall = (geometry: ReturnType<typeof buildDashboardPavilionGeometry>) => geometry.outlines.find(({ kind }) => kind === 'pavilion')!;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const assertFallback = (snapshot: CommercialPavilionDashboardSnapshot) => {
  const result = buildDashboardPavilionGeometry(snapshot);
  expect(result.records).toHaveLength(snapshot.records.length);
  expect(result.records.map(({ entity }) => entity.id).sort()).toEqual(snapshot.records.map(({ entity }) => entity.id).sort());
  expect(result.outlines).toEqual([]);
  expect(result.accesses).toEqual([]);
  expect(result.contentEnvelope).toBeUndefined();
  expect(result.pending.join(' ')).toContain('referência não pôde ser reconciliada');
  return result;
};

function transformRecord(entity: MapEntity, transform: (point: Coordinate) => Coordinate): MapEntity {
  return { ...entity, geometry: { ...entity.geometry, coordinates: entity.geometry.coordinates.map((ring) => ring.map(transform)) },
    metadata: { ...entity.metadata, labelAnchor: transform(entity.metadata.labelAnchor as Coordinate) } };
}

describe('dashboard references reconciled with loaded pavilion coordinates', () => {
  it.each(['B4', 'B5'] as const)('aligns %s with the independently reproduced SQL frame, moving only references', (id) => {
    const snapshot = pavilion(id);
    const before = JSON.stringify(snapshot);
    const result = buildDashboardPavilionGeometry(snapshot);
    const seeded = buildDashboardPavilionGeometry(pavilion(id, seed));
    const frame = dashboardPersistedPavilionFrame(snapshot.entity!, id);
    expect(result.pending).toEqual([]);
    expect(result.records).toHaveLength(snapshot.totalLots);
    const expected = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => frame.project([u, v]));
    hall(result).coordinates[0].forEach(([x, z], index) => {
      expect(x).toBeCloseTo(expected[index][0], 10);
      expect(z).toBeCloseTo(expected[index][1], 10);
    });
    result.outlines.forEach((outline, index) => outline.coordinates[0].forEach(([x, z], pointIndex) => {
      expect(x).toBeCloseTo(seeded.outlines[index].coordinates[0][pointIndex][0], 10);
      expect(z - seeded.outlines[index].coordinates[0][pointIndex][1]).toBeCloseTo(frame.slack, 10);
    }));
    result.accesses.forEach((access, index) => {
      expect(access.id).toBe(seeded.accesses[index].id);
      expect(access.position[0]).toBeCloseTo(seeded.accesses[index].position[0], 10);
      expect(access.position[1] - seeded.accesses[index].position[1]).toBeCloseTo(frame.slack, 10);
      expect(access.outward).toEqual(seeded.accesses[index].outward);
    });
    expect(result.contentEnvelope!.minY - seeded.contentEnvelope!.minY).toBeCloseTo(frame.slack, 10);
    expect(result.contentEnvelope!.maxY - seeded.contentEnvelope!.maxY).toBeCloseTo(frame.slack, 10);
    const outlinePoints = hall(result).coordinates[0];
    const xs = outlinePoints.map(([x]) => x), zs = outlinePoints.map(([, z]) => z);
    for (const { entity } of result.records) for (const [x, z] of entity.geometry.coordinates[0]) {
      expect(x).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-9);
      expect(x).toBeLessThanOrEqual(Math.max(...xs) + 1e-9);
      expect(z).toBeGreaterThanOrEqual(Math.min(...zs) - 1e-9);
      expect(z).toBeLessThanOrEqual(Math.max(...zs) + 1e-9);
    }
    expect(JSON.stringify(snapshot)).toBe(before);
    result.records.forEach((record) => expect(record).toBe(snapshot.records.find(({ lot }) => lot.id === record.lot.id)));
  });

  it('retains the P8 support wing and five official accesses inside the reconciled content envelope', () => {
    const result = buildDashboardPavilionGeometry(pavilion('B4'));
    expect(result.accesses).toHaveLength(5);
    const supports = result.outlines.filter(({ kind }) => kind === 'support');
    expect(supports.map(({ label }) => label)).toEqual(['Sanitários', 'Cozinha', 'Apoio de serviço']);
    for (const support of supports) for (const [x, z] of support.coordinates[0]) {
      expect(x).toBeGreaterThanOrEqual(result.contentEnvelope!.minX - 1e-9);
      expect(x).toBeLessThanOrEqual(result.contentEnvelope!.maxX + 1e-9);
      expect(z).toBeGreaterThanOrEqual(result.contentEnvelope!.minY - 1e-9);
      expect(z).toBeLessThanOrEqual(result.contentEnvelope!.maxY + 1e-9);
    }
    expect(result.records).toHaveLength(114);
  });

  it('uses P13 persisted normalized polygons when the central revision differs from current static cells', () => {
    const snapshot = pavilion('B5');
    const currentCell = COMMERCIAL_PAVILION_MODULE_PLANS.B5.cells.find(({ number }) => number === 27)!;
    const loaded = snapshot.records.find(({ entity }) => entity.metadata.pavilionModuleKey === currentCell.id)!;
    const normalized = loaded.entity.metadata.normalizedFootprintPolygon as Coordinate[];
    expect(Math.min(...normalized.map(([, z]) => z)) * 37.8).toBeCloseTo(6);
    expect((currentCell.centerZ - currentCell.depth / 2) * 37.8).toBeCloseTo(8.9);
    const result = buildDashboardPavilionGeometry(snapshot);
    expect(result.pending).toEqual([]);
    expect(result.records).toHaveLength(104);
    for (const number of [25, 26, 79, 80, 104]) {
      const key = `B5:module:${String(number).padStart(3, '0')}`;
      const record = result.records.find(({ entity }) => entity.metadata.pavilionModuleKey === key)!;
      expect(record.entity).toBe(snapshot.records.find(({ entity }) => entity.metadata.pavilionModuleKey === key)!.entity);
    }
  });

  it('keeps a valid zero translation in the seed and leaves the other six pavilion outputs unchanged', () => {
    for (const id of ['B4', 'B5']) expect(buildDashboardPavilionGeometry(pavilion(id, seed)).pending).toEqual([]);
    for (const snapshot of seed.pavilions.filter(({ definition }) => definition.publicIdentifier !== 'B4' && definition.publicIdentifier !== 'B5')) {
      const other = pavilion(snapshot.definition.publicIdentifier);
      expect(other.records.map(({ entity }) => entity)).toEqual(snapshot.records.map(({ entity }) => entity));
      expect(buildDashboardPavilionGeometry(other)).toEqual(buildDashboardPavilionGeometry(snapshot));
      for (const record of other.records) expect(record.entity).toBe(OFFICIAL_REFERENCE_DATA.entities.find(({ id }) => id === record.entity.id));
    }
    expect(persistedData.lots).toBe(OFFICIAL_REFERENCE_DATA.lots);
  });

  it.each(['normalizedFootprintPolygon', 'normalizedLabelAnchor', 'labelAnchor'])('uses a safe fallback when %s is absent', (field) => {
    const snapshot = clone(pavilion('B4'));
    delete snapshot.records[0].entity.metadata[field];
    assertFallback(snapshot);
  });

  it('rejects duplicate and unknown module keys without hiding any cadastral record', () => {
    const duplicate = clone(pavilion('B5'));
    duplicate.records[1].entity.metadata.pavilionModuleKey = duplicate.records[0].entity.metadata.pavilionModuleKey;
    assertFallback(duplicate);
    const unknown = clone(pavilion('B5'));
    unknown.records[0].entity.metadata.pavilionModuleKey = 'B5:module:unknown';
    assertFallback(unknown);
  });

  it.each(['scale', 'rotation'] as const)('rejects a %s discrepancy instead of transforming commercial polygons', (change) => {
    const original = pavilion('B4');
    const center = dashboardPersistedPavilionFrame(original.entity!, 'B4');
    const snapshot = { ...original, records: original.records.map((record) => ({ ...record,
      entity: transformRecord(record.entity, ([x, z]) => {
        const dx = x - center.centerX, dz = z - center.centerZ;
        return change === 'scale' ? [center.centerX + dx * 1.05, center.centerZ + dz * 1.05]
          : [center.centerX + dx * Math.cos(.2) + dz * Math.sin(.2), center.centerZ - dx * Math.sin(.2) + dz * Math.cos(.2)];
      }),
    })) };
    const before = JSON.stringify(snapshot);
    assertFallback(snapshot);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it.each(['scale', 'rotation'] as const)('rejects a %s discrepancy even when persisted normalized metadata agrees with it', (change) => {
    const original = pavilion('B5');
    const frame = dashboardPersistedPavilionFrame(original.entity!, 'B5');
    const snapshot = { ...original, records: original.records.map((record) => {
      const source = record.entity.metadata.normalizedFootprintPolygon as Coordinate[];
      const anchor = record.entity.metadata.normalizedLabelAnchor as Coordinate;
      const transform = ([x, z]: Coordinate): Coordinate => {
        const dx = x - anchor[0], dz = z - anchor[1];
        return change === 'scale' ? [anchor[0] + dx * .95, anchor[1] + dz * .95]
          : [anchor[0] + dx * Math.cos(.15) + dz * Math.sin(.15), anchor[1] - dx * Math.sin(.15) + dz * Math.cos(.15)];
      };
      const normalized = source.map(transform);
      return { ...record, entity: { ...record.entity,
        geometry: { ...record.entity.geometry, coordinates: [normalized.map(frame.project)] },
        metadata: { ...record.entity.metadata, normalizedFootprintPolygon: normalized,
          normalizedLabelAnchor: anchor, labelAnchor: frame.project(anchor) },
      } };
    }) };
    assertFallback(snapshot);
  });

  it('rejects a per-module translation, invalid anchors, and stale revision metadata', () => {
    const original = pavilion('B5');
    const inconsistent = { ...original, records: original.records.map((record, index) => index ? record : {
      ...record, entity: transformRecord(record.entity, ([x, z]) => [x, z + .08]),
    }) };
    assertFallback(inconsistent);
    const invalid = clone(original);
    invalid.records[0].entity.metadata.normalizedLabelAnchor = [Number.NaN, .5];
    assertFallback(invalid);
    const stale = clone(original);
    const module = stale.records.find(({ entity }) => entity.metadata.pavilionModuleKey === 'B5:module:027')!;
    const seedModule = pavilion('B5', seed).records.find(({ entity }) => entity.metadata.pavilionModuleKey === 'B5:module:027')!;
    module.entity.metadata.normalizedFootprintPolygon = seedModule.entity.metadata.normalizedFootprintPolygon;
    module.entity.metadata.normalizedLabelAnchor = seedModule.entity.metadata.normalizedLabelAnchor;
    assertFallback(stale);
  });

  it('requires structural anchor coverage rather than a fixed inventory count', () => {
    const original = pavilion('B4');
    assertFallback({ ...original, records: original.records.slice(0, 2) });
    assertFallback({ ...original, records: original.records.filter(({ entity }) => ['001', '002', '003'].some((n) => entity.metadata.pavilionModuleKey === `B4:module:${n}`)) });
    const sparse = { ...original, records: original.records.filter(({ entity }) => ['001', '026', '114'].some((n) => entity.metadata.pavilionModuleKey === `B4:module:${n}`)) };
    expect(buildDashboardPavilionGeometry(sparse).pending).toEqual([]);
    expect(buildDashboardPavilionGeometry(sparse).records).toHaveLength(3);
  });

  it('accepts harmless persisted coordinate rounding and cyclic/reversed ring order', () => {
    const original = pavilion('B5');
    const snapshot = { ...original, records: original.records.map((record) => {
      const entity = transformRecord(record.entity, ([x, z]) => [Number(x.toFixed(6)), Number(z.toFixed(6))]);
      const ring = entity.geometry.coordinates[0].slice(0, -1).reverse();
      const reordered = [...ring.slice(1), ring[0]];
      return { ...record, entity: { ...entity, geometry: { ...entity.geometry, coordinates: [[...reordered, reordered[0]]] } } };
    }) };
    expect(buildDashboardPavilionGeometry(snapshot).pending).toEqual([]);
  });
});
