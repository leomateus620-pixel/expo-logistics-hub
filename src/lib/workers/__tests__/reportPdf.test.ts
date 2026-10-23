import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createCommercialReportPdf } from '../report-pdf';
import { buildReportPlan } from '../report-plan';
import { parseCommercialReportSnapshot, type CommercialReportSnapshot } from '../commercial-report';
import { commercialPreviewSnapshot } from '../../../../scripts/workers/preview-commercial';

const id = (value: number) => `80000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
function snapshot(): CommercialReportSnapshot {
  return parseCommercialReportSnapshot(JSON.parse(JSON.stringify(commercialPreviewSnapshot)));
}
/** jsPDF leaves object dictionaries readable. Inflate its content streams to verify selectable text. */
function inspectPdf(bytes: Uint8Array) {
  const binary = Buffer.from(bytes).toString('latin1');
  const content: string[] = [];
  for (const match of binary.matchAll(/\nstream\r?\n/g)) {
    const from = match.index! + match[0].length;
    const to = binary.indexOf('\nendstream', from);
    const header = binary.slice(binary.lastIndexOf(' obj', match.index), match.index);
    if (to < 0) continue;
    try {
      content.push(header.includes('/FlateDecode') ? inflateSync(bytes.slice(from, to)).toString('latin1') : binary.slice(from, to));
    } catch { /* A binary asset stream is not evidence of selectable text. */ }
  }
  const text = content.flatMap(stream => [...stream.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map(match => match[1]
    .replace(/\\([\\()])/g, '$1').replace(/\\([nrt])/g, ' '))).join(' ').replace(/\s+/g, ' ');
  const mediaBoxes = [...binary.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map(match => match[1].trim().split(/\s+/).map(Number));
  return { text, mediaBoxes, pageCount: [...binary.matchAll(/\/Type\s*\/Page\b/g)].length };
}

describe('commercial PDF export regression', () => {
  it('keeps a small executive summary on a single A4 page with selectable local metadata', () => {
    const value = snapshot(); value.spec.presentation = 'executive'; value.spec.sections = ['summary'];
    const pdf = createCommercialReportPdf(value); const parsed = inspectPdf(pdf.bytes);
    expect(pdf.pageCount).toBe(1); expect(parsed.pageCount).toBe(1);
    expect(parsed.mediaBoxes).toHaveLength(1);
    expect(parsed.mediaBoxes[0][2]).toBeCloseTo(595.28, 1); expect(parsed.mediaBoxes[0][3]).toBeCloseTo(841.89, 1);
    expect(parsed.text).toContain('Pedidos distintos');
    expect(parsed.text).toContain('23/10/2026');
    expect(parsed.text).toContain('Principal negociado');
    expect(parsed.text).toContain('Documento anexado');
  });

  it('exports the complete dataset beyond the chat preview limit and preserves long accented identities', () => {
    const value = snapshot(); value.spec.presentation = 'detailed'; value.spec.sections = ['sales'];
    const template = value.rows[0];
    const longName = 'Empresa São José - Comércio e Serviços Agrícolas de Santa Rosa e Região Ltda.';
    value.rows = Array.from({ length: 47 }, (_, index) => ({ ...template, id: id(index + 1), orderId: id(index + 101),
      lotId: id(index + 201), exhibitorId: id(index + 301), reference: `QA-ROW-${String(index + 1).padStart(3, '0')}`, displayName: `${longName} Filial ${index + 1}` }));
    value.totals = { ...value.totals, orders: 47, signedLots: 47, pendingLots: 0, exhibitors: 47,
      principalCents: 47 * 1200000, signedPrincipalCents: 47 * 1200000, pendingPrincipalCents: 0,
      feesCents: 47 * 10000, totalCents: 47 * 1210000, historicalArea: 47 * 120 };
    const pdf = createCommercialReportPdf(value); const parsed = inspectPdf(pdf.bytes);
    expect(pdf.pageCount).toBeGreaterThan(2); expect(parsed.pageCount).toBe(pdf.pageCount);
    for (let index = 1; index <= 47; index++) expect(parsed.text).toContain(`QA-ROW-${String(index).padStart(3, '0')}`);
    expect(parsed.text).toContain(longName);
    expect(parsed.text).toContain('Filial 47');
    expect(parsed.text.match(/Empresa \/ referência/g)?.length).toBeGreaterThan(1);
  });

  it('combines managerial A4 pages and vector A3 plans from the same inventory generation', () => {
    const value = snapshot(); value.spec.sections = ['summary', 'sales', 'plan_2d'];
    const { geometry } = buildReportPlan(value.inventory, value.planOutlines);
    expect(new Set(geometry.lots.map(lot => lot.lot.id))).toEqual(new Set(value.inventory.map(lot => lot.lotId)));
    const pdf = createCommercialReportPdf(value); const parsed = inspectPdf(pdf.bytes);
    expect(parsed.pageCount).toBe(pdf.pageCount);
    expect(parsed.mediaBoxes.some(box => Math.abs(box[2] - 595.28) < .1 && Math.abs(box[3] - 841.89) < .1)).toBe(true);
    expect(parsed.mediaBoxes.some(box => Math.abs(box[2] - 1190.55) < .1 && Math.abs(box[3] - 841.89) < .1)).toBe(true);
    expect(parsed.text).toContain('mesma fotografia da tabela');
    expect(parsed.text).toContain('Quadra R');
    expect(parsed.text).toContain('Escala métrica');
  });

  it('rejects cross project input before producing any PDF bytes', () => {
    const value = snapshot(); value.scope.projectId = id(999);
    expect(() => createCommercialReportPdf(value)).toThrow('Snapshot inconsistente');
  });

  it('reports missing geometry without reconstructing a lot position from its number', () => {
    const value = snapshot(); value.spec.sections = ['plan_2d']; value.inventory[0].geometry = null;
    const { geometry } = buildReportPlan(value.inventory);
    expect(geometry.lots.some(lot => lot.lot.id === value.inventory[0].lotId)).toBe(false);
    expect(geometry.lots).toHaveLength(value.inventory.length - 1);
    expect(inspectPdf(createCommercialReportPdf(value).bytes).text).toContain('1 sem geometria válida');
  });
});
