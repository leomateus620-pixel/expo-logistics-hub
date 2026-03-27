import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SystemReportPayload } from './systemReportCollector';

function fmtDate(d: string): string {
  if (!d) return '—';
  try {
    const [y, m, day] = d.split('T')[0].split('-');
    return `${day}/${m}/${y}`;
  } catch {
    return d;
  }
}

function fmtDateTime(d: string | null): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return d;
  }
}

function cellValue(v: any): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  // Format ISO dates
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return fmtDateTime(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtDate(s);
  return s;
}

export function generateSystemReportPdf(payload: SystemReportPayload) {
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
      doc.text('Fenasoja Logística — Relatório do Sistema', margin, pageH - 8);
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
    doc.setTextColor(30, 80, 30);
    doc.text(title, margin, y);
    y += 2;
    doc.setDrawColor(200, 180, 80);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + contentW, y);
    y += 8;
    doc.setTextColor(40);
  };

  // ══════════════ CAPA ══════════════
  doc.setFillColor(25, 60, 25);
  doc.rect(0, 0, pageW, pageH, 'F');

  doc.setTextColor(220, 190, 80);
  doc.setFontSize(28);
  doc.text('Relatório de Continuidade', pageW / 2, 65, { align: 'center' });
  doc.setFontSize(22);
  doc.text('Operacional', pageW / 2, 78, { align: 'center' });

  doc.setTextColor(200);
  doc.setFontSize(12);
  doc.text('Fenasoja 2026 — Logística', pageW / 2, 98, { align: 'center' });

  doc.setFontSize(10);
  doc.text(`Período: ${fmtDate(payload.period.start)} a ${fmtDate(payload.period.end)}`, pageW / 2, 112, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(160);
  doc.text(`Gerado em: ${fmtDateTime(payload.generatedAt)}`, pageW / 2, 128, { align: 'center' });
  doc.text(`ID: ${payload.reportId}`, pageW / 2, 136, { align: 'center' });
  doc.text(`Timezone: America/Sao_Paulo`, pageW / 2, 144, { align: 'center' });

  // ══════════════ RESUMO EXECUTIVO ══════════════
  doc.addPage();
  y = margin;
  sectionTitle('1. Resumo Executivo');

  const summaryRows: string[][] = [
    ['Período Analisado', `${fmtDate(payload.period.start)} a ${fmtDate(payload.period.end)}`],
    ['Total de Registros', String(payload.totalRecords)],
    ['Módulos Contemplados', String(payload.modules.length)],
    ['Total de Inconsistências', String(payload.totalInconsistencies)],
  ];

  for (const mod of payload.modules) {
    summaryRows.push([`  ${mod.config.label}`, `${mod.total} registros (${mod.created} criados, ${mod.updated} alterados)`]);
  }

  autoTable(doc, {
    startY: y,
    head: [['Indicador', 'Valor']],
    body: summaryRows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [25, 60, 25], textColor: [220, 190, 80] },
    alternateRowStyles: { fillColor: [245, 245, 240] },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // ══════════════ METADADOS ══════════════
  sectionTitle('2. Metadados do Relatório');

  doc.setFontSize(9);
  doc.setTextColor(60);
  const meta = [
    `ID do Relatório: ${payload.reportId}`,
    `Data/Hora de Geração: ${fmtDateTime(payload.generatedAt)}`,
    `Timezone: America/Sao_Paulo`,
    `Filtro de Período: ${fmtDate(payload.period.start)} a ${fmtDate(payload.period.end)}`,
    `Modo: Completo (registros criados, alterados ou ativos no período)`,
    `Módulos: ${payload.modules.map(m => m.config.label).join(', ')}`,
    `Origem: Dados persistidos no banco de dados do sistema`,
  ];
  for (const line of meta) {
    checkNewPage(7);
    doc.text(line, margin, y, { maxWidth: contentW });
    y += 6;
  }
  y += 4;

  // ══════════════ SEÇÕES POR MÓDULO ══════════════
  let sectionIdx = 3;
  for (const mod of payload.modules) {
    checkNewPage(30);
    sectionTitle(`${sectionIdx}. ${mod.config.label}`);

    // Module summary
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(`Total: ${mod.total} | Criados: ${mod.created} | Alterados: ${mod.updated} | Inconsistências: ${mod.inconsistencies.length}`, margin, y);
    y += 8;

    if (mod.records.length === 0) {
      doc.setFontSize(9);
      doc.text('Nenhum registro encontrado no período.', margin, y);
      y += 8;
    } else {
      // Table with all columns
      const cols = mod.config.columns;
      const head = cols.map(c => c.label);
      const body = mod.records.map(r => cols.map(c => cellValue(r[c.key])));

      autoTable(doc, {
        startY: y,
        head: [head],
        body,
        margin: { left: margin, right: margin },
        styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [25, 60, 25], textColor: [220, 190, 80], fontSize: 7 },
        alternateRowStyles: { fillColor: [245, 245, 240] },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    sectionIdx++;
  }

  // ══════════════ INCONSISTÊNCIAS ══════════════
  checkNewPage(30);
  sectionTitle(`${sectionIdx}. Inconsistências e Alertas`);

  const allInconsistencies = payload.modules.flatMap(m =>
    m.inconsistencies.map(i => [m.config.label, i])
  );

  if (allInconsistencies.length === 0) {
    doc.setFontSize(10);
    doc.text('Nenhuma inconsistência detectada.', margin, y);
    y += 10;
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Módulo', 'Descrição']],
      body: allInconsistencies,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [120, 40, 40], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [255, 245, 245] },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }
  sectionIdx++;

  // ══════════════ NOTA METODOLÓGICA ══════════════
  checkNewPage(50);
  sectionTitle(`${sectionIdx}. Nota Metodológica`);

  doc.setFontSize(9);
  doc.setTextColor(60);
  const notes = [
    '• Este relatório consolida todos os dados persistidos no sistema dentro do período selecionado.',
    '• Um registro é incluído se qualquer campo de data relevante (criação, atualização, data operacional) cai no intervalo.',
    '• O objetivo é fornecer base para continuidade operacional e contingência em caso de falha.',
    '• Dados inconsistentes ou incompletos são sinalizados, nunca ocultados.',
    '• Nenhum dado do sistema é alterado durante a geração deste relatório.',
    '• O relatório reflete o estado dos dados no momento da geração.',
  ];
  for (const note of notes) {
    checkNewPage(8);
    doc.text(note, margin, y, { maxWidth: contentW });
    y += 7;
  }

  addFooter();

  const filename = `Relatorio_Sistema_${payload.period.start}_a_${payload.period.end}.pdf`;
  doc.save(filename);
}
