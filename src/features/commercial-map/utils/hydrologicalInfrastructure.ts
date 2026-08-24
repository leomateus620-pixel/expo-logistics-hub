import type {
  CommercialHydrologicalNode,
  CommercialHydrologicalPipeSegment,
} from '../data/hydrologicalInfrastructure';
import type { Coordinate, MapClassification, MapEntity } from '../types';
import {
  DEFAULT_FLAT_SURFACE_CLASSIFICATIONS,
  distanceToEntity,
  entitySurfaceElevation,
  pointInPolygon,
} from './spatialSurface';

/**
 * Two pipe batches, four node-detail batches and one optional selection batch.
 * The value is an upper bound; empty classes do not allocate a draw call.
 */
export const HYDROLOGICAL_INFRASTRUCTURE_PRIMARY_DRAW_CALL_BUDGET = 7;
export const HYDROLOGICAL_PIPE_FULL_MAX_SPAN = 0.9;
export const HYDROLOGICAL_PIPE_REDUCED_MAX_SPAN = 1.8;

const HYDROLOGICAL_SURFACE_CLEARANCE = 0.012;
const HYDROLOGICAL_FALLBACK_GROUND_ELEVATION = 0.036;
const HYDROLOGICAL_SCOPE_MARGIN = 2.8;
const FULL_PARK_ANCHORS = ['A1', 'A6', 'A11', 'QUADRA-A', 'QUADRA-S'] as const;
const HYDROLOGICAL_SUPPORT_CLASSIFICATIONS: ReadonlySet<MapClassification> = new Set([
  'SELLABLE_LOT',
  ...DEFAULT_FLAT_SURFACE_CLASSIFICATIONS,
  'RURAL_EXHIBITION',
  'LIVESTOCK_AREA',
  'RESTRICTED_AREA',
  'ATTRACTION',
  'EVENT_VENUE',
  'OTHER',
]);

