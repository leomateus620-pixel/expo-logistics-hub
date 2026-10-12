import type { OrgEdge, OrgNode } from '../types';

export interface OrgLayoutPoint {
  x: number;
  y: number;
}

export interface OrgLayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedOrgNode extends OrgLayoutPoint {
  node: OrgNode;
  /** Stable order inside the node's own hierarchy level. */
  levelOrder: number;
  order: number;
  radius: number;
}

export interface PositionedOrgEdge {
  edge: OrgEdge;
  path: string;
  source: OrgLayoutPoint;
  target: OrgLayoutPoint;
}

export interface OrganizationalLayout {
  bounds: OrgLayoutBounds;
  nodes: PositionedOrgNode[];
  edges: PositionedOrgEdge[];
  nodeById: Map<string, PositionedOrgNode>;
}

export type OrgNavigationDirection = 'up' | 'right' | 'down' | 'left';

const LEVEL_RADII: Record<1 | 2 | 3 | 4, number> = {
  1: 80,
  2: 62,
  3: 52,
  4: 42,
};

const TOP_PADDING = 88;
// Include the entire portrait + caption, including the CCPF member count.
const LEVEL_2_Y = 360;
const LEVEL_3_Y = 590;
const LEVEL_4_Y = 810;
const LEVEL_4_ROW_GAP = 232;
const LEVEL_4_COLUMN_GAP = 184;
const SIDE_PADDING = 102;

