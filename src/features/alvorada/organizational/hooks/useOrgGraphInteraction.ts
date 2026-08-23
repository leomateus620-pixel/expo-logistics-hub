import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  responsibleRoleLabel,
  type OrgUnitResponsibleRole,
} from '@/lib/org-units';
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
  matched: boolean;
  muted: boolean;
  related: boolean;
  selected: boolean;
}

export interface OrgSearchResult {
  id: string;
  label: string;
  meta: string;
  node: OrgNode;
}

interface UseOrgGraphInteractionOptions {
  graph: OrganizationalGraph;
  initialSelectedNodeId?: string | null;
  onSelectedNodeChange?: (node: OrgNode | null) => void;
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function matchesFilter(node: OrgNode, filter: OrgGraphFilter): boolean {
  return filter === 'all' || node.type === filter;
}

function includesSearch(value: string | null | undefined, normalizedQuery: string): boolean {
  return Boolean(value && normalizeSearch(value).includes(normalizedQuery));
}

const RAW_RESPONSIBLE_ROLES = new Set<OrgUnitResponsibleRole>([
  'principal',
  'corresponsavel',
  'copresidente',
  'equipe_apoio',
]);

function presentRelationshipRole(role: string): string {
  const normalized = role.toLocaleLowerCase('pt-BR').replace(/[\s-]+/g, '_');
  const presented = RAW_RESPONSIBLE_ROLES.has(normalized as OrgUnitResponsibleRole)
    ? responsibleRoleLabel(normalized as OrgUnitResponsibleRole)
    : role;
  return presented.toLocaleUpperCase('pt-BR');
}

function createSearchResult(
  graph: OrganizationalGraph,
  node: OrgNode,
  normalizedQuery: string,
): { result: OrgSearchResult; score: number } | null {
  const people = node.personIds
    .map((personId) => graph.people[personId])
    .filter(Boolean);
  const personByName = people.find((person) => includesSearch(person.fullName, normalizedQuery));
  const responsibilityByName = node.responsibilities.find((responsibility) => (
    includesSearch(responsibility.displayName, normalizedQuery)
  ));
  const nodeTitleMatches = includesSearch(node.title, normalizedQuery);
  const personByRole = people.find((person) => (
    person.roles.some((role) => includesSearch(role, normalizedQuery))
  ));
  const responsibilityByRole = node.responsibilities.find((responsibility) => (
    includesSearch(responsibility.relationshipRole, normalizedQuery)
  ));
  const nodeSubtitleMatches = includesSearch(node.subtitle, normalizedQuery);

  const matchedPerson = personByName ?? (
    responsibilityByName?.personId ? graph.people[responsibilityByName.personId] : null
  ) ?? personByRole ?? (
    responsibilityByRole?.personId ? graph.people[responsibilityByRole.personId] : null
  );
  const matchedResponsibility = responsibilityByName ?? responsibilityByRole;
  const matches = Boolean(
    matchedPerson
    || matchedResponsibility
    || nodeTitleMatches
    || nodeSubtitleMatches
  );
  if (!matches) return null;

  const label = matchedPerson?.fullName
    ?? matchedResponsibility?.displayName
    ?? node.title;
  const contextualRole = matchedResponsibility?.relationshipRole
    || matchedPerson?.roles.find((role) => includesSearch(role, normalizedQuery))
    || '';
  const organizationContext = normalizeSearch(node.title) === normalizeSearch(label)
    ? node.subtitle
    : node.title;
  const meta = [organizationContext, contextualRole ? presentRelationshipRole(contextualRole) : '']
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
    .join(' · ') || node.subtitle || node.title;
  const score = personByName
    ? 0
    : responsibilityByName
      ? 1
      : nodeTitleMatches
        ? 2
        : personByRole
          ? 3
          : responsibilityByRole
            ? 4
            : 5;

  return {
    score,
    result: {
      id: node.id,
      label,
      meta,
      node,
    },
  };
}

function collectRelationshipContext(
  graph: OrganizationalGraph,
  focusNodeId: string | null,
  includeAncestors: boolean,
): { edgeIds: Set<string>; nodeIds: Set<string> } {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  if (!focusNodeId) return { edgeIds, nodeIds };
  nodeIds.add(focusNodeId);

  const incomingByTarget = new Map<string, typeof graph.edges>();
  const outgoingBySource = new Map<string, typeof graph.edges>();
  graph.edges.forEach((edge) => {
    incomingByTarget.set(edge.targetId, [...(incomingByTarget.get(edge.targetId) ?? []), edge]);
    outgoingBySource.set(edge.sourceId, [...(outgoingBySource.get(edge.sourceId) ?? []), edge]);
  });

  const directIncoming = incomingByTarget.get(focusNodeId) ?? [];
  const directOutgoing = outgoingBySource.get(focusNodeId) ?? [];
  [...directIncoming, ...directOutgoing].forEach((edge) => {
    edgeIds.add(edge.id);
    nodeIds.add(edge.sourceId);
    nodeIds.add(edge.targetId);
  });

  if (includeAncestors) {
    const pending = directIncoming.map((edge) => edge.sourceId);
    const visited = new Set<string>();
    while (pending.length > 0) {
      const nodeId = pending.shift();
      if (!nodeId || visited.has(nodeId)) continue;
      visited.add(nodeId);
      nodeIds.add(nodeId);
      (incomingByTarget.get(nodeId) ?? []).forEach((edge) => {
        edgeIds.add(edge.id);
        nodeIds.add(edge.sourceId);
        pending.push(edge.sourceId);
      });
    }
  }

  return { edgeIds, nodeIds };
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    validInitialSelectedNodeId,
  );
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [keyboardNodeId, setKeyboardNodeId] = useState<string | null>(
    validInitialSelectedNodeId ?? fallbackNodeId,
  );
  const [filter, setFilter] = useState<OrgGraphFilter>('all');
  const [query, setQuery] = useState('');

