import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContractsExportDialog } from './ContractsExportDialog';
import { EMPTY_SALE_FILTERS, type SaleOrdersFilters } from './salesOrdersService';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), generate: vi.fn(), save: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('../contractsPdf', () => ({ generateContractsPdf: mocks.generate }));

const row = (name: string) => ({ identification: name, legalName: name, tradeName: null, document: null, createdAt: null, value: 1, locations: [], signatureStatus: 'Assinado' });
const snapshot = (rows: ReturnType<typeof row>[]) => ({ data: { generatedAt: '2026-10-28T14:42:00Z', projectName: 'Evento', rows }, error: null });
function setup(filters: SaleOrdersFilters = EMPTY_SALE_FILTERS) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(true);
    return <ContractsExportDialog open={open} onOpenChange={setOpen} projectId="project" filters={filters} busy={busy} setBusy={setBusy} />;
  }
  return render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe('exportação de contratos', () => {
  it('renova o snapshot completo ao gerar e usa as mesmas linhas no PDF', async () => {
    const preview = Array.from({ length: 21 }, (_, i) => row(`Pedido ${i}`));
    const latest = [...preview, row('Pedido novo')];
    mocks.rpc.mockResolvedValueOnce(snapshot(preview)).mockResolvedValueOnce(snapshot(latest));
    mocks.generate.mockResolvedValue({ save: mocks.save });
    setup();
    await screen.findByText('registros para exportação.', { exact: false });
    expect(screen.getByText('21')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar lista em PDF' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('fenasoja_contratos_todos_2026-10-28_1142.pdf'));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls[0][0].records).toEqual(latest);
    expect(mocks.rpc.mock.calls[1][1]).not.toHaveProperty('p_limit');
  });
  it('substitui filtro de assinatura conflitante, preservando os outros ao selecionar pendentes', async () => {
    mocks.rpc.mockResolvedValue(snapshot([row('Pedido')]));
    setup({ ...EMPTY_SALE_FILTERS, status: 'SIGNED', search: 'Empresa', hasDocument: 'yes' });
    await screen.findByText('1');
    fireEvent.click(screen.getByLabelText('Com assinatura pendente'));
    await waitFor(() => expect(mocks.rpc).toHaveBeenLastCalledWith('export_commercial_sale_orders', expect.objectContaining({ p_signature_selection: 'PENDING', p_status: null, p_search: 'Empresa', p_has_document: true })));
    expect(screen.getByText(/Filtro de assinatura da tela substituído/)).toBeInTheDocument();
  });
  it('indica recorte vazio e permite consultar novamente após erro', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('Falha') }).mockResolvedValueOnce(snapshot([]));
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText(/Nenhum contrato encontrado neste recorte/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar lista em PDF' })).toBeDisabled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('mostra falha na geração e permite nova tentativa sem salvar arquivo incompleto', async () => {
    mocks.rpc.mockResolvedValue(snapshot([row('Pedido')]));
    mocks.generate.mockRejectedValueOnce(new Error('falha')).mockResolvedValueOnce({ save: mocks.save });
    setup();
    await screen.findByText('1');
    fireEvent.click(screen.getByRole('button', { name: 'Baixar lista em PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível gerar o PDF. Tente novamente.');
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar lista em PDF' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  });
  it('bloqueia uma segunda geração enquanto a consulta está em andamento', async () => {
    let finish: (value: ReturnType<typeof snapshot>) => void = () => {};
    mocks.rpc.mockResolvedValueOnce(snapshot([row('Pedido')])).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    mocks.generate.mockResolvedValue({ save: mocks.save });
    setup();
    await screen.findByText('1');
    const button = screen.getByRole('button', { name: 'Baixar lista em PDF' });
    fireEvent.click(button);
    expect(await screen.findByRole('button', { name: 'Gerando PDF…' })).toBeDisabled();
    fireEvent.click(button);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    finish(snapshot([row('Pedido')]));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  });
});
