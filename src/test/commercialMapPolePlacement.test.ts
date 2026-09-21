import { describe, expect, it } from 'vitest';
import { COMMERCIAL_ELECTRICAL_NODES as nodes, COMMERCIAL_ELECTRICAL_CONNECTIONS as connections } from '@/features/commercial-map/data/electricalInfrastructure';
import { OFFICIAL_REFERENCE_DATA as data } from '@/features/commercial-map/data/officialReference2026';
import { complexWorldPolygon } from '@/features/commercial-map/data/fenasojaComplexReconstruction';
import { buildElectricalSceneLayout, buildElectricalWirePositions, resolveElectricalNodePlacements } from '@/features/commercial-map/utils/electricalInfrastructure';
import { buildElectricalPoleConstraints, ELECTRICAL_SOURCE_LOTS } from '@/features/commercial-map/utils/electricalPolePlacement';
import { closestPointOnSegment, distanceToPolygon, pointInPolygon } from '@/features/commercial-map/utils/spatialSurface';

const scene = buildElectricalSceneLayout(nodes, connections, data.entities, true);
const poles = scene.placements.filter(p => p.node.type === 'POLE');
const pole = (id: string) => poles.find(p => p.node.sourceMarkerId === `pole-ref-${id}`)!;
const entity = (id: string) => data.entities.find(e => e.publicIdentifier === id)!;

describe('registered pole placement against current rendered territory', () => {
  it('keeps every red source marker and transformer, with no unresolved pole', () => {
    expect(poles).toHaveLength(408);
    expect(scene.placements).toHaveLength(428);
    expect(poles.filter(p => !p.poleAudit?.resolved).map(p => p.node.sourceMarkerId)).toEqual([]);
    expect(new Set(poles.map(p => p.node.id)).size).toBe(408);
  });

  it('clears the complete shaft radius from all road surfaces and solid footprints', () => {
    const constraints = buildElectricalPoleConstraints(data.entities, true);
    for (const p of poles) for (const c of constraints) {
      expect(distanceToPolygon(p.renderPosition, c.polygon), `${p.node.sourceMarkerId}/${c.id}`)
        .toBeGreaterThanOrEqual(p.node.radius + c.margin - 0.0001);
    }
    // Independent cadastral containment check, including roads with no old offsets.
    for (const p of poles) for (const e of data.entities.filter(e => e.classification === 'ROAD')) {
      expect(pointInPolygon(p.renderPosition, e.geometry.coordinates[0]), `${p.node.sourceMarkerId}/${e.publicIdentifier}`).toBe(false);
    }
  });

  it('retains all 121 source parcel associations with the shaft inside the official ring', () => {
    expect(Object.keys(ELECTRICAL_SOURCE_LOTS)).toHaveLength(121);
    for (const p of poles.filter(p => p.poleAudit?.sourceLotIdentifier)) {
      const host = entity(p.poleAudit!.sourceLotIdentifier!);
      const ring = host.geometry.coordinates[0];
      expect(pointInPolygon(p.renderPosition, ring), p.node.sourceMarkerId).toBe(true);
      for (let i = 0; i < ring.length; i++) {
        const q = closestPointOnSegment(p.renderPosition, ring[i], ring[(i + 1) % ring.length]);
        expect(Math.hypot(q[0] - p.renderPosition[0], q[1] - p.renderPosition[1]), p.node.sourceMarkerId).toBeGreaterThan(p.node.radius);
      }
    }
  });

  it('places the Chile alignment inside the source lots instead of the asphalt', () => {
    expect(ELECTRICAL_SOURCE_LOTS['pole-ref-240']).toBe('Q-M-05');
    expect(ELECTRICAL_SOURCE_LOTS['pole-ref-241']).toBe('Q-M-01');
    for (const id of ['240', '241', '242', '243', '244', '245', '250', '253', '254']) {
      const p = pole(id);
      expect(pointInPolygon(p.renderPosition, entity(p.poleAudit!.sourceLotIdentifier!).geometry.coordinates[0])).toBe(true);
      expect(p.renderPosition[1]).toBeLessThan(p.node.position[1]);
    }
  });

  it('keeps both D4 facade poles on the original north side of Rua Bolivia', () => {
    for (const id of ['212', '217']) {
      const p = pole(id);
      const northEdge = Math.min(...entity('RUA-BOLIVIA').geometry.coordinates[0].map(v => v[1]));
      expect(p.renderPosition[1] + p.node.radius).toBeLessThan(northEdge);
      expect(distanceToPolygon(p.renderPosition, entity('D4').geometry.coordinates[0])).toBeGreaterThan(p.node.radius);
    }
  });

  it('does not move pole 084 onto RS-472 when clearing Ubiretama', () => {
    expect(pole('084').renderPosition[0]).toBeLessThan(pole('084').node.position[0]);
    expect(pointInPolygon(pole('084').renderPosition, entity('RUA-UBIRETAMA').geometry.coordinates[0])).toBe(false);
    expect(pointInPolygon(pole('084').renderPosition, entity('RODOVIA-RS-472').geometry.coordinates[0])).toBe(false);
  });

  it('checks both headquarters and stage roofs for pole 337', () => {
    for (const building of ['headquarters', 'stage'] as const) {
      expect(distanceToPolygon(pole('337').renderPosition, complexWorldPolygon(building, 'roofProjection'))).toBeGreaterThan(0.2749);
    }
  });

  it('supports poles on the ground rather than a nearby pavilion roof', () => {
    expect(pole('203').groundElevation).toBeLessThan(0.3);
    expect(poles.every(p => p.groundElevation > 0 && p.groundElevation < 0.3)).toBe(true);
  });

  it('does not rewrite commercial data, source anchors or inferred wire topology', () => {
    const before = JSON.stringify({ data, nodes, connections });
    const repeat = resolveElectricalNodePlacements([...nodes].reverse(), data.entities, true);
    const byId = new Map(repeat.map(p => [p.node.id, p]));
    for (const p of scene.placements) expect(byId.get(p.node.id)?.renderPosition).toEqual(p.renderPosition);
    expect(JSON.stringify({ data, nodes, connections })).toBe(before);
    expect(scene.placements.every(p => nodes.includes(p.node))).toBe(true);
  });

  it('shares wire attachment geometry without dropping conductors, segments or crossarms', () => {
    const shared = buildElectricalWirePositions(nodes, connections, data.entities, false, scene.placements, scene.crossarms);
    const separate = buildElectricalWirePositions(nodes, connections, data.entities, false, scene.placements);
    expect(shared).toEqual(separate);
    expect(scene.crossarms).toHaveLength(465);
    expect(shared.length).toBe(34020);
    expect([...shared].every(Number.isFinite)).toBe(true);
  });
});
