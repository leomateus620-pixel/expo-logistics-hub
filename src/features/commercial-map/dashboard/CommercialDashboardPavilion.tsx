import { useMemo } from 'react';
import type { CommercialPavilionDashboardSnapshot } from './commercialDashboardTypes';
import { buildDashboardPavilionGeometry } from './commercialDashboardPavilionGeometry';
import { CommercialMiniMap } from './CommercialMiniMap';
import type { CommercialStatus } from '../types';

export default function CommercialDashboardPavilion({ snapshot, onViewLot, selection, highlightedStatus }: {
  snapshot: CommercialPavilionDashboardSnapshot;
  onViewLot: (id: string) => void;
  selection?: { entityId: string | null; onChange: (id: string | null) => void };
  highlightedStatus?: CommercialStatus | null;
}) {
  const geometry = useMemo(() => buildDashboardPavilionGeometry(snapshot), [snapshot]);
  return <div data-dashboard-pavilion={snapshot.definition.publicIdentifier}>
    {!snapshot.totalLots && <p className="commercial-dashboard-empty">Nenhum módulo comercial ativo carregado neste pavilhão.</p>}
    <p className="commercial-dashboard-data-note">
      {geometry.referenceCount} módulos na referência oficial · {snapshot.totalLots} registros ativos carregados.
      {geometry.referenceCount !== snapshot.totalLots && ' A diferença permanece explícita; os indicadores usam somente o cadastro ativo carregado.'}
    </p>
    <CommercialMiniMap items={geometry.records} title={snapshot.definition.officialName}
      outlines={geometry.outlines} accesses={geometry.accesses} numbered onViewLot={onViewLot} selection={selection} highlightedStatus={highlightedStatus} />
    {geometry.pending.map((message) => <p className="commercial-dashboard-pending" key={message}>{message}</p>)}
  </div>;
}
