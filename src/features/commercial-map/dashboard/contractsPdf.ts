/** A single contractual record. Values and status must come from the same persisted snapshot. */
export interface ContractPdfRecord {
  identification: string;
  legalName: string | null;
  tradeName: string | null;
  document: string | null;
  createdAt: string | null;
  value: number | null;
  locations: { location: string | null; lots: string[] }[];
  signatureStatus: string;
  signatureCompletedAt?: string | null;
  signaturesCompleted?: number | null;
  signaturesPending?: number | null;
  /** Cancelled/replaced contracts are reported separately from the current total. */
  excludedFromCurrentTotal?: boolean;
}

export interface ContractsPdfOptions {
  records: ContractPdfRecord[];
  scopeDescription: string;
  eventName?: string | null;
  generatedAt?: Date;
}

const NOT_INFORMED = 'Não informado';
const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const clean = (value: string | null | undefined) => value?.trim() || NOT_INFORMED;
const validValue = (value: number | null) => value !== null && Number.isFinite(value);
const cents = (value: number) => Math.round(value * 100);

export function summarizeContracts(records: ContractPdfRecord[]) {
  const byStatus = new Map<string, { count: number; currentCents: number; excludedCents: number; currentKnown: number; excludedKnown: number; missing: number }>();
  let currentCents = 0, excludedCents = 0, currentKnown = 0, excludedKnown = 0, missing = 0, excludedCount = 0;
  for (const record of records) {
    const status = clean(record.signatureStatus);
    const group = byStatus.get(status) ?? { count: 0, currentCents: 0, excludedCents: 0, currentKnown: 0, excludedKnown: 0, missing: 0 };
    group.count++;
    if (record.excludedFromCurrentTotal) excludedCount++;
    if (!validValue(record.value)) { missing++; group.missing++; }
    else if (record.excludedFromCurrentTotal) { excludedCents += cents(record.value!); excludedKnown++; group.excludedCents += cents(record.value!); group.excludedKnown++; }
    else { currentCents += cents(record.value!); currentKnown++; group.currentCents += cents(record.value!); group.currentKnown++; }
    byStatus.set(status, group);
  }
  return { count: records.length, currentCents, excludedCents, currentKnown, excludedKnown, excludedCount, missing, byStatus };
}

