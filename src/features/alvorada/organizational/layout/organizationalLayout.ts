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

const TOP_PADDING = 100;
const LEVEL_2_Y = 310;
const LEVEL_3_Y = 490;
const LEVEL_4_Y = 700;
const LEVEL_4_ROW_GAP = 170;
const LEVEL_4_COLUMN_GAP = 172;
const SIDE_PADDING = 150;

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
  const direction = target.y >= source.y ? 1 : -1;
  const sourceY = source.y + source.radius * direction;
  const targetY = target.y - target.radius * direction;
  const verticalDistance = Math.abs(targetY - sourceY);
  const bend = clamp(verticalDistance * 0.48, 72, 180) * direction;

  if (verticalDistance < 80) {
    const horizontalBend = Math.max(80, Math.abs(target.x - source.x) * 0.36);
    return `M ${source.x} ${source.y} C ${source.x + horizontalBend} ${source.y}, ${target.x - horizontalBend} ${target.y}, ${target.x} ${target.y}`;
  }

  return `M ${source.x} ${sourceY} C ${source.x} ${sourceY + bend}, ${target.x} ${targetY - bend}, ${target.x} ${targetY}`;
}

/**
 * Stable, domain-agnostic organizational layout. It consumes only the already
 * resolved graph model and never infers authority from names or labels.
 */
export function calculateOrganizationalLayout(
  nodes: OrgNode[],
  edges: OrgEdge[],
): OrganizationalLayout {
  const renderable = sortNodes(nodes.filter((node) => (
    node.isRenderable && node.authorityLevel >= 1 && node.authorityLevel <= 4
  )));
  const byLevel = new Map<number, OrgNode[]>();
  renderable.forEach((node) => {
    const group = byLevel.get(node.authorityLevel) ?? [];
    group.push(node);
    byLevel.set(node.authorityLevel, group);
  });

  const level4 = byLevel.get(4) ?? [];
  const level3 = byLevel.get(3) ?? [];
  const level4Columns = level4.length === 0
    ? 1
    : clamp(Math.ceil(level4.length / 3), 1, 12);
  const level4Rows = Math.max(1, Math.ceil(level4.length / level4Columns));
  const worldWidth = Math.max(
    1640,
    (level4Columns - 1) * LEVEL_4_COLUMN_GAP + SIDE_PADDING * 2,
    (Math.min(10, Math.max(1, level3.length)) - 1) * 188 + SIDE_PADDING * 2,
  );
  const worldHeight = level4.length > 0
    ? LEVEL_4_Y + (level4Rows - 1) * LEVEL_4_ROW_GAP + 170
    : LEVEL_3_Y + 240;
  const centerX = worldWidth / 2;
  const maximumTopSpan = worldWidth - SIDE_PADDING * 2;

  const positioned: PositionedOrgNode[] = [];
  let order = 0;

  const level1Positions = distributeAcrossSpan(
    byLevel.get(1) ?? [],
    TOP_PADDING,
    centerX,
    420,
    maximumTopSpan * 0.48,
    order,
  );
  positioned.push(...level1Positions);
  order += level1Positions.length;

  const level2Positions = distributeAcrossSpan(
    byLevel.get(2) ?? [],
    LEVEL_2_Y,
    centerX,
    390,
    maximumTopSpan * 0.62,
    order,
  );
  positioned.push(...level2Positions);
  order += level2Positions.length;

  const level3Base = distributeAcrossSpan(
    level3,
    LEVEL_3_Y,
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
    const organicOffset = row % 2 === 1 && level4Columns > 1
      ? Math.sin((column / (level4Columns - 1)) * Math.PI) * columnGap * 0.16
      : 0;
    return {
      row,
      column,
      x: gridStartX + columnGap * column + organicOffset,
      y: LEVEL_4_Y + row * LEVEL_4_ROW_GAP + (column % 2 === 0 ? 0 : 4),
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

  layout.nodes.forEach((candidate) => {
    if (candidate.node.id === currentNodeId) return;
    const primaryDelta = (candidate[axis] - current[axis]) * sign;
    if (primaryDelta <= 8) return;
    const secondaryDelta = axis === 'x'
      ? Math.abs(candidate.y - current.y)
      : Math.abs(candidate.x - current.x);
    // Prefer the next visual band while still penalizing strong diagonal jumps.
    // A lighter cross-axis weight keeps a centered Level 3 node from skipping
    // over the intentionally split President/Vice band.
    const score = primaryDelta + secondaryDelta * 0.72;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  });

  return best;
}
