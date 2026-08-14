import {
  type AnalysisMember,
  AnalysisProviderError,
  type AnalysisTranscriptSegment,
  analyzeMeetingTranscript,
} from "../_shared/agenda-meeting/analysis.ts";
import {
  isPlainObject,
  isUuid,
  type JsonValue,
  removeUnsafeControlCharacters,
} from "../_shared/agenda-meeting/contracts.ts";
import {
  errorResponse,
  HttpError,
  jsonResponse,
  logSafe,
  optionsResponse,
} from "../_shared/agenda-meeting/http.ts";
import {
  createMeetingAdminClient,
  mapDatabaseError,
  type MeetingSupabaseClient,
  requireInternalWorker,
} from "../_shared/agenda-meeting/supabase.ts";

interface MeetingJob {
  id: string;
  kind: "assemble_transcript" | "analysis_generate";
  session_id: string;
  org_id: string;
  event_id: string;
  transcript_version_id: string | null;
  lease_token: string;
  attempts: number;
  max_attempts: number;
}

interface OriginalSegmentRow {
  id: string;
  sequence: number;
  transcript_text: string;
}

interface ReceiptTimingRow {
  sequence: number;
  capture_start_ms: number | string;
  capture_end_ms: number | string;
}

interface RevisionSegmentRow {
  source_segment_id: string;
  sequence: number;
  revised_text: string;
}

function configuredBatchSize() {
  const configured = Number(
    Deno.env.get("AGENDA_MEETING_WORKER_BATCH_SIZE") ?? "1",
  );
  return Number.isFinite(configured)
    ? Math.max(1, Math.min(2, Math.round(configured)))
    : 1;
}

function asSafeMilliseconds(value: number | string, code: string) {
  const number = typeof value === "number" ? value : Number(value);
  if (
    !Number.isSafeInteger(number) || number < 0 || number > 4 * 60 * 60 * 1_000
  ) {
    throw new AnalysisProviderError(code, false, 0);
  }
  return number;
}

function requireJob(value: unknown): MeetingJob {
  if (
    !isPlainObject(value) ||
    !isUuid(value.id) ||
    !isUuid(value.session_id) ||
    !isUuid(value.org_id) ||
    !isUuid(value.event_id) ||
    !isUuid(value.lease_token) ||
    (value.kind !== "assemble_transcript" && value.kind !== "analysis_generate")
  ) {
    throw new HttpError(503, "invalid_claimed_job", true);
  }
  return value as unknown as MeetingJob;
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null || typeof value === "string" || typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]),
    );
  }
  throw new AnalysisProviderError("analysis_result_not_json", false, 0);
}

