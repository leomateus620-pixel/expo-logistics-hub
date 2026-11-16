import {
  deduplicateTranscriptOverlaps,
  type MeetingAnalysisInput,
  renderReportMarkdown,
  resolveRelativeDueDate,
  validateMeetingReport,
} from "./analysis.ts";
import { ProviderError } from "./gateway.ts";

const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";

const input: MeetingAnalysisInput = {
  eventContext: { title: "Comissão de Logística", location: "Casa Fenasoja", commissions: [{ name: "Logística" }] },
  transcriptVersionId: "30000000-0000-4000-8000-000000000001",
  transcriptVersionNumber: 1,
  transcriptCoverage: "complete",
  missingSequenceCount: 0,
  meetingDate: "2026-11-16",
  transcriptSegments: [
    { id: A, text: "Ficou decidido que a Fernanda vai enviar a lista de voos até sexta-feira.", captureStartMs: 0, captureEndMs: 30_000 },
    { id: B, text: "O Roberto sugeriu reduzir a decoração, mas a Zélia discordou. Fica pendente.", captureStartMs: 30_000, captureEndMs: 60_000 },
  ],
};

function raw(overrides: Record<string, unknown> = {}) {
  return {
    title: "Reunião de logística",
    executiveSummary: "Lista de voos encaminhada; decoração pendente.",
    themes: [{ title: "Decoração", discussion: "Redução proposta e contestada.", arguments: ["Custo"], divergences: ["Zélia discordou"], evidenceSegmentIds: [B] }],
    decisions: [{ title: "Lista de voos", detail: "Fernanda enviará a lista.", evidenceSegmentIds: [A] }],
    proposals: [{ title: "Reduzir decoração", detail: "Sugestão do Roberto.", status: "em_discussao", evidenceSegmentIds: [B] }],
    actionItems: [{ title: "Enviar lista de voos", description: "Lista dos convidados.", responsibleText: "Fernanda", dueDateText: "até sexta-feira", dueDate: "2026-11-20", evidenceSegmentIds: [A] }],
    pendingItems: [{ title: "Decoração", detail: "Sem decisão.", evidenceSegmentIds: [B] }],
    risks: [],
    openQuestions: [],
    nextSteps: [],
    nextMeetings: [],
    coverageNotes: [],
    ...overrides,
  };
}

Deno.test("keeps grounded responsible and resolves an unambiguous weekday in São Paulo time", () => {
  const report = validateMeetingReport(raw(), input);
  const action = report.actionItems[0];
  if (action.responsibleText !== "Fernanda") throw new Error("responsible dropped");
  if (action.dueDate !== "2026-11-20") throw new Error(`weekday not resolved: ${action.dueDate}`);
  if (report.partial || report.coverage.status !== "complete") throw new Error("coverage mislabeled");
});

Deno.test("drops responsible names and dates that are not in the evidence", () => {
  const report = validateMeetingReport(raw({
    actionItems: [{ title: "X", description: "Y", responsibleText: "Maria", dueDateText: "dia 30", dueDate: "2026-11-30", evidenceSegmentIds: [A] }],
  }), input);
  const action = report.actionItems[0];
  if (action.responsibleText !== null || action.dueDateText !== null || action.dueDate !== null) {
    throw new Error("invented responsible or deadline kept");
  }
});

Deno.test("rejects evidence IDs that do not exist", () => {
  let rejected = false;
  try {
    validateMeetingReport(raw({ decisions: [{ title: "A", detail: "B", evidenceSegmentIds: ["10000000-0000-4000-8000-0000000000ff"] }] }), input);
  } catch (error) {
    rejected = error instanceof ProviderError;
  }
  if (!rejected) throw new Error("unknown evidence accepted");
});

Deno.test("rejects extra fields from the model", () => {
  let rejected = false;
  try {
    validateMeetingReport({ ...raw(), html: "<b>x</b>" }, input);
  } catch (error) {
    rejected = error instanceof ProviderError && error.message === "analysis_schema_invalid";
  }
  if (!rejected) throw new Error("extra field accepted");
});

Deno.test("marks the report as partial when the transcript has gaps", () => {
  const report = validateMeetingReport(raw(), { ...input, transcriptCoverage: "with_gaps", missingSequenceCount: 2 });
  if (!report.partial) throw new Error("partial report not flagged");
  if (!renderReportMarkdown(report).includes("PARCIAL")) throw new Error("partial label missing from minutes");
});

Deno.test("leaves ambiguous relative dates unresolved", () => {
  if (resolveRelativeDueDate("até a próxima sexta", "2026-11-16") !== null) throw new Error("ambiguous date resolved");
  if (resolveRelativeDueDate("amanhã", "2026-11-16") !== "2026-11-17") throw new Error("tomorrow not resolved");
});

Deno.test("deduplicates only overlapping legacy boundaries", () => {
  const segments = deduplicateTranscriptOverlaps([
    { id: A, text: "Precisamos fechar o contrato até sexta", captureStartMs: 0, captureEndMs: 30_000 },
    { id: B, text: "contrato até sexta e avisar a comissão", captureStartMs: 29_000, captureEndMs: 59_000 },
  ]);
  if (segments[1].text !== "e avisar a comissão") throw new Error("overlap not removed");
  const contiguous = deduplicateTranscriptOverlaps([
    { id: A, text: "contrato até sexta", captureStartMs: 0, captureEndMs: 30_000 },
    { id: B, text: "contrato até sexta de novo", captureStartMs: 30_000, captureEndMs: 60_000 },
  ]);
  if (contiguous[1].text !== "contrato até sexta de novo") throw new Error("contiguous audio parts must keep repeated speech");
});
