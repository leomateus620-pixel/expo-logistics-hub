import { memo } from 'react';
import { annotationLine, type PavilionAnnotationLayout } from './pavilionAnnotationLayout';

export const PavilionAnnotations = memo(function PavilionAnnotations({ layout, selectedId, selectedScopeId, connections, onSelect }: {
  layout: PavilionAnnotationLayout; selectedId: string | null; selectedScopeId?: string | null; connections: boolean; onSelect: (id: string, scopeId?: string) => void;
}) {
  const active = (groupId: string, scopeId: string) => selectedScopeId ? selectedScopeId === scopeId : selectedId === groupId;
  return <g className="pavilion-annotations" data-testid="pavilion-annotations">
    {layout.annotations.map(({ id, group, clusters, label, scopeId, scopeKind, scopeMarker, scopeLabel }) => <g key={id} data-exhibitor-group={group.id} data-contract-scope={scopeId}
      opacity={(selectedScopeId ? selectedScopeId !== scopeId : selectedId && selectedId !== group.id) ? .22 : 1}>
      <g pointerEvents="none" fill="none" stroke={group.state === 'REVIEW' ? '#a6632b' : '#17685c'} strokeLinejoin="round" strokeLinecap="round">
        {clusters.map((cluster, index) => <g key={index}>
          <path d={cluster.path} strokeWidth={active(group.id, scopeId) ? 4 : 2.8} stroke="#ffffff" strokeOpacity=".9" vectorEffect="non-scaling-stroke" />
          <path d={cluster.path} strokeWidth={active(group.id, scopeId) ? 2.8 : 1.6} vectorEffect="non-scaling-stroke"
            strokeDasharray={scopeKind === 'CONTRACT' ? undefined : '4 3'} data-group-contour={group.id} data-contract-contour={scopeKind === 'CONTRACT' ? scopeId : undefined} />
          {connections && cluster.route && <>
            {[cluster.route, ...cluster.branches].map((route, i) => <path key={i} d={annotationLine(route)} stroke="#ffffff" strokeWidth={active(group.id, scopeId) ? 4.2 : 3.4} strokeOpacity=".94" vectorEffect="non-scaling-stroke" />)}
            <path d={annotationLine(cluster.route)} strokeWidth={active(group.id, scopeId) ? 2.6 : 1.9}
            strokeDasharray={group.state === 'PENDING_SIGNATURE' ? '4 3' : undefined} vectorEffect="non-scaling-stroke" data-group-connection={group.id} />
            {cluster.branches.map((branch, i) => <path key={i} d={annotationLine(branch)} strokeWidth={active(group.id, scopeId) ? 2 : 1.5} vectorEffect="non-scaling-stroke" data-group-branch={group.id} />)}
            <circle cx={cluster.anchor[0]} cy={cluster.anchor[1]} r="2" fill="#17685c" stroke="white" strokeWidth=".7" />
            {cluster.anchors.map((anchor, i) => <circle key={i} cx={anchor[0]} cy={anchor[1]} r="1.8" fill="white" strokeWidth="1.1" />)}</>}
        </g>)}
      </g>
      {label && <g role="button" tabIndex={0} aria-pressed={selectedScopeId ? selectedScopeId === scopeId : selectedId === group.id} aria-label={`Expositor ${group.name}, ${scopeLabel ?? ''}, ${label.lotLine}, ${label.stateLine}`}
        onClick={() => onSelect(group.id, scopeId)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(group.id, scopeId); } }}
        className="pavilion-annotation-label">
        <title>{group.name} · {scopeLabel} · {label.lotLine} · {label.stateLine}{!group.verified ? ' · Identidade não verificada' : ''}</title>
        <rect x={label.minX} y={label.minY} width={label.maxX - label.minX} height={label.maxY - label.minY} rx="7"
          fill={active(group.id, scopeId) ? '#eaf4ef' : '#ffffff'} stroke={active(group.id, scopeId) ? '#17685c' : '#b7cec2'} strokeWidth={active(group.id, scopeId) ? 1.4 : .8} />
        <circle cx={label.minX + 11} cy={label.minY + 12} r="6.5" fill="#235746" />
        <text x={label.minX + 11} y={label.minY + 12} dominantBaseline="central" textAnchor="middle" fontSize={scopeMarker.length > 2 ? 5.5 : 7} fill="white">{scopeMarker}</text>
        {label.lines.map((line, i) => <text key={i} x={label.minX + 23} y={label.minY + 13.5 + i * 9} fontSize="9.2" fontWeight="700" fill="#213d32">{line}</text>)}
        {scopeLabel && <text x={label.minX + 8} y={label.minY + 23 + (label.lines.length - 1) * 9} fontSize="7.2" fontWeight="650" fill="#17685c">{label.referenceLine}</text>}
        <text x={label.minX + 8} y={label.minY + 26 + (label.lines.length - 1) * 9 + (scopeLabel ? 7 : 0)} fontSize="7.8" fill="#52695c">{label.lotLine}</text>
        <text x={label.minX + 8} y={label.minY + 35 + (label.lines.length - 1) * 9 + (scopeLabel ? 7 : 0)} fontSize="7.2" fill="#52695c">{label.stateLine}</text>
      </g>}
    </g>)}
  </g>;
});
