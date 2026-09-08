import { describe, expect, it } from 'vitest';
import { lactalisAudienceOrientationProposal } from '@/features/commercial-map/utils/lactalisOrientationProposal';
import { LACTALIS_STAGE_LAYOUT } from '@/features/commercial-map/utils/lactalisStage';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import { commercialSitePolygonInteriorsOverlap } from '@/features/commercial-map/utils/commercialSiteEnvironment';
import persistedLayout from './fixtures/soyGatePersistedLayout.json';
import type { Coordinate } from '@/features/commercial-map/types';

describe('Lactalis approved orientation and plan containment', () => {
  it('uses the actual older Cloud anchor without moving it to the local reference', () => {
    const entities = OFFICIAL_REFERENCE_ENTITIES.map((entity) => {
      const row = persistedLayout[entity.publicIdentifier as keyof typeof persistedLayout];
      return row ? { ...entity, geometry: { ...entity.geometry, coordinates: row.geometry.coordinates as Coordinate[][] } } : entity;
    });
    const before = JSON.stringify(entities);
    const report = lactalisAudienceOrientationProposal(entities);
    expect(report.center[0]).toBeCloseTo(16.18909090909091, 10);
    expect(report.center[1]).toBeCloseTo(13.09090915662651, 10);
    expect(report.yaw).toBeCloseTo(report.expectedYaw, 12);
    expect(report.collisions).toEqual([]);
    expect(report.planScale).toBeGreaterThan(0.65);
    expect(report.planScale).toBeLessThan(0.9);
    for (const lot of report.lots) {
      const dx = lot.center[0] - report.center[0], dz = lot.center[1] - report.center[1];
      expect((dx * report.frontVector[0] + dz * report.frontVector[1]) / Math.hypot(dx, dz)).toBeGreaterThan(0.94);
    }
    expect(JSON.stringify(entities)).toBe(before);
  });
  it('resolves D11/D12, calculates the local +Z rotation and faces both lots', () => {
    const p = lactalisAudienceOrientationProposal();
    expect(p.lots.map((l) => l.publicIdentifier)).toEqual(['Q-D-11', 'Q-D-12']);
    expect(p.degrees).toBeCloseTo(-78.29694092855645, 8);
    for (const lot of p.lots) {
      const dx = lot.center[0] - p.center[0],
        dz = lot.center[1] - p.center[1];
      expect(
        (dx * p.frontVector[0] + dz * p.frontVector[1]) / Math.hypot(dx, dz),
      ).toBeGreaterThan(0.96);
    }
  });
  it('applies only the approved plan reduction and clears the road and headquarters', () => {
    const p = lactalisAudienceOrientationProposal();
    expect(p.collisions).toEqual([]);
    expect(p.reductionPercent).toBeGreaterThan(12);
    expect(p.reductionPercent).toBeLessThan(14);
    expect(p.status).toBe('APPLIED_USER_APPROVED_PLAN_REDUCTION');
    expect(p.yaw).toBeCloseTo(p.expectedYaw, 12);
    expect(LACTALIS_STAGE_LAYOUT.facingRadians).toBeCloseTo(p.yaw, 12);
    for (const id of ['RUA-URUGUAI-LESTE', 'B12']) {
      const neighbor = OFFICIAL_REFERENCE_ENTITIES.find(
        (e) => e.publicIdentifier === id,
      )!;
      expect(
        commercialSitePolygonInteriorsOverlap(
          p.footprint,
          neighbor.geometry.coordinates[0],
        ),
      ).toBe(false);
    }
  });
});