async function loadAnalysisInput(
  admin: MeetingSupabaseClient,
  job: MeetingJob,
) {
  if (!job.transcript_version_id || !isUuid(job.transcript_version_id)) {
    throw new AnalysisProviderError(
      "analysis_transcript_version_missing",
      false,
      0,
    );
  }
  const [
    sessionResult,
    versionResult,
    originalResult,
    timingResult,
    memberResult,
  ] = await Promise.all([
    admin.from("agenda_meeting_sessions")
      .select("id,org_id,event_id,event_context")
      .eq("id", job.session_id)
      .eq("org_id", job.org_id)
      .eq("event_id", job.event_id)
      .maybeSingle(),
    admin.from("agenda_meeting_transcript_versions")
      .select("id,session_id,kind,missing_sequences")
      .eq("id", job.transcript_version_id)
      .eq("session_id", job.session_id)
      .maybeSingle(),
    admin.from("agenda_meeting_transcript_segments")
      .select("id,sequence,transcript_text")
      .eq("session_id", job.session_id)
      .order("sequence", { ascending: true }),
    admin.from("agenda_meeting_segment_receipts")
      .select("sequence,capture_start_ms,capture_end_ms")
      .eq("session_id", job.session_id)
      .eq("status", "transcribed")
      .order("sequence", { ascending: true }),
    admin.from("org_members")
      .select("user_id,nome_exibicao")
      .eq("org_id", job.org_id)
      .eq("is_active", true),
  ]);
  if (
    sessionResult.error || versionResult.error || originalResult.error ||
    timingResult.error || memberResult.error
  ) {
    throw new AnalysisProviderError("analysis_source_query_failed", true, 30);
  }
  if (!sessionResult.data || !versionResult.data) {
    throw new AnalysisProviderError("analysis_source_not_found", false, 0);
  }
  const missingSequences = versionResult.data.missing_sequences;
  if (
    !Array.isArray(missingSequences) ||
    missingSequences.some((sequence) =>
      !Number.isSafeInteger(sequence) || sequence < 0
    )
  ) {
    throw new AnalysisProviderError("analysis_coverage_invalid", false, 0);
  }

  const timings = new Map<number, { start: number; end: number }>();
  for (const raw of (timingResult.data ?? []) as ReceiptTimingRow[]) {
    const start = asSafeMilliseconds(
      raw.capture_start_ms,
      "analysis_timing_invalid",
    );
    const end = asSafeMilliseconds(
      raw.capture_end_ms,
      "analysis_timing_invalid",
    );
    if (end < start) {
      throw new AnalysisProviderError("analysis_timing_invalid", false, 0);
    }
    timings.set(raw.sequence, { start, end });
  }

  const originals = (originalResult.data ?? []) as OriginalSegmentRow[];
  const originalById = new Map(
    originals.map((segment) => [segment.id, segment]),
  );
  let selected: Array<{ id: string; sequence: number; text: string }>;
  if (versionResult.data.kind === "manual_revision") {
    const { data: revisions, error } = await admin
      .from("agenda_meeting_transcript_revision_segments")
      .select("source_segment_id,sequence,revised_text")
      .eq("transcript_version_id", job.transcript_version_id)
      .eq("session_id", job.session_id)
      .order("sequence", { ascending: true });
    if (error) {
      throw new AnalysisProviderError(
        "analysis_revision_query_failed",
        true,
        30,
      );
    }
    selected = ((revisions ?? []) as RevisionSegmentRow[]).map((revision) => {
      if (!originalById.has(revision.source_segment_id)) {
        throw new AnalysisProviderError(
          "analysis_revision_source_invalid",
          false,
          0,
        );
      }
      return {
        id: revision.source_segment_id,
        sequence: revision.sequence,
        text: revision.revised_text,
      };
    });
  } else {
    selected = originals.map((segment) => ({
      id: segment.id,
      sequence: segment.sequence,
      text: segment.transcript_text,
    }));
  }
  if (!selected.length || !selected.some((segment) => segment.text.trim())) {
    throw new AnalysisProviderError(
      "analysis_transcript_has_no_speech",
      false,
      0,
    );
  }

  const transcriptSegments: AnalysisTranscriptSegment[] = selected.map(
    (segment) => {
      const timing = timings.get(segment.sequence);
      if (!timing) {
        throw new AnalysisProviderError("analysis_timing_missing", false, 0);
      }
      return {
        id: segment.id,
        text: removeUnsafeControlCharacters(segment.text).trim(),
        captureStartMs: timing.start,
        captureEndMs: timing.end,
      };
    },
  );
  const members: AnalysisMember[] = [];
  const seenMembers = new Set<string>();
  for (const member of memberResult.data ?? []) {
    if (
      !isUuid(member.user_id) ||
      typeof member.nome_exibicao !== "string" ||
      !member.nome_exibicao.trim() ||
      seenMembers.has(member.user_id)
    ) continue;
    seenMembers.add(member.user_id);
    members.push({
      userId: member.user_id,
      name: member.nome_exibicao.trim().slice(0, 240),
    });
  }
  const eventContext = isPlainObject(sessionResult.data.event_context)
    ? sessionResult.data.event_context
    : {};
  return {
    eventContext,
    transcriptVersionId: job.transcript_version_id,
    transcriptCoverage: missingSequences.length > 0
      ? "with_gaps" as const
      : "complete" as const,
    missingSequenceCount: missingSequences.length,
    transcriptSegments,
    members,
  };
}

