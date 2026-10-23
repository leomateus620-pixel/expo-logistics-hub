import type { OrgEdge, OrgNode, OrgPerson } from '../types';
import type { OrgGraphFilter } from '../hooks/useOrgGraphInteraction';

export interface OrgLayoutPoint { x: number; y: number }
export interface OrgLayoutBounds extends OrgLayoutPoint { width: number; height: number }
export interface PositionedOrgNode extends OrgLayoutPoint {
  node: OrgNode; levelOrder: number; order: number; radius: number;
  width: number; height: number; horizontal: boolean; context: boolean; captionSide?: 'left' | 'right'; compactGroup?: boolean;
}
export interface PositionedOrgEdge { edge: OrgEdge; path: string; source: OrgLayoutPoint; target: OrgLayoutPoint }
export interface OrganizationalLayout {
  bounds: OrgLayoutBounds; nodes: PositionedOrgNode[]; edges: PositionedOrgEdge[];
  nodeById: Map<string, PositionedOrgNode>; grouped: boolean;
  page: number; pageCount: number; unitCount: number; minimumScale: number;
}
export type OrgNavigationDirection = 'up' | 'right' | 'down' | 'left';
export interface OrganizationalLayoutOptions {
  viewportWidth?: number; viewportHeight?: number; availableWidth?: number; availableHeight?: number;
  people?: Record<string, OrgPerson>; filter?: OrgGraphFilter; page?: number;
}

