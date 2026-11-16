import {
  generateMeetingReport,
  type AnalysisTranscriptSegment,
  renderReportMarkdown,
} from "../_shared/agenda-meeting/analysis.ts";
import { isPlainObject, isUuid, type JsonValue, removeUnsafeControlCharacters } from "../_shared/agenda-meeting/contracts.ts";
import { ProviderError } from "../_shared/agenda-meeting/gateway.ts";
import { errorResponse, HttpError, jsonResponse, logSafe, optionsResponse } from "../_shared/agenda-meeting/http.ts";
import {
  createMeetingAdminClient,
  looseClient,
  mapDatabaseError,
  MEETING_AUDIO_BUCKET,
  type MeetingSupabaseClient,
  removeSessionStorage,
  requireInternalWorker,
} from "../_shared/agenda-meeting/supabase.ts";
import { inspectWav, transcribeAudioPart } from "../_shared/agenda-meeting/transcription.ts";

type JobKind = "assemble_transcript" | "analysis_generate" | "transcribe_segment";

interface MeetingJob {
  id: string;
  kind: JobKind;
  session_id: string;
  org_id: string;
  event_id: string;
  transcript_version_id: string | null;
  receipt_id: string | null;
  lease_token: string;
  attempts: number;
  max_attempts: number;
}

/** Each run claims for at most this long; long report calls only start at the beginning of a run. */
const RUN_CLAIM_BUDGET_MS = 40_000;
const TRANSCRIPTION_CONCURRENCY = 3;

function requireJob(value: unknown): MeetingJob {
  if (
    !isPlainObject(value) || !isUuid(value.id) || !isUuid(value.session_id) || !isUuid(value.org_id) ||
    !isUuid(value.event_id) || !isUuid(value.lease_token) ||
    !["assemble_transcript", "analysis_generate", "transcribe_segment"].includes(String(value.kind))
  ) throw new HttpError(503, "invalid_claimed_job", true);
  return value as unknown as MeetingJob;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]));
  throw new ProviderError("analysis_result_not_json", false, 0);
}

function saoPauloDate(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

async function processTranscription(admin: MeetingSupabaseClient, job: MeetingJob) {
  if (!job.receipt_id) throw new ProviderError("transcription_receipt_missing", false, 0);
  const { data: receipt, error } = await looseClient(admin).from("agenda_meeting_segment_receipts")
    .select("id,session_id,sequence,status,audio_storage_path,audio_deleted_at,sha256,byte_size")
    .eq("id", job.receipt_id).eq("session_id", job.session_id).maybeSingle();
  if (error) throw new ProviderError("transcription_source_query_failed", true, 30);
  if (!receipt || !receipt.audio_storage_path || receipt.audio_deleted_at) {
    throw new ProviderError("transcription_audio_unavailable", false, 0);
  }
  const download = await admin.storage.from(MEETING_AUDIO_BUCKET).download(receipt.audio_storage_path);
  if (download.error || !download.data) throw new ProviderError("transcription_audio_download_failed", true, 30);
  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource)))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (digest !== receipt.sha256 || bytes.byteLength !== Number(receipt.byte_size)) {
    throw new ProviderError("transcription_audio_integrity_failed", false, 0);
  }
  try {
    inspectWav(bytes);
  } catch {
    throw new ProviderError("transcription_audio_invalid", false, 0);
  }
  const result = await transcribeAudioPart(bytes, `parte-${String(receipt.sequence).padStart(5, "0")}.wav`);
  const { error: completeError } = await looseClient(admin).rpc("agenda_meeting_complete_transcription_job", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_transcript: removeUnsafeControlCharacters(result.text),
    p_provider_request_id: result.providerRequestId,
    p_provider_model: result.model,
    p_usage: result.usage,
  });
  if (completeError) throw mapDatabaseError(completeError);
}

