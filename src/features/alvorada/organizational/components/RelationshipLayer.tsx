import { memo, type CSSProperties } from 'react';
import type { OrgNodeVisualState } from '../hooks/useOrgGraphInteraction';
import type { OrganizationalLayout } from '../layout/organizationalLayout';

interface RelationshipLayerProps {
  active: boolean;
  activeEdgeIds: Set<string>;
  layout: OrganizationalLayout;
  visualStateById: Map<string, OrgNodeVisualState>;
}

function relationshipDelay(authorityLevel: number, levelOrder: number): number {
  if (authorityLevel === 2) return Math.min(560, 360 + levelOrder * 150);
  if (authorityLevel === 3) return 760;
  if (authorityLevel === 4) return Math.min(1720, 980 + levelOrder * 22);
  return 80;
}

function RelationshipLayerComponent({
  active,
  activeEdgeIds,
  layout,
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
    >
      <defs>
        <linearGradient id="org-connector-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F9C121" stopOpacity="0.9" />
          <stop offset="0.48" stopColor="#F7A43B" stopOpacity="0.9" />
          <stop offset="1" stopColor="#77ACE8" stopOpacity="0.88" />
        </linearGradient>
        <linearGradient id="org-connector-advisory" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FAD954" />
          <stop offset="1" stopColor="#74D8C3" />
        </linearGradient>
        <filter id="org-connector-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {layout.edges.map(({ edge, path }) => {
        const sourceState = visualStateById.get(edge.sourceId);
        const targetState = visualStateById.get(edge.targetId);
        const isActive = activeEdgeIds.has(edge.id);
        const isMuted = Boolean(sourceState?.muted || targetState?.muted);
        const sourceNode = layout.nodeById.get(edge.sourceId)?.node;
        const targetPosition = layout.nodeById.get(edge.targetId);
        const targetNode = targetPosition?.node;
        const advisory = sourceNode?.type === 'advisory' || targetNode?.type === 'advisory';
        const delay = relationshipDelay(
          targetNode?.authorityLevel ?? edge.authorityLevel,
          targetPosition?.levelOrder ?? 0,
        );

        return (
          <g
            key={edge.id}
            className="org-relationship"
            data-highlighted={isActive || undefined}
            data-muted={isMuted || undefined}
            data-target-authority={targetNode?.authorityLevel}
            data-target-order={targetPosition?.levelOrder}
            style={{ '--org-edge-delay': `${delay}ms` } as CSSProperties}
          >
            <path
              className="org-relationship__reveal-glow"
              d={path}
              pathLength={1}
            />
            {isActive && <path className="org-relationship__glow" d={path} pathLength={1} />}
            <path
              className="org-relationship__path"
              d={path}
              pathLength={1}
              stroke={advisory ? 'url(#org-connector-advisory)' : 'url(#org-connector-base)'}
            />
            <circle
              className="org-relationship__terminal"
              cx={targetPosition?.x}
              cy={(targetPosition?.y ?? 0) - (targetPosition?.radius ?? 0)}
              r="3.5"
            />
          </g>
        );
      })}
    </svg>
  );
}

export const RelationshipLayer = memo(RelationshipLayerComponent);
