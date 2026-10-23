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
    metadata: type === 'executive' ? { executiveRole: [id === 'president' ? 'president' : 'vice-president'] } : {},
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
  it.each([[1440, 900], [390, 844], [844, 390]])('preserves four distinct centered executive tiers at %ix%i', (viewportWidth, viewportHeight) => {
    const nodes = [node('root', 'ccp', 1), node('president', 'executive', 2),
      node('vice', 'executive', 2, ['root', 'president']), node('central', 'central-commission', 3, ['vice'])];
    // Labels never determine the executive role or the visual row.
    nodes[1].title = 'Nome atualizado';
    const layout = calculateOrganizationalLayout(nodes, [], { viewportWidth, viewportHeight });
    const [root, president, vice, central] = nodes.map((item) => layout.nodeById.get(item.id)!);
    expect(root.y + root.height / 2).toBeLessThan(president.y - president.height / 2);
    expect(root.x).toBe(president.x);
    expect(vice.x).toBe(layout.bounds.width / 2);
    expect(central.x).toBe(vice.x);
    expect(vice.y).toBeGreaterThan(president.y);
    expect(central.y).toBeGreaterThan(vice.y);
    expect(findDirectionalNode(layout, 'root', 'down')?.node.id).toBe('president');
    expect(findDirectionalNode(layout, 'president', 'down')?.node.id).toBe('vice');
    expect(findDirectionalNode(layout, 'vice', 'down')?.node.id).toBe('central');
  });

  it('keeps deterministic positions and authority progression', () => {
    const nodes = [
      node('root', 'ccp', 1),
      node('president', 'executive', 2),
      node('vice', 'executive', 2, ['root', 'president']),
      node('central', 'central-commission', 3, ['vice']),
      node('commission', 'commission', 4, ['central']),
      node('future-volunteer', 'volunteer', 5, ['commission']),
    ];
    const edges = [
      edge('root', 'vice', 2),
      edge('president', 'vice', 2),
      edge('vice', 'central', 3),
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
    expect(first.nodeById.get('root')!.y).toBeLessThan(first.nodeById.get('president')!.y);
    expect(first.nodeById.get('root')!.x).toBe(first.nodeById.get('president')!.x);
    expect(first.nodeById.get('vice')!.x).toBe(first.bounds.width / 2);
    expect(first.nodeById.get('vice')!.y).toBeGreaterThan(first.nodeById.get('president')!.y);
    expect(first.nodeById.get('president')?.y).toBeLessThan(first.nodeById.get('central')?.y ?? 0);
    expect(first.nodeById.get('central')?.y).toBeLessThan(first.nodeById.get('commission')?.y ?? 0);
    expect(first.nodes.filter(({ node: item }) => item.authorityLevel === 1).map(({ levelOrder }) => levelOrder)).toEqual([0]);
    expect(first.nodes.filter(({ node: item }) => item.authorityLevel === 2).map(({ levelOrder }) => levelOrder)).toEqual([0, 0]);
    expect(first.nodes.filter(({ node: item }) => item.authorityLevel === 3).map(({ levelOrder }) => levelOrder)).toEqual([0]);
    expect(first.nodes.filter(({ node: item }) => item.authorityLevel === 4).map(({ levelOrder }) => levelOrder)).toEqual([0]);
    expect(first.edges).toHaveLength(edges.length);
  });

  it('fits 35 operational cards in a collision-free compact world without shrinking captions below the readable presentation limit on 1366x768', () => {
    const operationalNodes = Array.from({ length: 35 }, (_, index) => node(
      `unit-${index + 1}`,
      index % 5 === 0 ? 'advisory' : 'commission',
      4,
      ['central'],
    ));
    const nodes = [
      node('root', 'ccp', 1),
      node('president', 'executive', 2),
      node('central', 'central-commission', 3, ['president']),
      ...operationalNodes,
    ];
    const layout = calculateOrganizationalLayout(nodes, [], { viewportWidth: 1366, viewportHeight: 768, availableHeight: 632 });
    const coordinates = layout.nodes.map(({ x, y }) => `${x.toFixed(2)}:${y.toFixed(2)}`);
    const positionedOperational = layout.nodes.filter((item) => item.node.authorityLevel === 4);

    expect(new Set(coordinates).size).toBe(coordinates.length);
    const reachable = new Set<string>();
    for (let page = 0; page < layout.pageCount; page++) {
      calculateOrganizationalLayout(nodes, [], { viewportWidth: 1366, viewportHeight: 768, availableHeight: 632, page })
        .nodes.filter(item => item.node.authorityLevel === 4).forEach(item => reachable.add(item.node.id));
    }
    expect(reachable.size).toBe(35);
    expect(positionedOperational.map(({ levelOrder }) => levelOrder)).toEqual(
      Array.from({ length: positionedOperational.length }, (_, index) => index),
    );
    expect(layout.bounds.width).toBeLessThanOrEqual(2240);
    expect(layout.bounds.height).toBeLessThanOrEqual(1440);
    layout.nodes.forEach(({ x, y }) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(layout.bounds.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(layout.bounds.height);
    });

    positionedOperational.forEach((current, currentIndex) => {
      positionedOperational.slice(currentIndex + 1).forEach((candidate) => {
        const cardsOverlap = Math.abs(current.x - candidate.x) < (current.width + candidate.width) / 2
          && Math.abs(current.y - candidate.y) < Math.max(current.height, candidate.height);
        expect(
          cardsOverlap,
          `${current.node.id} colide com ${candidate.node.id}`,
        ).toBe(false);
      });
    });

    const desktopFitScale = Math.min(
      (1366 - 24 * 2) / layout.bounds.width,
      632 / layout.bounds.height,
    );
    expect(desktopFitScale).toBeGreaterThanOrEqual(layout.minimumScale);
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
      expect(right - left).toBeLessThanOrEqual((operationalCount - 1) * 170);
    },
  );

  it('groups every canonical mobile unit, then exposes every individual through dedicated pages', () => {
    const nodes = [node('root', 'ccp', 1), node('central', 'central-commission', 3),
      ...Array.from({ length: 35 }, (_, i) => node(`unit-${i}`, i % 5 === 0 ? 'advisory' : 'commission', 4, ['central']))];
    const snapshot = structuredClone(nodes);
    const phone = calculateOrganizationalLayout(nodes, [], { viewportWidth: 390, viewportHeight: 844 });
    expect(phone.grouped).toBe(true);
    const groups = phone.nodes.filter(item => item.node.metadata.presentationGroupIds);
    expect(groups).toHaveLength(2);
    expect(groups.flatMap(item => item.node.metadata.presentationGroupIds as string[]).sort())
      .toEqual(nodes.filter(item => item.authorityLevel === 4).map(item => item.id).sort());
    const seen = new Set<string>();
    for (const filter of ['commission', 'advisory'] as const) {
      const first = calculateOrganizationalLayout(nodes, [], { viewportWidth: 390, viewportHeight: 844, filter });
      for (let page = 0; page < first.pageCount; page++) {
        const layout = calculateOrganizationalLayout(nodes, [], { viewportWidth: 390, viewportHeight: 844, filter, page });
        layout.nodes.filter(item => item.node.authorityLevel === 4).forEach(item => seen.add(item.node.id));
        expect(layout.bounds.height * layout.minimumScale).toBeLessThanOrEqual(704);
      }
    }
    expect(seen.size).toBe(35);
    expect(nodes).toEqual(snapshot);
  });

  it('supports spatial keyboard navigation without relying on DOM order', () => {
    const layout = calculateOrganizationalLayout([
      node('root', 'ccp', 1),
      node('president', 'executive', 2),
      node('vice', 'executive', 2, ['root', 'president']),
      node('central', 'central-commission', 3, ['vice']),
    ], []);

    const down = findDirectionalNode(layout, 'root', 'down');
    expect(down?.node.authorityLevel).toBe(2);
    expect(findDirectionalNode(layout, down?.node.id ?? '', 'up')?.node.id).toBe('root');
  });
});
