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
    const snapshot = (layout: typeof first) => layout.nodes.map(({
      levelOrder,
      node: item,
      x,
      y,
    }) => ({
      id: item.id,
      levelOrder,
      x,
      y,
    }));

    expect(snapshot(first)).toEqual(snapshot(second));
    expect(first.nodeById.has('future-volunteer')).toBe(false);
    expect(first.nodeById.get('root')?.y).toBeLessThan(first.nodeById.get('president')?.y ?? 0);
    expect(first.nodeById.get('president')?.y).toBeLessThan(first.nodeById.get('central')?.y ?? 0);
    expect(first.nodeById.get('central')?.y).toBeLessThan(first.nodeById.get('commission')?.y ?? 0);
    expect(first.nodes.filter(({ node: item }) => item.authorityLevel === 1).map(({ levelOrder }) => levelOrder)).toEqual([0]);
    expect(first.nodes.filter(({ node: item }) => item.authorityLevel === 2).map(({ levelOrder }) => levelOrder)).toEqual([0, 1]);
    expect(first.nodes.filter(({ node: item }) => item.authorityLevel === 3).map(({ levelOrder }) => levelOrder)).toEqual([0]);
    expect(first.nodes.filter(({ node: item }) => item.authorityLevel === 4).map(({ levelOrder }) => levelOrder)).toEqual([0]);
    expect(first.edges).toHaveLength(edges.length);
  });

  it('fits 35 operational cards in a collision-free 2200x1400 world at more than 35% on 1366x768', () => {
    const operationalNodes = Array.from({ length: 35 }, (_, index) => node(
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
    const positionedOperational = layout.nodes.filter((item) => item.node.authorityLevel === 4);

    expect(new Set(coordinates).size).toBe(coordinates.length);
    expect(positionedOperational).toHaveLength(35);
    expect(positionedOperational.map(({ levelOrder }) => levelOrder)).toEqual(
      Array.from({ length: 35 }, (_, index) => index),
    );
    expect(layout.bounds.width).toBeLessThanOrEqual(2200);
    expect(layout.bounds.height).toBeLessThanOrEqual(1400);
    layout.nodes.forEach(({ x, y }) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(layout.bounds.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(layout.bounds.height);
    });

    positionedOperational.forEach((current, currentIndex) => {
      positionedOperational.slice(currentIndex + 1).forEach((candidate) => {
        const cardsOverlap = Math.abs(current.x - candidate.x) < 160
          && Math.abs(current.y - candidate.y) < 166;
        expect(
          cardsOverlap,
          `${current.node.id} colide com ${candidate.node.id}`,
        ).toBe(false);
      });
    });

    const desktopFitScale = Math.min(
      (1366 - 64 * 2) / layout.bounds.width,
      (768 - 142 - 50) / layout.bounds.height,
    );
    expect(desktopFitScale).toBeGreaterThan(0.35);
  });

  it.each([1, 2, 3, 4, 5, 6])(
    'centers a sparse operational layer with %i nodes',
    (operationalCount) => {
      const operationalNodes = Array.from({ length: operationalCount }, (_, index) => node(
        `sparse-${index + 1}`,
        'commission',
        4,
        ['central'],
      ));
      const layout = calculateOrganizationalLayout([
        node('root', 'ccp', 1),
        node('central', 'central-commission', 3),
        ...operationalNodes,
      ], []);
      const positioned = layout.nodes.filter((item) => item.node.authorityLevel === 4);
      const centerX = layout.bounds.width / 2;
      const left = Math.min(...positioned.map((item) => item.x));
      const right = Math.max(...positioned.map((item) => item.x));

      expect((left + right) / 2).toBeCloseTo(centerX, 5);
      expect(right - left).toBeLessThanOrEqual(172);
    },
  );

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
