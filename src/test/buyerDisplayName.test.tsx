import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { buyerDisplayName, matchesBuyerNames, normalizeTradeName } from '@/features/commercial-map/utils/buyerDisplayName';
import { matchesExhibitor } from '@/features/commercial-map/sales/exhibitorService';
import { resolveLotTooltipPresentation } from '@/features/commercial-map/utils/lotTooltipPresentation';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args), from: vi.fn() } }));

import { SaleExhibitorEditDialog } from '@/features/commercial-map/sales/components/SaleExhibitorEditDialog';

describe('nome de exibição do comprador', () => {
  it('prioriza o nome fantasia e cai para a razão social quando vazio ou só espaços', () => {
    expect(buyerDisplayName('  Loja Sol ', 'SOL COMERCIO LTDA')).toBe('Loja Sol');
    expect(buyerDisplayName('   ', 'SOL COMERCIO LTDA')).toBe('SOL COMERCIO LTDA');
    expect(buyerDisplayName(null, null)).toBeNull();
    expect(normalizeTradeName('   ')).toBeNull();
  });
  it('busca pelos dois nomes ignorando caixa, acentos e espaços', () => {
    expect(matchesBuyerNames('  sao  joao ', 'SÃO JOÃO AGRO', 'X LTDA')).toBe(true);
    expect(matchesBuyerNames('x ltda', 'SÃO JOÃO AGRO', 'X LTDA')).toBe(true);
    expect(matchesBuyerNames('outro', 'SÃO JOÃO AGRO', 'X LTDA')).toBe(false);
    const item = { id: '1', name: 'SOL COMERCIO LTDA', tradeName: 'Loja Sól', documentNumber: '1', phone: null, email: null };
    expect(matchesExhibitor(item, 'loja sol')).toBe(true);
    expect(matchesExhibitor(item, 'comercio')).toBe(true);
  });
  it('tooltip continua mostrando comprador só em lote vendido', () => {
    expect(resolveLotTooltipPresentation({ status: 'SALE_OPEN', currentBuyer: 'Loja Sol' }).buyerName).toBeNull();
  });
});

const identity = { saleId: 's1', status: 'OPEN' as const, buyerName: 'SOL COMERCIO LTDA', tradeName: 'LOJA SOL', documentNumber: '', phone: '', email: '', orderId: 'o1', exhibitorId: 'e1', affectedSpaces: ['Lote 1', 'Lote 2'] };
const renderDialog = (onClose = vi.fn()) => {
  render(<QueryClientProvider client={new QueryClient()}><SaleExhibitorEditDialog lotId="l1" identity={identity} onClose={onClose} /></QueryClientProvider>);
  return onClose;
};

describe('editor dos dados do expositor', () => {
  it('cancelar sem alterações fecha sem chamar o servidor', () => {
    rpc.mockReset();
    const onClose = renderDialog();
    expect(screen.getByText(/Lote 1, Lote 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('apagar o nome fantasia envia nulo uma única vez, e falha preserva o formulário', async () => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: null, error: { message: 'SALE_EDIT_CONFLICT', code: 'P0001' } });
    const onClose = renderDialog();
    fireEvent.change(screen.getByLabelText('Nome fantasia (opcional)'), { target: { value: '   ' } });
    const save = screen.getByRole('button', { name: 'Salvar alterações' });
    fireEvent.click(save); fireEvent.click(save);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/alterada por outra pessoa/));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_buyer_trade_name: null, p_update_exhibitor: true, p_expected_status: 'OPEN' });
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Nome / Razão social') as HTMLInputElement).value).toBe('SOL COMERCIO LTDA');
  });
});
