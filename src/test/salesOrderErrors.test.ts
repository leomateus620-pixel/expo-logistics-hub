import { describe, expect, it, vi } from 'vitest';
import {
  SalesOrderError,
  classifySalesError,
  sanitizeDiagnosticText,
} from '@/features/commercial-map/sales/salesErrors';

describe('classificação de erros da venda', () => {
  it('reconhece erro de esquema (coluna inexistente)', () => {
    expect(classifySalesError('column "nome" does not exist', '42703')).toBe('SCHEMA');
  });

  it('reconhece regra comercial', () => {
    expect(classifySalesError('LOT_NOT_SELLABLE:Q-J-02', 'P0001')).toBe('BUSINESS');
  });

  it('reconhece sessão/permissão', () => {
    expect(classifySalesError('MAP_PERMISSION_DENIED', 'P0001')).toBe('AUTH');
    expect(classifySalesError('AUTH_REQUIRED', 'P0001')).toBe('AUTH');
  });

  it('reconhece falha de comunicação como indeterminada', () => {
    const kind = classifySalesError('Failed to fetch', null);
    expect(kind).toBe('NETWORK');
    const error = new SalesOrderError('msg', {
      operation: 'register_commercial_sale_order',
      kind,
      correlationId: 'abc',
      code: null,
      details: null,
      hint: null,
      rawMessage: 'Failed to fetch',
      httpStatus: null,
      stage: 'RENOVACAO',
      lotCount: 2,
    });
    expect(error.indeterminate).toBe(true);
  });
});

describe('sanitização do diagnóstico', () => {
  it('remove documento, telefone, e-mail e credenciais', () => {
    const dirty = 'row (LEONARDO, 048.675.580-01, (55) 99969-9631, a@b.com, Bearer eyJabcdefghijklm)';
    const clean = sanitizeDiagnosticText(dirty) ?? '';
    expect(clean).not.toContain('048.675.580-01');
    expect(clean).not.toContain('99969-9631');
    expect(clean).not.toContain('a@b.com');
    expect(clean).not.toContain('Bearer eyJ');
    expect(clean).toContain('[oculto]');
  });

  it('aceita null sem quebrar', () => {
    expect(sanitizeDiagnosticText(null)).toBeNull();
  });
});

describe('registerSaleOrder', () => {
  it('não trata retorno inválido como sucesso e registra diagnóstico', async () => {
    vi.resetModules();
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { registerSaleOrder } = await import('@/features/commercial-map/sales/salesService');

    await expect(registerSaleOrder({
      idempotencyKey: 'key-1',
      stage: 'RENOVACAO',
      lotIds: ['a', 'b'],
      buyer: { buyerName: 'Fixture', documentNumber: '', phone: '', email: '', notes: '' },
      exhibitorId: null,
      paymentMethod: 'PIX',
      fees: { adminCents: 0, ppciCents: 0, cleaningCents: 0 },
      installments: [],
      expectedTotal: 100,
    })).rejects.toMatchObject({ name: 'SalesOrderError' });

    expect(spy).toHaveBeenCalledWith('commercial_sale_order_failed', expect.objectContaining({
      operation: 'register_commercial_sale_order',
      correlationId: 'key-1',
      lotCount: 2,
    }));
    spy.mockRestore();
    vi.doUnmock('@/integrations/supabase/client');
  });

  it('preserva código técnico e devolve mensagem segura ao usuário', async () => {
    vi.resetModules();
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'column "nome" does not exist', code: '42703', details: 'CPF 048.675.580-01', hint: null },
    });
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { registerSaleOrder } = await import('@/features/commercial-map/sales/salesService');

    const failure: SalesOrderError = await registerSaleOrder({
      idempotencyKey: 'key-2',
      stage: 'SEGUNDA_ETAPA',
      lotIds: ['a'],
      buyer: { buyerName: 'Fixture', documentNumber: '', phone: '', email: '', notes: '' },
      exhibitorId: null,
      paymentMethod: 'BOLETO_AVISTA',
      fees: { adminCents: 0, ppciCents: 0, cleaningCents: 0 },
      installments: [],
      expectedTotal: 10,
    }).then(() => null).catch((error: unknown) => error as SalesOrderError) as unknown as SalesOrderError;

    expect(failure.name).toBe('SalesOrderError');
    expect(failure.diagnostics.code).toBe('42703');
    expect(failure.diagnostics.kind).toBe('SCHEMA');
    expect(failure.diagnostics.details).not.toContain('048.675.580-01');
    expect(failure.message).not.toContain('nome');
    spy.mockRestore();
    vi.doUnmock('@/integrations/supabase/client');
  });
});
