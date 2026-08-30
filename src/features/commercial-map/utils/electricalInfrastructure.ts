import {
  COMMERCIAL_ELECTRICAL_CONNECTIONS,
  COMMERCIAL_ELECTRICAL_NODES,
  type CommercialElectricalConnection,
  type CommercialElectricalNode,
} from '../data/electricalInfrastructure';
import {
  resolveElectricalArchitectureClearancePosition,
  resolveRearRoadElectricalClearancePosition,
} from '../data/electricalPresentation';
import type { CommercialLot, Coordinate, MapClassification, MapEntity } from '../types';
import {
  closestPointOnSegment,
  DEFAULT_FLAT_SURFACE_CLASSIFICATIONS,
  distanceToEntity,
  entitySurfaceElevation,
  pointInPolygon,
} from './spatialSurface';
import {
  buildRearRoadCorridorFootprints,
  distanceToPath,
  type RearRoadCorridorFootprint,
} from './rearRoadNetwork';

export const ELECTRICAL_INFRASTRUCTURE_PRIMARY_DRAW_CALL_BUDGET = 9;
export const ELECTRICAL_INFRASTRUCTURE_SHADOW_DRAW_CALL_BUDGET = 4;
export const ELECTRICAL_WIRE_SAMPLES = 7;
export const ELECTRICAL_WIRE_REDUCED_SAMPLES = 4;
export const ELECTRICAL_WIRE_CONDUCTOR_SPACING = 0.15;
export const ELECTRICAL_WIRE_STRUCTURE_CLEARANCE = 0.22;

