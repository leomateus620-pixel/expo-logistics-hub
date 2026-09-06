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
  personId?: string;
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

  const namedPerson = personByName ?? (
    responsibilityByName?.personId ? graph.people[responsibilityByName.personId] : null
  );
  // A collective title also appears in its members' roles. Searching that
  // title must open the collective, not silently choose the first member.
  const collectiveMatch = !namedPerson && (nodeTitleMatches || nodeSubtitleMatches);
  const matchedPerson = namedPerson ?? (collectiveMatch ? null : personByRole ?? (
    responsibilityByRole?.personId ? graph.people[responsibilityByRole.personId] : null
  ));
  const matchedResponsibility = responsibilityByName ?? (collectiveMatch ? null : responsibilityByRole);
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
      personId: matchedPerson?.id,
    },
  };
}

/** Only explicit incident relationships: a collective membership never grants
 * the selected person every outgoing relationship of that collective. */
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
  const [query, setQuery] = useState('');

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
  const normalizedQuery = normalizeSearch(query);
  const relationshipContext = useMemo(() => collectRelationshipContext(
    graph,
    activeSelectedNodeId ?? activeHoveredNodeId,
    activeSelectedPersonId,
  ), [activeHoveredNodeId, activeSelectedNodeId, activeSelectedPersonId, graph]);

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
        selected: Boolean(activeSelectedNodeId && relationshipContext.membershipIds.has(node.id)),
      }];
    }));
  }, [
    filter,
    activeHoveredNodeId,
    activeSelectedNodeId,
    matchIds,
    normalizedQuery.length,
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
    query,
    searchResults,
    selectNode,
    selectedNode,
    selectedNodeId: activeSelectedNodeId,
    selectedPersonId: activeSelectedPersonId,
    setFilter,
    setHoveredNodeId,
    setKeyboardNodeId,
    setQuery,
    visualStateById,
  };
}
