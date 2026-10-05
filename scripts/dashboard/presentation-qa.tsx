// Browser-only, read-only visual harness. This file is not an application entry
// or route. The QA script serves its HTML through an intercepted local request.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RefreshRuntime from '/@react-refresh';
import '/src/styles/tokens.css';
import '/src/index.css';
import '/src/features/commercial-map/commercial-map.css';
import '/src/features/commercial-map/components/shell/commercial-map-shell.css';

RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type: unknown) => type;
window.__vite_plugin_react_preamble_installed__ = true;

async function start() {
  window.__dashboardQaStage = 'importing dashboard and reference';
  const [{ CommercialDashboard }, { OFFICIAL_REFERENCE_DATA }] = await Promise.all([
    import('/src/features/commercial-map/dashboard/CommercialDashboard.tsx'),
    import('/src/features/commercial-map/data/officialReference2026.ts'),
  ]);
  window.__dashboardQaStage = 'dashboard and reference imported';
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  function Presentation() {
    const [data, setData] = useState(OFFICIAL_REFERENCE_DATA);
    const [open, setOpen] = useState(true);
    window.__dashboardQa = {
      fixture: 'Official reference inventory; local React state only; no backend operations',
      data,
      updateCommercialStatus(entityId: string) {
        setData((current) => ({ ...current, lots: current.lots.map((lot) => lot.entityId === entityId
          ? { ...lot, status: lot.status === 'AVAILABLE' ? 'SALE_OPEN' : 'AVAILABLE' } : lot) }));
      },
    };
    window.__dashboardQaStage = 'rendering';
    return <QueryClientProvider client={client}><div className="commercial-map-shell" style={{ height: '100dvh' }}>
      {open ? <div className="commercial-dashboard-overlay" role="dialog" aria-label="Dashboard Comercial"
        style={{ position: 'fixed', inset: 0, zIndex: 60, overflow: 'auto', background: '#f5f7f3' }}>
        <CommercialDashboard data={data} dataUpdatedAt={Date.parse('2026-10-05T20:28:00Z')} isFetching={false}
          onClose={() => setOpen(false)} onViewLot={() => {}} scrollContainer={() => document.querySelector('.commercial-dashboard-overlay')} />
      </div> : <button type="button" onClick={() => setOpen(true)}>Abrir Dashboard para conferência</button>}
    </div></QueryClientProvider>;
  }
  createRoot(document.getElementById('dashboard-qa-root')!).render(<Presentation />);
}
start().catch((error) => {
  document.getElementById('dashboard-qa-root')!.textContent = String(error);
  throw error;
});
