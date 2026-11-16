import { jsPDF } from "npm:jspdf@4.2.1";
import autoTable from "npm:jspdf-autotable@5.0.7";
import { reportLogoDataUrl } from "../workers/generated/report-logo.ts";

export const EXPORT_RENDERER_VERSION = "meeting-export-v1";

export interface ExportMeta {
  eventTitle: string;
  meetingDateLabel: string;
  location: string | null;
  commissions: string[];
  generatedAtLabel: string;
}

export interface TranscriptExportLine {
  kind: "speech" | "silence" | "gap";
  startMs: number;
  endMs: number;
  text: string;
}

export interface TranscriptExportInput {
  meta: ExportMeta;
  version: number;
  versionKind: "canonical" | "manual_revision";
  coverage: "complete" | "with_gaps";
  model: string;
  lines: TranscriptExportLine[];
}

export interface ReportInsightLike {
  title: string;
  detail: string;
  evidenceSegmentIds: string[];
}

export interface ReportExportInput {
  meta: ExportMeta;
  minutesVersion: number;
  state: "ai_draft" | "reviewed" | "superseded";
  partial: boolean;
  model: string;
  transcriptVersion: number | null;
  evidenceStartMs: Record<string, number>;
  /** Structured report (v3) or null for legacy Markdown minutes. */
  report: null | {
    executiveSummary: string;
    themes: Array<{ title: string; discussion: string; arguments: string[]; divergences: string[]; evidenceSegmentIds: string[] }>;
    decisions: ReportInsightLike[];
    proposals: Array<ReportInsightLike & { status: string }>;
    actionItems: Array<{ title: string; description: string; responsibleText: string | null; dueDateText: string | null; dueDate: string | null; evidenceSegmentIds: string[] }>;
    pendingItems: ReportInsightLike[];
    risks: ReportInsightLike[];
    openQuestions: ReportInsightLike[];
    nextSteps: ReportInsightLike[];
    nextMeetings: ReportInsightLike[];
    coverageNotes: string[];
    coverage?: { status?: string; missingSegmentCount?: number; segmentCount?: number };
  };
  legacySummary: string;
  legacyMarkdown: string;
}

const REPLACEMENTS: Record<string, string> = {
  "\u2192": "->", "\u2190": "<-", "\u2264": "<=", "\u2265": ">=", "\u00a0": " ",
  "\u2022": "-", "\u25cf": "-", "\u2713": "v", "\u2714": "v",
};

/** Standard PDF fonts cover Latin-1 + WinAnsi punctuation; anything else is mapped or dropped. */
export function pdfSafe(value: string) {
  return value.replace(/[\u2190-\u27ff\u00a0\u2022\u25cf]/g, (char) => REPLACEMENTS[char] ?? "")
    .replace(/[^\u0009\u000a\u000d\u0020-\u00ff\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2020\u2021\u2026\u2030\u20ac\u2122\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc]/g, "");
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1_000));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const GREEN: [number, number, number] = [0, 100, 0];
const GOLD: [number, number, number] = [196, 152, 32];
const INK: [number, number, number] = [28, 33, 30];
const MUTED: [number, number, number] = [96, 104, 99];
const MARGIN = 16;
const TOP = 34;
const BOTTOM = 18;

class PdfWriter {
  readonly doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  y = TOP;
  readonly width = this.doc.internal.pageSize.getWidth();
  readonly height = this.doc.internal.pageSize.getHeight();

  constructor(private readonly heading: string, private readonly meta: ExportMeta, private readonly badge: string | null) {}

  ensure(space: number) {
    if (this.y + space > this.height - BOTTOM) {
      this.doc.addPage();
      this.y = TOP;
    }
  }

  title(text: string, size = 13) {
    this.ensure(12);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(size);
    this.doc.setTextColor(...GREEN);
    const lines = this.doc.splitTextToSize(pdfSafe(text), this.width - MARGIN * 2) as string[];
    this.doc.text(lines, MARGIN, this.y);
    this.y += lines.length * size * 0.42 + 2.5;
    this.doc.setDrawColor(...GOLD);
    this.doc.setLineWidth(0.4);
    this.doc.line(MARGIN, this.y - 1.5, MARGIN + 28, this.y - 1.5);
    this.y += 2;
  }