function displayDate(value?: string | null): string {
  if (!value) return NOT_INFORMED;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? NOT_INFORMED : date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function displayDocument(value: string | null): string {
  if (!value?.trim()) return NOT_INFORMED;
  const digits = value.replace(/\D/g, '');
  return digits.length === 14 ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : value;
}

function locationsText(locations: ContractPdfRecord['locations']) {
  if (!locations.length) return NOT_INFORMED;
  return locations.map(({ location, lots }) => `${clean(location)}: ${lots.length ? lots.map(lot => clean(lot)).join(', ') : NOT_INFORMED}`).join(' · ');
}

/** Builds a text-based, landscape A4 report. Oversized records continue with an explicit label. */
export async function generateContractsPdf({ records, scopeDescription, eventName, generatedAt = new Date() }: ContractsPdfOptions) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ format: 'a4', orientation: 'landscape', unit: 'mm', compress: true });
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  const left = 12, right = width - 12, bottom = height - 14;
  const columns = [68, 31, 24, 68, 34, 48];
  const heads = ['Contrato / Empresa', 'CNPJ', 'Cadastro', 'Pavilhão e lotes', 'Valor negociado', 'Assinatura'];
  const lineHeight = 3.8;
  const summary = summarizeContracts(records);
  const generated = generatedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  let y = 0;

  const pageHeader = () => {
    doc.setFillColor('#f1f6f1'); doc.rect(0, 0, width, 26, 'F');
    doc.setTextColor('#173c2b'); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('FENASOJA', left, 10); doc.setFontSize(12); doc.text('Lista de contratos', left, 17);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor('#40594b');
    doc.text(`Gerado em ${generated} (Brasília)`, right, 10, { align: 'right' });
    doc.text(clean(eventName), right, 17, { align: 'right', maxWidth: 120 });
    y = 31;
  };
  const newPage = () => { doc.addPage(); pageHeader(); };
  const textLines = (text: string, maxWidth: number): string[] => doc.splitTextToSize(text, maxWidth) as string[];
  const paragraph = (text: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(8.5); doc.setTextColor('#253b30');
    for (const line of textLines(text, right - left)) {
      if (y + lineHeight > bottom) newPage();
      doc.text(line, left, y); y += lineHeight;
    }
  };
  const tableHeader = () => {
    if (y + 10 > bottom) newPage();
    doc.setFillColor('#dfece1'); doc.rect(left, y, right - left, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor('#173c2b');
    let x = left;
    heads.forEach((head, index) => {
      if (index === 4) doc.text(head, x + columns[index] - 2, y + 5.2, { align: 'right' });
      else doc.text(head, x + 2, y + 5.2);
      x += columns[index];
    });
    y += 8;
  };
  pageHeader();
  paragraph(`Recorte: ${clean(scopeDescription)}`);
  y += 2;
  paragraph(`Pedidos e registros legados exportados: ${summary.count}`, true);
  paragraph(`Valor negociado vigente${summary.missing ? ' (valores informados)' : ''}: ${summary.currentKnown ? money(summary.currentCents) : NOT_INFORMED}${summary.missing ? ` · ${summary.missing} registro(s) sem valor informado` : ''}`, true);
  if (summary.excludedCount) paragraph(`Cancelados/substituídos: ${summary.excludedCount} · valor separado: ${summary.excludedKnown ? money(summary.excludedCents) : NOT_INFORMED}`);
  for (const [status, group] of summary.byStatus) {
    const total = group.currentKnown ? money(group.currentCents) : NOT_INFORMED;
    const excluded = group.excludedKnown ? ` · cancelados/substituídos: ${money(group.excludedCents)}` : '';
    const missing = group.missing ? ` · ${group.missing} sem valor` : '';
    paragraph(`${status}: ${group.count} · subtotal vigente${group.missing ? ' (valores informados)' : ''}: ${total}${excluded}${missing}`);
  }
  paragraph('Cada linha representa um pedido ou registro legado. Dados de contrato são exibidos quando sua vinculação é inequívoca.');
  paragraph('Os valores apresentados correspondem aos valores negociados dos contratos e não representam recebimentos.');
  y += 3;
  tableHeader();
  for (const record of records) {
    const signature = [clean(record.signatureStatus)];
    if (record.signatureCompletedAt) signature.push(`Conclusão: ${displayDate(record.signatureCompletedAt)}`);
    if (record.signaturesCompleted != null && record.signaturesPending != null) signature.push(`Concluídas: ${record.signaturesCompleted} · pendentes: ${record.signaturesPending}`);
    if (record.excludedFromCurrentTotal) signature.push('Cancelado/substituído');
    const cellValues = [
      `${clean(record.identification)}\nRazão social: ${clean(record.legalName)}\nNome fantasia: ${clean(record.tradeName)}`,
      displayDocument(record.document), displayDate(record.createdAt), locationsText(record.locations),
      validValue(record.value) ? money(cents(record.value!)) : NOT_INFORMED, signature.join('\n'),
    ];
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    const lines = cellValues.map((value, i) => textLines(value, columns[i] - 4));
    const totalLines = Math.max(...lines.map(cell => cell.length));
    const fullRowHeight = totalLines * lineHeight + 4;
    // Keep normal records together; only split when they cannot fit on a fresh page.
    if (y + fullRowHeight > bottom && fullRowHeight <= bottom - 39) { newPage(); tableHeader(); }
    let offset = 0;
    while (offset < totalLines) {
      const continuation = offset > 0;
      const continuationHeight = continuation ? lineHeight : 0;
      let capacity = Math.floor((bottom - y - 4 - continuationHeight) / lineHeight);
      if (capacity < 1) { newPage(); tableHeader(); continue; }
      capacity = Math.min(capacity, totalLines - offset);
      const rowHeight = capacity * lineHeight + 4 + continuationHeight;
      doc.setDrawColor('#c6d6c9'); doc.setLineWidth(.15); doc.rect(left, y, right - left, rowHeight);
      let x = left;
      doc.setFontSize(8.5); doc.setTextColor('#20372b');
      if (continuation) {
        doc.setFont('helvetica', 'bold'); doc.text('Continuação do contrato', left + 2, y + 3.5);
      }
      doc.setFont('helvetica', 'normal');
      lines.forEach((cell, index) => {
        const visible = cell.slice(offset, offset + capacity);
        visible.forEach((line, lineIndex) => {
          const textY = y + 3.5 + continuationHeight + lineIndex * lineHeight;
          if (index === 4) doc.text(line, x + columns[index] - 2, textY, { align: 'right' });
          else doc.text(line, x + 2, textY);
        });
        x += columns[index];
        if (index < columns.length - 1) doc.line(x, y, x, y + rowHeight);
      });
      y += rowHeight; offset += capacity;
      if (offset < totalLines) { newPage(); tableHeader(); }
    }
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor('#40594b');
    doc.text(`Página ${page} de ${pages}`, right, height - 7, { align: 'right' });
  }
  return doc;
}