async function loadReportInput(admin: MeetingSupabaseClient, job: MeetingJob) {
  if (!job.transcript_version_id) throw new ProviderError("analysis_transcript_version_missing", false, 0);
  const db = looseClient(admin);
  const [sessionResult, versionResult, segmentResult, timingResult] = await Promise.all([
    db.from("agenda_meeting_sessions").select("id,event_context,started_at,created_at")
      .eq("id", job.session_id).eq("org_id", job.org_id).eq("event_id", job.event_id).maybeSingle(),
    db.from("agenda_meeting_transcript_versions").select("id,version,kind,missing_sequences")
      .eq("id", job.transcript_version_id).eq("session_id", job.session_id).maybeSingle(),
    db.from("agenda_meeting_transcript_segments").select("id,sequence,transcript_text")
      .eq("session_id", job.session_id).order("sequence", { ascending: true }),
    db.from("agenda_meeting_segment_receipts").select("sequence,capture_start_ms,capture_end_ms")
      .eq("session_id", job.session_id).eq("status", "transcribed"),
  ]);
  if (sessionResult.error || versionResult.error || segmentResult.error || timingResult.error) {
    throw new ProviderError("analysis_source_query_failed", true, 30);
  }
  if (!sessionResult.data || !versionResult.data) throw new ProviderError("analysis_source_not_found", false, 0);
  const timings = new Map<number, { start: number; end: number }>();
  for (const row of timingResult.data ?? []) timings.set(Number(row.sequence), { start: Number(row.capture_start_ms), end: Number(row.capture_end_ms) });
  const originals = (segmentResult.data ?? []) as Array<{ id: string; sequence: number; transcript_text: string }>;
  let selected = originals.map((segment) => ({ id: segment.id, sequence: segment.sequence, text: segment.transcript_text }));
  if (versionResult.data.kind === "manual_revision") {
    const { data, error } = await db.from("agenda_meeting_transcript_revision_segments")
      .select("source_segment_id,sequence,revised_text").eq("transcript_version_id", job.transcript_version_id)
      .order("sequence", { ascending: true });
    if (error) throw new ProviderError("analysis_revision_query_failed", true, 30);
    const known = new Set(originals.map((segment) => segment.id));
    selected = (data ?? []).map((revision: { source_segment_id: string; sequence: number; revised_text: string }) => {
      if (!known.has(revision.source_segment_id)) throw new ProviderError("analysis_revision_source_invalid", false, 0);
      return { id: revision.source_segment_id, sequence: revision.sequence, text: revision.revised_text };
    });
  }
  const transcriptSegments: AnalysisTranscriptSegment[] = selected.filter((segment) => segment.text.trim()).map((segment) => {
    const timing = timings.get(segment.sequence);
    if (!timing) throw new ProviderError("analysis_timing_missing", false, 0);
    return { id: segment.id, text: removeUnsafeControlCharacters(segment.text).trim(), captureStartMs: timing.start, captureEndMs: timing.end };
  });
  if (!transcriptSegments.length) throw new ProviderError("analysis_transcript_has_no_speech", false, 0);
  const missing = Array.isArray(versionResult.data.missing_sequences) ? versionResult.data.missing_sequences : [];
  return {
    eventContext: isPlainObject(sessionResult.data.event_context) ? sessionResult.data.event_context : {},
    transcriptVersionId: job.transcript_version_id,
    transcriptVersionNumber: Number(versionResult.data.version),
    transcriptCoverage: missing.length > 0 ? "with_gaps" as const : "complete" as const,
    missingSequenceCount: missing.length,
    meetingDate: saoPauloDate(sessionResult.data.started_at ?? sessionResult.data.created_at),
    transcriptSegments,
  };
}