  subtitle(text: string) {
    this.ensure(9);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10.5);
    this.doc.setTextColor(...INK);
    const lines = this.doc.splitTextToSize(pdfSafe(text), this.width - MARGIN * 2) as string[];
    this.doc.text(lines, MARGIN, this.y);
    this.y += lines.length * 4.6 + 1;
  }

  paragraph(text: string, options: { size?: number; color?: [number, number, number]; indent?: number; bold?: boolean } = {}) {
    const size = options.size ?? 10;
    const indent = options.indent ?? 0;
    this.doc.setFont("helvetica", options.bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(...(options.color ?? INK));
    const lines = this.doc.splitTextToSize(pdfSafe(text), this.width - MARGIN * 2 - indent) as string[];
    const lineHeight = size * 0.45;
    for (const line of lines) {
      this.ensure(lineHeight + 1);
      this.doc.text(line, MARGIN + indent, this.y);
      this.y += lineHeight;
    }
    this.y += 1.6;
  }

  highlight(label: string, text: string) {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(10.5);
    const lines = this.doc.splitTextToSize(pdfSafe(text), this.width - MARGIN * 2 - 10) as string[];
    const blockHeight = lines.length * 4.9 + 12;
    if (blockHeight < this.height - TOP - BOTTOM) this.ensure(blockHeight);
    const startY = this.y;
    this.doc.setFillColor(240, 247, 238);
    this.doc.setDrawColor(...GREEN);
    this.doc.roundedRect(MARGIN, startY - 4, this.width - MARGIN * 2, Math.min(blockHeight, this.height - BOTTOM - startY + 4), 2, 2, "FD");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9);
    this.doc.setTextColor(...GREEN);
    this.doc.text(pdfSafe(label.toUpperCase()), MARGIN + 5, startY + 1.5);
    this.y = startY + 7;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(10.5);
    this.doc.setTextColor(...INK);
    for (const line of lines) {
      this.ensure(5);
      this.doc.text(line, MARGIN + 5, this.y);
      this.y += 4.9;
    }
    this.y += 5;
  }

  bullets(items: string[], empty = "Não definido") {
    if (!items.length) {
      this.paragraph(empty, { color: MUTED });
      return;
    }
    for (const item of items) this.paragraph(`- ${item}`, { indent: 2 });
  }

  table(head: string[], body: string[][], widths: number[]) {
    autoTable(this.doc, {
      startY: this.y,
      head: [head.map(pdfSafe)],
      body: body.map((row) => row.map(pdfSafe)),
      margin: { left: MARGIN, right: MARGIN, top: TOP, bottom: BOTTOM },
      styles: { font: "helvetica", fontSize: 8.6, cellPadding: 1.8, textColor: INK, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [247, 249, 246] },
      columnStyles: Object.fromEntries(widths.map((width, index) => [index, { cellWidth: width }])),
      rowPageBreak: "avoid",
      showHead: "everyPage",
    });
    // deno-lint-ignore no-explicit-any
    this.y = ((this.doc as any).lastAutoTable?.finalY ?? this.y) + 6;
  }

  finish(footer: string) {
    const pages = this.doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      this.doc.setPage(page);
      try {
        this.doc.addImage(reportLogoDataUrl, "PNG", MARGIN, 7, 14, 14);
      } catch {
        // Logo is decorative.
      }
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(8);
      this.doc.setTextColor(...GOLD);
      this.doc.text(pdfSafe(this.heading.toUpperCase()), MARGIN + 18, 11);
      this.doc.setFontSize(11);
      this.doc.setTextColor(...GREEN);
      const titleLines = this.doc.splitTextToSize(pdfSafe(this.meta.eventTitle), this.width - MARGIN * 2 - 60) as string[];
      this.doc.text(titleLines[0] ?? "", MARGIN + 18, 16.5);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8);
      this.doc.setTextColor(...MUTED);
      this.doc.text(pdfSafe([this.meta.meetingDateLabel, this.meta.location].filter(Boolean).join(" · ")), MARGIN + 18, 21);
      if (this.badge) {
        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(8);
        const badgeWidth = this.doc.getTextWidth(this.badge) + 6;
        this.doc.setFillColor(...(this.badge.includes("PARCIAL") ? [180, 83, 9] as [number, number, number] : this.badge.includes("REVISADO") ? GREEN : GOLD));
        this.doc.roundedRect(this.width - MARGIN - badgeWidth, 8, badgeWidth, 6, 1.5, 1.5, "F");
        this.doc.setTextColor(255, 255, 255);
        this.doc.text(pdfSafe(this.badge), this.width - MARGIN - badgeWidth + 3, 12.2);
      }
      this.doc.setDrawColor(...GREEN);
      this.doc.setLineWidth(0.5);
      this.doc.line(MARGIN, 25, this.width - MARGIN, 25);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(7.5);
      this.doc.setTextColor(...MUTED);
      this.doc.text(pdfSafe(footer), MARGIN, this.height - 9);
      this.doc.text(`Página ${page} de ${pages}`, this.width - MARGIN, this.height - 9, { align: "right" });
    }
    return new Uint8Array(this.doc.output("arraybuffer"));
  }
}

