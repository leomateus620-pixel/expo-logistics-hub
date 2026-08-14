import {
  AnalysisProviderError,
  deduplicateTranscriptOverlaps,
  type MeetingAnalysisInput,
  validateMeetingAnalysisOutput,
} from "./analysis.ts";

const SEGMENT_ID = "10000000-0000-4000-8000-000000000001";
const MEMBER_ID = "20000000-0000-4000-8000-000000000001";

const input: MeetingAnalysisInput = {
  eventContext: { title: "Credenciamento FENASOJA" },
  transcriptVersionId: "30000000-0000-4000-8000-000000000001",
  transcriptCoverage: "complete",
  missingSequenceCount: 0,
  transcriptSegments: [{
    id: SEGMENT_ID,
    text: "Maria Silva deve publicar o formulário até 20 de agosto de 2026.",
    captureStartMs: 0,
    captureEndMs: 30_000,
  }],
  members: [{ userId: MEMBER_ID, name: "Maria Silva" }],
};

Deno.test("deduplicates only grounded text at overlapping capture boundaries", () => {
  const secondId = "10000000-0000-4000-8000-000000000002";
  const segments = deduplicateTranscriptOverlaps([
    {
      id: SEGMENT_ID,
      text: "Precisamos fechar o contrato até sexta",
      captureStartMs: 0,
      captureEndMs: 30_000,
    },
    {
      id: secondId,
      text: "contrato até sexta e avisar a comissão",
      captureStartMs: 29_000,
      captureEndMs: 59_000,
    },
  ]);
  if (
    segments.length !== 2 || segments[1].id !== secondId ||
    segments[1].text !== "e avisar a comissão"
  ) {
    throw new Error("overlapping transcript boundary was not deduplicated");
  }
});

function rawAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    title: "Título fornecido pelo modelo",
    executiveSummary: "A publicação do formulário foi encaminhada.",
    minutesMarkdown: "## Encaminhamento\nMaria Silva publicará o formulário.",
    decisions: [{
      title: "Publicar formulário",
      detail: "A publicação foi definida.",
      evidenceSegmentIds: [SEGMENT_ID],
    }],
    pendingItems: [],
    risks: [],
    importantPoints: [],
    nextSteps: [],
    nextMeetings: [],
    actionItems: [{
      title: "Publicar formulário",
      description: "Disponibilizar o formulário aprovado.",
      responsibleText: "Maria Silva",
      dueDateText: "20 de agosto de 2026",
      dueDate: "2026-08-20",
      evidenceSegmentIds: [SEGMENT_ID],
    }],
    ...overrides,
  };
}

Deno.test("validates grounded analysis and suggests only the unique exact member", () => {
  const result = validateMeetingAnalysisOutput(rawAnalysis(), input);
  const action = result.actionItems[0];

  if (result.title !== "Ata — Credenciamento FENASOJA") {
    throw new Error("event title was not authoritative");
  }
  if (action.responsibleText !== "Maria Silva") {
    throw new Error("grounded responsible was removed");
  }
  if (action.suggestedMemberId !== MEMBER_ID) {
    throw new Error("unique member was not suggested");
  }
  if (action.dueDate !== "2026-08-20") {
    throw new Error("explicit date was not retained");
  }
});

Deno.test("does not invent responsible users or deadlines", () => {
  const result = validateMeetingAnalysisOutput(
    rawAnalysis({
      actionItems: [{
        title: "Publicar formulário",
        description: "Disponibilizar o formulário aprovado.",
        responsibleText: "João Souza",
        dueDateText: "amanhã",
        dueDate: "2026-08-21",
        evidenceSegmentIds: [SEGMENT_ID],
      }],
    }),
    input,
  );
  const action = result.actionItems[0];

  if (action.responsibleText !== null || action.suggestedMemberId !== null) {
    throw new Error("ungrounded responsible was retained");
  }
  if (action.dueDateText !== null || action.dueDate !== null) {
    throw new Error("ungrounded deadline was retained");
  }
});

Deno.test("rejects a calendar date that normalizes to another day", () => {
  const impossibleDateInput: MeetingAnalysisInput = {
    ...input,
    transcriptSegments: [{
      ...input.transcriptSegments[0],
      text: "O prazo mencionado foi 30 de fevereiro de 2026.",
    }],
  };
  const result = validateMeetingAnalysisOutput(
    rawAnalysis({
      actionItems: [{
        title: "Validar prazo",
        description: "Confirmar o prazo mencionado.",
        responsibleText: null,
        dueDateText: "30 de fevereiro de 2026",
        dueDate: "2026-02-30",
        evidenceSegmentIds: [SEGMENT_ID],
      }],
    }),
    impossibleDateInput,
  );
  if (result.actionItems[0].dueDate !== null) {
    throw new Error("impossible normalized date was persisted");
  }
});

Deno.test("does not suggest an ambiguous member match", () => {
  const result = validateMeetingAnalysisOutput(rawAnalysis(), {
    ...input,
    members: [
      ...input.members,
      { userId: "20000000-0000-4000-8000-000000000002", name: "Maria Silva" },
    ],
  });
  if (result.actionItems[0].suggestedMemberId !== null) {
    throw new Error("ambiguous member was suggested");
  }
});

Deno.test("rejects unknown evidence and extra schema fields", () => {
  const unknownEvidence = rawAnalysis({
    decisions: [{
      title: "Sem fonte",
      detail: "Não existe no segmento.",
      evidenceSegmentIds: ["40000000-0000-4000-8000-000000000001"],
    }],
  });
  let unknownEvidenceError: unknown;
  try {
    validateMeetingAnalysisOutput(unknownEvidence, input);
  } catch (error) {
    unknownEvidenceError = error;
  }
  if (!(unknownEvidenceError instanceof AnalysisProviderError)) {
    throw new Error("unknown evidence was accepted");
  }

  let schemaError: unknown;
  try {
    validateMeetingAnalysisOutput(rawAnalysis({ inventedField: true }), input);
  } catch (error) {
    schemaError = error;
  }
  if (
    !(schemaError instanceof AnalysisProviderError) ||
    schemaError.message !== "analysis_schema_invalid"
  ) {
    throw new Error("strict schema accepted an extra field");
  }
});
