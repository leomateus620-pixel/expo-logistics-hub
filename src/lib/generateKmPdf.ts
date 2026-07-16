import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ConsolidationResult, FAIR_PERIODS } from './kmConsolidation';
import type { VehicleOdometerEvent } from '@/hooks/useVehicleOdometerEvent';
import { FENASOJA_2028_RGB } from './fenasoja-brand';

const PDF_NAVY = FENASOJA_2028_RGB.navy;
const PDF_INDIGO = FENASOJA_2028_RGB.indigo;
const PDF_ORANGE = FENASOJA_2028_RGB.orange;
const PDF_GOLD = FENASOJA_2028_RGB.gold;
const PDF_SOFT_WHITE = FENASOJA_2028_RGB.softWhite;
const PDF_ALT_ROW: [number, number, number] = [245, 246, 252];

export interface OdometerEventReport {
  items: VehicleOdometerEvent[];
  totalKmEvento: number;
  totalValorCombustivel: number;
  totalLitros: number;
  totalCustoEstimadoKm: number;
}

const KM_SOURCE_LABELS: Record<string, string> = {
  saved: 'KM salvo no transporte',
  known_route: 'Rota conhecida',
  insufficient: 'Base insuficiente',
};

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function fmtKm(km: number | null): string {
  return km != null ? `${km.toLocaleString('pt-BR')} km` : '—';
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function generateKmPdf(data: ConsolidationResult, odometer?: OdometerEventReport) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  const addFooter = () => {
    const pages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Página ${i} de ${pages}`, pageW / 2, pageH - 8, { align: 'center' });
      doc.text('Fenasoja 2028 · Logística — Relatório gerado automaticamente', margin, pageH - 8);
    }
  };

  const checkNewPage = (needed: number) => {
    if (y + needed > pageH - 20) {
      doc.addPage();
      y = margin;
    }
  };

  const sectionTitle = (title: string) => {
    checkNewPage(20);
    y += 6;
    doc.setFontSize(14);
    doc.setTextColor(...PDF_INDIGO);
    doc.text(title, margin, y);
    y += 2;
    doc.setDrawColor(...PDF_ORANGE);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + contentW, y);
    y += 8;
    doc.setTextColor(40);
  };

  // ══════════════ CAPA ══════════════
  doc.setFillColor(...PDF_NAVY);
  doc.rect(0, 0, pageW, pageH, 'F');

  doc.setTextColor(...PDF_GOLD);
  doc.setFontSize(28);
  doc.text('Relatório de Quilometragem', pageW / 2, 70, { align: 'center' });
  doc.setFontSize(20);
  doc.text('e Base de Emissão de Carbono', pageW / 2, 82, { align: 'center' });

  doc.setTextColor(...PDF_SOFT_WHITE);
  doc.setFontSize(12);
  doc.text('Fenasoja 2028 — Logística', pageW / 2, 100, { align: 'center' });

  doc.setFontSize(10);
  const periodsText = FAIR_PERIODS.map(p => `${p.label}: ${fmtDate(p.start)} a ${fmtDate(p.end)}`).join('   |   ');
  doc.text(periodsText, pageW / 2, 115, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(160);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, pageW / 2, 135, { align: 'center' });

  // ══════════════ RESUMO EXECUTIVO ══════════════
  doc.addPage();
  y = margin;
  sectionTitle('1. Resumo Executivo');

  const official = data.transports.filter(t => t.status !== 'cancelado');

  const summaryRows = [
    ['KM Totais Confirmados', fmtKm(data.totalKmConfirmed)],
    ['KM Totais Previstos (pendentes)', fmtKm(data.totalKmPending)],
    ['Total de Transportes', String(data.totalTransports)],
    ['Total de Veículos', String(data.totalVehicles)],
    ['Total de Hóspedes Vinculados', String(data.totalGuests)],
    ['Com Base de KM Confirmada', String(official.filter(t => t.kmSource !== 'insufficient').length)],
    ['Pendências / Inconsistências', String(data.inconsistencies.length)],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Indicador', 'Valor']],
    body: summaryRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: PDF_INDIGO, textColor: PDF_SOFT_WHITE },
    alternateRowStyles: { fillColor: PDF_ALT_ROW },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // ══════════════ COMPARATIVO ENTRE PERÍODOS ══════════════
  sectionTitle('2. Comparativo entre Períodos');

  const periodRows = data.periods.map(ps => [
    ps.period.label,
    `${fmtDate(ps.period.start)} a ${fmtDate(ps.period.end)}`,
    fmtKm(ps.totalKmConfirmed),
    fmtKm(ps.totalKmPending),
    String(ps.transportCount),
    String(ps.vehicleCount),
    String(ps.guestCount),
    String(ps.inconsistentCount),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Período', 'Datas', 'KM Confirmado', 'KM Previsto', 'Transportes', 'Veículos', 'Hóspedes', 'Pendências']],
    body: periodRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: PDF_INDIGO, textColor: PDF_SOFT_WHITE },
    alternateRowStyles: { fillColor: PDF_ALT_ROW },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // ══════════════ CONSOLIDAÇÃO DIÁRIA ══════════════
  sectionTitle('3. Consolidação Diária');

  const dayRows: string[][] = [];
  for (const ps of data.periods) {
    for (const d of ps.days) {
      if (d.transportCount === 0) continue;
      dayRows.push([
        fmtDate(d.date),
        ps.period.label,
        String(d.transportCount),
        fmtKm(d.kmConfirmed),
        fmtKm(d.kmPending),
        String(d.vehicleIds.size),
        String(d.guestIds.size),
        String(d.inconsistentCount),
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['Data', 'Período', 'Transportes', 'KM Confirmado', 'KM Previsto', 'Veículos', 'Hóspedes', 'Pendências']],
    body: dayRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: PDF_INDIGO, textColor: PDF_SOFT_WHITE },
    alternateRowStyles: { fillColor: PDF_ALT_ROW },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // ══════════════ POR TRANSPORTE ══════════════
  checkNewPage(30);
  sectionTitle('4. Consolidação por Transporte');

  const tRows = data.transports.map(t => [
    fmtDate(t.date),
    `${t.origem} → ${t.destino}`,
    t.vehicleName || '—',
    t.motoristaNome || '—',
    t.guestNames.join(', ') || '—',
    fmtKm(t.km),
    KM_SOURCE_LABELS[t.kmSource] || t.kmSource,
    STATUS_LABELS[t.status] || t.status,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Data', 'Rota', 'Veículo', 'Motorista', 'Hóspedes', 'KM', 'Fonte KM', 'Status']],
    body: tRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: PDF_INDIGO, textColor: PDF_SOFT_WHITE },
    alternateRowStyles: { fillColor: PDF_ALT_ROW },
    columnStyles: {
      1: { cellWidth: 35 },
      4: { cellWidth: 30 },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // ══════════════ POR VEÍCULO ══════════════
  checkNewPage(30);
  sectionTitle('5. Consolidação por Veículo');

  const vRows = data.vehicleSummaries.map(v => [
    `${v.vehicleName} (${v.vehiclePlaca})`,
    String(v.transportCount),
    fmtKm(v.kmByPeriod['p1'] || 0),
    fmtKm(v.kmByPeriod['p2'] || 0),
    fmtKm(v.kmTotal),
    String(v.daysUsed.size),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Veículo', 'Transportes', 'KM Per. 1', 'KM Per. 2', 'KM Total', 'Dias']],
    body: vRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: PDF_INDIGO, textColor: PDF_SOFT_WHITE },
    alternateRowStyles: { fillColor: PDF_ALT_ROW },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // ══════════════ ODÔMETRO DO EVENTO ══════════════
  if (odometer && odometer.items.length > 0) {
    checkNewPage(40);
    sectionTitle('6. Od­ômetro do Evento por Veículo');

    const oRows = odometer.items.map((i) => [
      i.label,
      i.hasOdometer ? (i.kmInicial ?? 0).toLocaleString('pt-BR') : '—',
      i.hasOdometer ? (i.kmFinal ?? 0).toLocaleString('pt-BR') : '—',
      i.hasOdometer ? fmtKm(i.kmEvento ?? 0) : '— (sem od­ômetro)',
      i.litros ? `${i.litros.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L` : '—',
      i.valorCombustivel ? fmtBRL(i.valorCombustivel) : '—',
      i.custoEstimadoKm != null ? fmtBRL(i.custoEstimadoKm) : '—',
    ]);

    oRows.push([
      'TOTAL',
      '',
      '',
      fmtKm(odometer.totalKmEvento),
      `${odometer.totalLitros.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L`,
      fmtBRL(odometer.totalValorCombustivel),
      fmtBRL(odometer.totalCustoEstimadoKm),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Veículo', 'KM Inicial', 'KM Final', 'KM Rodado', 'Litros', 'R$ Combustível', 'Custo Est. (R$ 0,65/km)']],
      body: oRows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: PDF_INDIGO, textColor: PDF_SOFT_WHITE },
      alternateRowStyles: { fillColor: PDF_ALT_ROW },
      didParseCell: (hookData) => {
        if (hookData.row.index === oRows.length - 1) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [230, 220, 180];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ══════════════ POR HÓSPEDE (ANALÍTICO) ══════════════
  checkNewPage(30);
  sectionTitle('7. Consolidação Analítica por Hóspede');

  const gRows = data.guestSummaries.map(g => [
    g.guestName,
    g.hotelNome || '—',
    String(g.transports.length),
    g.transports.map(t => `${fmtDate(t.date)}: ${t.origem}→${t.destino}`).join('; '),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Hóspede', 'Hospedagem', 'Transportes', 'Deslocamentos']],
    body: gRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: PDF_INDIGO, textColor: PDF_SOFT_WHITE },
    alternateRowStyles: { fillColor: PDF_ALT_ROW },
    columnStyles: { 3: { cellWidth: 70 } },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // ══════════════ INCONSISTÊNCIAS ══════════════
  checkNewPage(30);
  sectionTitle('8. Inconsistências e Dados Pendentes');

  if (data.inconsistencies.length === 0) {
    doc.setFontSize(10);
    doc.text('Nenhuma inconsistência detectada.', margin, y);
    y += 10;
  } else {
    const iRows = data.inconsistencies.map(i => [
      fmtDate(i.date),
      i.transportId.slice(0, 8) + '...',
      i.description,
      i.type,
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Data', 'Transporte', 'Descrição', 'Tipo']],
      body: iRows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [120, 40, 40], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [255, 245, 245] },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ══════════════ NOTA METODOLÓGICA ══════════════
  checkNewPage(50);
  sectionTitle('9. Nota Metodológica');

  doc.setFontSize(9);
  doc.setTextColor(60);
  const notes = [
    '• O total oficial de KM considera cada deslocamento uma única vez, independente do número de passageiros.',
    '• Hóspedes vinculados não multiplicam o total de quilometragem da frota.',
    '• Registros sem base confiável de KM não entram no consolidado oficial.',
    '• Transportes cancelados são excluídos do total oficial.',
    '• A fonte de cada KM é indicada: salvo no transporte, rota conhecida, ou base insuficiente.',
    '• Este relatório utiliza exclusivamente dados persistidos no sistema.',
    '• A seção de hóspedes é analítica/logística e não duplica o total de KM operacionais.',
  ];
  for (const note of notes) {
    checkNewPage(8);
    doc.text(note, margin, y, { maxWidth: contentW });
    y += 7;
  }

  addFooter();

  doc.save(`Relatorio_KM_Emissoes_Fenasoja_${new Date().toISOString().slice(0, 10)}.pdf`);
}
