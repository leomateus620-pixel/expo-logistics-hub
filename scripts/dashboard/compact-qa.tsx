// Isolated presentation fixture; never imported by App or production routes.
import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommercialDashboard } from '@/features/commercial-map/dashboard/CommercialDashboard';
import { CommercialDashboard as Before } from './compact-baselines.local/before/CommercialDashboard';
import { CommercialDashboard as Historical } from './compact-baselines.local/historical/CommercialDashboard';
import { withDashboardValue } from '@/test/helpers/dashboardFinancialFixture';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import report from '../../docs/commercial-analytics/database-report.json';
import '@/index.css';
import regionBeforeCss from './compact-baselines.local/region-before.css?inline';
import currentCss from '@/features/commercial-map/dashboard/commercial-dashboard-overview.css?inline';
import beforeCss from './compact-baselines.local/before/commercial-dashboard-overview.css?inline';
import historicalCss from './compact-baselines.local/historical/commercial-dashboard-overview.css?inline';
const params = new URLSearchParams(location.search);
const phase = params.get('phase') ?? 'after';
const Dashboard = phase === 'before' ? Before : phase === 'historical' ? Historical : CommercialDashboard;
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const data = { ...OFFICIAL_REFERENCE_DATA, lots: OFFICIAL_REFERENCE_DATA.lots.map((lot, index) => withDashboardValue({ ...lot, status: (['SOLD', 'SALE_OPEN', 'AVAILABLE', 'BLOCKED'] as const)[index % 4] }, index % 17 === 0 ? 0 : 1000 + (index % 9) * 125, 1600 + (index % 9) * 125)) };
function Qa() {
  const scroll = useRef<HTMLDivElement>(null);
  return <QueryClientProvider client={client}>
    <style>{phase === 'region-before' ? regionBeforeCss : phase === 'before' ? beforeCss : phase === 'historical' ? historicalCss : currentCss}</style>
    <div ref={scroll} data-qa-scroll style={{ height: '100dvh', overflow: 'auto', background: '#f4f7f2' }}>
      <div style={{ padding: '4px 24px', fontSize: 11 }}>Prévia local · dados fictícios · {phase}</div>
      <CommercialDashboardOrBaseline />
    </div>
  </QueryClientProvider>;
  function CommercialDashboardOrBaseline() { return <Dashboard data={data} projectId={report.baseline.projectId} orgId="test-org"
    dataUpdatedAt={1792706400000} inventoryRevision={params.get('state') === 'stale' ? 'outdated' : report.baseline.generation} isFetching={false}
    canManageSales={params.get('access') !== 'contracts'} canManageContracts onClose={() => {}} onViewLot={() => {}} onViewSale={() => {}}
    scrollContainer={() => scroll.current} />; }
}
const root = createRoot(document.getElementById('root')!);
root.render(<Qa />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
