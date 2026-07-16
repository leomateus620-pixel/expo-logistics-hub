import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CartUsageSession } from '@/hooks/useCartUsageReport';
import { FENASOJA_2028_RGB } from './fenasoja-brand';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDuration(min: number | null): string {
  if (min == null) return 'Em aberto';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function generateCartUsagePdf(sessions: CartUsageSession[], periodLabel: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  doc.setFontSize(16);
  doc.setTextColor(...FENASOJA_2028_RGB.indigo);
  doc.text('Uso de Carrinhos Elétricos', 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Período: ${periodLabel}`, 14, 22);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, 14, 27);
  doc.text(`Total de sessões: ${sessions.length}`, 14, 32);

  autoTable(doc, {
    startY: 38,
    head: [['Carrinho', 'Responsável', 'Tipo', 'Retirada', 'Devolução', 'Duração']],
    body: sessions.map((s) => [
      `${s.cart_codigo}${s.cart_nome ? ` — ${s.cart_nome}` : ''}`,
      s.tipo === 'empresa' ? (s.empresa_nome || '—') : (s.responsavel_nome || '—'),
      s.tipo === 'empresa' ? 'Empresa Parceira' : (s.comissao || 'Membro'),
      fmt(s.retirada_em),
      fmt(s.devolucao_em),
      fmtDuration(s.duration_min),
    ]),
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: FENASOJA_2028_RGB.indigo, textColor: FENASOJA_2028_RGB.softWhite, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 246, 252] },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 55 },
      2: { cellWidth: 35 },
      3: { cellWidth: 35 },
      4: { cellWidth: 35 },
      5: { cellWidth: 30 },
    },
  });

  // Footer
  const pages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Página ${i} de ${pages}`, pageW / 2, pageH - 8, { align: 'center' });
    doc.text('Fenasoja 2028 · Logística — Relatório de Carrinhos Elétricos', 14, pageH - 8);
  }

  doc.save(`uso-carrinhos-eletricos-${new Date().toISOString().slice(0, 10)}.pdf`);
}
