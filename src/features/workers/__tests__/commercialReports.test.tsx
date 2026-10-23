import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkerRichContent, { richContentToText } from '../components/WorkerRichContent';
import { CommercialReportError } from '../commercial-reports-api';
import { encodeWorkerResponse, type WorkerResponse } from '../../../../supabase/functions/_shared/workers/response-contract';

const api = vi.hoisted(() => ({ status: vi.fn(), prepare: vi.fn(), download: vi.fn(), plan: vi.fn(), save: vi.fn() }));
vi.mock('../commercial-reports-api', async original => ({ ...await original<typeof import('../commercial-reports-api')>(),
  readCommercialReport: api.status, prepareCommercialReport: api.prepare, downloadCommercialReport: api.download,
  readCommercialPlan: api.plan, saveCommercialReport: api.save,
}));
const snapshotId = '10000000-0000-4000-8000-000000000001';
const reportId = '20000000-0000-4000-8000-000000000001';
const orgId = '30000000-0000-4000-8000-000000000001';
const generation = 'a'.repeat(32);
const reportBlock = { type: 'commercial_report' as const, snapshotId, title: 'ExpoRural · pendências de assinatura',
  scopeLabels: ['ExpoRural'], filterLabels: ['Aguardando assinatura', 'Principal'], generatedAt: '2026-10-23T13:30:00Z', generation,
  rowCount: 87, previewCount: 20, coverage: { complete: true, excludedRows: 0, issues: [] },
  capabilities: { companyNames: true, monetaryValues: false, contractReferences: false }, status: 'available' as const };
const planBlock = { type: 'commercial_plan' as const, snapshotId, generation, title: 'Planta da ExpoRural', scopeLabels: ['ExpoRural'], lotCount: 1, missingGeometryCount: 0 };
function content(blocks: WorkerResponse['blocks'] = [reportBlock]) {
  return encodeWorkerResponse({ version: 2, worker: 'mapa', intent: 'map_commercial_report', summary: 'Há 87 itens aguardando assinatura no recorte consultado.',
    metadata: { organizationId: orgId, timezone: 'America/Sao_Paulo', scope: 'Projeto autorizado · ExpoRural', updatedAt: '2026-10-23T13:30:00Z', completeness: 'complete', notes: [] }, blocks });
}
const inventory = [{ lotId: '40000000-0000-4000-8000-000000000001', entityId: '50000000-0000-4000-8000-000000000001',
  lotLabel: 'Quadra R · Lote 11', lotNumber: '11', block: 'R', pavilionId: null, pavilionName: null, segmentId: null, segmentName: 'ExpoRural', category: 'external', status: 'SALE_OPEN', currentArea: 120,
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] }, labelAnchor: null,
  associations: [{ rowId: '60000000-0000-4000-8000-000000000001', exhibitorId: null, displayName: 'Empresa de teste <script>não executar</script>', state: 'pending' }], issues: [] }];