async function processReport(admin: MeetingSupabaseClient, job: MeetingJob) {
  const input = await loadReportInput(admin, job);
  const generated = await generateMeetingReport(input);
  const report = generated.report;
  const asInsight = (item: { title: string; detail: string; evidenceSegmentIds: string[] }) => item;
  const result = {
    title: `Relatório — ${report.meeting.eventTitle}`.slice(0, 300),
    executiveSummary: report.executiveSummary,
    minutesMarkdown: renderReportMarkdown(report),
    decisions: report.decisions.map(asInsight),
    pendingItems: [...report.pendingItems, ...report.openQuestions].map(asInsight),
    risks: report.risks.map(asInsight),
    importantPoints: report.themes.map((theme) => ({ title: theme.title, detail: theme.discussion, evidenceSegmentIds: theme.evidenceSegmentIds })),
    nextSteps: report.nextSteps.map(asInsight),
    nextMeetings: report.nextMeetings.map(asInsight),
    actionItems: report.actionItems.map((item) => ({ ...item, suggestedMemberId: null })),
    report: { ...report, model: generated.model, providerCallIds: generated.providerCallIds },
    analysisModel: generated.model,
    reasoningEffort: generated.reasoningEffort,
    promptVersion: generated.promptVersion,
    schemaVersion: generated.schemaVersion,
  };
  const { error } = await looseClient(admin).rpc("agenda_meeting_complete_report_job", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_transcript_version_id: job.transcript_version_id,
    p_result: toJsonValue(result),
    p_provider_response_id: generated.providerResponseId,
    p_usage: { ...generated.usage, providerCallIds: generated.providerCallIds },
  });
  if (error) throw mapDatabaseError(error);
}

async function processJob(admin: MeetingSupabaseClient, job: MeetingJob) {
  if (job.kind === "transcribe_segment") return await processTranscription(admin, job);
  if (job.kind === "assemble_transcript") {
    const { error } = await admin.rpc("agenda_meeting_complete_assemble_job", { p_job_id: job.id, p_lease_token: job.lease_token });
    if (error) throw mapDatabaseError(error);
    return;
  }
  return await processReport(admin, job);
}

function failureOf(error: unknown) {
  if (error instanceof ProviderError) {
    return { code: error.message, retryAfterSeconds: error.retryable ? error.retryAfterSeconds : 0, pause: error.pauseProvider, requestId: error.providerRequestId };
  }
  if (error instanceof HttpError) return { code: error.detail ? `${error.code}_${error.detail}`.slice(0, 120) : error.code, retryAfterSeconds: error.retryable ? 30 : 0, pause: false, requestId: null };
  return { code: "meeting_job_failed", retryAfterSeconds: 30, pause: false, requestId: null };
}

async function failJob(admin: MeetingSupabaseClient, job: MeetingJob, error: unknown) {
  const failure = failureOf(error);
  const db = looseClient(admin);
  const { error: persistenceError } = job.kind === "transcribe_segment"
    ? await db.rpc("agenda_meeting_fail_transcription_job", {
      p_job_id: job.id,
      p_lease_token: job.lease_token,
      p_error_code: failure.code,
      p_retry_after_seconds: failure.retryAfterSeconds,
      p_provider_request_id: failure.requestId,
      p_pause_provider: failure.pause,
    })
    : await admin.rpc("agenda_meeting_fail_job", {
      p_job_id: job.id,
      p_lease_token: job.lease_token,
      p_error_code: failure.code,
      p_retry_after_seconds: failure.retryAfterSeconds,
    });
  if (failure.pause && job.kind !== "transcribe_segment") {
    await db.rpc("agenda_meeting_pause_provider", { p_reason: failure.code, p_minutes: 15 });
  }
  if (persistenceError) logSafe("error", "agenda_meeting_job_failure_write_failed", { jobId: job.id, jobKind: job.kind });
  logSafe("warn", "agenda_meeting_job_failed", { jobId: job.id, jobKind: job.kind, sessionId: job.session_id, errorCode: failure.code, attempts: job.attempts });
}