function evidenceLabel(ids: string[], starts: Record<string, number>) {
  const labels = ids.map((id) => starts[id]).filter((value) => typeof value === "number").sort((a, b) => a - b)
    .slice(0, 3).map((value) => formatClock(value));
  return labels.length ? labels.join(", ") : "-";
}

function insightLines(items: ReportInsightLike[], starts: Record<string, number>) {
  return items.map((item) => `${item.title}: ${item.detail} [trecho ${evidenceLabel(item.evidenceSegmentIds, starts)}]`);
}

const PROPOSAL_LABEL: Record<string, string> = { em_discussao: "em discussão", nao_aprovada: "não aprovada", adiada: "adiada" };

export function renderReportPdf(input: ReportExportInput) {
  const badge = input.partial ? "PARCIAL" : input.state === "reviewed" ? "REVISADO" : "RASCUNHO - REVISÃO HUMANA PENDENTE";
  const writer = new PdfWriter("Fenasoja · Relatório de reunião", input.meta, badge);
  const meta = input.meta;
  writer.title("Identificação da reunião");
  writer.paragraph(`Evento: ${meta.eventTitle}`);
  writer.paragraph(`Data: ${meta.meetingDateLabel}`);
  if (meta.location) writer.paragraph(`Local: ${meta.location}`);
  if (meta.commissions.length) writer.paragraph(`Comissões: ${meta.commissions.join(", ")}`);
  writer.paragraph(`Relatório versão ${input.minutesVersion} · transcrição versão ${input.transcriptVersion ?? "-"} · modelo ${input.model}`, { color: MUTED, size: 9 });
  if (input.partial) {
    writer.paragraph("Atenção: relatório PARCIAL. A transcrição tem lacunas e não cobre toda a reunião; nada foi deduzido sobre os trechos ausentes.", { bold: true, color: [180, 83, 9] });
  }
  const report = input.report;
  if (!report) {
    writer.highlight("Resumo executivo", input.legacySummary);
    writer.title("Ata registrada (formato anterior)");
    for (const line of input.legacyMarkdown.split(/\n+/)) {
      const text = line.replace(/^#+\s*/, "").replace(/^>\s*/, "").replace(/\*\*/g, "").trim();
      if (!text) continue;
      if (/^#/.test(line)) writer.subtitle(text);
      else writer.paragraph(text);
    }
    return writer.finish(`Fenasoja Meeting · registro anterior ao upgrade · gerado em ${meta.generatedAtLabel}`);
  }
  writer.highlight("Resumo executivo", report.executiveSummary);
  writer.title("Principais temas e discussões");
  if (!report.themes.length) writer.paragraph("Não definido", { color: MUTED });
  for (const theme of report.themes) {
    writer.subtitle(`${theme.title} [trecho ${evidenceLabel(theme.evidenceSegmentIds, input.evidenceStartMs)}]`);
    writer.paragraph(theme.discussion);
    for (const argument of theme.arguments) writer.paragraph(`- Argumento: ${argument}`, { indent: 2 });
    for (const divergence of theme.divergences) writer.paragraph(`- Divergência: ${divergence}`, { indent: 2 });
  }
  writer.title("Decisões confirmadas");
  writer.bullets(insightLines(report.decisions, input.evidenceStartMs), "Nenhuma decisão confirmada na transcrição.");
  writer.title("Propostas e possibilidades (não decididas)");
  writer.bullets(report.proposals.map((item) => `${item.title} (${PROPOSAL_LABEL[item.status] ?? item.status}): ${item.detail} [trecho ${evidenceLabel(item.evidenceSegmentIds, input.evidenceStartMs)}]`), "Nenhuma proposta pendente registrada.");
  writer.title("Encaminhamentos");
  if (report.actionItems.length) {
    writer.table(
      ["#", "Ação", "Responsável", "Prazo", "Trecho"],
      report.actionItems.map((item, index) => [
        String(index + 1),
        `${item.title}\n${item.description}`,
        item.responsibleText ?? "Não definido",
        item.dueDate ? `${item.dueDate.split("-").reverse().join("/")}${item.dueDateText ? ` ("${item.dueDateText}")` : ""}` : item.dueDateText ?? "Não definido",
        evidenceLabel(item.evidenceSegmentIds, input.evidenceStartMs),
      ]),
      [8, 82, 34, 30, 24],
    );
  } else writer.paragraph("Nenhum encaminhamento explícito na transcrição.", { color: MUTED });
  writer.title("Pendências, riscos e questões em aberto");
  writer.subtitle("Pendências");
  writer.bullets(insightLines(report.pendingItems, input.evidenceStartMs));
  writer.subtitle("Riscos");
  writer.bullets(insightLines(report.risks, input.evidenceStartMs));
  writer.subtitle("Questões em aberto");
  writer.bullets(insightLines(report.openQuestions, input.evidenceStartMs));
  writer.title("Próximos passos");
  writer.bullets([...insightLines(report.nextSteps, input.evidenceStartMs), ...insightLines(report.nextMeetings, input.evidenceStartMs)]);
  writer.title("Cobertura e revisão");
  writer.bullets([
    `Transcrição versão ${input.transcriptVersion ?? "-"}: ${input.partial ? `com ${report.coverage?.missingSegmentCount ?? "?"} lacuna(s)` : "completa"}.`,
    ...report.coverageNotes,
    input.state === "reviewed" ? "Revisão humana confirmada." : "Revisão humana pendente.",
  ]);
  return writer.finish(`Fenasoja Meeting · relatório v${input.minutesVersion} · ${input.model} · gerado em ${meta.generatedAtLabel}`);
}

export function renderTranscriptPdf(input: TranscriptExportInput) {
  const badge = input.coverage === "with_gaps" ? "PARCIAL - COM LACUNAS" : null;
  const writer = new PdfWriter("Fenasoja · Transcrição da reunião", input.meta, badge);
  writer.title("Transcrição completa");
  writer.paragraph(`Evento: ${input.meta.eventTitle} · ${input.meta.meetingDateLabel}`);
  writer.paragraph(`Versão ${input.version} (${input.versionKind === "manual_revision" ? "correção humana" : "transcrição original"}) · ${input.coverage === "complete" ? "cobertura completa" : "contém lacunas explícitas"} · ${input.model}`, { color: MUTED, size: 9 });
  writer.paragraph("Horários relativos ao início da gravação (pausas não contam). Trechos sem fala e lacunas aparecem identificados; nenhum conteúdo foi reconstruído.", { color: MUTED, size: 8.5 });
  for (const line of input.lines) {
    const stamp = `[${formatClock(line.startMs)} - ${formatClock(line.endMs)}]`;
    if (line.kind === "gap") writer.paragraph(`${stamp} LACUNA: trecho sem transcrição disponível.`, { bold: true, color: [180, 83, 9] });
    else if (line.kind === "silence") writer.paragraph(`${stamp} (nenhuma fala identificada)`, { color: MUTED });
    else {
      writer.paragraph(stamp, { size: 8, color: GREEN, bold: true });
      writer.paragraph(line.text);
    }
  }
  return writer.finish(`Fenasoja Meeting · transcrição v${input.version} · gerado em ${input.meta.generatedAtLabel}`);
}

export function renderTranscriptText(input: TranscriptExportInput) {
  const lines = [
    "FENASOJA - TRANSCRIÇÃO DA REUNIÃO",
    `Evento: ${input.meta.eventTitle}`,
    `Data: ${input.meta.meetingDateLabel}`,
    ...(input.meta.location ? [`Local: ${input.meta.location}`] : []),
    `Versão: ${input.version} (${input.versionKind === "manual_revision" ? "correção humana" : "transcrição original"})`,
    `Cobertura: ${input.coverage === "complete" ? "completa" : "PARCIAL - contém lacunas"}`,
    `Modelo de transcrição: ${input.model}`,
    `Gerado em: ${input.meta.generatedAtLabel}`,
    "Horários relativos ao início da gravação (pausas não contam).",
    "",
  ];
  for (const line of input.lines) {
    const stamp = `[${formatClock(line.startMs)} - ${formatClock(line.endMs)}]`;
    if (line.kind === "gap") lines.push(`${stamp} [LACUNA: trecho sem transcrição disponível]`);
    else if (line.kind === "silence") lines.push(`${stamp} [nenhuma fala identificada]`);
    else lines.push(`${stamp} ${line.text}`);
    lines.push("");
  }
  return new TextEncoder().encode(`\ufeff${lines.join("\r\n")}`);
}
