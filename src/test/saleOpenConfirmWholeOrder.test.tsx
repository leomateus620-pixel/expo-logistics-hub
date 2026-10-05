import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const { items, order, confirmSaleOrderItems } = vi.hoisted(() => {
  const items = ['34', '35', '36', '37', '38', '39'].map((n) => ({
  itemId: `item-${n}`, orderId: 'order-1', lotId: `lot-${n}`, publicIdentifier: `B5-M0${n}`, itemTotal: 1, pricingStage: 'RENOVACAO',
}));
const order = { orderId: 'order-1', buyerName: 'ACME', buyerLegalName: 'ACME', stage: 'RENOVACAO', createdAt: null, negotiatedTotal: 6, items };
  return { items, order, confirmSaleOrderItems: vi.fn().mockResolvedValue({}) };
});

vi.mock('@/features/commercial-map/sales/salesService', () => ({
  fetchLotOpenSaleOrder: () => Promise.resolve(order),
  confirmSaleOrderItems: (...args: unknown[]) => confirmSaleOrderItems(...args),
  cancelSaleOrderItems: vi.fn(),
}));
vi.mock('@/features/commercial-map/sales/components/SaleExhibitorEditDialog', () => ({ SaleExhibitorIdentity: () => null }));

import { SaleOpenSection } from '@/features/commercial-map/sales/components/SaleOpenSection';

describe('confirmação de venda em aberto', () => {
  it('confirma todos os espaços pendentes do mesmo pedido ao clicar no módulo 37', async () => {
    render(<QueryClientProvider client={new QueryClient()}><SaleOpenSection lotId="lot-37" canManageSales mapData={{ lots: [], entities: [] }} /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar contrato assinado/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar 6 espaços' }));
    await waitFor(() => expect(confirmSaleOrderItems).toHaveBeenCalledWith('order-1', items.map((i) => i.itemId)));
  });
});
