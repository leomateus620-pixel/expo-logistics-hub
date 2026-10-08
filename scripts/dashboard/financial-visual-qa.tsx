// Isolated frontend test page; never mounted in App or a production route.
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommercialDashboard } from '@/features/commercial-map/dashboard/CommercialDashboard';
import { withDashboardValue } from '@/test/helpers/dashboardFinancialFixture';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { CommercialMapHeaderTools } from '@/features/commercial-map/components/shell/CommercialMapHeaderTools';
import { CommercialMapHeaderHost } from '@/features/commercial-map/components/shell/headerHost';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import '@/styles/tokens.css';
import '@/index.css';
import '@/features/commercial-map/components/shell/commercial-map-shell.css';

// Explicit UI-only financial coverage using the existing test helper.
// No persistence, live amounts or production data assertion.
const data = { ...OFFICIAL_REFERENCE_DATA, lots: OFFICIAL_REFERENCE_DATA.lots.map((lot, index) => withDashboardValue({ ...lot, status: (['SOLD', 'SALE_OPEN', 'AVAILABLE', 'BLOCKED'] as const)[index % 4] }, index % 17 === 0 ? 0 : 1000 + (index % 9) * 125, 1600 + (index % 9) * 125)) };
const p13 = data.entities.find(entity => entity.publicIdentifier === 'B5')!;
const moduleLots = data.lots.filter(lot => data.entities.some(entity => entity.id === lot.entityId && entity.parentEntityId === p13.id)).slice(0, 2);
const externalLot = data.lots.find(lot => !data.entities.find(entity => entity.id === lot.entityId)?.metadata.pavilionModuleKey)!;
const chosen = [...moduleLots, externalLot];
const rows = Array.from({ length: 20 }, (_, index) => ({
  record_id: index === 2 ? 'qa-legacy' : `qa-order-${index + 1}`, kind: index === 2 ? 'LEGACY' : 'ORDER',
  order_id: index === 2 ? null : `qa-order-${index + 1}`, sale_id: index === 2 ? 'qa-old-sale' : null,
  reference: index === 2 ? 'LEG-QA' : `PED-QA-${String(index + 1).padStart(3, '0')}`, created_at: '2026-10-01T12:00:00Z',
  status: index === 2 ? 'SOLD' : 'OPEN', buyer_name: 'Expositor de teste Ltda.',
  buyer_trade_name: index < 2 ? 'Expositor de teste' : `Expositor de teste ${index + 1}`, display_name: 'Expositor de teste Ltda.',
  negotiated_total: 5250, spaces_subtotal: 5000, fees_total: 250, payment_method: 'BOLETO_PARCELADO', installment_count: 17,
  item_count: 3, active_count: 2, signed_count: 1, pending_count: 1, cancelled_count: 1, legacy_count: index === 2 ? 1 : 0,
  active_items_total: 3000, lot_ids: moduleLots.map(lot => lot.id), document_count: index === 2 ? null : 1, paid_installments: 1,
}));
const detail = {
  header: { kind: 'ORDER', orderId: 'qa-order-1', reference: 'PED-QA-001', createdAt: '2026-10-01T12:00:00Z', installmentCount: 17,
    buyerName: 'Expositor de teste Ltda.', buyerTradeName: 'Expositor de teste',
    status: 'OPEN', negotiatedTotal: 5250, spacesSubtotal: 5000, feeAdmin: 250, feePpci: 0, feeCleaning: 0,
    paymentMethod: 'BOLETO_PARCELADO', documentNumber: 'Documento de teste', email: 'teste@example.invalid' },
  items: chosen.map((lot, index) => ({ itemId: `qa-item-${index + 1}`, lotId: lot.id, entityId: lot.entityId,
    publicIdentifier: lot.publicIdentifier, lotNumber: lot.lotNumber, displayName: lot.displayName,
    areaSnapshot: lot.officialAreaSqm, itemTotal: [3000, 0, 2000][index],
    contractState: ['SIGNED', 'PENDING_SIGNATURE', 'CANCELLED'][index], lotStatus: ['SOLD', 'SALE_OPEN', 'AVAILABLE'][index] })),
  installments: Array.from({ length: 17 }, (_, index) => ({ number: index + 1, dueDate: `2027-${String(index % 12 + 1).padStart(2, '0')}-05`,
    amount: index === 16 ? 308.88 : 308.82, paymentStatus: index === 0 ? 'PAID' : 'PENDING', paidAt: index === 0 ? '2027-01-05' : null })),
  contracts: [{ contractId: 'qa-contract', scope: 'ORDER_ITEMS', contractNumber: 'QA-01', activeVersion: 2,
    createdAt: '2026-10-01T12:00:00Z', lotIds: moduleLots.map(lot => lot.id), versions: [
      { id: 'qa-v2', version: 2, storagePath: 'test/v2.pdf', originalName: 'contrato-de-teste-v2.pdf', mimeType: 'application/pdf', fileSize: 200, uploadedAt: '2026-10-02T12:00:00Z', supersededAt: null },
      { id: 'qa-v1', version: 1, storagePath: 'test/v1.pdf', originalName: 'contrato-de-teste-v1.pdf', mimeType: 'application/pdf', fileSize: 180, uploadedAt: '2026-10-01T12:00:00Z', supersededAt: '2026-10-02T12:00:00Z' },
    ] }], documentsAccessible: true,
};
Object.assign(window, { __salesQa: { rows, detail, revisions: { updatedAt: '2026-10-03T12:00:00Z', revisions: [{ id: 'qa-revision',
  createdAt: '2026-10-03T12:00:00Z', actorName: 'Responsável de teste', reason: 'Retirada de um espaço de teste',
  before: { lots: chosen.map(lot => lot.publicIdentifier), negotiated_total: 5250, installment_count: 17 },
  after: { lots: moduleLots.map(lot => lot.publicIdentifier), negotiated_total: 3250, installment_count: 17 } }] } } });
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
export function Qa() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [toolsHost, setToolsHost] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(true);
  const [currentData, setCurrentData] = useState(data);
  const [fetching, setFetching] = useState(false);
  Object.assign(window, { __dashboardQa: { data: currentData, updateCommercialStatus(entityId: string) { setFetching(true); setCurrentData(current => ({ ...current, lots: current.lots.map(lot => lot.entityId === entityId ? { ...lot, status: lot.status === 'AVAILABLE' ? 'SALE_OPEN' : 'AVAILABLE' } : lot) })); setTimeout(() => setFetching(false), 80); } } });
  return <QueryClientProvider client={client}><CommercialMapHeaderHost.Provider value={toolsHost}><div className="commercial-map-module" style={{ height: '100dvh' }}>
    <header className="commercial-map-module__bar"><div className="commercial-map-module__leading"><span className="commercial-map-module__back" aria-hidden="true">‹</span>
      <div className="commercial-map-module__identity"><FenasojaBrand compact markOnly tone="dark" className="commercial-map-module__brand" /><span className="commercial-map-module__title-group"><span className="commercial-map-module__eyebrow">Gestão territorial</span><strong>Mapa Comercial</strong></span></div>
    </div><div className="commercial-map-module__actions"><div ref={setToolsHost} className="commercial-map-module__tools-host" /><span className="commercial-map-module__edition"><span>FENASOJA</span><strong>2028</strong></span></div></header>
    <CommercialMapHeaderTools salesAvailable dashboardAvailable dashboardOpen={open} onOpenDashboard={() => setOpen(true)} />
    <div className="commercial-map-shell" style={{ height: '100dvh' }}>
    {open ? <div className="commercial-dashboard-overlay" ref={scrollRef} role="dialog" aria-modal="true" aria-label="Dashboard Comercial" style={{ inset: 0 }}>
      <CommercialDashboard data={currentData} dataUpdatedAt={0} isFetching={fetching} projectId="qa-local-only" orgId="qa-local-only"
        canManageSales canManageContracts onClose={() => setOpen(false)} onViewLot={() => setOpen(false)}
        scrollContainer={() => scrollRef.current} onViewSale={() => setOpen(false)} />
    </div> : <button type="button" onClick={() => setOpen(true)} style={{ margin: 40 }}>Voltar à dashboard</button>}
  </div></div></CommercialMapHeaderHost.Provider></QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<Qa />);
