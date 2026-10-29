import type { CSSProperties } from 'react';
import { COMMERCIAL_MAP_SEGMENTS } from '../data/commercialMapSegments';
import { STATUS_CONFIG } from '../constants';
import type { PublicAreaDefinition } from './publicAreaRegistry';
import { EXTERNAL_LOT_PALETTE, externalLotFrameColor } from '../utils/externalLotPresentation';

export function PublicMapLegend({ area }: { area: PublicAreaDefinition }) {
  const segment = COMMERCIAL_MAP_SEGMENTS.find(item => item.id === (area.segmentSlug ?? area.slug));
  const external = (area.kind === 'SEGMENT' && segment?.id === 'exporural')
    || (area.kind === 'SEGMENT_EXTERNAL' && segment?.id === 'industria-comercio-servicos')
    || (area.kind === 'ENTITY_SET' && segment?.id === 'espaco-automovel');
  return <div className="public-map-legend" aria-label="Legenda de disponibilidade"
    style={{ '--segment-color': segment?.palette.edge, '--segment-accent': segment?.palette.accent } as CSSProperties}>
    {segment && <strong className="public-map-segment" key={segment.id}>{segment.name}</strong>}
    <div className="public-map-legend__statuses">
      {(['AVAILABLE', 'SOLD', 'BLOCKED'] as const).map(status =>
        <span key={status}><i className={external && status !== 'BLOCKED' ? 'is-external-lot' : undefined}
          style={external && status !== 'BLOCKED' ? {
            '--grass': EXTERNAL_LOT_PALETTE.grass, '--grass-light': EXTERNAL_LOT_PALETTE.lightGrass,
            '--frame': externalLotFrameColor(status) ?? 'transparent',
          } as CSSProperties : { background: STATUS_CONFIG[status].color }} />{STATUS_CONFIG[status].label}</span>)}
    </div>
  </div>;
}