/** Visual rows are independent of institutional authority and filter identity. */
export function organizationalPresentationLevel(node: OrgNode): number {
  if (node.type === 'ccp') return 1;
  if (node.type === 'executive') {
    const roles = node.metadata.executiveRole;
    return Array.isArray(roles) && roles.includes('president') ? 1 : 2;
  }
  return node.authorityLevel;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function sortNodes(nodes: OrgNode[]): OrgNode[] {
  return [...nodes].sort((a, b) => (
    a.sortOrder - b.sortOrder
    || a.type.localeCompare(b.type, 'pt-BR')
    || a.title.localeCompare(b.title, 'pt-BR')
    || a.id.localeCompare(b.id)
  ));
}

function distributeAcrossSpan(
  nodes: OrgNode[],
  y: number,
  centerX: number,
  preferredGap: number,
  maximumSpan: number,
  orderOffset: number,
): PositionedOrgNode[] {
  if (nodes.length === 0) return [];
  const span = Math.min(maximumSpan, Math.max(0, (nodes.length - 1) * preferredGap));
  const startX = centerX - span / 2;
  const gap = nodes.length === 1 ? 0 : span / (nodes.length - 1);

  return nodes.map((node, index) => ({
    node,
    x: startX + gap * index,
    y,
    levelOrder: index,
    order: orderOffset + index,
    radius: LEVEL_RADII[node.authorityLevel as 1 | 2 | 3 | 4] ?? LEVEL_RADII[4],
  }));
}

function averageParentX(
  node: OrgNode,
  positionedById: Map<string, PositionedOrgNode>,
  fallback: number,
): number {
  const parentPositions = node.parentIds
    .map((parentId) => positionedById.get(parentId)?.x)
    .filter((value): value is number => typeof value === 'number');

  if (parentPositions.length === 0) return fallback;
  return parentPositions.reduce((sum, value) => sum + value, 0) / parentPositions.length;
}

function createConnectionPath(source: PositionedOrgNode, target: PositionedOrgNode): string {
  const side = target.x >= source.x ? 1 : -1;
  const sourceX = source.x + side * source.radius * 0.9;
  const sourceY = source.y + source.radius * 0.38;
  const captionHalfWidth = source.node.type === 'ccp' ? 143
    : source.node.type === 'executive' ? 112 : 98;
  const exitX = source.x + side * (captionHalfWidth + 12);
  // Leave the rim horizontally before descending beside the source caption.
  const departure = `M ${sourceX} ${sourceY} C ${sourceX + side * 24} ${sourceY}, ${exitX} ${sourceY}, ${exitX} ${sourceY + 24}`;
  if (target.node.authorityLevel === 4) {
    // Keep the established column gutters and fan-out. The approach to each
    // upper side of the rim stays below the preceding row's long captions.
    const gutterSide = target.x === source.x ? -1 : side;
    const gutterX = target.x - gutterSide * (LEVEL_4_COLUMN_GAP / 2);
    const fanY = source.y + 156;
    const targetX = target.x - gutterSide * target.radius * 0.9;
    const targetY = target.y - target.radius * 0.38;
    return `${departure} L ${exitX} ${fanY - 18} Q ${exitX} ${fanY} ${exitX + side * 18} ${fanY} L ${gutterX} ${fanY} L ${gutterX} ${targetY - 18} Q ${gutterX} ${targetY} ${targetX} ${targetY}`;
  }
  const targetY = target.y - target.radius - 5;
  return `${departure} L ${exitX} ${targetY - 22} Q ${exitX} ${targetY} ${target.x} ${targetY}`;
}

export interface OrganizationalLayoutOptions {
  viewportWidth?: number;
  viewportHeight?: number;
}

/**
 * Stable, domain-agnostic organizational layout. It consumes only the already
 * resolved graph model and never infers authority from names or labels.
 */
export function calculateOrganizationalLayout(
  nodes: OrgNode[],
  edges: OrgEdge[],
  options: OrganizationalLayoutOptions = {},
): OrganizationalLayout {
  const renderable = sortNodes(nodes.filter((node) => (
    node.isRenderable && node.authorityLevel >= 1 && node.authorityLevel <= 4
  )));
  const byLevel = new Map<number, OrgNode[]>();
  renderable.forEach((node) => {
    const level = organizationalPresentationLevel(node);
    const group = byLevel.get(level) ?? [];
    group.push(node);
    byLevel.set(level, group);
  });

  const level4 = byLevel.get(4) ?? [];
  const level3 = byLevel.get(3) ?? [];
  const compact = (options.viewportWidth ?? 1280) <= 720
    || ((options.viewportWidth ?? 1280) <= 960 && (options.viewportHeight ?? 800) <= 520);
  const level4Columns = level4.length === 0 ? 1 : compact
    ? Math.min(level4.length, (options.viewportWidth ?? 390) <= 440 ? 2 : 3)
    : clamp(Math.ceil(level4.length / 3), 1, 12);
  const level4Rows = Math.max(1, Math.ceil(level4.length / level4Columns));
  const worldWidth = Math.max(
    compact ? 600 : 660,
    (level4Columns - 1) * LEVEL_4_COLUMN_GAP + SIDE_PADDING * 2,
    (Math.min(10, Math.max(1, level3.length)) - 1) * 188 + SIDE_PADDING * 2,
  );
  const centralY = LEVEL_3_Y;
  const operationalY = LEVEL_4_Y;
  const worldHeight = level4.length > 0
    ? operationalY + (level4Rows - 1) * LEVEL_4_ROW_GAP + 132
    : centralY + 180;
  const centerX = worldWidth / 2;
  const maximumTopSpan = worldWidth - SIDE_PADDING * 2;

  const positioned: PositionedOrgNode[] = [];
  let order = 0;

  const level1Positions = distributeAcrossSpan(
    [...(byLevel.get(1) ?? [])].sort((a, b) => Number(a.type !== 'ccp') - Number(b.type !== 'ccp') || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    TOP_PADDING,
    centerX,
    300,
    maximumTopSpan,
    order,
  );
  positioned.push(...level1Positions);
  order += level1Positions.length;

  const level2Positions = distributeAcrossSpan(
    byLevel.get(2) ?? [],
    LEVEL_2_Y,
    centerX,
    280,
    maximumTopSpan,
    order,
  );
  positioned.push(...level2Positions);
  order += level2Positions.length;

  const level3Base = distributeAcrossSpan(
    level3,
    centralY,
    centerX,
    220,
    maximumTopSpan,
    order,
  );
  const level3Positions = level3Base.map((item, index) => {
    const normalized = level3Base.length <= 1
      ? 0
      : Math.abs((index / (level3Base.length - 1)) * 2 - 1);
    return { ...item, y: item.y + Math.pow(normalized, 1.35) * 62 };
  });
  positioned.push(...level3Positions);
  order += level3Positions.length;

  const positionedById = new Map(positioned.map((item) => [item.node.id, item]));
  const orderedLevel4 = [...level4].sort((a, b) => (
    averageParentX(a, positionedById, centerX) - averageParentX(b, positionedById, centerX)
    || Number(a.type === 'advisory') - Number(b.type === 'advisory')
    || a.sortOrder - b.sortOrder
    || a.title.localeCompare(b.title, 'pt-BR')
    || a.id.localeCompare(b.id)
  ));

  const columnGap = LEVEL_4_COLUMN_GAP;
  const gridStartX = centerX - ((level4Columns - 1) * columnGap) / 2;
  const availableSlots = Array.from({ length: level4Rows * level4Columns }, (_, slotIndex) => {
    const row = Math.floor(slotIndex / level4Columns);
    const column = slotIndex % level4Columns;
    return {
      row,
      column,
      x: gridStartX + columnGap * column,
      y: operationalY + row * LEVEL_4_ROW_GAP,
    };
  });

  orderedLevel4.forEach((node, index) => {
    const desiredX = averageParentX(node, positionedById, centerX);
    let bestSlotIndex = 0;
    let bestCost = Number.POSITIVE_INFINITY;
    availableSlots.forEach((slot, slotIndex) => {
      const rowCost = slot.row * 66;
      const advisoryLaneBias = node.type === 'advisory'
        ? Math.max(0, centerX - slot.x) * 0.08
        : Math.max(0, slot.x - centerX) * 0.025;
      const cost = Math.abs(slot.x - desiredX) + rowCost + advisoryLaneBias;
      if (cost < bestCost) {
        bestCost = cost;
        bestSlotIndex = slotIndex;
      }
    });
    const [slot] = availableSlots.splice(bestSlotIndex, 1);
    if (!slot) return;
    const item: PositionedOrgNode = {
      node,
      x: slot.x,
      y: slot.y,
      levelOrder: index,
      order: order + index,
      radius: LEVEL_RADII[4],
    };
    positioned.push(item);
    positionedById.set(node.id, item);
  });

  const finalNodeById = new Map(positioned.map((item) => [item.node.id, item]));
  const positionedEdges = edges.flatMap((edge): PositionedOrgEdge[] => {
    const source = finalNodeById.get(edge.sourceId);
    const target = finalNodeById.get(edge.targetId);
    if (!source || !target) return [];
    return [{
      edge,
      path: createConnectionPath(source, target),
      source: { x: source.x, y: source.y },
      target: { x: target.x, y: target.y },
    }];
  });

  return {
    bounds: { x: 0, y: 0, width: worldWidth, height: worldHeight },
    nodes: positioned,
    edges: positionedEdges,
    nodeById: finalNodeById,
  };
}

export function findDirectionalNode(
  layout: OrganizationalLayout,
  currentNodeId: string,
  direction: OrgNavigationDirection,
): PositionedOrgNode | null {
  const current = layout.nodeById.get(currentNodeId);
  if (!current) return null;

  const axis = direction === 'left' || direction === 'right' ? 'x' : 'y';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  let best: PositionedOrgNode | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const sameRowPeers = axis === 'x' && layout.nodes.some((candidate) => (
    (candidate.x - current.x) * sign > 8 && Math.abs(candidate.y - current.y) <= 8
  ));

  layout.nodes.forEach((candidate) => {
    if (candidate.node.id === currentNodeId) return;
    const primaryDelta = (candidate[axis] - current[axis]) * sign;
    if (primaryDelta <= 8) return;
    const secondaryDelta = axis === 'x'
      ? Math.abs(candidate.y - current.y)
      : Math.abs(candidate.x - current.x);
    if (sameRowPeers && secondaryDelta > 8) return;
    // Prefer the next visual band while still penalizing strong diagonal jumps.
    // A lighter cross-axis weight keeps a centered Level 3 node from skipping
    // over the intentionally split President/Vice band.
    const score = primaryDelta + secondaryDelta * 0.38;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  });

  return best;
}
