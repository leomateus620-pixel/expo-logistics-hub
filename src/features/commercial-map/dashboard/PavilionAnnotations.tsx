import { memo } from 'react';
import { annotationLine, type PavilionAnnotationLayout } from './pavilionAnnotationLayout';
import { occupancyLotList } from './pavilionOccupancy';

/** Company identity is primary. Contract inspection is painted on the actual
 * linked cells by the map, and never mounts another company card. */
export const PavilionAnnotations = memo(function PavilionAnnotations({ layout, selectedId, connections, onSelect }: {
  layout: PavilionAnnotationLayout; selectedId: string | null; connections: boolean; onSelect: (id: string) => void;
}) {
  return <g className="pavilion-annotations" data-testid="pavilion-annotations">
    {layout.annotations.map(({ id, group, clusters, label }) => {
      const active = selectedId === group.id;
      const color = group.state === 'REVIEW' ? '#a6632b' : '#17685c';
      return <g key={id} data-exhibitor-group={group.id} opacity={selectedId && !active ? .55 : 1}>
        <g pointerEvents="none" fill="none" stroke={color} strokeLinejoin="round" strokeLinecap="round">
          {clusters.map((cluster, index) => <g key={index}>
            <path d={cluster.path} strokeWidth={active ? 1.6 : 1} vectorEffect="non-scaling-stroke"
              strokeDasharray={group.state === 'REVIEW' || !group.verified ? '3 3' : undefined} data-group-contour={group.id} />
            {connections && cluster.route && <>
              <path d={annotationLine(cluster.route)} strokeWidth={active ? 1.1 : .85} vectorEffect="non-scaling-stroke" data-group-connection={group.id} />
              <circle cx={cluster.anchor[0]} cy={cluster.anchor[1]} r="1.2" fill={color} stroke="none" />
            </>}
            {cluster.marker && <g data-component-marker={group.id}>
              <circle cx={cluster.marker[0]} cy={cluster.marker[1]} r="3.2" fill="white" strokeWidth=".8" vectorEffect="non-scaling-stroke" />
              <text x={cluster.marker[0]} y={cluster.marker[1]} dominantBaseline="central" textAnchor="middle" fontSize="4.4" fontWeight="650" fill={color} stroke="none">{group.marker}</text>
            </g>}
          </g>)}
        </g>
        {label && <g role="button" tabIndex={0} aria-pressed={active} aria-label={`Expositor ${group.name}, ${occupancyLotList(group.items)}, ${label.stateLine}`}
          onClick={() => onSelect(group.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(group.id); } }}
          className="pavilion-annotation-label" data-company-label={group.id}>
          <title>{group.name} · {occupancyLotList(group.items)} · {label.stateLine}{!group.verified ? ' · Identidade não verificada' : ''}</title>
          <rect className="pavilion-annotation-surface" x={label.minX} y={label.minY} width={label.maxX - label.minX} height={label.maxY - label.minY} rx="6"
            fill={active ? '#f0f7f3' : '#ffffff'} stroke={active ? '#17685c' : '#c5d7cc'} strokeWidth={active ? 1.2 : .8} vectorEffect="non-scaling-stroke" />
          <circle cx={label.minX + 12} cy={label.minY + 13} r="6" fill="#235746" />
          <text x={label.minX + 12} y={label.minY + 13} dominantBaseline="central" textAnchor="middle" fontSize="6.8" fill="white">{group.marker}</text>
          {label.lines.map((line, i) => <text key={i} x={label.minX + 24} y={label.minY + 15 + i * 10} fontSize="9.2" fontWeight="700" fill="#213d32">{line}</text>)}
          <text x={label.minX + 9} y={label.minY + 28 + (label.lines.length - 1) * 10} fontSize="7.8" fill="#52695c">{label.lotLine}</text>
          <text x={label.minX + 9} y={label.minY + 37 + (label.lines.length - 1) * 10} fontSize="7" fill={color}>{label.stateLine}</text>
        </g>}
      </g>;
    })}
  </g>;
});
