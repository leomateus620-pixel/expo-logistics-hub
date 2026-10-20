import { COMMERCIAL_PHASES, STATUS_CONFIG } from '../constants';
import { toCommercialPhase } from '../types';
import type { CommercialPavilionDashboardSnapshot } from './commercialDashboardTypes';
import { buildCommercialMiniMapViewBox, commercialMiniMapNumberLabel, type CommercialMiniMapGeometry } from './commercialDashboardGeometry';
import { projectPavilionAccessMarkers } from './pavilionAccessGeometry';
import { buildPavilionAnnotationLayout, type AnnotationPoint } from './pavilionAnnotationLayout';
import { OCCUPANCY_STATE_LABEL, occupancyLotList, buildPavilionOccupancyGroups, occupancyMatchesInventory, type PavilionOccupancy } from './pavilionOccupancy';
import type { DashboardAccessMarker } from './CommercialMiniMap';

/** A3 vector document from the exact cadastral and annotation models. No DOM,
 * canvas, screenshot, private document, token or storage URL enters the PDF. */
export async function createPavilionPdf(snapshot: CommercialPavilionDashboardSnapshot, payload: PavilionOccupancy,
  geometry: CommercialMiniMapGeometry, accesses: readonly DashboardAccessMarker[] = []) {
  if (!occupancyMatchesInventory(payload, snapshot.records.map(r => r.lot))) throw new Error('Atualize a planta antes de exportar: inventários divergentes.');
  if (geometry.lots.length !== snapshot.totalLots) throw new Error('Exportação indisponível: há lotes sem geometria válida.');
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const groups = buildPavilionOccupancyGroups(payload);
  const markers = projectPavilionAccessMarkers(geometry, accesses);
  const layout = buildPavilionAnnotationLayout(geometry, groups, null, 8, markers.map(marker => marker.bounds));
  const [ax, ay, aw, ah] = layout.viewBox.split(' ').map(Number);
  const [vx, vy, vw, vh] = buildCommercialMiniMapViewBox(geometry,
    [{ minX: ax, minY: ay, maxX: ax + aw, maxY: ay + ah }, ...markers.map(marker => marker.bounds)]).split(' ').map(Number);
  const sourceBounds = geometry.bounds!;
  const landscape = sourceBounds.maxX - sourceBounds.minX >= sourceBounds.maxY - sourceBounds.minY;
  const doc = new jsPDF({ format: 'a3', orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', compress: true });
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  const observed = new Date(payload.observedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const ink = '#203e30', muted = '#52695c';
  const header = (subtitle: string) => {
    doc.setFillColor('#f4f7f3'); doc.rect(0, 0, width, 30, 'F');
    doc.setTextColor(ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('FENASOJA 2028', 12, 12);
    doc.setFontSize(12); doc.text(snapshot.definition.officialName, 12, 20);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(muted); doc.setFontSize(8);
    doc.text(subtitle, 12, 26);
    doc.text(`Dados consultados: ${observed} (Brasília)`, width - 12, 12, { align: 'right' });
  };
  header(`${snapshot.totalLots} lotes | ${snapshot.soldLots} vendidos | ${snapshot.saleOpenLots} em andamento | ${snapshot.availableLots} disponíveis | ${groups.length} agrupamentos`);
  const plotHeight = height - 67, plotWidth = width - 24;
  const scale = Math.min(plotWidth / vw, plotHeight / vh);
  const left = 12 + (plotWidth - vw * scale) / 2, top = 34 + (plotHeight - vh * scale) / 2;
  const pt = ([x, y]: readonly number[]) => [left + (x - vx) * scale, top + (y - vy) * scale] as AnnotationPoint;
  const polygon = (rings: readonly (readonly (readonly number[])[])[], fill: string | null, stroke: string, lineWidth = .18) => {
    const ops: Array<{ op: string; c: number[] }> = rings.flatMap(ring => [...ring.map((point, i) => ({ op: i ? 'l' : 'm', c: pt(point) as number[] })), { op: 'h', c: [] }]);
    doc.setDrawColor(stroke); doc.setLineWidth(lineWidth);
    doc.path(ops);
    if (fill) { doc.setFillColor(fill); doc.fillStrokeEvenOdd(); } else doc.stroke();
  };
  const line = (points: readonly AnnotationPoint[], color: string, lineWidth = .18) => {
    doc.setDrawColor(color); doc.setLineWidth(lineWidth); doc.path(points.map((p, i) => ({ op: i ? 'l' : 'm', c: pt(p) }))); doc.stroke();
  };
  const text = (value: string, x: number, y: number, units: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(units * scale * 72 / 25.4); doc.setTextColor(ink);
    doc.text(value.replace(/…/gu, '...'), ...pt([x, y]));
  };
  for (const outline of geometry.outlines) polygon(outline.coordinates.map(ring => ring.map(geometry.project)), outline.kind === 'support' ? '#e3e9e1' : '#f5f7f3', outline.color, .3);
  for (const lot of geometry.lots) {
    const config = STATUS_CONFIG[lot.lot.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : toCommercialPhase(lot.lot.status)];
    polygon(lot.entity.geometry.coordinates.map(ring => ring.map(geometry.project)), config.color, config.border);
  }
  for (const { group, clusters, label } of layout.annotations) {
    const contourColor = group.state === 'REVIEW' ? '#a6632b' : '#17685c';
    doc.setLineDashPattern(group.state === 'REVIEW' || !group.verified ? [.7, .7] : [], 0);
    for (const cluster of clusters) {
      polygon(cluster.rings, null, contourColor, .2);
      if (cluster.route) line(cluster.route, contourColor, .18);
      if (cluster.marker) {
        const [mx, my] = pt(cluster.marker);
        doc.setFillColor('#ffffff'); doc.setDrawColor(contourColor); doc.setLineWidth(.15);
        doc.circle(mx, my, 3.2 * scale, 'FD');
        text(String(group.marker), cluster.marker[0] - 1.2, cluster.marker[1] + 1.4, 4.4, true);
      }
    }
    doc.setLineDashPattern([], 0);
    if (label) {
      const [x, y] = pt([label.minX, label.minY]);
      doc.setDrawColor('#cbd9d0'); doc.setFillColor('#ffffff'); doc.setLineWidth(.15);
      doc.roundedRect(x, y, (label.maxX - label.minX) * scale, (label.maxY - label.minY) * scale, 1.5, 1.5, 'FD');
      text(String(group.marker), label.minX + 7, label.minY + 15, 7, true);
      label.lines.forEach((name, i) => text(name, label.minX + 24, label.minY + 15 + i * 10, 9.2, true));
      text(label.lotLine, label.minX + 9, label.minY + 28 + (label.lines.length - 1) * 10, 7.8);
      text(label.stateLine, label.minX + 9, label.minY + 37 + (label.lines.length - 1) * 10, 7);
    }
  }
  // Numbers are painted last and sized against each real cell, including rotation.
  for (const { lot, labelPoint, labelWidth, labelHeight } of geometry.lots) {
    if (!lot.lotNumber) continue;
    const fit = commercialMiniMapNumberLabel(lot.lotNumber, labelWidth, labelHeight, scale * 72 / 25.4, 8.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fit.fontPixels); doc.setTextColor('#173c2b');
    const [x, y] = pt(labelPoint);
    if (fit.vertical) doc.text(lot.lotNumber, x + fit.fontPixels * 25.4 / 72 * .32, y + doc.getTextWidth(lot.lotNumber) / 2, { angle: 90 });
    else doc.text(lot.lotNumber, x, y, { align: 'center', baseline: 'middle' });
  }
  // Preserve official access anchors without using platform-dependent arrow glyphs.
  for (const marker of markers) {
    line([[marker.x, marker.y], [marker.iconX, marker.iconY]], '#315543');
    const [x, y] = pt([marker.iconX - 14, marker.iconY - 14]);
    doc.setFillColor('#214d37'); doc.roundedRect(x, y, 28 * scale, 28 * scale, 5 * scale, 5 * scale, 'F');
    const center: AnnotationPoint = [marker.iconX, marker.iconY];
    // Small vector arrows mirror the existing access meaning without relying on font glyphs.
    const dx = 1;
    const dy = marker.kind === 'entrance' ? 1 : marker.kind === 'exit' ? -1 : 0;
    const from: AnnotationPoint = [center[0] - dx * 8, center[1] - dy * 8];
    const to: AnnotationPoint = [center[0] + dx * 8, center[1] + dy * 8];
    line([from, to], '#ffffff');
    const ux = dx / Math.hypot(dx, dy), uy = dy / Math.hypot(dx, dy);
    const arrow = (tip: AnnotationPoint, direction: number) => line([
      [tip[0] - direction * ux * 5 - uy * 4, tip[1] - direction * uy * 5 + ux * 4], tip,
      [tip[0] - direction * ux * 5 + uy * 4, tip[1] - direction * uy * 5 - ux * 4],
    ], '#ffffff');
    arrow(to, 1); if (marker.kind === 'connection' || marker.kind === 'bidirectional') arrow(from, -1);
  }
  let legendX = 12;
  for (const status of [...COMMERCIAL_PHASES, 'UNAVAILABLE' as const]) {
    const config = STATUS_CONFIG[status];
    doc.setFillColor(config.color); doc.roundedRect(legendX, height - 23, 2.5, 2.5, .5, .5, 'F');
    doc.setTextColor(ink); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(config.label, legendX + 4, height - 20.8);
    legendX += doc.getTextWidth(config.label) + 10;
  }
  doc.setFontSize(8); doc.setTextColor(muted);
  doc.text('Cores representam a situação comercial. Documento anexado não comprova assinatura. Legados preservados como vendidos.', 12, height - 14);
  doc.text(`${groups.filter(g => g.verified).length} expositores identificados | ${groups.filter(g => !g.verified).length} vínculos sem identidade verificada. Relação completa nas próximas páginas.`, 12, height - 9);
  if (groups.length) {
    doc.addPage(); header('Detalhamento dos vínculos comerciais - mesmos dados da planta');
    const rows = groups.flatMap(group => group.orders.length ? group.orders.flatMap(order => {
      const references = order.contracts.map(c => `${c.number || 'Sem número'} [${c.id}] (${c.scope}; ${OCCUPANCY_STATE_LABEL[c.state]}; ${occupancyLotList(c.items)})`).join('\n');
      return [[`${group.marker}. ${group.name}${group.verified ? '' : '\nIdentidade não verificada'}${group.issues.length ? '\n' + group.issues.join('\n') : ''}`,
        order.orderId ? `Pedido ${order.orderId}` : `Venda ${order.saleId}`,
        occupancyLotList(order.items), order.items.map(item => `${item.number ?? 'Sem número'}: ${OCCUPANCY_STATE_LABEL[item.state]} / ${STATUS_CONFIG[item.status].label}`).join('\n'),
        payload.contractsAccessible ? references || 'Sem contrato vinculado' : 'Referências restritas']];
    }) : [[`${group.marker}. ${group.name}`, 'Vínculo em conferência', occupancyLotList(group.items), OCCUPANCY_STATE_LABEL[group.state], 'Não resolvido']]);
    autoTable(doc, { startY: 35, margin: { top: 35, bottom: 15, left: 12, right: 12 },
      head: [['Expositor', 'Pedido / venda', 'Lotes oficiais', 'Situação de cada item', 'Contratos e abrangência']], body: rows,
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, overflow: 'linebreak', textColor: ink, lineColor: '#d9e3da', lineWidth: .1 },
      headStyles: { fillColor: '#264d3b', textColor: '#ffffff' }, alternateRowStyles: { fillColor: '#f4f7f3' },
      columnStyles: { 0: { cellWidth: (width - 24) * .22 }, 1: { cellWidth: (width - 24) * .18 }, 2: { cellWidth: (width - 24) * .14 }, 3: { cellWidth: (width - 24) * .23 }, 4: { cellWidth: (width - 24) * .23 } },
      didDrawPage: () => header('Detalhamento dos vínculos comerciais - mesmos dados da planta'),
    });
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) { doc.setPage(page); doc.setFontSize(8); doc.setTextColor(muted); doc.text(`${page} / ${pages}`, width - 12, height - 5, { align: 'right' }); }
  doc.setProperties({ title: `FenaSoja 2028 - ${snapshot.definition.officialName}`, subject: 'Snapshot comercial autorizado', author: 'FenaSoja' });
  return doc;
}
