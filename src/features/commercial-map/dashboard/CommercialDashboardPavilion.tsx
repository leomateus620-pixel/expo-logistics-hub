import { useMemo } from 'react';
import type { CommercialPavilionDashboardSnapshot } from './commercialDashboardTypes';
import { buildDashboardPavilionGeometry } from './commercialDashboardPavilionGeometry';
import { CommercialMiniMap } from './CommercialMiniMap';
import type { CommercialStatus } from '../types';

export default function CommercialDashboardPavilion({ snapshot, onViewLot, selection, highlightedStatus, hideStatusLegend = false }: {
  snapshot: CommercialPavilionDashboardSnapshot;
  onViewLot: (id: string) => void;
  selection?: { entityId: string | null; onChange: (id: string | null) => void };
  highlightedStatus?: CommercialStatus | null;
  hideStatusLegend?: boolean;
}) {
  const geometry = useMemo(() => buildDashboardPavilionGeometry(snapshot), [snapshot]);
  return <div data-dashboard-pavilion={snapshot.definition.publicIdentifier}>
    {!snapshot.totalLots && <p className="commercial-dashboard-empty">Nenhum módulo comercial ativo carregado neste pavilhão.</p>}
    <p className="commercial-dashboard-data-note">
      {geometry.referenceCount} módulos na referência oficial · {snapshot.totalLots} registros ativos carregados.
      {geometry.referenceCount !== snapshot.totalLots && ' A diferença permanece explícita; os indicadores usam somente o cadastro ativo carregado.'}
    </p>
    <CommercialMiniMap items={geometry.records} title={snapshot.definition.officialName}
      className="commercial-dashboard-pavilion-plan" contentEnvelope={geometry.contentEnvelope}
      numberLabelPixels={snapshot.definition.pavilionNumber === 1 ? 14 : 11}
      outlines={geometry.outlines} accesses={geometry.accesses} numbered onViewLot={onViewLot} selection={selection} highlightedStatus={highlightedStatus} hideStatusLegend={hideStatusLegend} />
    {geometry.pending.map((message) => <p className="commercial-dashboard-pending" key={message}>{message}</p>)}
  </div>;
}
