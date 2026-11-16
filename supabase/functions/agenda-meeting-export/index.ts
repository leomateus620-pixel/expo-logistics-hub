import { isPlainObject, isUuid } from "../_shared/agenda-meeting/contracts.ts";
import {
  EXPORT_RENDERER_VERSION,
  type ExportMeta,
  renderReportPdf,
  renderTranscriptPdf,
  renderTranscriptText,
  type TranscriptExportLine,
} from "../_shared/agenda-meeting/export-render.ts";
import { errorResponse, HttpError, jsonResponse, logSafe, optionsResponse, readJsonBody } from "../_shared/agenda-meeting/http.ts";
import {
  authenticateMeetingUser,
  authorizeMeetingAction,
  createMeetingAdminClient,
  looseClient,
  mapDatabaseError,
  MEETING_EXPORTS_BUCKET,
} from "../_shared/agenda-meeting/supabase.ts";

type ExportKind = "report_pdf" | "transcript_pdf" | "transcript_txt";
const KINDS = new Set<ExportKind>(["report_pdf", "transcript_pdf", "transcript_txt"]);
const SIGNED_URL_SECONDS = 120;

async function sha256Hex(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource)))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function dateLabel(iso: string | null | undefined, withTime = false) {
  if (!iso) return "Data não registrada";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Data não registrada";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "long",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(date);
}

function slug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 60) || "reuniao";
}