async function runHousekeeping(admin: MeetingSupabaseClient) {
  const db = looseClient(admin);
  const { data: candidates } = await db.rpc("agenda_meeting_audio_cleanup_candidates", { p_limit: 100 });
  const rows = (Array.isArray(candidates) ? candidates : []) as Array<{ receipt_id: string; storage_path: string }>;
  if (rows.length) {
    const { error } = await admin.storage.from(MEETING_AUDIO_BUCKET).remove(rows.map((row) => row.storage_path));
    if (!error) await db.rpc("agenda_meeting_mark_audio_deleted", { p_receipt_ids: rows.map((row) => row.receipt_id) });
  }
  // Fallback for storage left behind when a delete request ended before cleaning files.
  if (new Date().getUTCMinutes() % 10 === 0) {
    const { data: deleted } = await db.rpc("agenda_meeting_recent_deleted_sessions", { p_since: new Date(Date.now() - 24 * 3_600_000).toISOString() });
    for (const row of (Array.isArray(deleted) ? deleted : []) as Array<{ org_id: string; event_id: string; session_id: string }>) {
      await removeSessionStorage(admin, { orgId: row.org_id, eventId: row.event_id, sessionId: row.session_id });
    }
  }
  return rows.length;
}

async function runWorker() {
  const admin = createMeetingAdminClient();
  const startedAt = Date.now();
  const { error: staleError } = await admin.rpc("agenda_meeting_expire_stale_captures", { p_stale_seconds: 180 });
  if (staleError) logSafe("warn", "agenda_meeting_stale_capture_recovery_failed", { errorCode: "stale_capture_recovery_failed" });

  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  let first = true;
  while (Date.now() - startedAt < RUN_CLAIM_BUDGET_MS) {
    // Report generation can take minutes, so it is only claimed at the start of a run.
    const kinds = first ? null : ["transcribe_segment", "assemble_transcript"];
    first = false;
    const { data, error } = await looseClient(admin).rpc("agenda_meeting_claim_jobs_v2", {
      p_batch_size: TRANSCRIPTION_CONCURRENCY,
      p_lease_seconds: 390,
      p_kinds: kinds,
    });
    if (error) throw new HttpError(503, "meeting_job_claim_failed", true);
    const jobs = (Array.isArray(data) ? data : []).map(requireJob);
    if (!jobs.length) break;
    claimed += jobs.length;
    await Promise.all(jobs.map(async (job) => {
      const jobStarted = Date.now();
      try {
        await processJob(admin, job);
        succeeded += 1;
        logSafe("info", "agenda_meeting_job_succeeded", { jobId: job.id, jobKind: job.kind, sessionId: job.session_id, latencyMs: Date.now() - jobStarted });
      } catch (jobError) {
        failed += 1;
        await failJob(admin, job, jobError);
      }
    }));
  }
  const audioRemoved = await runHousekeeping(admin).catch(() => 0);
  const summary = { claimed, succeeded, failed, audioRemoved, durationMs: Date.now() - startedAt };
  if (claimed || audioRemoved) logSafe("info", "agenda_meeting_worker_run", summary);
  return summary;
}

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);
  if (req.method !== "POST") return jsonResponse(req, { error: "method_not_allowed" }, 405);
  try {
    await requireInternalWorker(req);
    // The scheduler's HTTP call gives up after a few seconds; the run continues as a
    // background task bounded by the claim budget and job leases.
    if (typeof EdgeRuntime !== "undefined" && new URL(req.url).searchParams.get("wait") !== "1") {
      EdgeRuntime.waitUntil(runWorker().catch((error) => {
        logSafe("error", "agenda_meeting_worker_failed", { errorCode: error instanceof HttpError ? error.code : "worker_failed" });
      }));
      return jsonResponse(req, { ok: true, accepted: true }, 202);
    }
    return jsonResponse(req, { ok: true, ...(await runWorker()) });
  } catch (error) {
    return errorResponse(req, error, "agenda_meeting_worker");
  }
});
