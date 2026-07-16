import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toTitleCase, formatCpf } from './textNormalize';
import { FENASOJA_2028_RGB } from './fenasoja-brand';

export type MobilityExportType = 'carro_eletrico' | 'patinete';

interface MobilityAuthorization {
  id: string;
  member_name: string;
  member_role?: string | null;
  member_identifier?: string | null;
  committee_name_snapshot: string;
  president_name_snapshot: string;
  operational_responsible_name?: string | null;
  operational_responsible_phone?: string | null;
  operational_responsible_email?: string | null;
  qr_access_free: boolean;
  access_status: string;
  authorization_type: string;
  submitted_at?: string | null;
  synced_at?: string | null;
  updated_at?: string | null;
}

const TYPE_LABEL: Record<MobilityExportType, { singular: string; plural: string; fileSlug: string }> = {
  carro_eletrico: { singular: 'Carrinho Elétrico', plural: 'Carrinhos Elétricos', fileSlug: 'carrinhos' },
  patinete: { singular: 'Patinete', plural: 'Patinetes', fileSlug: 'patinetes' },
};

const FENASOJA_NAVY = FENASOJA_2028_RGB.navy;
const FENASOJA_INDIGO = FENASOJA_2028_RGB.indigo;
const FENASOJA_ORANGE = FENASOJA_2028_RGB.orange;
const FENASOJA_GOLD = FENASOJA_2028_RGB.gold;
const FENASOJA_SOFT_WHITE = FENASOJA_2028_RGB.softWhite;
const TEXT_DARK: [number, number, number] = [30, 30, 30];
const TEXT_MUTED: [number, number, number] = [110, 110, 110];

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateBR(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

function formatDateTimeBR(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function getApproved(authorizations: MobilityAuthorization[]): MobilityAuthorization[] {
  return authorizations
    .filter((a) => a.access_status === 'liberado')
    .sort((a, b) => {
      const c = toTitleCase(a.committee_name_snapshot).localeCompare(toTitleCase(b.committee_name_snapshot), 'pt-BR');
      if (c !== 0) return c;
      return toTitleCase(a.member_name).localeCompare(toTitleCase(b.member_name), 'pt-BR');
    });
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function exportMobilityAuthorizationsCSV(
  authorizations: MobilityAuthorization[],
  type: MobilityExportType,
): number {
  const approved = getApproved(authorizations);
  if (approved.length === 0) return 0;

  const meta = TYPE_LABEL[type];
  const headers = [
    'Nº', 'Comissão', 'Presidente', 'Resp. Operacional', 'Telefone Op.',
    'Nome', 'Cargo', 'CPF/Identificador', 'Modal', 'Data Aprovação',
  ];

  const rows = approved.map((a, i) => [
    i + 1,
    toTitleCase(a.committee_name_snapshot),
    toTitleCase(a.president_name_snapshot),
    toTitleCase(a.operational_responsible_name || ''),
    a.operational_responsible_phone || '',
    toTitleCase(a.member_name),
    toTitleCase(a.member_role || ''),
    formatCpf(a.member_identifier || ''),
    meta.singular,
    formatDateBR(a.updated_at || a.synced_at || a.submitted_at),
  ]);

  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `autorizacoes_aprovadas_${meta.fileSlug}_${todayISO()}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  return approved.length;
}

export function exportMobilityAuthorizationsPDF(
  authorizations: MobilityAuthorization[],
  type: MobilityExportType,
): number {
  const approved = getApproved(authorizations);
  if (approved.length === 0) return 0;

  const meta = TYPE_LABEL[type];
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ===== COVER =====
  doc.setFillColor(...FENASOJA_NAVY);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Gold accent bar
  doc.setFillColor(...FENASOJA_ORANGE);
  doc.rect(0, 60, pageW, 3, 'F');
  doc.rect(0, 200, pageW, 3, 'F');

  doc.setTextColor(...FENASOJA_GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('FENASOJA 2028 — LOGÍSTICA', pageW / 2, 80, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(26);
  doc.text('Autorizações Aprovadas', pageW / 2, 110, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(20);
  doc.setTextColor(...FENASOJA_GOLD);
  doc.text(meta.plural, pageW / 2, 124, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text(`Documento gerado em ${formatDateTimeBR(new Date().toISOString())}`, pageW / 2, 160, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(48);
  doc.setTextColor(...FENASOJA_GOLD);
  doc.text(String(approved.length), pageW / 2, 185, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('autorizações aprovadas', pageW / 2, 193, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(...FENASOJA_GOLD);
  doc.text('Documento oficial de autorização — Comissão de Logística', pageW / 2, pageH - 15, { align: 'center' });

  // ===== SUMMARY PAGE =====
  doc.addPage();
  drawHeader(doc, meta.plural, pageW);

  const committees = new Map<string, { count: number; president: string; opName: string; opPhone: string }>();
  approved.forEach((a) => {
    const key = toTitleCase(a.committee_name_snapshot);
    const cur = committees.get(key) || {
      count: 0,
      president: toTitleCase(a.president_name_snapshot),
      opName: toTitleCase(a.operational_responsible_name || ''),
      opPhone: a.operational_responsible_phone || '',
    };
    cur.count += 1;
    committees.set(key, cur);
  });

  doc.setTextColor(...TEXT_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Resumo Geral', 14, 38);

  // Stat cards
  const cardY = 46;
  const cardW = (pageW - 28 - 6) / 2;
  const cardH = 26;
  const stats: Array<[string, string]> = [
    ['Aprovados', String(approved.length)],
    ['Comissões', String(committees.size)],
  ];
  stats.forEach((s, i) => {
    const x = 14 + i * (cardW + 6);
    doc.setFillColor(245, 246, 252);
    doc.roundedRect(x, cardY, cardW, cardH, 2, 2, 'F');
    doc.setFillColor(...FENASOJA_ORANGE);
    doc.rect(x, cardY, 2, cardH, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(s[0].toUpperCase(), x + 6, cardY + 9);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...FENASOJA_INDIGO);
    doc.text(s[1], x + 6, cardY + 21);
  });

  // Per-committee summary table
  const summaryRows = Array.from(committees.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
    .map(([name, info]) => [name, info.president, String(info.count)]);

  autoTable(doc, {
    startY: cardY + cardH + 10,
    head: [['Comissão', 'Presidente', 'Aprovados']],
    body: summaryRows,
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, textColor: TEXT_DARK },
    headStyles: { fillColor: FENASOJA_INDIGO, textColor: FENASOJA_SOFT_WHITE, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 244] },
    columnStyles: {
      2: { halign: 'center', cellWidth: 28 },
    },
    margin: { left: 14, right: 14 },
  });

  // ===== DETAIL PAGES (per committee) =====
  const sortedCommittees = Array.from(committees.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  sortedCommittees.forEach((committeeName) => {
    const members = approved.filter((a) => toTitleCase(a.committee_name_snapshot) === committeeName);
    if (members.length === 0) return;
    const first = members[0];
    const opName = toTitleCase(first.operational_responsible_name || '');

    doc.addPage();
    drawHeader(doc, meta.plural, pageW);

    // Committee section header
    let y = 38;
    doc.setFillColor(...FENASOJA_INDIGO);
    doc.roundedRect(14, y, pageW - 28, 22, 2, 2, 'F');
    doc.setTextColor(...FENASOJA_GOLD);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(committeeName, 18, y + 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`Presidente: ${toTitleCase(first.president_name_snapshot)}`, 18, y + 16);

    if (opName || first.operational_responsible_phone) {
      const op = [
        opName && `Resp. Op.: ${opName}`,
        first.operational_responsible_phone && `Tel.: ${first.operational_responsible_phone}`,
      ].filter(Boolean).join('   |   ');
      doc.text(op, pageW - 18, y + 16, { align: 'right' });
    }

    autoTable(doc, {
      startY: y + 26,
      head: [['#', 'Nome', 'Cargo', 'CPF/Identificador', 'Aprovado em']],
      body: members.map((m, i) => [
        String(i + 1),
        toTitleCase(m.member_name),
        toTitleCase(m.member_role || '') || '—',
        formatCpf(m.member_identifier || '') || '—',
        formatDateBR(m.updated_at || m.synced_at || m.submitted_at),
      ]),
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, textColor: TEXT_DARK },
      headStyles: { fillColor: FENASOJA_INDIGO, textColor: FENASOJA_SOFT_WHITE, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 244] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        4: { halign: 'center', cellWidth: 28 },
      },
      margin: { left: 14, right: 14 },
    });
  });

  // ===== FOOTER ON ALL PAGES =====
  const pageCount = doc.getNumberOfPages();
  for (let i = 2; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...FENASOJA_GOLD);
    doc.setLineWidth(0.4);
    doc.line(14, pageH - 12, pageW - 14, pageH - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Fenasoja 2028 · Logística — Documento oficial de autorização', 14, pageH - 7);
    doc.text(`Página ${i} de ${pageCount}`, pageW - 14, pageH - 7, { align: 'right' });
  }

  doc.save(`autorizacoes_aprovadas_${meta.fileSlug}_${todayISO()}.pdf`);
  return approved.length;
}

function drawHeader(doc: jsPDF, title: string, pageW: number) {
  doc.setFillColor(...FENASOJA_INDIGO);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setFillColor(...FENASOJA_ORANGE);
  doc.rect(0, 22, pageW, 1.5, 'F');

  doc.setTextColor(...FENASOJA_GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('FENASOJA 2028 · LOGÍSTICA', 14, 14);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Autorizações Aprovadas — ${title}`, pageW - 14, 14, { align: 'right' });
}