/** Presentation depth deliberately does not change institutional authority. */
export function organizationalPresentationLevel(node: OrgNode): number {
  if (node.type === 'ccp') return 1;
  if (node.type === 'executive') {
    const roles = node.metadata.executiveRole;
    return Array.isArray(roles) && roles.includes('president') ? 2 : 3;
  }
  return node.type === 'central-commission' ? 4 : 5;
}
function sortNodes(nodes: OrgNode[]): OrgNode[] {
  return [...nodes].sort((a, b) => organizationalPresentationLevel(a) - organizationalPresentationLevel(b)
    || Number(a.type === 'advisory') - Number(b.type === 'advisory')
    || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** Conservative wrapping estimate; full names also grow naturally in the DOM. */
export function captionLines(text: string, width: number, fontSize: number): number {
  const capacity = Math.max(1, Math.floor(width / (fontSize * 0.62)));
  let lines = 1, used = 0;
  for (const word of text.split(/\s+/)) {
    if (used && used + word.length + 1 > capacity) { lines++; used = 0; }
    lines += Math.max(0, Math.ceil(word.length / capacity) - 1);
    used = (used ? used + 1 : 0) + word.length % capacity;
  }
  return lines;
}
function unitHeight(node: OrgNode, width: number, people: Record<string, OrgPerson>, mobile: boolean): number {
  const name = people[node.personIds[0]]?.fullName ?? node.responsibilities[0]?.displayName ?? node.title;
  return 44 + captionLines(name, width + 8, mobile ? 14 : 13.5) * 16.5
    + Math.min(2, captionLines(node.title, width + 8, 11.5)) * 13.5
    + (node.personIds.length > 1 ? 14 : 0) + 4;
}
function groupNode(type: 'commission' | 'advisory', units: OrgNode[]): OrgNode {
  const members = units.filter(node => node.type === type);
  const parents = [...new Set(members.flatMap(node => node.parentIds))];
  return {
    id: `presentation:${type}`, type, authorityLevel: 4, title: type === 'commission' ? 'Comissões' : 'Assessorias',
    subtitle: `${members.length} unidades`, personIds: [], parentIds: parents, childIds: [], commissionId: null,
    advisoryId: null, sortOrder: type === 'commission' ? 0 : 1, isRenderable: true, responsibilities: [],
    metadata: { presentationGroupIds: members.map(node => node.id), presentationFilter: type },
  };
}
export function calculateOrganizationalLayout(nodes: OrgNode[], edges: OrgEdge[], options: OrganizationalLayoutOptions = {}): OrganizationalLayout {
  const renderable = sortNodes(nodes.filter(node => node.isRenderable && node.authorityLevel <= 4));
  const width = Math.max(260, options.availableWidth ?? (options.viewportWidth ?? 1280) - 48);
  const height = Math.max(180, options.availableHeight ?? (options.viewportHeight ?? 800) - 140);
  const mobile = (options.viewportWidth ?? 1280) <= 720;
  const short = height < 380;
  const filter = options.filter ?? 'all';
  const people = options.people ?? {};
  const upper = renderable.filter(node => organizationalPresentationLevel(node) < 5);
  const allUnits = renderable.filter(node => organizationalPresentationLevel(node) === 5);
  const units = filter === 'all' ? allUnits : allUnits.filter(node => node.type === filter);
  const phoneCellWidth = (width - 16) / 2 - 10;
  const fullPhoneHeight = upper.length * 86 + 26 + Math.ceil(allUnits.length / 2)
    * (Math.max(112, ...allUnits.map(node => unitHeight(node, phoneCellWidth, people, true))) + 12);
  const grouped = filter === 'all' && (short || (mobile && fullPhoneHeight > height / .92));
  const context = filter !== 'all';
  // Four separate rows stay centered, even on a narrow or short viewport.
  const upperHeight = context || short ? 38 : mobile ? 68 : 44;
  const upperGap = context || short ? 6 : 18;
  const upperWidth = Math.min(width - 8, context || short ? 310 : mobile ? 320 : 350);
  const positioned: PositionedOrgNode[] = [];
  let y = 4;
  for (const level of [1, 2, 3, 4]) {
    const row = upper.filter(node => organizationalPresentationLevel(node) === level);
    const tierHeight = upperHeight + (!context && !short ? level === 1 ? 4 : level === 4 ? 2 : 0 : 0);
    row.forEach((node, i) => {
      const itemWidth = Math.min(upperWidth, width / Math.max(1, row.length) - 8);
      positioned.push({ node, x: width / 2 + (i - (row.length - 1) / 2) * (itemWidth + 8),
        y: y + tierHeight / 2, width: itemWidth, height: tierHeight, radius: tierHeight / 2,
        horizontal: true, context: context && node.type !== filter, captionSide: 'right', levelOrder: i, order: positioned.length });
    });
    if (row.length) y += tierHeight + upperGap;
  }
  y += grouped ? 18 : 14;
  let displayed = grouped ? (['commission', 'advisory'] as const).map(type => groupNode(type, allUnits))
    .filter(node => (node.metadata.presentationGroupIds as string[]).length > 0) : units;
  const maxColumns = Math.max(1, Math.min(units.length, Math.floor(width / 110)));
  const columns = grouped ? 2 : mobile ? 2 : Math.max(1, Math.ceil(units.length / Math.ceil(Math.max(1, units.length) / maxColumns)));
  const cellWidth = Math.min(grouped ? 190 : mobile ? 190 : 160, (width - 16) / Math.max(1, columns) - 10);
  const rowHeight = grouped ? short ? 56 : 106 : Math.max(112, ...units.map(node => unitHeight(node, cellWidth, people, mobile)));
  const rowsAvailable = Math.max(1, Math.floor((height / 0.92 - y + 4) / (rowHeight + 12)));
  const capacity = Math.max(1, columns * rowsAvailable);
  const pageCount = grouped ? 1 : Math.max(1, Math.ceil(displayed.length / capacity));
  const page = Math.max(0, Math.min(pageCount - 1, options.page ?? 0));
  if (!grouped) displayed = displayed.slice(page * capacity, (page + 1) * capacity);
  const countColumns = Math.min(columns, displayed.length);
  displayed.forEach((node, index) => {
    const column = index % columns, row = Math.floor(index / columns);
    positioned.push({ node, x: width / 2 + (column - (countColumns - 1) / 2) * (cellWidth + 10),
      y: y + row * (rowHeight + 12) + 24, width: cellWidth, height: rowHeight, radius: grouped ? short ? 18 : 24 : 22, compactGroup: grouped && short,
      horizontal: false, context: false, levelOrder: index, order: positioned.length });
  });
  const nodeById = new Map(positioned.map(item => [item.node.id, item]));
  const presentationEdges = grouped ? [
    ...edges.filter(edge => nodeById.has(edge.sourceId) && nodeById.has(edge.targetId)),
    ...displayed.flatMap(node => node.parentIds.filter(id => nodeById.has(id)).map(parent => ({
      id: `presentation:${parent}:${node.id}`, sourceId: parent, targetId: node.id, authorityLevel: 4 as const,
    }))),
  ] : edges;
  const positionedEdges = presentationEdges.flatMap((edge): PositionedOrgEdge[] => {
    const source = nodeById.get(edge.sourceId), target = nodeById.get(edge.targetId);
    if (!source || !target) return [];
    const sx = source.x;
    const sy = source.y + (source.horizontal ? source.radius + 3 : source.height - source.radius);
    const tx = target.compactGroup ? target.x - target.width / 2 + target.radius : target.x, ty = target.y - target.radius - 3;
    let path: string;
    if (target.horizontal) {
      const middle = (sy + ty) / 2;
      path = `M ${sx} ${sy} C ${sx} ${middle}, ${tx} ${middle}, ${tx} ${ty}`;
    } else if (target.compactGroup) {
      // Compact groups put their labels beside the portrait. Approach from above
      // so a sibling branch cannot pass through the preceding group's label.
      path = `M ${sx} ${sy} L ${sx} ${y - 9} L ${tx} ${y - 9} L ${tx} ${ty}`;
    } else {
      const fanY = y - 9;
      // Each real parent owns its own branch. Vertical lanes live in cell gutters,
      // never through the portraits or captions of a previous row of siblings.
      const gutter = tx - cellWidth / 2 - 5;
      path = `M ${sx} ${sy} L ${sx} ${fanY} L ${gutter} ${fanY} L ${gutter} ${target.y} L ${tx - target.radius - 3} ${target.y}`;
    }
    return [{ edge, path, source: { x: sx, y: sy }, target: { x: tx, y: ty } }];
  });
  const bottom = Math.max(y, ...positioned.map(item => item.horizontal ? item.y + item.height / 2 : item.y - item.radius + item.height));
  return { bounds: { x: 0, y: 0, width, height: bottom + 6 }, nodes: positioned, edges: positionedEdges,
    nodeById, grouped, page, pageCount, unitCount: units.length, minimumScale: 0.92 };
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
    // A lighter cross-axis weight keeps navigation on the nearest visual tier.
    const score = primaryDelta + secondaryDelta * 0.38;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  });

  return best;
}
