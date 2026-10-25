import { describe, expect, it } from 'vitest';
import replay from '../../scripts/exporural/official-2026-10-20/replay-data.json';
import type { CommercialLot, MapEntity } from '@/features/commercial-map/types';
import { COMMERCIAL_MAP_TREES } from '@/features/commercial-map/data/commercialTrees';
import { COMMERCIAL_ELECTRICAL_NODES, COMMERCIAL_ELECTRICAL_CONNECTIONS } from '@/features/commercial-map/data/electricalInfrastructure';
import { EXPORURAL_SCENE_CORRECTIONS, exporuralTransformerSupportPosition } from '@/features/commercial-map/data/exporuralSceneCorrections';
import { presentExporuralElectricalInfrastructure } from '@/features/commercial-map/data/electricalPresentation';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { pointInPolygon } from '@/features/commercial-map/utils/spatialSurface';
import { commercialTreeGroundElevation, selectCommercialTreesForScene } from '@/features/commercial-map/utils/treeLayer';
import { buildElectricalSceneLayout, buildElectricalWirePositions } from '@/features/commercial-map/utils/electricalInfrastructure';

const entities = replay.after.entities as unknown as MapEntity[];
const lots = replay.after.lots as unknown as CommercialLot[];
const correction = EXPORURAL_SCENE_CORRECTIONS;
const presented = () => presentExporuralElectricalInfrastructure(COMMERCIAL_ELECTRICAL_NODES, COMMERCIAL_ELECTRICAL_CONNECTIONS, entities);

describe('October 25 presentation against persisted October ExpoRural parcels', () => {
  it('registers one R/01 trunk inside the actual lot, aligned across Gustavo Bessel', () => {
    const trees = COMMERCIAL_MAP_TREES.filter(tree => tree.id === correction.tree.id);
    expect(trees).toHaveLength(1);
    const tree = trees[0], host = entities.find(e => e.publicIdentifier === 'Q-R-01')!;
    expect(pointInPolygon(tree.position, host.geometry.coordinates[0])).toBe(true);
    expect(tree.position[0]).toBe(correction.tree.alignmentMarkerPosition[0]);
    expect(tree.position[0]).toBeLessThan(9);
    expect(tree.position[1]).toBeLessThan(-18.5);
    expect(commercialTreeGroundElevation(tree, entities)).toBeCloseTo(.134);
    expect(commercialTreeGroundElevation(tree, [{ ...host, geometry: { ...host.geometry, elevation: .2, extrusionHeight: .3 } }])).toBeCloseTo(.504);
    expect(lots.find(l => l.publicIdentifier === 'Q-R-01')!.officialAreaSqm).toBe(896.85);
    expect(selectCommercialTreesForScene([host], lots.filter(l => l.entityId === host.id))).toContain(tree);
    expect(selectCommercialTreesForScene([], [])).not.toContain(tree);
    expect(tree.quadra).toBeNull();
  });

  it('contains the full special assembly in Q-R-34 and preserves the original source records', () => {
    const graph = presented();
    const host = entities.find(e => e.publicIdentifier === 'Q-R-34')!;
    for (const point of correction.transformer.envelope) expect(pointInPolygon(point, host.geometry.coordinates[0])).toBe(true);
    expect(graph.nodes.filter(n => n.presentationAssembly)).toHaveLength(2);
    expect(graph.nodes.some(n => n.sourceMarkerId === 'pole-ref-136')).toBe(false);
    for (const node of graph.nodes.filter(n => n.presentationAssembly)) {
      const source = COMMERCIAL_ELECTRICAL_NODES.find(n => n.id === node.id)!;
      expect(node.position).toBe(source.position);
      expect(source.presentationAssembly).toBeUndefined();
    }
    const layout = buildElectricalSceneLayout(graph.nodes, graph.connections, entities);
    for (const role of ['LEFT', 'RIGHT'] as const) {
      const placement = layout.placements.find(p => p.node.presentationAssembly?.role === role)!;
      expect(placement.renderPosition).toEqual(exporuralTransformerSupportPosition(role));
      expect(placement.groundElevation).toBeCloseTo(.036);
    }
    const original38 = COMMERCIAL_ELECTRICAL_NODES.find(n => n.sourceMarkerId === 'pole-ref-138')!;
    expect(graph.nodes.find(n => n.id === original38.id)).toBe(original38);
    const placement38 = layout.placements.find(p => p.node.id === original38.id)!;
    expect(pointInPolygon(placement38.renderPosition, entities.find(e => e.publicIdentifier === 'Q-R-38')!.geometry.coordinates[0])).toBe(true);
  });

  it('rewires only the removed terminal, has no orphan wires, and leaves other circuits unchanged', () => {
    const graph = presented(), ids = new Set(graph.nodes.map(n => n.id));
    for (const connection of graph.connections) {
      expect(ids.has(connection.fromNodeId)).toBe(true);
      expect(ids.has(connection.toNodeId)).toBe(true);
      expect(connection.fromNodeId).not.toBe(connection.toNodeId);
      expect([connection.fromNodeId, connection.toNodeId]).not.toContain('electrical-pole-ref-136');
    }
    const affected = (edge: typeof graph.connections[number]) => [edge.fromNodeId, edge.toNodeId].includes('electrical-pole-ref-136');
    for (const original of COMMERCIAL_ELECTRICAL_CONNECTIONS.filter(edge => !affected(edge))) {
      expect(graph.connections.find(edge => edge.id === original.id)).toEqual(original);
    }
    expect(graph.connections.find(edge => edge.id === 'electrical-connection-139:exporural-2026-10-25')).toMatchObject({
      fromNodeId: 'electrical-pole-ref-135', toNodeId: 'electrical-pole-ref-138',
    });
    const layout = buildElectricalSceneLayout(graph.nodes, graph.connections, entities);
    const wires = buildElectricalWirePositions(graph.nodes, graph.connections, entities, false, layout.placements, layout.crossarms);
    expect(wires.length).toBeGreaterThan(0); expect(wires.every(Number.isFinite)).toBe(true);
  });

  it('does not activate the correction on stale geometry or unrelated scopes and never mutates commercial rows', () => {
    const snapshot = JSON.stringify({ entities, lots, nodes: COMMERCIAL_ELECTRICAL_NODES, connections: COMMERCIAL_ELECTRICAL_CONNECTIONS });
    presented();
    expect(JSON.stringify({ entities, lots, nodes: COMMERCIAL_ELECTRICAL_NODES, connections: COMMERCIAL_ELECTRICAL_CONNECTIONS })).toBe(snapshot);
    const stale = presentExporuralElectricalInfrastructure(COMMERCIAL_ELECTRICAL_NODES, COMMERCIAL_ELECTRICAL_CONNECTIONS, OFFICIAL_REFERENCE_DATA.entities);
    expect(stale.nodes).toEqual(COMMERCIAL_ELECTRICAL_NODES);
    expect(stale.connections).toEqual(COMMERCIAL_ELECTRICAL_CONNECTIONS);
  });
});