interface IndexedHydrologicalSurface {
  entity: MapEntity;
  polygon: readonly Coordinate[];
  elevation: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export type HydrologicalPipeRenderClass = 'DISTRIBUTION' | 'HYDRANT_SUPPLY';
export type HydrologicalNodeRenderKind =
  | 'TAP'
  | 'HYDRANT'
  | 'RESERVOIR'
  | 'WELL'
  | 'VALVE'
  | 'TECHNICAL_MARKER'
  | 'JUNCTION'
  | 'SUPPLY_ENTRY';

export interface ResolvedHydrologicalNodePlacement {
  node: CommercialHydrologicalNode;
  /** Exact registered world X/Z. Presentation never projects or snaps the source anchor. */
  renderPosition: Coordinate;
  groundElevation: number;
  surfaceEntityId: string | null;
  placementStatus: 'CONTAINING_SURFACE' | 'TECHNICAL_FLOOR';
  sourceAnchorPreserved: true;
}

export interface HydrologicalPipeSpan {
  id: string;
  segment: CommercialHydrologicalPipeSegment;
  renderClass: HydrologicalPipeRenderClass;
  diameterMm: number | null;
  renderRadius: number;
  start: readonly [number, number, number];
  end: readonly [number, number, number];
  length: number;
  activationStart: number;
  activationEnd: number;
}

export interface HydrologicalInfrastructureTopology {
  nodeCount: number;
  segmentCount: number;
  distributionSegmentCount: number;
  hydrantSupplySegmentCount: number;
  totalRouteLength: number;
  connectedComponentCount: number;
  connectedComponents: readonly (readonly string[])[];
  terminalNodeIds: readonly string[];
  junctionNodeIds: readonly string[];
  isolatedNodeIds: readonly string[];
  orphanSegmentIds: readonly string[];
  duplicateNodeIds: readonly string[];
  duplicateSegmentIds: readonly string[];
  linkedSegmentMismatchNodeIds: readonly string[];
}

function normalizeInfrastructureToken(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toUpperCase();
}

export function hydrologicalPipeRenderClass(
  segment: CommercialHydrologicalPipeSegment,
): HydrologicalPipeRenderClass {
  const category = normalizeInfrastructureToken(segment.category);
  return category.includes('HIDR')
    || category.includes('HYDR')
    || category.includes('INCEND')
    || category.includes('ALTA_VAZAO')
    || category.includes('HIGH_FLOW')
    || category === 'RED'
    ? 'HYDRANT_SUPPLY'
    : 'DISTRIBUTION';
}

export function hydrologicalNodeRenderKind(
  node: CommercialHydrologicalNode,
): HydrologicalNodeRenderKind {
  const type = normalizeInfrastructureToken(node.type);
  if (type.includes('CORSAN') || type.includes('ENTRADA') || type.includes('SUPPLY')) {
    return 'SUPPLY_ENTRY';
  }
  if (type.includes('RESERV') || type.includes('CAIXA') || type.includes('TANK')) {
    return 'RESERVOIR';
  }
  if (type.includes('POCO') || type.includes('WELL')) return 'WELL';
  if (type.includes('REGIST') || type.includes('VALV')) return 'VALVE';
  if (type.includes('HIDR') || type.includes('HYDRANT')) return 'HYDRANT';
  // The official sheet does not expand the TL acronym. Keep it visually
  // neutral rather than inventing a tap/valve meaning.
  if (
    type === 'TL'
    || type.includes('PONTO_TECNICO')
    || type.includes('TECHNICAL_SYMBOL')
  ) return 'TECHNICAL_MARKER';
  if (type.includes('JUNCTION')) return 'JUNCTION';
  return 'TAP';
}

/**
 * The physical diameter is visually amplified just enough to remain legible at
 * park scale. Ordering between official diameters remains monotonic.
 */
export function hydrologicalPipeRenderRadius(diameterMm: number | null | undefined) {
  const safeDiameter = Number.isFinite(diameterMm) ? Math.max(0, diameterMm) : 0;
  return Math.min(0.108, Math.max(0.054, 0.039 + safeDiameter * 0.00076));
}

function surfacePriority(entity: MapEntity) {
  switch (entity.classification) {
    case 'ROAD': return 0;
    case 'PEDESTRIAN_PATH': return 1;
    case 'PARKING': return 2;
    case 'WATER': return 3;
    case 'GREEN_AREA': return 4;
    case 'SELLABLE_LOT': return 5;
    case 'QUADRA': return 6;
    default: return 7;
  }
}

function indexHydrologicalSurfaces(entities: readonly MapEntity[]) {
  return entities.flatMap<IndexedHydrologicalSurface>((entity) => {
    if (!HYDROLOGICAL_SUPPORT_CLASSIFICATIONS.has(entity.classification)) return [];
    const polygon = entity.geometry.coordinates[0] ?? [];
    if (polygon.length < 3) return [];
    const xs = polygon.map(([x]) => x).filter(Number.isFinite);
    const zs = polygon.map(([, z]) => z).filter(Number.isFinite);
    if (xs.length < 3 || zs.length < 3) return [];
    return [{
      entity,
      polygon,
      elevation: entitySurfaceElevation(entity, {
        flatClassifications: DEFAULT_FLAT_SURFACE_CLASSIFICATIONS,
        clearance: HYDROLOGICAL_SURFACE_CLEARANCE,
      }),
      bounds: {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minZ: Math.min(...zs),
        maxZ: Math.max(...zs),
      },
    }];
  });
}

function containingHydrologicalSurface(
  position: readonly [number, number],
  surfaces: readonly IndexedHydrologicalSurface[],
) {
  const containing = surfaces.filter((surface) => (
    position[0] >= surface.bounds.minX
    && position[0] <= surface.bounds.maxX
    && position[1] >= surface.bounds.minZ
    && position[1] <= surface.bounds.maxZ
    && pointInPolygon(position, surface.polygon)
  ));
  containing.sort((left, right) => (
    right.elevation - left.elevation
    || surfacePriority(left.entity) - surfacePriority(right.entity)
    || left.entity.id.localeCompare(right.entity.id)
  ));
  return containing[0] ?? null;
}

function resolveGroundElevationFromIndex(
  position: readonly [number, number],
  surfaces: readonly IndexedHydrologicalSurface[],
) {
  const surface = containingHydrologicalSurface(position, surfaces);
  return {
    groundElevation: surface?.elevation ?? HYDROLOGICAL_FALLBACK_GROUND_ELEVATION,
    surfaceEntityId: surface?.entity.id ?? null,
    placementStatus: surface
      ? 'CONTAINING_SURFACE' as const
      : 'TECHNICAL_FLOOR' as const,
  };
}

export function resolveHydrologicalGroundElevation(
  position: readonly [number, number],
  entities: readonly MapEntity[] = [],
) {
  return resolveGroundElevationFromIndex(position, indexHydrologicalSurfaces(entities));
}

export function resolveHydrologicalNodePlacements(
  nodes: readonly CommercialHydrologicalNode[],
  entities: readonly MapEntity[] = [],
): readonly ResolvedHydrologicalNodePlacement[] {
  const surfaces = indexHydrologicalSurfaces(entities);
  return nodes.map((node) => {
    const resolved = resolveGroundElevationFromIndex(node.position, surfaces);
    return {
      node,
      renderPosition: [node.position[0], node.position[1]],
      ...resolved,
      sourceAnchorPreserved: true,
    };
  });
}

export function hydrologicalRouteLength(route: readonly Coordinate[]) {
  let length = 0;
  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    length += Math.hypot(end[0] - start[0], end[1] - start[1]);
  }
  return length;
}

