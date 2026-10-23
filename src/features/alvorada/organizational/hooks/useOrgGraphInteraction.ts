import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OrganizationalGraph, OrgNode } from '../types';

export type OrgGraphFilter =
  | 'all'
  | 'ccp'
  | 'executive'
  | 'central-commission'
  | 'commission'
  | 'advisory';

export interface OrgNodeVisualState {
  filtered: boolean;
  hovered: boolean;
  muted: boolean;
  related: boolean;
  selected: boolean;
}

interface UseOrgGraphInteractionOptions {
  graph: OrganizationalGraph;
  initialSelectedNodeId?: string | null;
  onSelectedNodeChange?: (node: OrgNode | null) => void;
}

function matchesFilter(node: OrgNode, filter: OrgGraphFilter): boolean {
  return filter === 'all' || node.type === filter;
}

/** Follow canonical ancestry. A person never inherits the outgoing authority
 * of a collective merely because they belong to it. */
export function collectRelationshipContext(
  graph: OrganizationalGraph,
  focusNodeId: string | null,
  personId: string | null = null,
): { edgeIds: Set<string>; nodeIds: Set<string>; membershipIds: Set<string> } {
  const allowed = new Set(graph.renderableNodeIds);
  const nodes = graph.nodes.filter((node) => node.isRenderable && allowed.has(node.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const membershipIds = new Set(personId
    ? nodes.filter((node) => node.personIds.includes(personId)
      || node.responsibilities.some((item) => item.personId === personId)).map((node) => node.id)
    : focusNodeId && nodeById.has(focusNodeId) ? [focusNodeId] : []);
  const nodeIds = new Set(membershipIds);
  const edgeIds = new Set<string>();
  graph.edges.forEach((edge) => {
    if (!nodeById.has(edge.sourceId) || !nodeById.has(edge.targetId)) return;
    const source = nodeById.get(edge.sourceId);
    const incoming = membershipIds.has(edge.targetId);
    const outgoing = membershipIds.has(edge.sourceId) && (!personId
      || source?.type === 'executive'
      || (membershipIds.has(edge.targetId)));
    if (!incoming && !outgoing) return;
    edgeIds.add(edge.id);
    nodeIds.add(edge.sourceId);
    nodeIds.add(edge.targetId);
  });
  const walk = (starts: Set<string>, down: boolean) => {
    const pending = [...starts], visited = new Set(starts);
    while (pending.length) {
      const id = pending.shift();
      graph.edges.forEach(edge => {
        if (!nodeById.has(edge.sourceId) || !nodeById.has(edge.targetId)) return;
        if ((down ? edge.sourceId : edge.targetId) !== id) return;
        const next = down ? edge.targetId : edge.sourceId;
        edgeIds.add(edge.id); nodeIds.add(edge.sourceId); nodeIds.add(edge.targetId);
        if (!visited.has(next)) { visited.add(next); pending.push(next); }
      });
    }
  };
  walk(membershipIds, false);
  const descendantRoots = new Set([...membershipIds].filter(id => !personId || nodeById.get(id)?.type === 'executive'));
  walk(descendantRoots, true);
  return { edgeIds, nodeIds, membershipIds };
}

export function useOrgGraphInteraction({
  graph,
  initialSelectedNodeId = null,
  onSelectedNodeChange,
}: UseOrgGraphInteractionOptions) {
  const renderableNodeIdSet = useMemo(
    () => new Set(graph.renderableNodeIds),
    [graph.renderableNodeIds],
  );
  const renderableNodes = useMemo(
    () => graph.nodes.filter((node) => node.isRenderable && renderableNodeIdSet.has(node.id)),
    [graph.nodes, renderableNodeIdSet],
  );
  const nodeById = useMemo(
    () => new Map(renderableNodes.map((node) => [node.id, node])),
    [renderableNodes],
  );
  const fallbackNodeId = nodeById.has(graph.rootNodeId)
    ? graph.rootNodeId
    : renderableNodes[0]?.id ?? null;
  const validInitialSelectedNodeId = initialSelectedNodeId && nodeById.has(initialSelectedNodeId)
    ? initialSelectedNodeId
    : null;
  const [selection, setSelection] = useState<{ nodeId: string | null; personId: string | null }>({
    nodeId: validInitialSelectedNodeId, personId: null,
  });
  const selectedNodeId = selection.nodeId;
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [keyboardNodeId, setKeyboardNodeId] = useState<string | null>(
    validInitialSelectedNodeId ?? fallbackNodeId,
  );
  const [filter, setFilter] = useState<OrgGraphFilter>('all');

  const filterFallbackNodeId = renderableNodes.find((node) => (
    node.id === graph.rootNodeId && matchesFilter(node, filter)
  ))?.id ?? renderableNodes.find((node) => matchesFilter(node, filter))?.id ?? null;
  const selectedNodeCandidate = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const selectedNode = selectedNodeCandidate && matchesFilter(selectedNodeCandidate, filter)
    ? selectedNodeCandidate
    : null;
  const activeSelectedNodeId = selectedNode?.id ?? null;
  const activeSelectedPersonId = selection.personId && graph.people[selection.personId] && selectedNode
    && (selectedNode.personIds.includes(selection.personId)
      || selectedNode.responsibilities.some((item) => item.personId === selection.personId))
    ? selection.personId : null;
  const hoveredNodeCandidate = hoveredNodeId ? nodeById.get(hoveredNodeId) ?? null : null;
  const activeHoveredNodeId = hoveredNodeCandidate && matchesFilter(hoveredNodeCandidate, filter)
    ? hoveredNodeCandidate.id
    : null;
  const relationshipContext = useMemo(() => collectRelationshipContext(
    graph,
    activeSelectedNodeId ?? activeHoveredNodeId,
    activeSelectedPersonId,
  ), [activeHoveredNodeId, activeSelectedNodeId, activeSelectedPersonId, graph]);

  const visualStateById = useMemo(() => {
    const hasRelationshipFocus = Boolean(activeHoveredNodeId ?? activeSelectedNodeId);
    return new Map(renderableNodes.map((node): [string, OrgNodeVisualState] => {
      const filtered = !matchesFilter(node, filter);
      const related = relationshipContext.nodeIds.has(node.id);
      return [node.id, {
        filtered,
        hovered: activeHoveredNodeId === node.id,
        muted: filtered || (hasRelationshipFocus && !related),
        related,
        selected: Boolean(activeSelectedNodeId && relationshipContext.membershipIds.has(node.id)),
      }];
    }));
  }, [
    filter,
    activeHoveredNodeId,
    activeSelectedNodeId,
    relationshipContext.nodeIds,
    relationshipContext.membershipIds,
    renderableNodes,
  ]);

  const selectNode = useCallback((nodeId: string | null, personId?: string | null) => {
    const candidate = nodeId ? nodeById.get(nodeId) ?? null : null;
    const node = candidate && matchesFilter(candidate, filter) ? candidate : null;
    const individualNode = node && node.personIds.length === 1
      && node.type !== 'ccp' && node.type !== 'central-commission';
    const requestedPerson = personId === undefined && individualNode ? node.personIds[0] : personId;
    const validPerson = requestedPerson && node && graph.people[requestedPerson]
      && (node.personIds.includes(requestedPerson)
        || node.responsibilities.some((item) => item.personId === requestedPerson))
      ? requestedPerson : null;
    setSelection({ nodeId: node?.id ?? null, personId: validPerson });
    if (node) setKeyboardNodeId(node.id);
    onSelectedNodeChange?.(node);
  }, [filter, graph.people, nodeById, onSelectedNodeChange]);

  const clearSelection = useCallback(() => {
    setHoveredNodeId(null);
    selectNode(null);
  }, [selectNode]);

  useEffect(() => {
    const selectedCandidate = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
    if (selectedNodeId && (!selectedCandidate || !matchesFilter(selectedCandidate, filter))) {
      setSelection({ nodeId: null, personId: null });
      onSelectedNodeChange?.(null);
    }
    const hoveredCandidate = hoveredNodeId ? nodeById.get(hoveredNodeId) ?? null : null;
    if (hoveredNodeId && (!hoveredCandidate || !matchesFilter(hoveredCandidate, filter))) {
      setHoveredNodeId(null);
    }
    const keyboardCandidate = keyboardNodeId ? nodeById.get(keyboardNodeId) ?? null : null;
    if (!keyboardCandidate || !matchesFilter(keyboardCandidate, filter)) {
      setKeyboardNodeId(filterFallbackNodeId);
    }
  }, [
    filter,
    filterFallbackNodeId,
    hoveredNodeId,
    keyboardNodeId,
    nodeById,
    onSelectedNodeChange,
    selectedNodeId,
  ]);

  return {
    activeEdgeIds: relationshipContext.edgeIds,
    clearSelection,
    filter,
    hoveredNodeId: activeHoveredNodeId,
    keyboardNodeId,
    selectNode,
    selectedNode,
    selectedNodeId: activeSelectedNodeId,
    selectedPersonId: activeSelectedPersonId,
    setFilter,
    setHoveredNodeId,
    setKeyboardNodeId,
    visualStateById,
  };
}
