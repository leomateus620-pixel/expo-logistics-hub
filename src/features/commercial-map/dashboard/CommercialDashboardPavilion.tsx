import { useMemo } from 'react';
import type { CommercialPavilionDashboardSnapshot } from './commercialDashboardTypes';
import { buildDashboardPavilionGeometry } from './commercialDashboardPavilionGeometry';
import { CommercialMiniMap } from './CommercialMiniMap';
import type { CommercialStatus } from '../types';
import { OverviewInfo } from './CommercialDashboardOverviewInfo';

export default function CommercialDashboardPavilion({ snapshot, onViewLot, selection, highlightedStatus, hideStatusLegend = false }: {
  snapshot: CommercialPavilionDashboardSnapshot;
  onViewLot: (id: string) => void;
  selection?: { entityId: string | null; onChange: (id: string | null) => void };
  highlightedStatus?: CommercialStatus | null;
  hideStatusLegend?: boolean;
}) {
  const geometry = useMemo(() => buildDashboardPavilionGeometry(snapshot), [snapshot]);
  const hasReferenceDetails = geometry.referenceCount !== snapshot.totalLots || geometry.pending.length > 0;
  return <div data-dashboard-pavilion={snapshot.definition.publicIdentifier}>
    {!snapshot.totalLots && <p className="commercial-dashboard-empty">Nenhum módulo comercial ativo carregado neste pavilhão.</p>}
    <CommercialMiniMap items={geometry.records} title={snapshot.definition.officialName}
      presentation="pavilion" className="commercial-dashboard-pavilion-plan" contentEnvelope={geometry.contentEnvelope}
      numberLabelPixels={snapshot.definition.pavilionNumber === 1 ? 14 : 11}
      outlines={geometry.outlines} accesses={geometry.accesses} numbered onViewLot={onViewLot} selection={selection} highlightedStatus={highlightedStatus} hideStatusLegend={hideStatusLegend} />
    {hasReferenceDetails && <div className="commercial-dashboard-pavilion-reference-note">
      <OverviewInfo label={`Informações da referência de ${snapshot.definition.officialName}`}
        title="Referência da planta" lead="A planta mantém os espaços do cadastro ativo carregado."
        facts={[
          ['Módulos na referência', geometry.referenceCount],
          ['Registros ativos carregados', snapshot.totalLots],
        ]}
        note={geometry.pending.length ? geometry.pending.join(' ') : 'A referência e o cadastro carregado possuem contagens diferentes. Os indicadores usam somente o cadastro ativo.'} />
    </div>}
  </div>;
}
