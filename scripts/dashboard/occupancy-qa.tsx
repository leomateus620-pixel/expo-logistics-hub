// Isolated synthetic commercial data on official polygons. Never imported by App.
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PavilionWorkspace } from '@/features/commercial-map/dashboard/CommercialDashboardPavilion';
import { createPavilionOccupancyFixture, createPavilionGroupingRegressionFixture } from '@/test/helpers/pavilionOccupancyFixture';
import '@/styles/tokens.css';
import '@/index.css';
import '@/features/commercial-map/dashboard/commercial-dashboard.css';
import '@/features/commercial-map/dashboard/commercial-dashboard-overview.css';

export function Qa() {
  const [number, setNumber] = useState(12), [dense, setDense] = useState(false);
  const [reported, setReported] = useState(true);
  const fixture = useMemo(() => reported && !dense ? createPavilionGroupingRegressionFixture(number) : createPavilionOccupancyFixture(number, dense), [number, dense, reported]);
  Object.assign(window, { __occupancyQa: fixture });
  return <main className="commercial-dashboard" style={{ margin: '0 auto', maxWidth: 1600, padding: 24 }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 20 }}><div>
      <h1 style={{ fontSize: 26, fontWeight: 750 }}>Dashboard Comercial <span style={{ color: '#3343a8', fontSize: 14 }}>FENASOJA 2028</span></h1>
      <p style={{ fontSize: 12 }}>Validação local · expositores e contratos fictícios · geometria oficial preservada</p></div>
      <div><label>Pavilhão <select aria-label="Pavilhão de teste" value={number} onChange={e => setNumber(Number(e.target.value))}><option value="12">12</option><option value="13">13</option></select></label>
        <label style={{ marginLeft: 12 }}><input type="checkbox" checked={reported} onChange={e => setReported(e.target.checked)} />Casos dos anexos</label>
        <label style={{ marginLeft: 12 }}><input type="checkbox" checked={dense} onChange={e => setDense(e.target.checked)} />Alta densidade</label></div></header>
    <h2 style={{ fontSize: 22, marginBottom: 8 }}>{fixture.snapshot.definition.officialName}</h2>
    <p style={{ marginBottom: 16 }}>{fixture.snapshot.totalLots} espaços · {fixture.snapshot.soldLots} vendidos · {fixture.snapshot.saleOpenLots} em andamento · {fixture.snapshot.availableLots} disponíveis</p>
    <PavilionWorkspace key={`${number}:${dense}:${reported}`} snapshot={fixture.snapshot} payload={fixture.payload} onViewLot={id => Object.assign(window, { __viewedLot: id })} />
  </main>;
}
createRoot(document.getElementById('dashboard-qa-root')!).render(<Qa />);
