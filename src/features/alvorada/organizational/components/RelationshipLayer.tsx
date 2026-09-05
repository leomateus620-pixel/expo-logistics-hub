import { memo, type CSSProperties } from 'react';
import type { OrgNodeVisualState } from '../hooks/useOrgGraphInteraction';
import type { OrganizationalLayout } from '../layout/organizationalLayout';

interface RelationshipLayerProps {
  active: boolean;
  activeEdgeIds: Set<string>;
  selectionActive: boolean;
  layout: OrganizationalLayout;
  visualStateById: Map<string, OrgNodeVisualState>;
}

function relationshipDelay(authorityLevel: number, levelOrder: number): number {
  if (authorityLevel === 2) return 80 + levelOrder * 60;
  if (authorityLevel === 3) return 180;
  if (authorityLevel === 4) return Math.min(620, 260 + levelOrder * 12);
  return 80;
}

function RelationshipLayerComponent({
  active,
  activeEdgeIds,
  layout,
  selectionActive,
  visualStateById,
}: RelationshipLayerProps) {
  return (
    <svg
      className="org-relationships"
      width={layout.bounds.width}
      height={layout.bounds.height}
      viewBox={`0 0 ${layout.bounds.width} ${layout.bounds.height}`}
      aria-hidden="true"
      focusable="false"
      data-active={active || undefined}
      data-selection-active={selectionActive || undefined}
      style={{ pointerEvents: 'none' }}
    >
      <defs>
        <linearGradient id="org-connector-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#BC9760" stopOpacity="0.48" />
          <stop offset="0.48" stopColor="#DCC393" stopOpacity="0.7" />
          <stop offset="1" stopColor="#AF986C" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="org-connector-advisory" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C5A879" />
          <stop offset="1" stopColor="#89B1A6" />
        </linearGradient>
      </defs>
      {layout.edges.filter(({ edge }) => (
        (!selectionActive || activeEdgeIds.has(edge.id))
        && !visualStateById.get(edge.sourceId)?.filtered
        && !visualStateById.get(edge.targetId)?.filtered
      )).map(({ edge, path }) => {
        const sourceState = visualStateById.get(edge.sourceId);
        const targetState = visualStateById.get(edge.targetId);
        const isActive = activeEdgeIds.has(edge.id);
        const isMuted = Boolean(sourceState?.muted || targetState?.muted);
        const sourceNode = layout.nodeById.get(edge.sourceId)?.node;
        const targetPosition = layout.nodeById.get(edge.targetId);
        const targetNode = targetPosition?.node;
        const advisory = sourceNode?.type === 'advisory' || targetNode?.type === 'advisory';
        const delay = selectionActive ? 0 : relationshipDelay(
          targetNode?.authorityLevel ?? edge.authorityLevel,
          targetPosition?.levelOrder ?? 0,
        );

        return (
          <g
            key={edge.id}
            className="org-relationship"
            data-edge-id={edge.id}
            data-highlighted={isActive || undefined}
            data-muted={isMuted || undefined}
            data-target-authority={targetNode?.authorityLevel}
            data-target-order={targetPosition?.levelOrder}
            style={{ '--org-edge-delay': `${delay}ms` } as CSSProperties}
          >
            {isActive && <path className="org-relationship__glow" d={path} pathLength={1} vectorEffect="non-scaling-stroke" />}
            <path
              className="org-relationship__path"
              d={path}
              pathLength={1}
              vectorEffect="non-scaling-stroke"
              stroke={advisory ? 'url(#org-connector-advisory)' : 'url(#org-connector-base)'}
            />
          </g>
        );
      })}
    </svg>
  );
}

export const RelationshipLayer = memo(RelationshipLayerComponent);
