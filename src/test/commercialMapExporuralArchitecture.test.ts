import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  buildExporuralArchitecture,
  wallAroundOpenings,
} from '@/features/commercial-map/utils/exporuralArchitecture';
import {
  C4_CREW_COUNT,
  C4_SMOKE_COUNT,
  advanceC4Activity,
  c4RotorStep,
} from '@/features/commercial-map/utils/exporuralMotion';
import {
  EXPORURAL_STEAKHOUSE_LAYOUT,
  EXPORURAL_TURBINE_AXIS_REFERENCE,
  EXPORURAL_TURBINE_YAW,
  resolveExporuralSteakhouseDimensions,
} from '@/features/commercial-map/utils/exporuralSteakhouse';
const baseline = JSON.parse(
  readFileSync(
    'docs/screenshots/exporural-upgrade/before-desktop.json',
    'utf8',
  ),
).inventory;
const bounds = { width: 2.6181818181818244, depth: 2.4000000120481957 };

describe('C4 / E-06 architecture and selection activity', () => {
  it('preserves the complete approved official inventory and compound placement', () => {
    const prior = JSON.parse(readFileSync('docs/screenshots/soy-gate9/before-inventory.json', 'utf8')).entities;
    const originalE07 = { ...prior.find((e: { publicIdentifier: string }) => e.publicIdentifier === 'E-07') };
    delete originalE07.source;
    // Only the explicitly authorized September additions/restroom are excluded.
    const preserved = OFFICIAL_REFERENCE_ENTITIES.filter(e => !['RUA-MONTEVIDEU-COZINHA', 'RES-A9'].includes(e.publicIdentifier)).map(e => e.publicIdentifier === 'E-07' ? originalE07 : e);
    const hash = createHash('sha256')
      .update(JSON.stringify(preserved))
      .digest('hex');
    expect(hash).toBe(baseline.officialEntitiesSha256);
    expect(EXPORURAL_STEAKHOUSE_LAYOUT.mainBuilding).toEqual(
      baseline.layout.mainBuilding,
    );
    expect(EXPORURAL_STEAKHOUSE_LAYOUT.restroomAnnex).toEqual(
      baseline.layout.restroomAnnex,
    );
    expect(EXPORURAL_STEAKHOUSE_LAYOUT.windTurbine.offsetToFootprint).toEqual(
      baseline.layout.windTurbine.offsetToFootprint,
    );
    expect(resolveExporuralSteakhouseDimensions(bounds)).toEqual(
      baseline.dimensions,
    );
  });
  it('builds actual apertures, with conserved wall area and no solid piece across an opening', () => {
    const openings = [
      { center: -0.6, width: 0.4, bottom: 0, top: 0.8 },
      { center: 0.25, width: 0.3, bottom: 0.3, top: 0.7 },
    ];
    const parts = wallAroundOpenings(2, 1, openings);
    expect(
      parts.reduce((area, p) => area + p.width * (p.top - p.bottom), 0),
    ).toBeCloseTo(2 - 0.4 * 0.8 - 0.3 * 0.4, 8);
    for (const p of parts)
      for (const o of openings) {
        const overlapX =
          Math.min(p.center + p.width / 2, o.center + o.width / 2) -
          Math.max(p.center - p.width / 2, o.center - o.width / 2);
        const overlapY = Math.min(p.top, o.top) - Math.max(p.bottom, o.bottom);
        expect(Math.min(overlapX, overlapY)).toBeLessThanOrEqual(0.000001);
      }
  });
  it('keeps the same roof planes and openings in both detail levels, without overlapping north/south panels', () => {
    const a = buildExporuralArchitecture(bounds, false),
      b = buildExporuralArchitecture(bounds, true);
    expect(a.batches.wall).toEqual(b.batches.wall);
    expect(a.dimensions).toEqual(b.dimensions);
    expect(a.kitchen).toEqual(b.kitchen);
    const d = a.dimensions,
      cut = a.cutRoof[0],
      south = a.batches.trim[0];
    expect(cut.position[2] + cut.scale[2] / 2).toBeCloseTo(
      south.position[2] - south.scale[2] / 2,
      8,
    );
    for (const p of Object.values(b.batches).flat().concat(b.cutRoof)) {
      expect(p.scale.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
    }
    expect(a.kitchen.x).toBeGreaterThan(d.mainOffsetX - d.mainWidth / 2);
    expect(a.kitchen.x + 0.3).toBeLessThan(d.mainOffsetX + d.mainWidth / 2);
    expect(a.kitchen.z - 0.34).toBeGreaterThan(-d.mainDepth / 2);
    expect(a.kitchen.chimneyY).toBeGreaterThan(
      0.055 + d.mainWallHeight + d.mainRoofRise,
    );
  });
  it('uses the documented photo vector for yaw and keeps its rotor axis independent of blade phase', () => {
    const { tailPixel: t, hubPixel: h } = EXPORURAL_TURBINE_AXIS_REFERENCE;
    const direction = new THREE.Vector3(
      h[0] - t[0],
      0,
      h[1] - t[1],
    ).normalize();
    const yaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      EXPORURAL_TURBINE_YAW,
    );
    expect(
      new THREE.Vector3(0, 0, -1).applyQuaternion(yaw).distanceTo(direction),
    ).toBeLessThan(1e-10);
    for (const phase of [0, 0.4, 2.9]) {
      const blade = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        phase,
      );
      expect(
        new THREE.Vector3(0, 0, -1)
          .applyQuaternion(blade)
          .applyQuaternion(yaw)
          .distanceTo(direction),
      ).toBeLessThan(1e-10);
    }
  });
  it('runs the same moderate wind speed at 30, 60 and 120 frames per second', () => {
    const results = [30, 60, 120].map((fps) => {
      let time = 0,
        angle = 0;
      for (let i = 0; i < fps * 30; i++) {
        const step = c4RotorStep(time, 1 / fps);
        time = step.time;
        angle += step.angle;
      }
      return angle;
    });
    expect(results[0]).toBeCloseTo(results[1], 8);
    expect(results[1]).toBeCloseTo(results[2], 8);
    expect(results[0] / 30).toBeGreaterThan(0.3);
    expect(results[0] / 30).toBeLessThan(0.38);
  });
  it('converges to a fully idle state after rapid and repeated selections', () => {
    let amount = 0;
    for (let cycle = 0; cycle < 100; cycle++) {
      for (let i = 0; i < 11; i++)
        amount = advanceC4Activity(amount, true, 1 / 60);
      for (let i = 0; i < 2; i++)
        amount = advanceC4Activity(amount, false, 1 / 60);
    }
    for (let i = 0; i < 60; i++)
      amount = advanceC4Activity(amount, false, 1 / 60);
    expect(amount).toBe(0);
    for (let i = 0; i < 60; i++)
      amount = advanceC4Activity(amount, true, 1 / 60);
    expect(amount).toBe(1);
    expect(C4_CREW_COUNT).toBe(3);
    expect(C4_SMOKE_COUNT).toBe(8);
  });
});
