import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateSaleIdentity = vi.fn();
vi.mock('@/features/commercial-map/sales/saleIdentityService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/commercial-map/sales/saleIdentityService')>()),
  updateSaleIdentity: (...args: unknown[]) => updateSaleIdentity(...args),
}));

import {
  SaleExhibitorEditDialog, saleIdentityQueryKey,
} from '@/features/commercial-map/sales/components/SaleExhibitorEditDialog';
import type { SaleIdentity } from '@/features/commercial-map/sales/saleIdentityService';

const identity: SaleIdentity = {
  saleId: 'sale-1',
  status: 'OPEN',
  buyerName: 'EXPOSITOR LTDA',
  tradeName: null,
  documentNumber: '12345678900',
  phone: '(55) 99999-9999',
  email: 'compras@expositor.com.br',
  orderId: 'order-1',
  exhibitorId: 'exhibitor-1',
  affectedSpaces: ['B5-M001'],
};

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SaleExhibitorEditDialog lotId="lot-1" identity={identity} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('editor dos dados do expositor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateSaleIdentity.mockResolvedValue({ sale_ids: ['sale-1'], lot_ids: ['lot-1'], exhibitor_updated: true });
  });

  it('abre com o cadastro do expositor já marcado e sem alterações pendentes', () => {
    renderDialog();
    const checkbox = screen.getByRole('checkbox', { name: 'Atualizar também o cadastro do expositor' });
    expect(checkbox).toBeChecked();
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  });

  it('salva com atualização do cadastro quando o usuário não toca no checkbox', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Nome fantasia (opcional)'), { target: { value: 'FANTASIA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(updateSaleIdentity).toHaveBeenCalledTimes(1));
    expect(updateSaleIdentity.mock.calls[0][0]).toMatchObject({ updateExhibitor: true });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull());
  });

  it('desmarcar o checkbox sem alterar campos não habilita o envio', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Atualizar também o cadastro do expositor' }));
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  });
});