beforeEach(() => { vi.clearAllMocks(); api.status.mockResolvedValue(null); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('commercial query and report cards', () => {
  it('consults real job state without generating on a simple query and exposes scope, local time and restricted dimensions', async () => {
    render(<WorkerRichContent content={content()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gerar PDF' })).toBeEnabled());
    expect(api.status).toHaveBeenCalledWith({ orgId, snapshotId }, expect.any(AbortSignal));
    expect(api.prepare).not.toHaveBeenCalled();
    expect(screen.getByText(/23\/10\/2026,? 10:30/)).toBeInTheDocument();
    expect(screen.getByText(/Exibindo 20 de 87/)).toBeInTheDocument();
    expect(screen.getAllByText('Informação restrita')).toHaveLength(2);
    expect(document.body.textContent).not.toContain(snapshotId);
  });

  it('creates a single job on double click and keeps the same snapshot through preparation', async () => {
    let resolve!: (value: unknown) => void;
    api.prepare.mockImplementation(() => new Promise(done => { resolve = done; }));
    render(<WorkerRichContent content={content()} />);
    const generate = await screen.findByRole('button', { name: 'Gerar PDF' });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(generate); fireEvent.click(generate);
    expect(api.prepare).toHaveBeenCalledTimes(1);
    expect(api.prepare).toHaveBeenCalledWith({ orgId, snapshotId }, expect.any(AbortSignal));
    await act(async () => resolve({ id: reportId, status: 'rendering' }));
    expect(screen.getByRole('status')).toHaveTextContent('Preparando o PDF');
    expect(screen.queryByRole('button', { name: 'Baixar PDF' })).not.toBeInTheDocument();
  });

  it('polls only active jobs and stops when the actual server state becomes ready', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    api.status.mockResolvedValueOnce({ id: reportId, status: 'rendering' }).mockResolvedValue({ id: reportId, status: 'ready' });
    render(<WorkerRichContent content={content()} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('status')).toHaveTextContent('Preparando o PDF');
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(screen.getByRole('button', { name: 'Baixar PDF' })).toBeEnabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(api.status).toHaveBeenCalledTimes(2);
  });

  it('reopens an old card using current server state and mediates downloads without a stored URL', async () => {
    api.status.mockResolvedValue({ id: reportId, status: 'ready', pageCount: 8, expiresAt: '2026-11-22T13:30:00Z' });
    const file = new Blob(['%PDF-1.7 test'], { type: 'application/pdf' }); api.download.mockResolvedValue(file);
    render(<WorkerRichContent content={content()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar PDF' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(file, reportBlock.title));
    expect(api.download).toHaveBeenCalledWith({ orgId, snapshotId, reportId }, expect.any(AbortSignal));
    expect(document.querySelector('a[href]')).toBeNull();
  });

  it('stops offering a download when permission is revoked and never displays the upstream error', async () => {
    api.status.mockResolvedValue({ id: reportId, status: 'ready' });
    api.download.mockRejectedValue(new CommercialReportError('access_denied'));
    render(<WorkerRichContent content={content()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Seu acesso');
    expect(screen.queryByRole('button', { name: 'Baixar PDF' })).not.toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();
  });

  it('refreshes the clicked snapshot explicitly while copied text contains no IDs or arbitrary URLs', async () => {
    const refresh = vi.fn();
    render(<WorkerRichContent content={content()} onRefreshCommercial={refresh} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar dados' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar dados' }));
    expect(refresh).toHaveBeenCalledWith(snapshotId);
    const copied = richContentToText(content());
    expect(copied).toContain('ExpoRural'); expect(copied).toContain('20 de 87');
    expect(copied).not.toContain(snapshotId); expect(copied).not.toContain('https://');
  });

  it('refuses to combine a plan with another generation', async () => {
    api.plan.mockResolvedValue({ snapshotId, generation: 'b'.repeat(32), inventory });
    render(<WorkerRichContent content={content([planBlock])} />);
    const details = screen.getByText('Ver planta 2D').closest('details')!;
    // jsdom does not perform the native summary toggle on click.
    details.open = true; fireEvent(details, new Event('toggle'));
    expect(await screen.findByRole('alert')).toHaveTextContent('validar');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('loads geometry only on opening the plan and treats company text as data', async () => {
    api.plan.mockResolvedValue({ snapshotId, generation, inventory });
    const { container } = render(<WorkerRichContent content={content([planBlock])} />);
    expect(api.plan).not.toHaveBeenCalled();
    const details = screen.getByText('Ver planta 2D').closest('details')!;
    details.open = true; fireEvent(details, new Event('toggle'));
    expect(await screen.findByRole('img', { name: 'Planta da ExpoRural' })).toBeInTheDocument();
    expect(screen.getByText('Empresa de teste <script>não executar</script>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('path[fill="#eab308"]')).not.toBeNull();
    expect(screen.getByText('Aguardando assinatura')).toBeInTheDocument();
  });
});