export function buildHydrologicalPipeSpans(
  segments: readonly CommercialHydrologicalPipeSegment[],
  entities: readonly MapEntity[] = [],
  reducedGraphics = false,
): readonly HydrologicalPipeSpan[] {
  const surfaces = indexHydrologicalSurfaces(entities);
  const maxSpan = reducedGraphics
    ? HYDROLOGICAL_PIPE_REDUCED_MAX_SPAN
    : HYDROLOGICAL_PIPE_FULL_MAX_SPAN;
  const spans: HydrologicalPipeSpan[] = [];

  segments.forEach((segment) => {
    const renderClass = hydrologicalPipeRenderClass(segment);
    const renderRadius = hydrologicalPipeRenderRadius(segment.diameterMm);
    const segmentActivation = Number.isFinite(segment.activationDistance)
      ? Math.max(0, segment.activationDistance)
      : 0;
    let routeDistance = 0;
    for (let routeIndex = 0; routeIndex < segment.route.length - 1; routeIndex += 1) {
      const routeStart = segment.route[routeIndex];
      const routeEnd = segment.route[routeIndex + 1];
      const edgeLength = Math.hypot(
        routeEnd[0] - routeStart[0],
        routeEnd[1] - routeStart[1],
      );
      if (!Number.isFinite(edgeLength) || edgeLength <= Number.EPSILON) continue;
      const subdivisions = Math.max(1, Math.ceil(edgeLength / maxSpan));
      for (let subdivision = 0; subdivision < subdivisions; subdivision += 1) {
        const startT = subdivision / subdivisions;
        const endT = (subdivision + 1) / subdivisions;
        const sourceStart = [
          routeStart[0] + (routeEnd[0] - routeStart[0]) * startT,
          routeStart[1] + (routeEnd[1] - routeStart[1]) * startT,
        ] as const;
        const sourceEnd = [
          routeStart[0] + (routeEnd[0] - routeStart[0]) * endT,
          routeStart[1] + (routeEnd[1] - routeStart[1]) * endT,
        ] as const;
        const startGround = resolveGroundElevationFromIndex(sourceStart, surfaces).groundElevation;
        const endGround = resolveGroundElevationFromIndex(sourceEnd, surfaces).groundElevation;
        const activationStart = segmentActivation + routeDistance + edgeLength * startT;
        const activationEnd = segmentActivation + routeDistance + edgeLength * endT;
        const start = [
          sourceStart[0],
          startGround + renderRadius,
          sourceStart[1],
        ] as const;
        const end = [
          sourceEnd[0],
          endGround + renderRadius,
          sourceEnd[1],
        ] as const;
        spans.push({
          id: `${segment.id}:edge-${routeIndex}:span-${subdivision}`,
          segment,
          renderClass,
          diameterMm: segment.diameterMm,
          renderRadius,
          start,
          end,
          length: Math.hypot(
            end[0] - start[0],
            end[1] - start[1],
            end[2] - start[2],
          ),
          activationStart,
          activationEnd,
        });
      }
      routeDistance += edgeLength;
    }
  });

  return spans;
}

