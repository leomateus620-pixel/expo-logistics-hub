// Local visual/interaction fixture. This entry is never imported by App/router.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommercialDashboard } from '@/features/commercial-map/dashboard/CommercialDashboard';
import { buildCommercialDashboardSnapshot } from '@/features/commercial-map/dashboard/commercialDashboardAnalytics';
import { createDashboardPersistedPavilionFixture } from '../../src/test/helpers/dashboardPersistedPavilionFixture';
import { withDashboardValue } from '@/test/helpers/dashboardFinancialFixture';
import type { CommercialStatus } from '@/features/commercial-map/types';
import '@/styles/tokens.css';
import '@/index.css';
import '@/features/commercial-map/commercial-map.css';
import '@/features/commercial-map/components/shell/commercial-map-shell.css';

const source = createDashboardPersistedPavilionFixture();
const firstLots = new Map<string, number>();
const data = { ...source, lots: source.lots.map((original) => {
  const parent = source.entities.find((entity) => entity.id === original.entityId)?.parentEntityId;
  const index = firstLots.get(parent ?? '') ?? 0;
  firstLots.set(parent ?? '', index + 1);
  // Explicit test-only prices and identities exercise the real read presentation.
  const status = index === 0 ? 'AVAILABLE' : index === 1 ? 'SALE_OPEN' : index === 2 ? 'SOLD' : original.status;
  return withDashboardValue({ ...original, status,
    currentBuyer: status === 'SALE_OPEN' || status === 'SOLD' ? 'Expositor de teste' : null,
  }, index === 0 ? 0 : 2250, index === 0 ? 2750 : 3000);
}) };
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

export function Qa() {
  const [mapData, setMapData] = useState(data);
  const [open, setOpen] = useState(true);
  Object.assign(window, { __pavilionQa: {
    data: mapData,
    snapshot: buildCommercialDashboardSnapshot(mapData),
    // Explicit test-only official-area fields, never inferred from polygons.
    updateAreas: (areas: Record<string, number | null>) => setMapData((current) => ({ ...current,
      lots: current.lots.map((lot) => Object.prototype.hasOwnProperty.call(areas, lot.entityId) ? { ...lot, officialAreaSqm: areas[lot.entityId] } : lot),
    })),
    updateStatus: (entityId: string, status: CommercialStatus) => setMapData((current) => ({ ...current,
      lots: current.lots.map((lot) => lot.entityId === entityId ? withDashboardValue({ ...lot, status }, 2250, 3000) : lot),
    })),
  } });
  return <QueryClientProvider client={client}><div className="commercial-map-shell" style={{ height: '100dvh' }}>
    {open ? <div className="commercial-dashboard-overlay" role="dialog" aria-modal="true" aria-label="Dashboard Comercial"
      style={{ position: 'fixed', inset: 0, zIndex: 60, overflow: 'auto', background: '#f5f7f3' }}>
      <CommercialDashboard data={mapData} dataUpdatedAt={Date.parse('2026-10-08T03:00:00-03:00')} isFetching={false}
        onClose={() => setOpen(false)} onViewLot={(id) => { Object.assign(window, { __viewedLot: id }); }}
        scrollContainer={() => document.querySelector('.commercial-dashboard-overlay')} />
    </div> : <button type="button" onClick={() => setOpen(true)}>Voltar à dashboard</button>}
  </div></QueryClientProvider>;
}
createRoot(document.getElementById('dashboard-qa-root')!).render(<Qa />);
