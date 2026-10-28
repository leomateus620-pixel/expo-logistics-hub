import { describe, expect, it } from 'vitest';
import { generateContractsPdf, summarizeContracts, type ContractPdfRecord } from '../contractsPdf';

const contract = (overrides: Partial<ContractPdfRecord> = {}): ContractPdfRecord => ({
  identification: 'Pedido PV-123', legalName: 'Empresa Exemplo Ltda.', tradeName: 'Exemplo',
  document: '12345678000195', createdAt: '2026-10-20', value: 100.1,
  locations: [{ location: 'Pavilhão A', lots: ['12', '13'] }, { location: 'Pavilhão B', lots: ['04'] }],
  signatureStatus: 'Aguardando assinatura', ...overrides,
});

describe('relatório de contratos', () => {
  it('soma cada registro uma vez, preserva valores ausentes e separa cancelados', () => {
    const summary = summarizeContracts([
      contract(), contract({ value: 0.2, signatureStatus: 'Assinado' }),
      contract({ value: null, signatureStatus: 'Situação de assinatura não informada' }),
      contract({ value: 50, excludedFromCurrentTotal: true }),
    ]);
    expect(summary.count).toBe(4);
    expect(summary.currentCents).toBe(10030);
    expect(summary.excludedCents).toBe(5000);
    expect(summary.missing).toBe(1);
    expect(summary.byStatus.get('Aguardando assinatura')).toMatchObject({ count: 2, currentCents: 10010, excludedCents: 5000 });
  });

  it('cria páginas adicionais para listas longas e para um registro excepcionalmente extenso', async () => {
    const long = contract({ locations: [{ location: 'Pavilhão A', lots: Array.from({ length: 1500 }, (_, i) => `lote ${i + 1}`) }] });
    const pdf = await generateContractsPdf({ records: [long, ...Array.from({ length: 35 }, () => contract())], scopeDescription: 'Todos os contratos', generatedAt: new Date('2026-10-28T14:42:00Z') });
    expect(pdf.getNumberOfPages()).toBeGreaterThan(3);
    expect(pdf.output('arraybuffer').byteLength).toBeGreaterThan(1000);
  });
});
