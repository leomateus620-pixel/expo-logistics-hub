import { inflateSync } from 'node:zlib';
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

  it('exporta o ponto como unidade e apresenta uma única referência do arquivo compartilhado', async () => {
    const records = [contract({
      identification: 'Contrato COBERTURA-C2 · Pedido PV-123',
      value: 82464,
      locations: [{ location: 'Gastronomia · Restaurante · C2', lots: ['Pizzaria (1 ponto de alimentação)', 'Restaurante Central (1 ponto de alimentação)'] }],
      documents: [{ name: 'COBERTURA-C2', spaces: ['Pizzaria', 'Restaurante Central'] }],
    })];
    const pdf = await generateContractsPdf({ records, scopeDescription: 'Gastronomia' });
    const bytes = Buffer.from(pdf.output('arraybuffer')).toString('latin1');
    const content = [...bytes.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
      .map(([, stream]) => inflateSync(Buffer.from(stream, 'latin1')).toString('latin1')).join('\n');
    const text = [...content.matchAll(/^\((.*)\) Tj$/gm)].map(([, line]) => line.replace(/\\([()\\])/g, '$1')).join(' ');
    expect(text).toContain('Gastronomia · Restaurante · C2');
    expect(text).toContain('1 ponto de alimentação');
    expect(text.match(/COBERTURA-C2/g)).toHaveLength(1);
    expect(summarizeContracts(records)).toMatchObject({ count: 1, currentCents: 8246400 });
  });
});
