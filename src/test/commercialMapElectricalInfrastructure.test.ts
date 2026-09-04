import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_ELECTRICAL_ALIGNMENT_CHAINS,
  COMMERCIAL_ELECTRICAL_CONNECTIONS,
  COMMERCIAL_ELECTRICAL_NODES,
  COMMERCIAL_ELECTRICAL_POLES,
  COMMERCIAL_ELECTRICAL_TRANSFORMERS,
  ELECTRICAL_INFRASTRUCTURE_REFERENCE,
  electricalPlanPointToOfficialPdf,
  electricalPlanPointToWorldXZ,
} from '@/features/commercial-map/data/electricalInfrastructure';
import {
  ELECTRICAL_ARCHITECTURE_CLEARANCE_PRESENTATION,
  PARK_ACCESS_ELECTRICAL_CLEARANCE_PRESENTATION,
} from '@/features/commercial-map/data/electricalPresentation';
import {
  GATE_FOUR_DISTRICT_LAYOUT,
  resolveGateFourInteractionFootprint,
} from '@/features/commercial-map/data/gateFourDistrict';
import { COMMERCIAL_MAP_SEGMENT_IDS } from '@/features/commercial-map/data/commercialMapSegments';
import {
  OFFICIAL_REFERENCE_DATA,
  officialPdfPointToLocal,
} from '@/features/commercial-map/data/officialReference2026';
import { PARK_ACCESS_SPATIAL_PLAN } from '@/features/commercial-map/data/parkAccessSpatialPlan';
import {
  buildElectricalPoleCrossarmLayouts,
  buildElectricalWirePositions,
  ELECTRICAL_WIRE_CONDUCTOR_SPACING,
  ELECTRICAL_WIRE_SAMPLES,
  ELECTRICAL_WIRE_STRUCTURE_CLEARANCE,
  electricalInfrastructureInstanceBudget,
  resolveElectricalNodePlacements,
  selectCommercialElectricalInfrastructureForScene,
} from '@/features/commercial-map/utils/electricalInfrastructure';
import { scopeCommercialMapData } from '@/features/commercial-map/utils/areaScope';
import { strategicLandmarkBounds, strategicLandmarkVisualHeight } from '@/features/commercial-map/utils/landmarks';
import {
  distanceToEntity,
  distanceToPolygon,
  pointInPolygon,
} from '@/features/commercial-map/utils/spatialSurface';

const nodeById = new Map(COMMERCIAL_ELECTRICAL_NODES.map((node) => [node.id, node]));

function properConnectionIntersection(
  left: (typeof COMMERCIAL_ELECTRICAL_CONNECTIONS)[number],
  right: (typeof COMMERCIAL_ELECTRICAL_CONNECTIONS)[number],
) {
  const sharedEndpoint = [left.fromNodeId, left.toNodeId]
    .some((nodeId) => nodeId === right.fromNodeId || nodeId === right.toNodeId);
  if (sharedEndpoint) return false;
  const a = nodeById.get(left.fromNodeId)!.sourcePagePosition;
  const b = nodeById.get(left.toNodeId)!.sourcePagePosition;
  const c = nodeById.get(right.fromNodeId)!.sourcePagePosition;
  const d = nodeById.get(right.toNodeId)!.sourcePagePosition;
  const orientation = (
    start: readonly [number, number],
    end: readonly [number, number],
    point: readonly [number, number],
  ) => (end[0] - start[0]) * (point[1] - start[1])
    - (end[1] - start[1]) * (point[0] - start[0]);
  return orientation(a, b, c) * orientation(a, b, d) < -1e-7
    && orientation(c, d, a) * orientation(c, d, b) < -1e-7;
}

