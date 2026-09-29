import type { CSSProperties } from 'react';
import { COMMERCIAL_MAP_SEGMENTS } from '../data/commercialMapSegments';
import { STATUS_CONFIG } from '../constants';
import type { PublicAreaDefinition } from './publicAreaRegistry';

export function PublicMapLegend({ area }: { area: PublicAreaDefinition }) {
  const segment = COMMERCIAL_MAP_SEGMENTS.find(item => item.id === (area.segmentSlug ?? area.slug));
  return <div className="public-map-legend" aria-label="Legenda de disponibilidade"
    style={{ '--segment-color': segment?.palette.edge, '--segment-accent': segment?.palette.accent } as CSSProperties}>
    {segment && <strong className="public-map-segment" key={segment.id}>{segment.name}</strong>}
    <div className="public-map-legend__statuses">
      {(['AVAILABLE', 'SOLD', 'BLOCKED'] as const).map(status =>
        <span key={status}><i style={{ background: STATUS_CONFIG[status].color }} />{STATUS_CONFIG[status].label}</span>)}
    </div>
  </div>;
}
