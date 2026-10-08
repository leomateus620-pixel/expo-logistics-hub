import { useId, type ReactNode } from 'react';
import { Building2, CarFront, Factory, MapPinned, Sprout } from 'lucide-react';
import { COMMERCIAL_MAP_SEGMENT_IDS, type CommercialMapSegmentId } from '../data/commercialMapSegments';
import { OverviewInfo } from './CommercialDashboardOverviewInfo';
import { formatDashboardInteger } from './commercialDashboardFormatters';
import { buildDashboardCommercialProgress, formatDashboardCommercialProgress } from './commercialDashboardProgress';
import type { DashboardAggregate } from './commercialDashboardTypes';

type ScopeIdentity = 'all' | 'rural' | 'industry' | 'automotive' | 'pavilion';

/** Visual identities follow canonical IDs; membership remains in the snapshot. */
const segmentIdentities: Record<CommercialMapSegmentId, ScopeIdentity> = {
  [COMMERCIAL_MAP_SEGMENT_IDS.exporural]: 'rural',
  [COMMERCIAL_MAP_SEGMENT_IDS.industry]: 'industry',
  [COMMERCIAL_MAP_SEGMENT_IDS.automotive]: 'automotive',
};
const icons: Record<ScopeIdentity, typeof MapPinned> = {
  all: MapPinned, rural: Sprout, industry: Factory, automotive: CarFront, pavilion: Building2,
};

export function CommercialDashboardScopeCard({ scopeId, title, aggregate, selected, onSelect, segmentId, pavilionNumber }: {
  scopeId: string;
  title: string;
  aggregate: DashboardAggregate;
  selected: boolean;
  onSelect: () => void;
  segmentId?: CommercialMapSegmentId;
  pavilionNumber?: number;
}) {
  const id = useId();
  const identity = pavilionNumber !== undefined ? 'pavilion' : segmentId ? segmentIdentities[segmentId] : 'all';
  const Icon = icons[identity];
  const progress = buildDashboardCommercialProgress({ total: aggregate.commercialLots,
    saleOpen: aggregate.saleOpenLots, sold: aggregate.soldLots });
  const formatted = formatDashboardCommercialProgress(progress.percentage);
  const context = pavilionNumber !== undefined ? 'lotes' : 'espaços';
  const progressText = progress.percentage === null ? 'Sem base de cálculo' : `${formatted} comercializados`;
  const note: ReactNode = <>
    {aggregate.unavailableLots > 0
      ? `${formatDashboardInteger(aggregate.unavailableLots)} ${aggregate.unavailableLots === 1 ? 'indisponível permanece' : 'indisponíveis permanecem'} no total cadastral e ${aggregate.unavailableLots === 1 ? 'não entra' : 'não entram'} no percentual comercial. `
      : 'O total cadastral e a base comercial coincidem neste recorte. '}
    {progress.inconsistent && 'Os estados comercializados excedem a base ou contêm valores negativos. A barra é limitada visualmente; confira os registros. '}
    {scopeId === 'external:all' && 'Este consolidado reúne apenas as áreas externas. Os pavilhões são contabilizados à parte. '}
    Anexos e históricos não acrescentam lotes ao cálculo.
  </>;

  return <article className={`commercial-dashboard-scope-card commercial-dashboard-scope-card--${identity}`}
    data-scope-id={scopeId} data-selected={selected ? 'true' : 'false'}>
    <button type="button" className="commercial-dashboard-scope-card__select" aria-label={title}
      aria-pressed={selected} aria-describedby={`${id}-summary`} onClick={onSelect}>
      <span className="commercial-dashboard-scope-card__top">
        <span className="commercial-dashboard-scope-card__quantity" key={`total:${aggregate.totalLots}`}>{formatDashboardInteger(aggregate.totalLots)}
          <small> {context}</small>
        </span>
        <span className="commercial-dashboard-scope-card__identity" aria-hidden="true"><Icon />
          {pavilionNumber !== undefined && <span>{String(pavilionNumber).padStart(2, '0')}</span>}
        </span>
      </span>
      <span className="commercial-dashboard-scope-card__name-line">
        <span className="commercial-dashboard-scope-card__name">{pavilionNumber === undefined ? title : `Pavilhão ${pavilionNumber}`}</span>
        <strong className="commercial-dashboard-scope-card__percentage" key={`progress:${formatted}`} data-has-base={progress.percentage !== null}>{formatted}</strong>
      </span>
      <span className="commercial-dashboard-scope-card__track" aria-hidden="true" data-has-base={progress.percentage !== null}>
        <span className="commercial-dashboard-scope-card__fill commercial-dashboard-scope-card__fill--open" style={{ width: `${progress.saleOpenWidth}%` }} />
        <span className="commercial-dashboard-scope-card__fill commercial-dashboard-scope-card__fill--sold" style={{ width: `${progress.soldWidth}%` }} />
      </span>
      <span id={`${id}-summary`} className="sr-only">
        {formatDashboardInteger(aggregate.totalLots)} registros. {progressText}. Base de {formatDashboardInteger(aggregate.commercialLots)} {context} comerciais;
        {' '}{formatDashboardInteger(aggregate.saleOpenLots)} com venda em andamento e {formatDashboardInteger(aggregate.soldLots)} com venda confirmada.
      </span>
    </button>
    <div className="commercial-dashboard-scope-card__info">
      <OverviewInfo label={`Informações do recorte: ${title}`} title={title}
        lead={progress.percentage === null ? 'Este recorte não tem base comercial válida para calcular o percentual.'
          : `${progressText}: vendas em andamento e confirmadas divididas pela quantidade de espaços comerciais.`}
        facts={[
          ['Registros no recorte', formatDashboardInteger(aggregate.totalLots)],
          ['Base comercial', formatDashboardInteger(aggregate.commercialLots)],
          ['Venda em andamento', formatDashboardInteger(aggregate.saleOpenLots)],
          ['Venda confirmada', formatDashboardInteger(aggregate.soldLots)],
        ]} note={note} />
    </div>
  </article>;
}