  const filterFallbackNodeId = renderableNodes.find((node) => (
    node.id === graph.rootNodeId && matchesFilter(node, filter)
  ))?.id ?? renderableNodes.find((node) => matchesFilter(node, filter))?.id ?? null;
  const selectedNodeCandidate = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const selectedNode = selectedNodeCandidate && matchesFilter(selectedNodeCandidate, filter)
    ? selectedNodeCandidate
    : null;
  const activeSelectedNodeId = selectedNode?.id ?? null;
  const hoveredNodeCandidate = hoveredNodeId ? nodeById.get(hoveredNodeId) ?? null : null;
  const activeHoveredNodeId = hoveredNodeCandidate && matchesFilter(hoveredNodeCandidate, filter)
    ? hoveredNodeCandidate.id
    : null;
  const normalizedQuery = normalizeSearch(query);
  const relationshipContext = useMemo(() => collectRelationshipContext(
    graph,
    activeSelectedNodeId ?? activeHoveredNodeId,
    activeSelectedNodeId !== null,
  ), [activeHoveredNodeId, activeSelectedNodeId, graph]);

  const searchResults = useMemo<OrgSearchResult[]>(() => {
    if (normalizedQuery.length < 2) return [];
    return renderableNodes
      .filter((node) => matchesFilter(node, filter))
      .map((node) => createSearchResult(graph, node, normalizedQuery))
      .filter((match): match is NonNullable<typeof match> => Boolean(match))
      .sort((a, b) => (
        a.score - b.score
        || a.result.node.authorityLevel - b.result.node.authorityLevel
        || a.result.node.sortOrder - b.result.node.sortOrder
        || a.result.label.localeCompare(b.result.label, 'pt-BR')
      ))
      .slice(0, 8)
      .map((match) => match.result);
  }, [filter, graph, normalizedQuery, renderableNodes]);
  const matchIds = useMemo(
    () => new Set(searchResults.map((result) => result.id)),
    [searchResults],
  );

  const visualStateById = useMemo(() => {
    const hasRelationshipFocus = Boolean(activeHoveredNodeId ?? activeSelectedNodeId);
    const hasSearch = normalizedQuery.length >= 2;
    return new Map(renderableNodes.map((node): [string, OrgNodeVisualState] => {
      const filtered = !matchesFilter(node, filter);
      const matched = hasSearch && matchIds.has(node.id);
      const related = relationshipContext.nodeIds.has(node.id);
      return [node.id, {
        filtered,
        hovered: activeHoveredNodeId === node.id,
        matched,
        muted: filtered || (hasSearch && !matched) || (hasRelationshipFocus && !related),
        related,
        selected: activeSelectedNodeId === node.id,
      }];
    }));
  }, [
    filter,
    activeHoveredNodeId,
    activeSelectedNodeId,
    matchIds,
    normalizedQuery.length,
    relationshipContext.nodeIds,
    renderableNodes,
  ]);

  const selectNode = useCallback((nodeId: string | null) => {
    const candidate = nodeId ? nodeById.get(nodeId) ?? null : null;
    const node = candidate && matchesFilter(candidate, filter) ? candidate : null;
    setSelectedNodeId(node?.id ?? null);
    if (node) setKeyboardNodeId(node.id);
    onSelectedNodeChange?.(node);
  }, [filter, nodeById, onSelectedNodeChange]);

  const clearSelection = useCallback(() => {
    setHoveredNodeId(null);
    selectNode(null);
  }, [selectNode]);

  useEffect(() => {
    const selectedCandidate = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
    if (selectedNodeId && (!selectedCandidate || !matchesFilter(selectedCandidate, filter))) {
      setSelectedNodeId(null);
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
    query,
    searchResults,
    selectNode,
    selectedNode,
    selectedNodeId: activeSelectedNodeId,
    setFilter,
    setHoveredNodeId,
    setKeyboardNodeId,
    setQuery,
    visualStateById,
  };
}
