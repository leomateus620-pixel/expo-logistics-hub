/** Isolated visual fixture. All identities, business values and geometry below are synthetic. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { encodeWorkerResponse } from '../../supabase/functions/_shared/workers/response-contract';
import { createCommercialReportPdf } from '../../src/lib/workers/report-pdf';
import { commercialReportSpecSchema, type CommercialReportSnapshot } from '../../src/lib/workers/commercial-report';

const uuid = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const snapshotId = uuid(1), generation = 'a'.repeat(32), projectId = uuid(2), reportId = uuid(3);
const states = ['SOLD', 'SALE_OPEN', 'AVAILABLE', 'BLOCKED'] as const;
const inventory: CommercialReportSnapshot['inventory'] = Array.from({ length: 12 }, (_, index) => {
  const x = index % 6 * 12, y = Math.floor(index / 6) * 15;
  return { lotId: uuid(100 + index), entityId: uuid(200 + index), lotLabel: `Quadra R · Lote ${index + 1}`,
    lotNumber: String(index + 1), block: 'R', pavilionId: null, pavilionName: null, segmentId: uuid(4), segmentName: 'ExpoRural · teste',
    category: 'external', status: states[index % 4], currentArea: 120, labelAnchor: null,
    geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10], [x, y]]] },
    associations: index % 4 < 2 ? [{ rowId: uuid(300 + index), exhibitorId: uuid(400 + index), displayName: index === 0 ? 'Cooperativa Demonstração de Produtos Agrícolas e Serviços — empresa fictícia' : `Expositor demonstração ${index + 1}`, state: index % 4 === 0 ? 'signed' : 'pending' }] : [], issues: [] };
});
const rows: CommercialReportSnapshot['rows'] = inventory.filter(lot => lot.associations.length).map((lot, index) => ({
  id: lot.associations[0].rowId, orderId: uuid(500 + index), saleId: uuid(600 + index), lotId: lot.lotId, exhibitorId: lot.associations[0].exhibitorId,
  reference: `TESTE-${index + 1}`, displayName: lot.associations[0].displayName, lotLabel: lot.lotLabel, historicalLotLabel: lot.lotLabel,
  lotNumber: lot.lotNumber, block: 'R', pavilionId: null, pavilionName: null, segmentId: uuid(4), segmentName: 'ExpoRural · teste', category: 'external',
  mapStatus: lot.status, state: lot.status === 'SOLD' ? 'signed' : 'pending', partialOrder: false, historicalArea: 120, currentArea: 120,
  principalCents: 1200000, feesCents: 10000, totalCents: 1210000, createdAt: '2026-10-20T12:00:00Z', signedAt: lot.status === 'SOLD' ? '2026-10-21T12:00:00Z' : null,
  documentCount: 0, contractIds: [], issues: [],
}));
export const commercialPreviewSnapshot: CommercialReportSnapshot = {
  schemaVersion: 1, snapshotId, generatedAt: '2026-10-23T13:30:00Z', generation,
  spec: commercialReportSpecSchema.parse({ projectId, scopeSearch: ['ExpoRural · dados de teste'], sections: ['summary', 'sales', 'exhibitors', 'charts', 'plan_2d'] }),
  scope: { projectId, projectName: 'FENASOJA · projeto de teste', editionYear: null, timezone: 'America/Sao_Paulo' },
  totals: { orders: 6, signedLots: 3, pendingLots: 3, legacyLots: 0, cancelledItems: 0, partialOrders: 0, exhibitors: 6, documents: 0,
    soldMapLots: 3, availableLots: 3, inventoryLots: 12, principalCents: 7200000, signedPrincipalCents: 3600000, pendingPrincipalCents: 3600000,
    legacyPrincipalCents: 0, feesCents: 60000, totalCents: 7260000, historicalArea: 720, currentArea: 1440 },
  coverage: { complete: true, excludedRows: 0, issues: [] }, capabilities: { companyNames: true, monetaryValues: true, contractReferences: true },
  rows, inventory, contracts: [], groups: [{ key: 'external', label: 'ExpoRural · teste', lots: 6, orders: 6, exhibitors: 6, principalCents: 7200000, feesCents: 60000, historicalArea: 720 }],
  planOutlines: [], calibration: null, notes: ['DADOS DE TESTE. Nomes, valores e geometria são fictícios. Nenhum dado comercial real foi usado.'],
};

export function commercialResponseFixture(input: { orgId: string; message: string }, history: Array<{ role: string; content: string }>) {
  if (!/relat[oó]rio comercial de teste/i.test(input.message) && !(history.some(item => item.content.includes(snapshotId)) && /pdf|planta|atualize|recorte comercial/i.test(input.message))) return null;
  return { worker: 'mapa', citations: [], content: encodeWorkerResponse({ version: 2, worker: 'mapa', intent: 'map_commercial_report',
    summary: 'Neste recorte de teste, há 3 espaços vendidos e 3 vendas aguardando assinatura.',
    metadata: { organizationId: input.orgId, projectId, timezone: 'America/Sao_Paulo', scope: 'ExpoRural · dados de teste', updatedAt: commercialPreviewSnapshot.generatedAt, completeness: 'complete', notes: commercialPreviewSnapshot.notes },
    blocks: [
      { type: 'commercial_report', snapshotId, title: 'ExpoRural · panorama comercial', scopeLabels: ['ExpoRural', 'Área externa'], filterLabels: ['Situação atual', 'Principal sem taxas'], generatedAt: commercialPreviewSnapshot.generatedAt, generation,
        rowCount: rows.length, previewCount: rows.length, coverage: commercialPreviewSnapshot.coverage, capabilities: commercialPreviewSnapshot.capabilities, status: 'available' },
      { type: 'indicators', items: [{ label: 'Assinatura confirmada', value: 3, unit: 'count', description: 'Espaços com assinatura comprovada' }, { label: 'Aguardando assinatura', value: 3, unit: 'count', description: 'Venda em aberto · não é recebimento' }, { label: 'Principal negociado', value: 72000, unit: 'BRL', description: 'Sem taxas · todos os itens elegíveis' }, { label: 'Área negociada', value: 720, unit: 'count', description: 'm² no snapshot da venda' }] },
      { type: 'table', title: 'Vendas e espaços · dados fictícios', columns: ['Empresa / expositor', 'Espaço', 'Área negociada', 'Assinatura'], rows: rows.map(row => [row.displayName!, row.lotLabel, '120 m²', row.state === 'signed' ? 'Confirmada' : 'Aguardando assinatura']) },
      { type: 'commercial_plan', snapshotId, generation, title: 'Planta de teste da ExpoRural', scopeLabels: ['ExpoRural', 'Quadra R · geometria fictícia'], lotCount: 12, missingGeometryCount: 0 },
    ] }) };
}

let preparedAt: number | null = null;
export async function handleCommercialPreview(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname !== '/functions/v1/workers-commercial-reports') return false;
  const chunks: string[] = []; for await (const chunk of request) chunks.push(String(chunk));
  const input = JSON.parse(chunks.join('')) as { operation: string; snapshotId: string };
  if (input.snapshotId !== snapshotId) { response.writeHead(403); response.end(); return true; }
  if (input.operation === 'plan') {
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ snapshotId, generation, inventory, planOutlines: [] })); return true;
  }
  if (input.operation === 'download') {
    const pdf = createCommercialReportPdf(commercialPreviewSnapshot);
    response.writeHead(200, { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' }); response.end(Buffer.from(pdf.bytes)); return true;
  }
  if (input.operation === 'prepare') preparedAt ??= Date.now();
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ report: preparedAt ? { id: reportId, status: Date.now() - preparedAt > 1800 ? 'ready' : 'rendering', expiresAt: '2026-11-22T13:30:00Z', pageCount: 5 } : null }));
  return true;
}