const ELECTRICAL_SURFACE_CLEARANCE = 0.006;
const ELECTRICAL_FALLBACK_GROUND_ELEVATION = 0.036;
const ELECTRICAL_FACADE_RENDER_CLEARANCE = 0.012;
const ELECTRICAL_FACADE_POLE_PHASE_MARGIN = 0.03;
const SCOPED_INFRASTRUCTURE_MARGIN = 2.8;
const FULL_PARK_ANCHORS = ['A1', 'A6', 'A11', 'QUADRA-A', 'QUADRA-S'] as const;
const ELECTRICAL_SUPPORT_CLASSIFICATIONS: ReadonlySet<MapClassification> = new Set([
  'SELLABLE_LOT',
  ...DEFAULT_FLAT_SURFACE_CLASSIFICATIONS,
  'RURAL_EXHIBITION',
  'LIVESTOCK_AREA',
  'RESTRICTED_AREA',
  'ATTRACTION',
]);
const ELECTRICAL_OBSTACLE_CLASSIFICATIONS: ReadonlySet<MapClassification> = new Set([
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

interface IndexedElectricalSurface {
  entity: MapEntity;
  polygon: readonly Coordinate[];
  groundElevation: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface ResolvedElectricalNodePlacement {
  node: CommercialElectricalNode;
  renderPosition: Coordinate;
  groundElevation: number;
  rotationRadians: number;
  sourceAnchorPreserved: true;
  placementStatus: 'DIRECT' | 'PROJECTED_FREE' | 'PROJECTED_FALLBACK' | 'PROJECTED_CLEARANCE';
}

export interface ElectricalPoleCrossarmLayout {
  id: string;
  nodeId: string;
  sourceAlignmentChainId: string | null;
  rotationRadians: number;
}

function surfacePriority(node: CommercialElectricalNode, entity: MapEntity) {
  if (entity.publicIdentifier === node.surfaceEntityIdentifier) return 0;
  if (entity.classification === 'ROAD') return 1;
  if (entity.classification === 'PEDESTRIAN_PATH') return 2;
  if (entity.classification === 'PARKING') return 3;
  if (entity.classification === 'SELLABLE_LOT') return 4;
  if (entity.classification === 'QUADRA') return 5;
  return 6;
}

function indexElectricalSurfaces(entities: readonly MapEntity[]) {
  return entities
    .filter((entity) => ELECTRICAL_SUPPORT_CLASSIFICATIONS.has(entity.classification))
    .map<IndexedElectricalSurface>((entity) => {
      const polygon = entity.geometry.coordinates[0] ?? [];
      const xs = polygon.map(([x]) => x);
      const zs = polygon.map(([, z]) => z);
      return {
        entity,
        polygon,
        groundElevation: entitySurfaceElevation(entity, {
          flatClassifications: DEFAULT_FLAT_SURFACE_CLASSIFICATIONS,
          clearance: ELECTRICAL_SURFACE_CLEARANCE,
        }),
        bounds: {
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minZ: Math.min(...zs),
          maxZ: Math.max(...zs),
        },
      };
    });
}

function surfaceMayContainPosition(
  position: Coordinate,
  surface: IndexedElectricalSurface,
  margin = 0,
) {
  return position[0] >= surface.bounds.minX - margin
    && position[0] <= surface.bounds.maxX + margin
    && position[1] >= surface.bounds.minZ - margin
    && position[1] <= surface.bounds.maxZ + margin;
}

function electricalSurfaceAtPosition(
  node: CommercialElectricalNode,
  position: Coordinate,
  surfaces: readonly IndexedElectricalSurface[],
) {
  const nearby = surfaces.filter((surface) => surfaceMayContainPosition(position, surface, 1.8));
  const containing = nearby
    .filter((surface) => (
      surfaceMayContainPosition(position, surface)
      && pointInPolygon(position, surface.polygon)
    ))
    .sort((left, right) => (
      right.groundElevation - left.groundElevation
      || surfacePriority(node, left.entity) - surfacePriority(node, right.entity)
    ));
  if (containing[0]) return containing[0];

  const nearest = nearby.reduce<IndexedElectricalSurface | null>((current, candidate) => {
    if (!current) return candidate;
    const candidateDistance = distanceToEntity(position, candidate.entity);
    const currentDistance = distanceToEntity(position, current.entity);
    if (candidateDistance < currentDistance - 1e-6) return candidate;
    if (
      Math.abs(candidateDistance - currentDistance) <= 1e-6
      && surfacePriority(node, candidate.entity) < surfacePriority(node, current.entity)
    ) return candidate;
    return current;
  }, null);
  return nearest && distanceToEntity(position, nearest.entity) <= 1.8 ? nearest : null;
}

function groundElevationAtPosition(
  node: CommercialElectricalNode,
  position: Coordinate,
  surfaces: readonly IndexedElectricalSurface[],
) {
  const surface = electricalSurfaceAtPosition(node, position, surfaces);
  return surface?.groundElevation ?? ELECTRICAL_FALLBACK_GROUND_ELEVATION;
}

function resolveFacadePresentation(
  node: CommercialElectricalNode,
  entityByIdentifier: ReadonlyMap<string, MapEntity>,
  obstacles: readonly MapEntity[],
  rearRoadFootprints: readonly RearRoadCorridorFootprint[],
) {
  if (
    (node.mountMode !== 'FACADE_RECEPTION' && node.mountMode !== 'FACADE_POLE')
    || !node.surfaceEntityIdentifier
  ) return null;
  const host = entityByIdentifier.get(node.surfaceEntityIdentifier);
  const polygon = host?.geometry.coordinates[0] ?? [];
  if (!host || polygon.length < 2) return null;
  const envelopeRadius = node.mountMode === 'FACADE_POLE'
    ? Math.max(
      node.radius,
      ELECTRICAL_WIRE_CONDUCTOR_SPACING
        + ELECTRICAL_WIRE_STRUCTURE_CLEARANCE
        + ELECTRICAL_FACADE_POLE_PHASE_MARGIN,
    )
    : node.radius + ELECTRICAL_FACADE_RENDER_CLEARANCE;
  const candidates = polygon.flatMap((start, segmentIndex) => {
    const end = polygon[(segmentIndex + 1) % polygon.length];
    const projection = closestPointOnSegment(node.position, start, end);
    const segmentDeltaX = end[0] - start[0];
    const segmentDeltaZ = end[1] - start[1];
    const segmentLength = Math.hypot(segmentDeltaX, segmentDeltaZ);
    if (segmentLength <= Number.EPSILON) return [];
    const normals: readonly Coordinate[] = [
      [-segmentDeltaZ / segmentLength, segmentDeltaX / segmentLength],
      [segmentDeltaZ / segmentLength, -segmentDeltaX / segmentLength],
    ];
    return normals.map(([normalX, normalZ], normalIndex) => {
      const renderPosition: Coordinate = [
        projection[0] + normalX * envelopeRadius,
        projection[1] + normalZ * envelopeRadius,
      ];
      return {
        renderPosition,
        rotationRadians: Math.atan2(normalX, normalZ),
        segmentIndex,
        normalIndex,
        distanceFromSource: Math.hypot(
          renderPosition[0] - node.position[0],
          renderPosition[1] - node.position[1],
        ),
        outsideHost: !pointInPolygon(renderPosition, polygon),
        blocked: obstacles.some((obstacle) => (
          distanceToEntity(renderPosition, obstacle) < envelopeRadius - 1e-6
        )) || rearRoadFootprints.some((footprint) => (
          distanceToPath(renderPosition, footprint.centerline) <= footprint.halfWidth + envelopeRadius + 0.05
        )),
      };
    });
  }).sort((left, right) => (
    left.distanceFromSource - right.distanceFromSource
    || left.segmentIndex - right.segmentIndex
    || left.normalIndex - right.normalIndex
  ));
  const selected = candidates.find((candidate) => candidate.outsideHost && !candidate.blocked)
    ?? candidates.find((candidate) => candidate.outsideHost)
    ?? null;
  return selected ? {
    renderPosition: selected.renderPosition,
    rotationRadians: selected.rotationRadians,
    placementStatus: selected.blocked ? 'PROJECTED_FALLBACK' : 'PROJECTED_FREE',
  } as const : null;
}

export function resolveElectricalNodePlacements(
  nodes: readonly CommercialElectricalNode[],
  entities: readonly MapEntity[] = [],
  rearRoadsActive = false,
): readonly ResolvedElectricalNodePlacement[] {
  const surfaces = indexElectricalSurfaces(entities);
  const entityByIdentifier = new Map(entities.map((entity) => [entity.publicIdentifier, entity]));
  const obstacles = entities.filter((entity) => (
    ELECTRICAL_OBSTACLE_CLASSIFICATIONS.has(entity.classification)
  ));
  const rearRoadFootprints = rearRoadsActive
    ? buildRearRoadCorridorFootprints(undefined, { includeShoulders: true })
    : [];
  return nodes.map((node) => {
    const facade = resolveFacadePresentation(node, entityByIdentifier, obstacles, rearRoadFootprints);
    const architectureClearance = facade
      ? null
      : resolveElectricalArchitectureClearancePosition(node, entityByIdentifier);
    const rearRoadClearance = rearRoadsActive && !facade
      ? resolveRearRoadElectricalClearancePosition(node)
      : null;
    const renderPosition = facade?.renderPosition ?? rearRoadClearance ?? architectureClearance ?? node.position;
    return {
      node,
      renderPosition,
      groundElevation: groundElevationAtPosition(node, renderPosition, surfaces),
      rotationRadians: facade?.rotationRadians ?? node.rotationRadians,
      sourceAnchorPreserved: true,
      placementStatus: facade?.placementStatus
        ?? (rearRoadClearance || architectureClearance ? 'PROJECTED_CLEARANCE' : 'DIRECT'),
    };
  });
}

export function electricalInfrastructureGroundElevation(
  node: CommercialElectricalNode,
  entities: readonly MapEntity[] = [],
) {
  return resolveElectricalNodePlacements([node], entities)[0]?.groundElevation
    ?? ELECTRICAL_FALLBACK_GROUND_ELEVATION;
}

function sceneBounds(entities: readonly MapEntity[]) {
  const points = entities.flatMap((entity) => entity.geometry.coordinates.flat());
  if (points.length === 0) return null;
  const xs = points.map(([x]) => x).filter(Number.isFinite);
  const zs = points.map(([, z]) => z).filter(Number.isFinite);
  if (xs.length === 0 || zs.length === 0) return null;
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function isFullParkScene(entities: readonly MapEntity[]) {
  const identifiers = new Set(entities.map((entity) => entity.publicIdentifier));
  return FULL_PARK_ANCHORS.every((identifier) => identifiers.has(identifier));
}

function nodeBelongsToScopedScene(
  node: CommercialElectricalNode,
  entities: readonly MapEntity[],
  bounds: NonNullable<ReturnType<typeof sceneBounds>>,
) {
  const [x, z] = node.position;
  if (
    x < bounds.minX - SCOPED_INFRASTRUCTURE_MARGIN
    || x > bounds.maxX + SCOPED_INFRASTRUCTURE_MARGIN
    || z < bounds.minZ - SCOPED_INFRASTRUCTURE_MARGIN
    || z > bounds.maxZ + SCOPED_INFRASTRUCTURE_MARGIN
  ) return false;
  return entities.some((entity) => (
    distanceToEntity(node.position, entity) <= SCOPED_INFRASTRUCTURE_MARGIN
  ));
}

export function selectCommercialElectricalInfrastructureForScene(
  entities: readonly MapEntity[],
  _lots: readonly CommercialLot[],
) {
  const fullPark = isFullParkScene(entities);
  const bounds = sceneBounds(entities);
  const nodes = fullPark
    ? [...COMMERCIAL_ELECTRICAL_NODES]
    : bounds
      ? COMMERCIAL_ELECTRICAL_NODES.filter((node) => nodeBelongsToScopedScene(node, entities, bounds))
      : [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const connections = COMMERCIAL_ELECTRICAL_CONNECTIONS.filter((connection) => (
    nodeIds.has(connection.fromNodeId) && nodeIds.has(connection.toNodeId)
  ));
  return { nodes, connections };
}

export function buildElectricalPoleCrossarmLayouts(
  nodes: readonly CommercialElectricalNode[],
  connections: readonly CommercialElectricalConnection[],
  resolvedPlacements: readonly ResolvedElectricalNodePlacement[] = [],
): readonly ElectricalPoleCrossarmLayout[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const renderedPositionByNodeId = new Map(resolvedPlacements.map((placement) => (
    [placement.node.id, placement.renderPosition]
  )));
  const vectorsByPole = new Map<
    string,
    Map<string, Array<readonly [number, number]>>
  >();
  const addVector = (
    pole: CommercialElectricalNode,
    other: CommercialElectricalNode,
    chainId: string,
  ) => {
    const chains = vectorsByPole.get(pole.id) ?? new Map<
      string,
      Array<readonly [number, number]>
    >();
    const vectors = chains.get(chainId) ?? [];
    const polePosition = renderedPositionByNodeId.get(pole.id) ?? pole.position;
    const otherPosition = renderedPositionByNodeId.get(other.id) ?? other.position;
    vectors.push([
      otherPosition[0] - polePosition[0],
      otherPosition[1] - polePosition[1],
    ]);
    chains.set(chainId, vectors);
    vectorsByPole.set(pole.id, chains);
  };

  connections.forEach((connection) => {
    if (connection.kind !== 'PRIMARY_ALIGNMENT' || !connection.sourceAlignmentChainId) return;
    const from = nodeById.get(connection.fromNodeId);
    const to = nodeById.get(connection.toNodeId);
    if (!from || !to || from.type !== 'POLE' || to.type !== 'POLE') return;
    addVector(from, to, connection.sourceAlignmentChainId);
    addVector(to, from, connection.sourceAlignmentChainId);
  });

  const layouts: ElectricalPoleCrossarmLayout[] = [];
  nodes.filter((node) => node.type === 'POLE').forEach((pole) => {
    const entries = [...(vectorsByPole.get(pole.id)?.entries() ?? [])]
      .sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0) {
      layouts.push({
        id: `${pole.id}-crossarm-fallback`,
        nodeId: pole.id,
        sourceAlignmentChainId: null,
        rotationRadians: pole.rotationRadians,
      });
      return;
    }
    entries.forEach(([sourceAlignmentChainId, vectors]) => {
      const doubledAngles = vectors.map(([deltaX, deltaZ]) => (
        Math.atan2(deltaZ, deltaX) * 2
      ));
      const spanAngle = Math.atan2(
        doubledAngles.reduce((sum, angle) => sum + Math.sin(angle), 0),
        doubledAngles.reduce((sum, angle) => sum + Math.cos(angle), 0),
      ) / 2;
      const rotationRadians = Math.atan2(
        Math.sin(Math.PI / 2 - spanAngle),
        Math.cos(Math.PI / 2 - spanAngle),
      );
      layouts.push({
        id: `${pole.id}-crossarm-${sourceAlignmentChainId}`,
        nodeId: pole.id,
        sourceAlignmentChainId,
        rotationRadians,
      });
    });
  });
  return layouts;
}

export function electricalInfrastructureInstanceBudget(
  nodes: readonly CommercialElectricalNode[],
  connections: readonly CommercialElectricalConnection[],
  reducedGraphics = false,
) {
  const poleCount = nodes.filter((node) => node.type === 'POLE').length;
  const transformerCount = nodes.length - poleCount;
  const crossarmCount = buildElectricalPoleCrossarmLayouts(nodes, connections).length;
  const wireSamples = reducedGraphics ? ELECTRICAL_WIRE_REDUCED_SAMPLES : ELECTRICAL_WIRE_SAMPLES;
  const conductorSegments = connections.reduce((total, connection) => (
    total + (reducedGraphics ? 1 : connection.conductorCount) * (wireSamples - 1)
  ), 0);
  const primaryDrawCalls = nodes.length > 0 ? ELECTRICAL_INFRASTRUCTURE_PRIMARY_DRAW_CALL_BUDGET : 0;
  const shadowDrawCalls = nodes.length > 0 && !reducedGraphics
    ? ELECTRICAL_INFRASTRUCTURE_SHADOW_DRAW_CALL_BUDGET
    : 0;
  return {
    poleCount,
    transformerCount,
    connectionCount: connections.length,
    primaryDrawCalls,
    shadowDrawCalls,
    maximumPassDrawCalls: primaryDrawCalls + shadowDrawCalls,
    poleInstances: poleCount,
    crossarmInstances: crossarmCount,
    insulatorInstances: crossarmCount * 3 + transformerCount * 3,
    transformerBodyInstances: transformerCount,
    conductorSegments,
    conductorVertices: conductorSegments * 2,
  };
}

function wireAttachmentHeight(node: CommercialElectricalNode) {
  return node.type === 'POLE' ? node.height - 0.08 : node.height + 0.145;
}

export function buildElectricalWirePositions(
  nodes: readonly CommercialElectricalNode[],
  connections: readonly CommercialElectricalConnection[],
  surfaceEntities: readonly MapEntity[],
  reducedGraphics = false,
  resolvedPlacements?: readonly ResolvedElectricalNodePlacement[],
) {
  const placements = resolvedPlacements
    ?? resolveElectricalNodePlacements(nodes, surfaceEntities);
  const placementByNodeId = new Map(placements.map((placement) => [placement.node.id, placement]));
  const crossarmByPoleChain = new Map(buildElectricalPoleCrossarmLayouts(
    nodes,
    connections,
    placements,
  ).map((layout) => [`${layout.nodeId}::${layout.sourceAlignmentChainId}`, layout]));
  const samples = reducedGraphics ? ELECTRICAL_WIRE_REDUCED_SAMPLES : ELECTRICAL_WIRE_SAMPLES;
  const positions: number[] = [];

  connections.forEach((connection) => {
    const fromPlacement = placementByNodeId.get(connection.fromNodeId);
    const toPlacement = placementByNodeId.get(connection.toNodeId);
    if (!fromPlacement || !toPlacement) return;
    const from = fromPlacement.node;
    const to = toPlacement.node;
    const deltaX = toPlacement.renderPosition[0] - fromPlacement.renderPosition[0];
    const deltaZ = toPlacement.renderPosition[1] - fromPlacement.renderPosition[1];
    const horizontalLength = Math.hypot(deltaX, deltaZ);
    if (horizontalLength <= Number.EPSILON) return;
    const perpendicularX = -deltaZ / horizontalLength;
    const perpendicularZ = deltaX / horizontalLength;
    const conductorCount = reducedGraphics ? 1 : connection.conductorCount;
    const offsets = Array.from({ length: conductorCount }, (_, index) => (
      (index - (conductorCount - 1) / 2) * ELECTRICAL_WIRE_CONDUCTOR_SPACING
    ));
    const fromY = fromPlacement.groundElevation + wireAttachmentHeight(from);
    const toY = toPlacement.groundElevation + wireAttachmentHeight(to);

    offsets.forEach((offset) => {
      const fromCrossarm = connection.sourceAlignmentChainId
        ? crossarmByPoleChain.get(`${from.id}::${connection.sourceAlignmentChainId}`)
        : null;
      const toCrossarm = connection.sourceAlignmentChainId
        ? crossarmByPoleChain.get(`${to.id}::${connection.sourceAlignmentChainId}`)
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
        // A crossarm axis is equivalent modulo PI, but phase identity is not:
        // canonicalize the destination axis so lateral conductors never swap
        // sides and cross inside an otherwise valid span.
        toOffsetX *= -1;
        toOffsetZ *= -1;
      }
      const pointAt = (t: number) => [
        fromPlacement.renderPosition[0] + deltaX * t + fromOffsetX + (toOffsetX - fromOffsetX) * t,
        fromY + (toY - fromY) * t - 4 * connection.sag * t * (1 - t),
        fromPlacement.renderPosition[1] + deltaZ * t + fromOffsetZ + (toOffsetZ - fromOffsetZ) * t,
      ] as const;
      for (let sample = 0; sample < samples - 1; sample += 1) {
        const start = pointAt(sample / (samples - 1));
        const end = pointAt((sample + 1) / (samples - 1));
        positions.push(...start, ...end);
      }
    });
  });

  return new Float32Array(positions);
}