async function processJob(admin: MeetingSupabaseClient, job: MeetingJob) {
  if (job.kind === "assemble_transcript") {
    const { error } = await admin.rpc("agenda_meeting_complete_assemble_job", {
      p_job_id: job.id,
      p_lease_token: job.lease_token,
    });
    if (error) throw mapDatabaseError(error);
    return;
  }

  const analysis = await analyzeMeetingTranscript(
    await loadAnalysisInput(admin, job),
  );
  if (!job.transcript_version_id) {
    throw new AnalysisProviderError(
      "analysis_transcript_version_missing",
      false,
      0,
    );
  }
  const transcriptVersionId = job.transcript_version_id;
  const resultWithProvenance = {
    ...analysis.result,
    analysisModel: analysis.model,
    reasoningEffort: "medium",
    promptVersion: analysis.promptVersion,
    schemaVersion: analysis.schemaVersion,
  };
  const { error } = await admin.rpc("agenda_meeting_complete_analysis_job", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_transcript_version_id: transcriptVersionId,
    p_result: toJsonValue(resultWithProvenance),
    p_provider_response_id: analysis.providerResponseId,
    p_usage: analysis.usage,
  });
  if (error) throw mapDatabaseError(error);
}

async function failJob(
  admin: MeetingSupabaseClient,
  job: MeetingJob,
  error: unknown,
) {
  const failure = error instanceof AnalysisProviderError
    ? {
      code: error.message,
      retryAfterSeconds: error.retryable ? error.retryAfterSeconds : 0,
    }
    : error instanceof HttpError
    ? { code: error.code, retryAfterSeconds: error.retryable ? 30 : 0 }
    : { code: "meeting_job_failed", retryAfterSeconds: 30 };
  const { error: persistenceError } = await admin.rpc(
    "agenda_meeting_fail_job",
    {
      p_job_id: job.id,
      p_lease_token: job.lease_token,
      p_error_code: failure.code,
      p_retry_after_seconds: failure.retryAfterSeconds,
    },
  );
  if (persistenceError) {
    logSafe("error", "agenda_meeting_job_failure_write_failed", {
      jobId: job.id,
      jobKind: job.kind,
      errorCode: "job_failure_write_failed",
    });
  }
  logSafe("warn", "agenda_meeting_job_failed", {
    jobId: job.id,
    jobKind: job.kind,
    sessionId: job.session_id,
    errorCode: failure.code,
    attempts: job.attempts,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed" }, 405);
  }

  try {
    await requireInternalWorker(req);
    const admin = createMeetingAdminClient();
    const { error: staleError } = await admin.rpc(
      "agenda_meeting_expire_stale_captures",
      { p_stale_seconds: 180 },
    );
    if (staleError) {
      logSafe("warn", "agenda_meeting_stale_capture_recovery_failed", {
        errorCode: "stale_capture_recovery_failed",
      });
    }
    const batchSize = configuredBatchSize();
    const { data, error } = await admin.rpc("agenda_meeting_claim_jobs", {
      p_batch_size: batchSize,
      p_lease_seconds: 390,
    });
    if (error) throw new HttpError(503, "meeting_job_claim_failed", true);
    if (!Array.isArray(data)) {
      throw new HttpError(503, "invalid_job_claim_result", true);
    }
    const jobs = data.map(requireJob);

    let succeeded = 0;
    let failed = 0;
    for (const job of jobs) {
      try {
        await processJob(admin, job);
        succeeded += 1;
        logSafe("info", "agenda_meeting_job_succeeded", {
          jobId: job.id,
          jobKind: job.kind,
          sessionId: job.session_id,
        });
      } catch (jobError) {
        failed += 1;
        await failJob(admin, job, jobError);
      }
    }
    return jsonResponse(req, {
      ok: true,
      claimed: jobs.length,
      succeeded,
      failed,
    });
  } catch (error) {
    return errorResponse(req, error, "agenda_meeting_worker");
  }
});