describe('infraestrutura elétrica cartográfica do Mapa Comercial', () => {
  it('preserva exatamente os 408 marcadores vermelhos e os 20 marcadores verdes extraídos do PDF', () => {
    expect(ELECTRICAL_INFRASTRUCTURE_REFERENCE.revision).toBe('2026.08.23.3');
    expect(COMMERCIAL_ELECTRICAL_POLES).toHaveLength(408);
    expect(COMMERCIAL_ELECTRICAL_TRANSFORMERS).toHaveLength(20);
    expect(COMMERCIAL_ELECTRICAL_NODES).toHaveLength(428);
    expect(new Set(COMMERCIAL_ELECTRICAL_NODES.map((node) => node.id))).toHaveLength(428);
    expect(new Set(COMMERCIAL_ELECTRICAL_NODES.map((node) => node.sourceMarkerId))).toHaveLength(428);
    expect(COMMERCIAL_ELECTRICAL_POLES.every((pole) => pole.sourceVectorPathCount === 16)).toBe(true);
    expect(COMMERCIAL_ELECTRICAL_POLES.reduce((total, pole) => total + pole.sourceVectorPathCount, 0))
      .toBe(6528);
    expect(COMMERCIAL_ELECTRICAL_TRANSFORMERS.reduce(
      (total, transformer) => total + transformer.sourceVectorPathCount,
      0,
    )).toBe(48);
  });

  it('mantém separados os pares próximos que a inspeção raster fundiria', () => {
    const candidates = ELECTRICAL_INFRASTRUCTURE_REFERENCE.extraction.rasterMergeCandidates;
    expect(candidates).toHaveLength(3);
    candidates.forEach(({ ids, separationPdfPoints }) => {
      const left = COMMERCIAL_ELECTRICAL_NODES.find((node) => node.sourceMarkerId === ids[0]);
      const right = COMMERCIAL_ELECTRICAL_NODES.find((node) => node.sourceMarkerId === ids[1]);
      expect(left, ids[0]).toBeDefined();
      expect(right, ids[1]).toBeDefined();
      expect(Math.hypot(
        right!.sourcePagePosition[0] - left!.sourcePagePosition[0],
        right!.sourcePagePosition[1] - left!.sourcePagePosition[1],
      )).toBeCloseTo(separationPdfPoints, 5);
      expect(left!.position).not.toEqual(right!.position);
    });
  });

  it('mantém a associação estável de IDs nos quatro grupos com empate de ordenação espacial', () => {
    const expectedByMarkerId = {
      'pole-ref-012': [803.880005, 113.375],
      'pole-ref-013': [745.199982, 113.390015],
      'pole-ref-014': [774.47998, 113.375],
      'pole-ref-132': [754.169983, 284.900024],
      'pole-ref-133': [811.22998, 284.88501],
      'pole-ref-205': [369.599991, 376.790009],
      'pole-ref-206': [522.539978, 376.775009],
      'pole-ref-252': [409.919983, 422.480011],
      'pole-ref-253': [481.529984, 422.480011],
      'pole-ref-254': [517.169983, 422.465012],
    } as const;
    Object.entries(expectedByMarkerId).forEach(([sourceMarkerId, sourcePagePosition]) => {
      expect(COMMERCIAL_ELECTRICAL_POLES.find((pole) => pole.sourceMarkerId === sourceMarkerId)?.sourcePagePosition)
        .toEqual(sourcePagePosition);
    });
  });

  it('transfere ponto a ponto pelo registro afim auditável da planta A3 para a base oficial', () => {
    expect(COMMERCIAL_ELECTRICAL_POLES[0].position).toEqual([-1.650873, -44.556539]);
    expect(COMMERCIAL_ELECTRICAL_TRANSFORMERS[0].position).toEqual([-35.692533, -24.899901]);
    COMMERCIAL_ELECTRICAL_NODES.forEach((node) => {
      expect(node.position, node.id).toEqual(electricalPlanPointToWorldXZ(node.sourcePagePosition));
      expect(node.sourceOfficialReferencePosition, node.id)
        .toEqual(electricalPlanPointToOfficialPdf(node.sourcePagePosition));
      const canonical = officialPdfPointToLocal(node.sourceOfficialReferencePosition);
      expect(node.position[0], node.id).toBeCloseTo(canonical[0], 4);
      expect(node.position[1], node.id).toBeCloseTo(canonical[1], 4);
      expect(node.sourcePagePosition[0], node.id).toBeGreaterThanOrEqual(0);
      expect(node.sourcePagePosition[0], node.id).toBeLessThanOrEqual(1191);
      expect(node.sourcePagePosition[1], node.id).toBeGreaterThanOrEqual(0);
      expect(node.sourcePagePosition[1], node.id).toBeLessThanOrEqual(842);
    });
    expect(ELECTRICAL_INFRASTRUCTURE_REFERENCE.calibration.diagnostics).toMatchObject({
      rotationDegrees: 0.0157,
      anisotropyPercent: 0.0156,
      pavilionB3CornerRmsWorldUnits: 0.119,
      quadraJCornerRmsWorldUnits: 0.251,
    });
  });

  it('classifica tudo como infraestrutura não comercial e fora de métricas, venda e seleção', () => {
    COMMERCIAL_ELECTRICAL_NODES.forEach((node) => {
      expect(['UTILITY_POLE', 'TRANSFORMER']).toContain(node.classification);
      expect(node.infrastructureClassification, node.id).toBe('NON_COMMERCIAL_INFRASTRUCTURE');
      expect(node.visibilityGroup, node.id).toBe('PARK_ENVIRONMENT');
      expect(node.isSellable, node.id).toBe(false);
      expect(node.contributesToCommercialMetrics, node.id).toBe(false);
      expect(node.height, node.id).toBeGreaterThan(0);
      expect(node.radius, node.id).toBeGreaterThan(0);
      expect(node.position.every(Number.isFinite), node.id).toBe(true);
    });
    const commercialEntityIds = new Set(OFFICIAL_REFERENCE_DATA.entities.map((entity) => entity.id));
    const commercialLotEntityIds = new Set(OFFICIAL_REFERENCE_DATA.lots.map((lot) => lot.entityId));
    COMMERCIAL_ELECTRICAL_NODES.forEach((node) => {
      expect(commercialEntityIds.has(node.id), node.id).toBe(false);
      expect(commercialLotEntityIds.has(node.id), node.id).toBe(false);
    });
  });

  it('gera apenas vãos curtos, canônicos e rastreáveis, sem cruzamentos arbitrários do parque', () => {
    expect(COMMERCIAL_ELECTRICAL_ALIGNMENT_CHAINS).toHaveLength(60);
    expect(COMMERCIAL_ELECTRICAL_ALIGNMENT_CHAINS.reduce(
      (total, [, , sourceMarkerIds]) => total + sourceMarkerIds.length - 1,
      0,
    )).toBe(335);
    expect(COMMERCIAL_ELECTRICAL_CONNECTIONS).toHaveLength(325);
    expect(COMMERCIAL_ELECTRICAL_CONNECTIONS.filter((connection) => (
      connection.kind === 'PRIMARY_ALIGNMENT'
    ))).toHaveLength(310);
    expect(COMMERCIAL_ELECTRICAL_CONNECTIONS.filter((connection) => (
      connection.kind === 'TRANSFORMER_SERVICE_DROP'
    ))).toHaveLength(15);
    expect(new Set(COMMERCIAL_ELECTRICAL_CONNECTIONS.map((connection) => connection.id))).toHaveLength(325);
    const endpointPairs = new Set<string>();
    COMMERCIAL_ELECTRICAL_CONNECTIONS.forEach((connection) => {
      const from = nodeById.get(connection.fromNodeId);
      const to = nodeById.get(connection.toNodeId);
      expect(from, connection.id).toBeDefined();
      expect(to, connection.id).toBeDefined();
      expect(connection.fromNodeId, connection.id).not.toBe(connection.toNodeId);
      expect(connection.fromNodeId.localeCompare(connection.toNodeId), connection.id).toBeLessThan(0);
      const pair = `${connection.fromNodeId}::${connection.toNodeId}`;
      expect(endpointPairs.has(pair), connection.id).toBe(false);
      endpointPairs.add(pair);
      const sourceSpan = Math.hypot(
        to!.sourcePagePosition[0] - from!.sourcePagePosition[0],
        to!.sourcePagePosition[1] - from!.sourcePagePosition[1],
      );
      expect(sourceSpan, connection.id).toBeLessThanOrEqual(
        connection.kind === 'PRIMARY_ALIGNMENT' ? 45.6 + 1e-6 : 50.4 + 1e-6,
      );
      expect(connection.conductorCount, connection.id)
        .toBe(connection.kind === 'PRIMARY_ALIGNMENT' ? 3 : 1);
      expect(connection.source, connection.id).toBe('INFERRED_FROM_OFFICIAL_MARKER_ALIGNMENT');
      if (connection.kind === 'PRIMARY_ALIGNMENT') {
        expect(connection.sourceAlignmentChainId, connection.id).toMatch(/^A[HV]-\d{3}$/);
      } else {
        expect(connection.sourceAlignmentChainId, connection.id).toBeNull();
      }
      expect(connection.topologyEvidence, connection.id).toBe(
        connection.kind === 'PRIMARY_ALIGNMENT'
          ? 'RECIPROCAL_NEAREST_COLLINEAR_ALIGNMENT'
          : 'TRANSFORMER_PROXIMITY',
      );
      expect(connection.sag, connection.id).toBeGreaterThanOrEqual(0.05);
      expect(connection.sag, connection.id).toBeLessThanOrEqual(0.22);
    });
    const primaryConnections = COMMERCIAL_ELECTRICAL_CONNECTIONS.filter((connection) => (
      connection.kind === 'PRIMARY_ALIGNMENT'
    ));
    primaryConnections.forEach((connection, index) => {
      primaryConnections.slice(index + 1).forEach((otherConnection) => {
        expect(properConnectionIntersection(connection, otherConnection), (
          `${connection.id} cruza ${otherConnection.id} sem um nó compartilhado`
        )).toBe(false);
      });
    });
    const actualSourcePairs = new Set(COMMERCIAL_ELECTRICAL_CONNECTIONS.map((connection) => (
      [nodeById.get(connection.fromNodeId)!.sourceMarkerId, nodeById.get(connection.toNodeId)!.sourceMarkerId]
        .sort()
        .join('::')
    )));
    ELECTRICAL_INFRASTRUCTURE_REFERENCE.topology.excludedObstructedPairs.forEach(({ sourceMarkerIds }) => {
      expect(actualSourcePairs.has([...sourceMarkerIds].sort().join('::'))).toBe(false);
    });
  });

  it('orienta cruzetas perpendicularmente às cadeias aceitas, incluindo trechos diagonais', () => {
    const placements = resolveElectricalNodePlacements(
      COMMERCIAL_ELECTRICAL_NODES,
      OFFICIAL_REFERENCE_DATA.entities,
    );
    const placementByNodeId = new Map(placements.map((placement) => [placement.node.id, placement]));
    const layouts = buildElectricalPoleCrossarmLayouts(
      COMMERCIAL_ELECTRICAL_NODES,
      COMMERCIAL_ELECTRICAL_CONNECTIONS,
      placements,
    );
    expect(layouts).toHaveLength(465);
    expect(new Set(layouts.map((layout) => layout.id))).toHaveLength(465);
    const layoutByPoleChain = new Map(layouts.map((layout) => [
      `${layout.nodeId}::${layout.sourceAlignmentChainId}`,
      layout,
    ]));
    let maximumRenderedMisalignment = 0;
    COMMERCIAL_ELECTRICAL_CONNECTIONS
      .filter((connection) => connection.kind === 'PRIMARY_ALIGNMENT')
      .forEach((connection) => {
        const from = placementByNodeId.get(connection.fromNodeId)!;
        const to = placementByNodeId.get(connection.toNodeId)!;
        const deltaX = to.renderPosition[0] - from.renderPosition[0];
        const deltaZ = to.renderPosition[1] - from.renderPosition[1];
        const span = Math.hypot(deltaX, deltaZ);
        [from, to].forEach((placement) => {
          const layout = layoutByPoleChain.get(`${placement.node.id}::${connection.sourceAlignmentChainId}`)!;
          const crossarmDotSpan = Math.abs(
            Math.cos(layout.rotationRadians) * deltaX / span
            - Math.sin(layout.rotationRadians) * deltaZ / span,
          );
          maximumRenderedMisalignment = Math.max(maximumRenderedMisalignment, crossarmDotSpan);
        });
      });
    // A single angle pole crossarm best-fits both adjoining spans after a facade
    // presentation is moved off a building. The limit below is 8.25 degrees.
    expect(maximumRenderedMisalignment).toBeLessThan(Math.sin(8.25 * Math.PI / 180));
  });

  it('apoia cada equipamento em uma superfície existente ou no piso técnico seguro', () => {
    const placements = resolveElectricalNodePlacements(
      COMMERCIAL_ELECTRICAL_NODES,
      OFFICIAL_REFERENCE_DATA.entities,
    );
    expect(placements).toHaveLength(428);
    placements.forEach((placement) => {
      expect(Number.isFinite(placement.groundElevation), placement.node.id).toBe(true);
      expect(placement.groundElevation, placement.node.id).toBeGreaterThan(0);
      expect(placement.groundElevation, placement.node.id).toBeLessThan(0.5);
      expect(placement.sourceAnchorPreserved, placement.node.id).toBe(true);
    });
    const expectedRaisedSupports = new Map([
      ['pole-ref-082', 0.186],
      ['pole-ref-155', 0.186],
      ['pole-ref-156', 0.186],
      ['pole-ref-157', 0.186],
      ['pole-ref-204', 0.126],
      ['pole-ref-219', 0.126],
      ['pole-ref-236', 0.126],
      ['pole-ref-239', 0.126],
    ]);
    expectedRaisedSupports.forEach((expectedElevation, sourceMarkerId) => {
      const placement = placements.find((candidate) => (
        candidate.node.sourceMarkerId === sourceMarkerId
      ));
      expect(placement, sourceMarkerId).toBeDefined();
      expect(placement!.groundElevation, sourceMarkerId).toBeCloseTo(expectedElevation, 6);
    });
  });

  it('preserva as 13 âncoras conflitantes e projeta só sua apresentação à fachada livre', () => {
    const placements = resolveElectricalNodePlacements(
      COMMERCIAL_ELECTRICAL_NODES,
      OFFICIAL_REFERENCE_DATA.entities,
    );
    const placementByMarker = new Map(placements.map((placement) => (
      [placement.node.sourceMarkerId, placement]
    )));
    const obstacleClassifications = new Set([
      'INTERNAL_STAND',
      'PAVILION',
      'BUILDING',
      'RESTAURANT',
      'FOOD_AREA',
      'RESTROOM',
      'CHEMICAL_RESTROOM',
      'GATE',
      'ADMINISTRATION',
      'SECURITY',
      'EMERGENCY',
      'SERVICE',
      'ATTRACTION',
      'EVENT_VENUE',
      'LIVESTOCK_AREA',
      'RURAL_EXHIBITION',
      'RESTRICTED_AREA',
      'LANDMARK',
    ]);
    const obstacles = OFFICIAL_REFERENCE_DATA.entities.filter((entity) => (
      obstacleClassifications.has(entity.classification)
    ));
    ELECTRICAL_INFRASTRUCTURE_REFERENCE.placement.facadeMountedMarkers.forEach((mount) => {
      const placement = placementByMarker.get(mount.sourceMarkerId)!;
      const host = OFFICIAL_REFERENCE_DATA.entities.find((entity) => (
        entity.publicIdentifier === mount.surfaceEntityIdentifier
      ))!;
      expect(placement.node.position, mount.sourceMarkerId)
        .toEqual(electricalPlanPointToWorldXZ(placement.node.sourcePagePosition));
      expect(
        pointInPolygon(placement.node.position, host.geometry.coordinates[0] ?? [])
        || distanceToEntity(placement.node.position, host) < placement.node.radius,
        mount.sourceMarkerId,
      ).toBe(true);
      expect(pointInPolygon(placement.renderPosition, host.geometry.coordinates[0] ?? []), mount.sourceMarkerId)
        .toBe(false);
      expect(placement.renderPosition, mount.sourceMarkerId).not.toEqual(placement.node.position);
      expect(placement.node.mountMode, mount.sourceMarkerId).toBe(mount.mountMode);
      expect(placement.node.surfaceEntityIdentifier, mount.sourceMarkerId)
        .toBe(mount.surfaceEntityIdentifier);
      expect(placement.placementStatus, mount.sourceMarkerId).toBe('PROJECTED_FREE');
      if (placement.node.mountMode === 'FACADE_POLE') {
        expect(distanceToEntity(placement.renderPosition, host), mount.sourceMarkerId)
          .toBeGreaterThanOrEqual(
            ELECTRICAL_WIRE_CONDUCTOR_SPACING + ELECTRICAL_WIRE_STRUCTURE_CLEARANCE + 0.03 - 1e-6,
          );
      }
      obstacles.forEach((obstacle) => {
        expect(
          distanceToEntity(placement.renderPosition, obstacle),
          `${mount.sourceMarkerId} colide com ${obstacle.publicIdentifier}`,
        ).toBeGreaterThanOrEqual(placement.node.radius + 0.012 - 1e-6);
      });
    });
    expect(ELECTRICAL_INFRASTRUCTURE_REFERENCE.placement.facadeMountedMarkers).toHaveLength(13);
    expect(placements.filter((placement) => placement.node.mountMode === 'FACADE_POLE'))
      .toHaveLength(8);
    expect(placements.filter((placement) => placement.node.mountMode === 'FACADE_RECEPTION'))
      .toHaveLength(5);
    expect(placements.filter((placement) => placement.placementStatus === 'PROJECTED_FALLBACK'))
      .toHaveLength(0);
  });

  it('mantém todas as fases acima da folga técnica mínima em estruturas existentes', () => {
    const structuralClassifications = new Set([
      'INTERNAL_STAND',
      'PAVILION',
      'BUILDING',
      'EVENT_VENUE',
      'RESTAURANT',
      'FOOD_AREA',
      'RESTROOM',
      'CHEMICAL_RESTROOM',
      'GATE',
      'ADMINISTRATION',
      'SECURITY',
      'EMERGENCY',
      'SERVICE',
      'ATTRACTION',
      'LIVESTOCK_AREA',
      'RURAL_EXHIBITION',
      'RESTRICTED_AREA',
      'LANDMARK',
    ]);
    const structuralPrisms = OFFICIAL_REFERENCE_DATA.entities
      .filter((entity) => structuralClassifications.has(entity.classification))
      .map((entity) => {
        const polygon = entity.geometry.coordinates[0] ?? [];
        const xs = polygon.map(([x]) => x);
        const zs = polygon.map(([, z]) => z);
        return {
          entity,
          baseY: entity.geometry.elevation,
          roofY: entity.geometry.elevation + (
            strategicLandmarkVisualHeight(entity) ?? entity.geometry.extrusionHeight
          ),
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minZ: Math.min(...zs),
          maxZ: Math.max(...zs),
        };
      });
    const placements = resolveElectricalNodePlacements(
      COMMERCIAL_ELECTRICAL_NODES,
      OFFICIAL_REFERENCE_DATA.entities,
    );
    const placementByNodeId = new Map(placements.map((placement) => [placement.node.id, placement]));
    const crossarmByPoleChain = new Map(buildElectricalPoleCrossarmLayouts(
      COMMERCIAL_ELECTRICAL_NODES,
      COMMERCIAL_ELECTRICAL_CONNECTIONS,
      placements,
    ).map((layout) => [`${layout.nodeId}::${layout.sourceAlignmentChainId}`, layout]));
    const clearanceViolations: string[] = [];
    COMMERCIAL_ELECTRICAL_CONNECTIONS.forEach((connection) => {
      const from = placementByNodeId.get(connection.fromNodeId)!;
      const to = placementByNodeId.get(connection.toNodeId)!;
      const deltaX = to.renderPosition[0] - from.renderPosition[0];
      const deltaZ = to.renderPosition[1] - from.renderPosition[1];
      const span = Math.hypot(deltaX, deltaZ);
      const perpendicularX = -deltaZ / span;
      const perpendicularZ = deltaX / span;
      const offsets = Array.from({ length: connection.conductorCount }, (_, index) => (
        (index - (connection.conductorCount - 1) / 2) * ELECTRICAL_WIRE_CONDUCTOR_SPACING
      ));
      const fromY = from.groundElevation + (from.node.type === 'POLE'
        ? from.node.height - 0.08
        : from.node.height + 0.145);
      const toY = to.groundElevation + (to.node.type === 'POLE'
        ? to.node.height - 0.08
        : to.node.height + 0.145);
      offsets.forEach((offset) => {
        const fromCrossarm = connection.sourceAlignmentChainId
          ? crossarmByPoleChain.get(`${from.node.id}::${connection.sourceAlignmentChainId}`)
          : null;
        const toCrossarm = connection.sourceAlignmentChainId
          ? crossarmByPoleChain.get(`${to.node.id}::${connection.sourceAlignmentChainId}`)
          : null;
        const fromOffsetX = fromCrossarm
          ? Math.cos(fromCrossarm.rotationRadians) * offset
          : perpendicularX * offset;
        const fromOffsetZ = fromCrossarm
          ? -Math.sin(fromCrossarm.rotationRadians) * offset
          : perpendicularZ * offset;
        let toOffsetX = toCrossarm
          ? Math.cos(toCrossarm.rotationRadians) * offset
          : perpendicularX * offset;
        let toOffsetZ = toCrossarm
          ? -Math.sin(toCrossarm.rotationRadians) * offset
          : perpendicularZ * offset;
        if (
          fromCrossarm
          && toCrossarm
          && fromOffsetX * toOffsetX + fromOffsetZ * toOffsetZ < 0
        ) {
          toOffsetX *= -1;
          toOffsetZ *= -1;
        }
        for (let sample = 1; sample < 24; sample += 1) {
          const t = sample / 24;
          const transformerEndpointT = from.node.type === 'TRANSFORMER'
            ? 0
            : to.node.type === 'TRANSFORMER'
              ? 1
              : null;
          if (
            connection.kind === 'TRANSFORMER_SERVICE_DROP'
            && transformerEndpointT !== null
            && Math.abs(t - transformerEndpointT) <= 0.25
          ) continue;
          const position = [
            from.renderPosition[0] + deltaX * t + fromOffsetX + (toOffsetX - fromOffsetX) * t,
            from.renderPosition[1] + deltaZ * t + fromOffsetZ + (toOffsetZ - fromOffsetZ) * t,
          ] as const;
          const wireY = fromY + (toY - fromY) * t - 4 * connection.sag * t * (1 - t);
          structuralPrisms.forEach((prism) => {
            if (
              position[0] < prism.minX - ELECTRICAL_WIRE_STRUCTURE_CLEARANCE
              || position[0] > prism.maxX + ELECTRICAL_WIRE_STRUCTURE_CLEARANCE
              || position[1] < prism.minZ - ELECTRICAL_WIRE_STRUCTURE_CLEARANCE
              || position[1] > prism.maxZ + ELECTRICAL_WIRE_STRUCTURE_CLEARANCE
            ) return;
            const horizontalDistance = distanceToEntity(position, prism.entity);
            const verticalDistance = wireY < prism.baseY
              ? prism.baseY - wireY
              : wireY > prism.roofY
                ? wireY - prism.roofY
                : 0;
            const prismDistance = Math.hypot(horizontalDistance, verticalDistance);
            if (prismDistance < ELECTRICAL_WIRE_STRUCTURE_CLEARANCE - 1e-6) {
              clearanceViolations.push(
                `${connection.id}:${prism.entity.publicIdentifier}:t=${t.toFixed(3)}:fase=${offset.toFixed(2)}:folga=${prismDistance.toFixed(6)}`,
              );
            }
          });
        }
      });
    });
    expect([...new Set(clearanceViolations)]).toEqual([]);
  });

  it('afasta apenas a apresentação dos seis postes junto aos novos volumes, sem mudar âncoras ou topologia', () => {
    const nodesBefore = JSON.stringify(COMMERCIAL_ELECTRICAL_NODES);
    const connectionsBefore = JSON.stringify(COMMERCIAL_ELECTRICAL_CONNECTIONS);
    const placements = resolveElectricalNodePlacements(
      COMMERCIAL_ELECTRICAL_NODES,
      OFFICIAL_REFERENCE_DATA.entities,
    );
    const architectureMarkerIds = new Set<string>(
      ELECTRICAL_ARCHITECTURE_CLEARANCE_PRESENTATION.groups.flatMap((group) => group.sourceMarkerIds),
    );
    const shifted = placements.filter((placement) => (
      placement.placementStatus === 'PROJECTED_CLEARANCE'
      && architectureMarkerIds.has(placement.node.sourceMarkerId)
    ));
    expect(shifted).toHaveLength(6);
    ELECTRICAL_ARCHITECTURE_CLEARANCE_PRESENTATION.groups.forEach((group) => {
      group.sourceMarkerIds.forEach((sourceMarkerId) => {
        const placement = shifted.find((candidate) => candidate.node.sourceMarkerId === sourceMarkerId)!;
        expect(placement.node).toBe(COMMERCIAL_ELECTRICAL_NODES.find((node) => node.sourceMarkerId === sourceMarkerId));
        expect(placement.sourceAnchorPreserved).toBe(true);
        expect(placement.node.position).toEqual(electricalPlanPointToWorldXZ(placement.node.sourcePagePosition));
        expect(placement.renderPosition[0]).toBeCloseTo(placement.node.position[0] + group.offset[0], 8);
        expect(placement.renderPosition[1]).toBeCloseTo(placement.node.position[1] + group.offset[1], 8);
      });
      const withoutOwner = OFFICIAL_REFERENCE_DATA.entities.filter((entity) => entity.publicIdentifier !== group.ownerIdentifier);
      const unshifted = resolveElectricalNodePlacements(
        COMMERCIAL_ELECTRICAL_NODES.filter((node) => group.sourceMarkerIds.some((id) => id === node.sourceMarkerId)),
        withoutOwner,
      );
      unshifted.forEach((placement) => {
        expect(placement.placementStatus).toBe('DIRECT');
        expect(placement.renderPosition).toEqual(placement.node.position);
      });
    });
    expect(JSON.stringify(COMMERCIAL_ELECTRICAL_NODES)).toBe(nodesBefore);
    expect(JSON.stringify(COMMERCIAL_ELECTRICAL_CONNECTIONS)).toBe(connectionsBefore);
    expect(ELECTRICAL_ARCHITECTURE_CLEARANCE_PRESENTATION.verificationStatus).toBe('FIELD_REVIEW_REQUIRED');
  });

  it('mantém os postes 026 e 149 fora do envelope físico das novas vias sem mover dados oficiais', () => {
    const inventoryBefore = JSON.stringify([
      COMMERCIAL_ELECTRICAL_NODES,
      COMMERCIAL_ELECTRICAL_CONNECTIONS,
    ]);
    const placements = resolveElectricalNodePlacements(
      COMMERCIAL_ELECTRICAL_NODES,
      OFFICIAL_REFERENCE_DATA.entities,
    );
    const roads = new Map(PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.map((road) => [road.id, road]));
    const markerIds = PARK_ACCESS_ELECTRICAL_CLEARANCE_PRESENTATION.groups
      .flatMap((group) => group.sourceMarkerIds);

    expect(markerIds).toEqual(['pole-ref-026', 'pole-ref-149']);
    PARK_ACCESS_ELECTRICAL_CLEARANCE_PRESENTATION.groups.forEach((group) => {
      const placement = placements.find((candidate) => (
        group.sourceMarkerIds.some((sourceMarkerId) => (
          sourceMarkerId === candidate.node.sourceMarkerId
        ))
      ))!;
      const road = roads.get(group.roadSurfaceId)!;

      expect(placement.placementStatus).toBe('PROJECTED_CLEARANCE');
      expect(placement.sourceAnchorPreserved).toBe(true);
      expect(placement.node.position)
        .toEqual(electricalPlanPointToWorldXZ(placement.node.sourcePagePosition));
      expect(placement.renderPosition[0])
        .toBeCloseTo(placement.node.position[0] + group.offset[0], 8);
      expect(placement.renderPosition[1])
        .toBeCloseTo(placement.node.position[1] + group.offset[1], 8);
      expect(pointInPolygon(placement.renderPosition, road.polygon)).toBe(false);
      expect(distanceToPolygon(placement.renderPosition, road.polygon))
        .toBeGreaterThanOrEqual(placement.node.radius + 0.05);

      const withoutOwner = OFFICIAL_REFERENCE_DATA.entities.filter((entity) => (
        entity.publicIdentifier !== group.ownerIdentifier
      ));
      const [withoutOwnerPlacement] = resolveElectricalNodePlacements(
        [placement.node],
        withoutOwner,
      );
      expect(withoutOwnerPlacement.placementStatus).toBe('DIRECT');
      expect(withoutOwnerPlacement.renderPosition).toEqual(placement.node.position);
    });

    expect(PARK_ACCESS_ELECTRICAL_CLEARANCE_PRESENTATION).toMatchObject({
      scope: 'PRESENTATION_ONLY',
      verificationStatus: 'FIELD_REVIEW_REQUIRED',
      sourceAnchorPreserved: true,
      topologyPreserved: true,
    });
    expect(JSON.stringify([
      COMMERCIAL_ELECTRICAL_NODES,
      COMMERCIAL_ELECTRICAL_CONNECTIONS,
    ])).toBe(inventoryBefore);
  });

  it('preserva a folga também no envelope visual do portal e da guarita A4, maior que o marcador oficial', () => {
    const gate = OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.publicIdentifier === 'A4')!;
    const bounds = strategicLandmarkBounds(gate);
    const offset = GATE_FOUR_DISTRICT_LAYOUT.gate4.visualOffset;
    const visualGate = {
      ...gate,
      geometry: {
        ...gate.geometry,
        coordinates: [resolveGateFourInteractionFootprint(bounds).map(([x, z]) => (
          [bounds.centerX + offset[0] + x, bounds.centerZ + offset[1] + z] as [number, number]
        ))],
      },
    };
    const wires = buildElectricalWirePositions(
      COMMERCIAL_ELECTRICAL_NODES,
      COMMERCIAL_ELECTRICAL_CONNECTIONS.filter((connection) => connection.sourceAlignmentChainId === 'AH-010'),
      OFFICIAL_REFERENCE_DATA.entities,
    );
    for (let index = 0; index < wires.length; index += 3) {
      expect(distanceToEntity([wires[index], wires[index + 2]], visualGate))
        .toBeGreaterThanOrEqual(ELECTRICAL_WIRE_STRUCTURE_CLEARANCE);
    }
  });

  it('compartilha o mesmo dataset no parque e nos três recortes sem deixar conexões órfãs', () => {
    const expectedCounts = {
      park: { nodes: 428, connections: 325 },
      [COMMERCIAL_MAP_SEGMENT_IDS.industry]: { nodes: 107, connections: 74 },
      [COMMERCIAL_MAP_SEGMENT_IDS.exporural]: { nodes: 89, connections: 66 },
      [COMMERCIAL_MAP_SEGMENT_IDS.automotive]: { nodes: 37, connections: 26 },
    } as const;
    Object.entries(expectedCounts).forEach(([scope, expected]) => {
      const scoped = scopeCommercialMapData(
        OFFICIAL_REFERENCE_DATA,
        scope as keyof typeof expectedCounts,
      );
      const infrastructure = selectCommercialElectricalInfrastructureForScene(scoped.entities, scoped.lots);
      expect(infrastructure.nodes, scope).toHaveLength(expected.nodes);
      expect(infrastructure.connections, scope).toHaveLength(expected.connections);
      const ids = new Set(infrastructure.nodes.map((node) => node.id));
      infrastructure.connections.forEach((connection) => {
        expect(ids.has(connection.fromNodeId), `${scope}:${connection.id}:from`).toBe(true);
        expect(ids.has(connection.toNodeId), `${scope}:${connection.id}:to`).toBe(true);
      });
    });
  });

  it('mantém uma única linha batched, geometrias instanciadas e orçamento fixo de draw calls', () => {
    const budget = electricalInfrastructureInstanceBudget(
      COMMERCIAL_ELECTRICAL_NODES,
      COMMERCIAL_ELECTRICAL_CONNECTIONS,
    );
    expect(budget).toMatchObject({
      poleCount: 408,
      transformerCount: 20,
      connectionCount: 325,
      primaryDrawCalls: 9,
      shadowDrawCalls: 4,
      maximumPassDrawCalls: 13,
    });
    const fullWires = buildElectricalWirePositions(
      COMMERCIAL_ELECTRICAL_NODES,
      COMMERCIAL_ELECTRICAL_CONNECTIONS,
      OFFICIAL_REFERENCE_DATA.entities,
    );
    const reducedWires = buildElectricalWirePositions(
      COMMERCIAL_ELECTRICAL_NODES,
      COMMERCIAL_ELECTRICAL_CONNECTIONS,
      OFFICIAL_REFERENCE_DATA.entities,
      true,
    );
    expect(fullWires.length).toBe(budget.conductorVertices * 3);
    expect(reducedWires.length).toBeLessThan(fullWires.length);
    expect([...fullWires].every(Number.isFinite)).toBe(true);
    let wireCursor = 0;
    const floatsPerConductor = (ELECTRICAL_WIRE_SAMPLES - 1) * 2 * 3;
    COMMERCIAL_ELECTRICAL_CONNECTIONS.forEach((connection) => {
      if (connection.conductorCount === 3) {
        const leftFrom = fullWires.slice(wireCursor, wireCursor + 3);
        const leftTo = fullWires.slice(
          wireCursor + floatsPerConductor - 3,
          wireCursor + floatsPerConductor,
        );
        const rightFromStart = wireCursor + floatsPerConductor * 2;
        const rightFrom = fullWires.slice(rightFromStart, rightFromStart + 3);
        const rightTo = fullWires.slice(
          wireCursor + floatsPerConductor * 3 - 3,
          wireCursor + floatsPerConductor * 3,
        );
        const fromPhaseAxisX = rightFrom[0] - leftFrom[0];
        const fromPhaseAxisZ = rightFrom[2] - leftFrom[2];
        const toPhaseAxisX = rightTo[0] - leftTo[0];
        const toPhaseAxisZ = rightTo[2] - leftTo[2];
        expect(
          fromPhaseAxisX * toPhaseAxisX + fromPhaseAxisZ * toPhaseAxisZ,
          `${connection.id} inverte a identidade lateral das fases`,
        ).toBeGreaterThan(0);
      }
      wireCursor += connection.conductorCount * floatsPerConductor;
    });
    expect(wireCursor).toBe(fullWires.length);

    const renderer = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/CommercialElectricalInfrastructureLayer.tsx',
    ), 'utf8');
    const canvas = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    ), 'utf8');
    expect(renderer.match(/<instancedMesh/g)).toHaveLength(8);
    expect(renderer.match(/raycast=\{NO_RAYCAST\}/g)).toHaveLength(9);
    expect(renderer).toContain('<lineSegments');
    expect(renderer).toContain('computeBoundingSphere()');
    expect(renderer).toContain('dispose()');
    expect(renderer).toContain('resolveElectricalNodePlacements(nodes, surfaceEntities, rearRoadsActive)');
    expect(canvas).toContain('rearRoadsActive={!isolatedArea}');
    expect(renderer).not.toContain('electricalInfrastructureGroundElevation(');
    expect(canvas.match(/<CommercialElectricalInfrastructureLayer/g)).toHaveLength(1);
    expect(canvas).toContain('visible={treesVisible && !hydrologicalModeActive}');
  });
});