function duplicateIds(items: readonly { id: string }[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  items.forEach(({ id }) => {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  });
  return [...duplicates].sort();
}

export function analyzeHydrologicalInfrastructureTopology(
  nodes: readonly CommercialHydrologicalNode[],
  segments: readonly CommercialHydrologicalPipeSegment[],
): HydrologicalInfrastructureTopology {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  const incidentSegmentIds = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  const orphanSegmentIds: string[] = [];

  segments.forEach((segment) => {
    const source = nodeById.get(segment.sourceNodeId);
    const target = nodeById.get(segment.targetNodeId);
    if (!source || !target || source.id === target.id) {
      orphanSegmentIds.push(segment.id);
      return;
    }
    adjacency.get(source.id)?.add(target.id);
    adjacency.get(target.id)?.add(source.id);
    incidentSegmentIds.get(source.id)?.add(segment.id);
    incidentSegmentIds.get(target.id)?.add(segment.id);
  });

  // Operational assets (tap, hydrant, reservoir, etc.) may sit along a span
  // rather than replace one of its geometric endpoints. Their official
  // linkedSegmentIds attach them to both endpoint nodes without modifying the
  // source route or inventing an extra branch segment.
  nodes.forEach((node) => {
    (node.linkedSegmentIds ?? []).forEach((segmentId) => {
      const segment = segmentById.get(segmentId);
      if (!segment) return;
      incidentSegmentIds.get(node.id)?.add(segmentId);
      if (node.id === segment.sourceNodeId || node.id === segment.targetNodeId) return;
      [segment.sourceNodeId, segment.targetNodeId].forEach((endpointNodeId) => {
        if (!nodeById.has(endpointNodeId)) return;
        adjacency.get(node.id)?.add(endpointNodeId);
        adjacency.get(endpointNodeId)?.add(node.id);
      });
    });
  });

  const linkedSegmentMismatchNodeIds = nodes.flatMap((node) => {
    const declared = new Set(node.linkedSegmentIds ?? []);
    const endpointSegments = segments.filter((segment) => (
      segment.sourceNodeId === node.id || segment.targetNodeId === node.id
    ));
    const mismatch = [...declared].some((segmentId) => !segmentById.has(segmentId))
      || endpointSegments.some((segment) => !declared.has(segment.id));
    return mismatch ? [node.id] : [];
  }).sort();

  const connectedComponents: string[][] = [];
  const visited = new Set<string>();
  [...nodeById.keys()].sort().forEach((rootNodeId) => {
    if (visited.has(rootNodeId)) return;
    const component: string[] = [];
    const pending = [rootNodeId];
    visited.add(rootNodeId);
    while (pending.length > 0) {
      const nodeId = pending.shift()!;
      component.push(nodeId);
      [...(adjacency.get(nodeId) ?? [])].sort().forEach((adjacentNodeId) => {
        if (visited.has(adjacentNodeId)) return;
        visited.add(adjacentNodeId);
        pending.push(adjacentNodeId);
      });
    }
    connectedComponents.push(component.sort());
  });

  const nodeDegree = (nodeId: string) => adjacency.get(nodeId)?.size ?? 0;
  return {
    nodeCount: nodes.length,
    segmentCount: segments.length,
    distributionSegmentCount: segments.filter((segment) => (
      hydrologicalPipeRenderClass(segment) === 'DISTRIBUTION'
    )).length,
    hydrantSupplySegmentCount: segments.filter((segment) => (
      hydrologicalPipeRenderClass(segment) === 'HYDRANT_SUPPLY'
    )).length,
    totalRouteLength: segments.reduce((total, segment) => (
      total + hydrologicalRouteLength(segment.route)
    ), 0),
    connectedComponentCount: connectedComponents.length,
    connectedComponents,
    terminalNodeIds: nodes.filter((node) => nodeDegree(node.id) === 1).map((node) => node.id).sort(),
    junctionNodeIds: nodes.filter((node) => nodeDegree(node.id) >= 3).map((node) => node.id).sort(),
    isolatedNodeIds: nodes.filter((node) => nodeDegree(node.id) === 0).map((node) => node.id).sort(),
    orphanSegmentIds: [...new Set(orphanSegmentIds)].sort(),
    duplicateNodeIds: duplicateIds(nodes),
    duplicateSegmentIds: duplicateIds(segments),
    linkedSegmentMismatchNodeIds,
  };
}

function sceneBounds(entities: readonly MapEntity[]) {
  const points = entities.flatMap((entity) => entity.geometry.coordinates.flat());
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

function infrastructureBounds(
  nodes: readonly CommercialHydrologicalNode[],
  segments: readonly CommercialHydrologicalPipeSegment[],
) {
  const points = [
    ...nodes.map((node) => node.position),
    ...segments.flatMap((segment) => segment.route),
  ];
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

function boundsContain(
  outer: NonNullable<ReturnType<typeof sceneBounds>>,
  inner: NonNullable<ReturnType<typeof infrastructureBounds>>,
) {
  return inner.minX >= outer.minX - HYDROLOGICAL_SCOPE_MARGIN
    && inner.maxX <= outer.maxX + HYDROLOGICAL_SCOPE_MARGIN
    && inner.minZ >= outer.minZ - HYDROLOGICAL_SCOPE_MARGIN
    && inner.maxZ <= outer.maxZ + HYDROLOGICAL_SCOPE_MARGIN;
}

function isFullParkScene(
  entities: readonly MapEntity[],
  nodes: readonly CommercialHydrologicalNode[],
  segments: readonly CommercialHydrologicalPipeSegment[],
) {
  const identifiers = new Set(entities.map((entity) => entity.publicIdentifier));
  if (FULL_PARK_ANCHORS.every((identifier) => identifiers.has(identifier))) return true;
  const scene = sceneBounds(entities);
  const infrastructure = infrastructureBounds(nodes, segments);
  return Boolean(scene && infrastructure && boundsContain(scene, infrastructure));
}

function nodeBelongsToScopedScene(
  node: CommercialHydrologicalNode,
  entities: readonly MapEntity[],
  bounds: NonNullable<ReturnType<typeof sceneBounds>>,
) {
  const [x, z] = node.position;
  if (
    x < bounds.minX - HYDROLOGICAL_SCOPE_MARGIN
    || x > bounds.maxX + HYDROLOGICAL_SCOPE_MARGIN
    || z < bounds.minZ - HYDROLOGICAL_SCOPE_MARGIN
    || z > bounds.maxZ + HYDROLOGICAL_SCOPE_MARGIN
  ) return false;
  return entities.some((entity) => (
    distanceToEntity(node.position, entity) <= HYDROLOGICAL_SCOPE_MARGIN
  ));
}

/**
 * Keeps the authoritative graph intact in scoped scenes: only edges whose two
 * registered endpoint nodes belong to the scene are returned, so callers never
 * receive an orphan edge or a synthetic/clipped route.
 */
export function selectCommercialHydrologicalInfrastructureForScene(
  nodes: readonly CommercialHydrologicalNode[],
  segments: readonly CommercialHydrologicalPipeSegment[],
  entities: readonly MapEntity[],
) {
  if (entities.length === 0) return { nodes: [], segments: [] };
  if (isFullParkScene(entities, nodes, segments)) {
    return { nodes: [...nodes], segments: [...segments] };
  }
  const bounds = sceneBounds(entities);
  if (!bounds) return { nodes: [], segments: [] };
  const scopedNodes = nodes.filter((node) => nodeBelongsToScopedScene(node, entities, bounds));
  const scopedNodeIds = new Set(scopedNodes.map((node) => node.id));
  const scopedSegments = segments.filter((segment) => (
    scopedNodeIds.has(segment.sourceNodeId) && scopedNodeIds.has(segment.targetNodeId)
  ));
  const scopedSegmentIds = new Set(scopedSegments.map((segment) => segment.id));
  return {
    nodes: scopedNodes.map((node) => ({
      ...node,
      linkedSegmentIds: node.linkedSegmentIds.filter((segmentId) => scopedSegmentIds.has(segmentId)),
    })),
    segments: scopedSegments,
  };
}

export function hydrologicalInfrastructureInstanceBudget(
  nodes: readonly CommercialHydrologicalNode[],
  segments: readonly CommercialHydrologicalPipeSegment[],
  reducedGraphics = false,
) {
  const pipeClasses = new Set(segments.map(hydrologicalPipeRenderClass)).size;
  const renderedNodes = nodes.filter((node) => hydrologicalNodeRenderKind(node) !== 'JUNCTION');
  const accessoryCount = renderedNodes.filter((node) => (
    hydrologicalNodeRenderKind(node) !== 'RESERVOIR'
  )).length;
  const ringCount = reducedGraphics ? 0 : renderedNodes.filter((node) => (
    ['HYDRANT', 'RESERVOIR', 'WELL', 'SUPPLY_ENTRY'].includes(hydrologicalNodeRenderKind(node))
  )).length;
  const selectableCount = renderedNodes.filter((node) => node.selectable).length;
  const primaryDrawCalls = pipeClasses
    + (renderedNodes.length > 0 ? 2 : 0)
    + (accessoryCount > 0 ? 1 : 0)
    + (ringCount > 0 ? 1 : 0)
    + (selectableCount > 0 ? 1 : 0);
  return {
    nodeCount: nodes.length,
    renderedNodeCount: renderedNodes.length,
    junctionNodeCount: nodes.length - renderedNodes.length,
    segmentCount: segments.length,
    pipeClasses,
    pipeSpanCount: segments.reduce((total, segment) => total + segment.route.reduce(
      (routeTotal, point, index) => {
        const next = segment.route[index + 1];
        if (!next) return routeTotal;
        const edgeLength = Math.hypot(next[0] - point[0], next[1] - point[1]);
        const maxSpan = reducedGraphics
          ? HYDROLOGICAL_PIPE_REDUCED_MAX_SPAN
          : HYDROLOGICAL_PIPE_FULL_MAX_SPAN;
        return routeTotal + Math.max(1, Math.ceil(edgeLength / maxSpan));
      },
      0,
    ), 0),
    nodeBodyInstances: renderedNodes.length,
    nodeTopInstances: renderedNodes.length,
    nodeAccessoryInstances: accessoryCount,
    nodeRingInstances: ringCount,
    selectionInstances: selectableCount,
    primaryDrawCalls,
    shadowDrawCalls: 0,
    maximumPassDrawCalls: primaryDrawCalls,
    withinPrimaryBudget: primaryDrawCalls <= HYDROLOGICAL_INFRASTRUCTURE_PRIMARY_DRAW_CALL_BUDGET,
  };
}
