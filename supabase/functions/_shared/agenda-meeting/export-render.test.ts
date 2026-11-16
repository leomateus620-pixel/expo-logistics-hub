import { pdfSafe, renderReportPdf, renderTranscriptPdf, renderTranscriptText } from "./export-render.ts";
import { inspectWav } from "./transcription.ts";

const meta = { eventTitle: "Reunião da Comissão de Logística — Casa Fenasoja", meetingDateLabel: "16 de novembro de 2026 08:30", location: "Casa Fenasoja", commissions: ["Logística"], generatedAtLabel: "16/11/2026" };

Deno.test("renders a long multi-page transcript PDF and TXT with gaps and accents", () => {
  const lines = Array.from({ length: 220 }, (_, index) => ({
    kind: index === 50 ? "gap" as const : index === 51 ? "silence" as const : "speech" as const,
    startMs: index * 30_000,
    endMs: (index + 1) * 30_000,
    text: `Trecho ${index}: ação, decisão, orçamento, avaliação — “citação” çãõéâ.`,
  }));
  const input = { meta, version: 1, versionKind: "canonical" as const, coverage: "with_gaps" as const, model: "Gemini 3.5 Transcribe", lines };
  const pdf = renderTranscriptPdf(input);
  const header = new TextDecoder().decode(pdf.slice(0, 5));
  if (header !== "%PDF-") throw new Error("not a PDF");
  const pages = (new TextDecoder("latin1").decode(pdf).match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  if (pages < 5) throw new Error(`expected multiple pages, got ${pages}`);
  const text = new TextDecoder().decode(renderTranscriptText(input));
  if (!text.includes("LACUNA") || !text.includes("nenhuma fala identificada") || !text.includes("çãõéâ")) throw new Error("txt missing content");
});

Deno.test("renders the report PDF with an action table", () => {
  const pdf = renderReportPdf({
    meta, minutesVersion: 2, state: "ai_draft", partial: true, model: "gpt-6.1-sol", transcriptVersion: 1,
    evidenceStartMs: { a: 0 },
    report: {
      executiveSummary: "Resumo ".repeat(80),
      themes: [{ title: "Transporte", discussion: "Discussão ".repeat(60), arguments: ["Custo"], divergences: ["Zélia discordou"], evidenceSegmentIds: ["a"] }],
      decisions: [{ title: "Lista", detail: "Fernanda envia", evidenceSegmentIds: ["a"] }],
      proposals: [],
      actionItems: Array.from({ length: 40 }, (_, index) => ({ title: `Ação ${index}`, description: "Descrição longa ".repeat(8), responsibleText: index % 2 ? "Fernanda" : null, dueDateText: "até sexta-feira", dueDate: "2026-11-20", evidenceSegmentIds: ["a"] })),
      pendingItems: [], risks: [], openQuestions: [], nextSteps: [], nextMeetings: [], coverageNotes: ["Trecho inaudível aos 10 min"],
      coverage: { missingSegmentCount: 1 },
    },
    legacySummary: "", legacyMarkdown: "",
  });
  if (new TextDecoder().decode(pdf.slice(0, 5)) !== "%PDF-") throw new Error("not a PDF");
});

Deno.test("maps characters outside the PDF standard fonts", () => {
  if (pdfSafe("A → B 😀 ação") !== "A -> B  ação") throw new Error(pdfSafe("A → B 😀 ação"));
});

Deno.test("validates canonical PCM WAV parts", () => {
  const samples = 16_000;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, samples * 2, true);
  const info = inspectWav(new Uint8Array(buffer));
  if (info.durationMs !== 1_000 || info.sampleRate !== 16_000) throw new Error("wav misread");
  view.setUint16(22, 2, true);
  let rejected = false;
  try { inspectWav(new Uint8Array(buffer)); } catch { rejected = true; }
  if (!rejected) throw new Error("stereo wav accepted");
});