function parseRequest(body: unknown) {
  if (!isPlainObject(body)) throw new HttpError(400, "invalid_export_request");
  const { orgId, eventId, sessionId, kind, versionId } = body;
  if (!isUuid(orgId) || !isUuid(eventId) || !isUuid(sessionId) || !isUuid(versionId)) throw new HttpError(400, "invalid_export_request");
  if (typeof kind !== "string" || !KINDS.has(kind as ExportKind)) throw new HttpError(400, "invalid_export_kind");
  return { orgId, eventId, sessionId, kind: kind as ExportKind, versionId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);
  if (req.method !== "POST") return jsonResponse(req, { error: "method_not_allowed" }, 405);
  try {
    const request = parseRequest(await readJsonBody(req, 16 * 1_024));
    const caller = await authenticateMeetingUser(req);
    // Downloads require the same read authorization as the meeting detail.
    await authorizeMeetingAction(caller.client, "detail", request.orgId, request.eventId, request.sessionId);
    const admin = createMeetingAdminClient();
    const db = looseClient(admin);

    const { data: session, error: sessionError } = await db.from("agenda_meeting_sessions")
      .select("id,org_id,event_id,event_context,started_at,created_at,stt_model,pipeline,deleted_at")
      .eq("id", request.sessionId).eq("org_id", request.orgId).eq("event_id", request.eventId).maybeSingle();
    if (sessionError) throw new HttpError(503, "meeting_scope_lookup_failed", true);
    if (!session || session.deleted_at) throw new HttpError(404, "meeting_not_found");
    const context = isPlainObject(session.event_context) ? session.event_context : {};
    const eventTitle = typeof context.title === "string" && context.title.trim() ? context.title.trim() : "Reunião FENASOJA";
    const meta: ExportMeta = {
      eventTitle,
      meetingDateLabel: dateLabel(session.started_at ?? session.created_at, true),
      location: typeof context.location === "string" && context.location.trim() ? context.location.trim() : null,
      commissions: Array.isArray(context.commissions)
        ? context.commissions.map((item: unknown) => isPlainObject(item) && typeof item.name === "string" ? item.name : "").filter(Boolean)
        : [],
      generatedAtLabel: dateLabel(new Date().toISOString(), true),
    };

    let transcriptVersionId: string;
    let minutes: Record<string, unknown> | null = null;
    if (request.kind === "report_pdf") {
      const { data, error } = await db.from("agenda_meeting_minutes_versions")
        .select("id,version,status,title,summary,minutes_markdown,transcript_version_id,analysis_model,report,report_format,is_partial,transcript_coverage")
        .eq("id", request.versionId).eq("session_id", session.id).maybeSingle();
      if (error) throw new HttpError(503, "meeting_scope_lookup_failed", true);
      if (!data) throw new HttpError(404, "meeting_report_not_found");
      minutes = data;
      transcriptVersionId = String(data.transcript_version_id);
    } else {
      transcriptVersionId = request.versionId;
    }

    const { data: transcript, error: transcriptError } = await db.from("agenda_meeting_transcript_versions")
      .select("id,version,kind,content_hash,missing_sequences").eq("id", transcriptVersionId).eq("session_id", session.id).maybeSingle();
    if (transcriptError) throw new HttpError(503, "meeting_scope_lookup_failed", true);
    if (!transcript) throw new HttpError(404, "meeting_transcript_not_found");

    const sourceHash = request.kind === "report_pdf"
      ? await sha256Hex(new TextEncoder().encode(JSON.stringify([
        minutes?.id, minutes?.version, minutes?.status, minutes?.summary, minutes?.minutes_markdown, minutes?.report, minutes?.is_partial,
      ])))
      : await sha256Hex(new TextEncoder().encode(JSON.stringify([transcript.content_hash, transcript.missing_sequences, transcript.version])));
    const sourceVersionId = request.kind === "report_pdf" ? String(minutes?.id) : String(transcript.id);
    const extension = request.kind === "transcript_txt" ? "txt" : "pdf";
    const contentType = extension === "txt" ? "text/plain; charset=utf-8" : "application/pdf";
    const label = request.kind === "report_pdf"
      ? `relatorio-v${minutes?.version}`
      : `transcricao-v${transcript.version}`;
    const downloadName = `${slug(eventTitle)}-${label}.${extension}`;

    const signed = async (path: string) => {
      const { data, error } = await admin.storage.from(MEETING_EXPORTS_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS, { download: downloadName });
      if (error || !data?.signedUrl) throw new HttpError(503, "meeting_export_sign_failed", true);
      return data.signedUrl;
    };

    // Idempotent: a stored file for this exact source version and renderer is reused
    // unless its source changed (e.g. a report review), which yields a new hash.
    const { data: existing } = await db.from("agenda_meeting_artifacts")
      .select("storage_path,source_content_hash,byte_size,sha256")
      .eq("session_id", session.id).eq("kind", request.kind).eq("source_version_id", sourceVersionId)
      .eq("renderer_version", EXPORT_RENDERER_VERSION).maybeSingle();
    if (existing && existing.source_content_hash === sourceHash) {
      return jsonResponse(req, { ok: true, url: await signed(existing.storage_path), fileName: downloadName, reused: true, byteSize: existing.byte_size, sha256: existing.sha256 });
    }

    // Build the content from the exact persisted version.
    const [{ data: segments }, { data: receipts }] = await Promise.all([
      db.from("agenda_meeting_transcript_segments").select("id,sequence,transcript_text,provider_model")
        .eq("session_id", session.id).order("sequence", { ascending: true }),
      db.from("agenda_meeting_segment_receipts").select("sequence,capture_start_ms,capture_end_ms,status")
        .eq("session_id", session.id).order("sequence", { ascending: true }),
    ]);
    const timing = new Map<number, { start: number; end: number; status: string }>();
    for (const row of receipts ?? []) timing.set(Number(row.sequence), { start: Number(row.capture_start_ms), end: Number(row.capture_end_ms), status: String(row.status) });
    const segmentRows = (segments ?? []) as Array<{ id: string; sequence: number; transcript_text: string; provider_model: string }>;
    const evidenceStartMs: Record<string, number> = {};
    for (const segment of segmentRows) {
      const t = timing.get(segment.sequence);
      if (t) evidenceStartMs[segment.id] = t.start;
    }

    let bytes: Uint8Array;
    if (request.kind === "report_pdf" && minutes) {
      const report = minutes.report_format === "structured_v3" && isPlainObject(minutes.report) ? minutes.report : null;
      bytes = renderReportPdf({
        meta,
        minutesVersion: Number(minutes.version),
        state: minutes.status === "reviewed" ? "reviewed" : minutes.status === "superseded" ? "superseded" : "ai_draft",
        partial: minutes.is_partial === true || minutes.transcript_coverage === "with_gaps",
        model: String(minutes.analysis_model),
        transcriptVersion: Number(transcript.version),
        evidenceStartMs,
        // deno-lint-ignore no-explicit-any
        report: report as any,
        legacySummary: String(minutes.summary ?? ""),
        legacyMarkdown: String(minutes.minutes_markdown ?? ""),
      });
    } else {
      let texts = new Map<number, string>(segmentRows.map((segment) => [segment.sequence, segment.transcript_text]));
      if (transcript.kind === "manual_revision") {
        const { data: revisions } = await db.from("agenda_meeting_transcript_revision_segments")
          .select("sequence,revised_text").eq("transcript_version_id", transcript.id);
        texts = new Map((revisions ?? []).map((row: { sequence: number; revised_text: string }) => [row.sequence, row.revised_text]));
      }
      const missing = new Set<number>(Array.isArray(transcript.missing_sequences) ? transcript.missing_sequences : []);
      const sequences = [...new Set([...texts.keys(), ...missing])].sort((a, b) => a - b);
      const lines: TranscriptExportLine[] = sequences.map((sequence) => {
        const t = timing.get(sequence) ?? { start: 0, end: 0, status: "lost" };
        if (missing.has(sequence) || !texts.has(sequence)) return { kind: "gap", startMs: t.start, endMs: t.end, text: "" };
        const text = (texts.get(sequence) ?? "").trim();
        return text ? { kind: "speech", startMs: t.start, endMs: t.end, text } : { kind: "silence", startMs: t.start, endMs: t.end, text: "" };
      });
      const model = session.pipeline === "audio_gemini_v1"
        ? `Gemini 3.5 Transcribe (${segmentRows[0]?.provider_model ?? session.stt_model})`
        : "Reconhecimento de fala do navegador (registro anterior ao upgrade)";
      const exportInput = {
        meta,
        version: Number(transcript.version),
        versionKind: transcript.kind === "manual_revision" ? "manual_revision" as const : "canonical" as const,
        coverage: missing.size > 0 ? "with_gaps" as const : "complete" as const,
        model,
        lines,
      };
      bytes = request.kind === "transcript_txt" ? renderTranscriptText(exportInput) : renderTranscriptPdf(exportInput);
    }

    const sha = await sha256Hex(bytes);
    const path = `${session.org_id}/${session.event_id}/${session.id}/exports/${request.kind}-${sourceVersionId}-${sourceHash.slice(0, 12)}.${extension}`;
    const upload = await admin.storage.from(MEETING_EXPORTS_BUCKET).upload(path, bytes as unknown as Blob, { contentType, upsert: true });
    if (upload.error) {
      logSafe("error", "agenda_meeting_export_upload_failed", { sessionId: session.id, kind: request.kind });
      throw new HttpError(503, "meeting_export_storage_failed", true);
    }
    if (existing && existing.source_content_hash !== sourceHash) {
      // The source changed (e.g. review status): replace the stale file and record.
      await db.from("agenda_meeting_artifacts").delete().eq("session_id", session.id).eq("kind", request.kind)
        .eq("source_version_id", sourceVersionId).eq("renderer_version", EXPORT_RENDERER_VERSION);
      if (existing.storage_path !== path) await admin.storage.from(MEETING_EXPORTS_BUCKET).remove([existing.storage_path]).catch(() => undefined);
    }
    const { data: registered, error: registerError } = await db.rpc("agenda_meeting_register_artifact", {
      p_session_id: session.id,
      p_kind: request.kind,
      p_source_version_id: sourceVersionId,
      p_source_hash: sourceHash,
      p_renderer_version: EXPORT_RENDERER_VERSION,
      p_storage_path: path,
      p_byte_size: bytes.byteLength,
      p_sha256: sha,
      p_actor_user_id: caller.id,
    });
    if (registerError) {
      await admin.storage.from(MEETING_EXPORTS_BUCKET).remove([path]).catch(() => undefined);
      throw mapDatabaseError(registerError);
    }
    const finalPath = isPlainObject(registered) && typeof registered.storagePath === "string" ? registered.storagePath : path;
    if (finalPath !== path) await admin.storage.from(MEETING_EXPORTS_BUCKET).remove([path]).catch(() => undefined);
    return jsonResponse(req, { ok: true, url: await signed(finalPath), fileName: downloadName, reused: false, byteSize: bytes.byteLength, sha256: sha });
  } catch (error) {
    return errorResponse(req, error, "agenda_meeting_export");
  }
});
