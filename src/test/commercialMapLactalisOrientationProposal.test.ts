import { describe, expect, it } from 'vitest';
import { lactalisAudienceOrientationProposal } from '@/features/commercial-map/utils/lactalisOrientationProposal';
import { LACTALIS_STAGE_LAYOUT } from '@/features/commercial-map/utils/lactalisStage';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import { commercialSitePolygonInteriorsOverlap } from '@/features/commercial-map/utils/commercialSiteEnvironment';

describe('Lactalis requested orientation: feasibility before changing dimensions', () => {
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
  it('reports the incompatible footprint constraints instead of silently moving or shrinking B13', () => {
    const p = lactalisAudienceOrientationProposal();
    expect(p.collisions).toEqual(['RUA-URUGUAI-LESTE', 'B12']);
    expect(p.roadEncroachment).toBeGreaterThan(0.13);
    expect(p.proposedReductionPercent).toBeGreaterThan(12);
    expect(p.proposedReductionPercent).toBeLessThan(14);
    expect(p.status).toBe('AWAITING_USER_PLAN_SIZE_DECISION');
    expect(LACTALIS_STAGE_LAYOUT.facingRadians).toBe(0);
    for (const id of p.collisions) {
      const neighbor = OFFICIAL_REFERENCE_ENTITIES.find(
        (e) => e.publicIdentifier === id,
      )!;
      expect(
        commercialSitePolygonInteriorsOverlap(
          p.proposedFootprint,
          neighbor.geometry.coordinates[0],
        ),
      ).toBe(false);
    }
  });
});
