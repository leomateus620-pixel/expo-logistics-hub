import { describe, expect, it } from 'vitest';
import type { AuthorityLevel, OrgEdge, OrgNode, OrgNodeType } from '../types';
import {
  calculateOrganizationalLayout,
  findDirectionalNode,
} from './organizationalLayout';

function node(
  id: string,
  type: OrgNodeType,
  authorityLevel: AuthorityLevel,
  parentIds: string[] = [],
): OrgNode {
  return {
    id,
    type,
    authorityLevel,
    title: id,
    subtitle: null,
    personIds: [],
    parentIds,
    childIds: [],
    commissionId: type === 'commission' ? id : null,
    advisoryId: type === 'advisory' ? id : null,
    sortOrder: Number(id.replace(/\D/g, '')) || 0,
    isRenderable: authorityLevel <= 4,
    responsibilities: [],
    metadata: {},
  };
}

function edge(sourceId: string, targetId: string, authorityLevel: AuthorityLevel): OrgEdge {
  return {
    id: `${sourceId}:${targetId}`,
    sourceId,
    targetId,
    authorityLevel,
  };
}

describe('calculateOrganizationalLayout', () => {
  it('keeps deterministic positions and authority progression', () => {
    const nodes = [
      node('root', 'ccp', 1),
      node('president', 'executive', 2, ['root']),
      node('vice', 'executive', 2, ['root']),
      node('central', 'central-commission', 3, ['president', 'vice']),
      node('commission', 'commission', 4, ['central']),
      node('future-volunteer', 'volunteer', 5, ['commission']),
    ];
    const edges = [
      edge('root', 'president', 2),
      edge('root', 'vice', 2),
      edge('president', 'central', 3),
      edge('central', 'commission', 4),
    ];

    const first = calculateOrganizationalLayout(nodes, edges);
    const second = calculateOrganizationalLayout(nodes, edges);
    const snapshot = (layout: typeof first) => layout.nodes.map(({ node: item, x, y }) => ({
      id: item.id,
      x,
      y,
    }));

    expect(snapshot(first)).toEqual(snapshot(second));
    expect(first.nodeById.has('future-volunteer')).toBe(false);
    expect(first.nodeById.get('root')?.y).toBeLessThan(first.nodeById.get('president')?.y ?? 0);
    expect(first.nodeById.get('president')?.y).toBeLessThan(first.nodeById.get('central')?.y ?? 0);
    expect(first.nodeById.get('central')?.y).toBeLessThan(first.nodeById.get('commission')?.y ?? 0);
    expect(first.edges).toHaveLength(edges.length);
  });

  it('produces unique, bounded positions for a large operational layer', () => {
    const operationalNodes = Array.from({ length: 27 }, (_, index) => node(
      `unit-${index + 1}`,
      index % 5 === 0 ? 'advisory' : 'commission',
      4,
      ['central'],
    ));
    const nodes = [
      node('root', 'ccp', 1),
      node('president', 'executive', 2, ['root']),
      node('central', 'central-commission', 3, ['president']),
      ...operationalNodes,
    ];
    const layout = calculateOrganizationalLayout(nodes, []);
    const coordinates = layout.nodes.map(({ x, y }) => `${x.toFixed(2)}:${y.toFixed(2)}`);

    expect(new Set(coordinates).size).toBe(coordinates.length);
    layout.nodes.forEach(({ x, y }) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(layout.bounds.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(layout.bounds.height);
    });
  });

  it('supports spatial keyboard navigation without relying on DOM order', () => {
    const layout = calculateOrganizationalLayout([
      node('root', 'ccp', 1),
      node('president', 'executive', 2, ['root']),
      node('vice', 'executive', 2, ['root']),
      node('central', 'central-commission', 3, ['president', 'vice']),
    ], []);

    const down = findDirectionalNode(layout, 'root', 'down');
    expect(down?.node.authorityLevel).toBe(2);
    expect(findDirectionalNode(layout, down?.node.id ?? '', 'up')?.node.id).toBe('root');
  });
});
