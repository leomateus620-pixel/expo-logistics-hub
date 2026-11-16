-- Fenasoja Meeting: real audio capture, Gemini transcription and GPT-6.1 Sol report.
-- Additive: historical rows keep their recorded metadata; `pipeline` exposes the true origin.

-- 1. Effective providers and pipeline -------------------------------------------------
ALTER TABLE public.agenda_meeting_sessions DROP CONSTRAINT IF EXISTS agenda_meeting_sessions_stt_provider_check;
ALTER TABLE public.agenda_meeting_sessions ADD CONSTRAINT agenda_meeting_sessions_stt_provider_check
  CHECK (stt_provider IN ('deepgram','browser_native','google'));
ALTER TABLE public.agenda_meeting_sessions DROP CONSTRAINT IF EXISTS agenda_meeting_sessions_stt_model_check;
ALTER TABLE public.agenda_meeting_sessions ADD CONSTRAINT agenda_meeting_sessions_stt_model_check
  CHECK (stt_model IN ('nova-3','browser-native','gemini-3.5-transcribe'));
ALTER TABLE public.agenda_meeting_sessions DROP CONSTRAINT IF EXISTS agenda_meeting_sessions_analysis_reasoning_effort_check;
ALTER TABLE public.agenda_meeting_sessions ADD CONSTRAINT agenda_meeting_sessions_analysis_reasoning_effort_check
  CHECK (analysis_reasoning_effort IN ('low','medium','high'));

ALTER TABLE public.agenda_meeting_sessions ADD COLUMN IF NOT EXISTS pipeline text;
UPDATE public.agenda_meeting_sessions SET pipeline = 'legacy_pre_audio' WHERE pipeline IS NULL;
ALTER TABLE public.agenda_meeting_sessions ALTER COLUMN pipeline SET DEFAULT 'audio_gemini_v1';
ALTER TABLE public.agenda_meeting_sessions ALTER COLUMN pipeline SET NOT NULL;
ALTER TABLE public.agenda_meeting_sessions ADD CONSTRAINT agenda_meeting_sessions_pipeline_check
  CHECK (pipeline IN ('legacy_pre_audio','audio_gemini_v1'));
ALTER TABLE public.agenda_meeting_sessions ALTER COLUMN stt_provider SET DEFAULT 'google';
ALTER TABLE public.agenda_meeting_sessions ALTER COLUMN stt_model SET DEFAULT 'gemini-3.5-transcribe';
ALTER TABLE public.agenda_meeting_sessions ALTER COLUMN analysis_model SET DEFAULT 'gpt-6.1-sol';
COMMENT ON COLUMN public.agenda_meeting_sessions.pipeline IS
  'Real capture/transcription origin. legacy_pre_audio = text recognised by the browser (no audio stored); audio_gemini_v1 = audio parts transcribed server-side by google/gemini-3.5-transcribe.';
COMMENT ON COLUMN public.agenda_meeting_sessions.stt_provider IS
  'Provider declared at creation. legacy_pre_audio rows kept the historical deepgram/nova-3 default although their text came from browser recognition; read pipeline for the true origin.';

-- 2. Audio receipts ---------------------------------------------------------------------
ALTER TABLE public.agenda_meeting_segment_receipts
  ADD COLUMN IF NOT EXISTS audio_storage_path text,
  ADD COLUMN IF NOT EXISTS audio_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS transcription_model text,
  ADD COLUMN IF NOT EXISTS transcription_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS speech_detected boolean,
  ADD COLUMN IF NOT EXISTS client_audio_stats jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.agenda_meeting_segment_receipts ADD CONSTRAINT agenda_meeting_receipts_usage_ck
  CHECK (jsonb_typeof(transcription_usage) = 'object' AND jsonb_typeof(client_audio_stats) = 'object');
CREATE UNIQUE INDEX IF NOT EXISTS agenda_meeting_receipts_audio_path_key
  ON public.agenda_meeting_segment_receipts (audio_storage_path) WHERE audio_storage_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS agenda_meeting_receipts_audio_pending_idx
  ON public.agenda_meeting_segment_receipts (created_at)
  WHERE audio_storage_path IS NOT NULL AND audio_deleted_at IS NULL;

-- 3. Processing queue -------------------------------------------------------------------
ALTER TABLE public.agenda_meeting_processing_jobs DROP CONSTRAINT IF EXISTS agenda_meeting_processing_jobs_kind_check;
ALTER TABLE public.agenda_meeting_processing_jobs ADD CONSTRAINT agenda_meeting_processing_jobs_kind_check
  CHECK (kind IN ('assemble_transcript','analysis_generate','transcribe_segment'));
ALTER TABLE public.agenda_meeting_processing_jobs
  ADD COLUMN IF NOT EXISTS receipt_id uuid REFERENCES public.agenda_meeting_segment_receipts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS provider_request_id text;
CREATE INDEX IF NOT EXISTS agenda_meeting_jobs_receipt_idx
  ON public.agenda_meeting_processing_jobs (receipt_id) WHERE receipt_id IS NOT NULL;

-- 4. Structured report ------------------------------------------------------------------
ALTER TABLE public.agenda_meeting_minutes_versions
  ADD COLUMN IF NOT EXISTS report jsonb,
  ADD COLUMN IF NOT EXISTS report_format text NOT NULL DEFAULT 'legacy_markdown',
  ADD COLUMN IF NOT EXISTS is_partial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS generation_key text;
ALTER TABLE public.agenda_meeting_minutes_versions ADD CONSTRAINT agenda_meeting_minutes_report_format_check
  CHECK (report_format IN ('legacy_markdown','structured_v3'));
ALTER TABLE public.agenda_meeting_minutes_versions ADD CONSTRAINT agenda_meeting_minutes_report_object_check
  CHECK (report IS NULL OR jsonb_typeof(report) = 'object');
CREATE UNIQUE INDEX IF NOT EXISTS agenda_meeting_minutes_generation_key
  ON public.agenda_meeting_minutes_versions (session_id, generation_key) WHERE generation_key IS NOT NULL;

-- 5. Export artifacts -------------------------------------------------------------------
CREATE TABLE public.agenda_meeting_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  org_id uuid NOT NULL,
  event_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('report_pdf','transcript_pdf','transcript_txt')),
  source_version_id uuid NOT NULL,
  source_content_hash text NOT NULL CHECK (source_content_hash ~ '^[0-9a-f]{64}$'),
  renderer_version text NOT NULL CHECK (btrim(renderer_version) <> ''),
  storage_path text NOT NULL UNIQUE,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_meeting_artifacts_scope_fkey FOREIGN KEY (session_id, org_id, event_id)
    REFERENCES public.agenda_meeting_sessions(id, org_id, event_id) ON DELETE CASCADE,
  CONSTRAINT agenda_meeting_artifacts_source_key UNIQUE (session_id, kind, source_version_id, renderer_version)
);
GRANT ALL ON public.agenda_meeting_artifacts TO service_role;
ALTER TABLE public.agenda_meeting_artifacts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.agenda_meeting_artifacts IS
  'Exported files (private bucket agenda-meeting-exports). Accessed only by edge functions after server-side authorization.';

-- 6. Runtime configuration (feature flag, limits, provider pause) -----------------------
CREATE TABLE public.agenda_meeting_runtime_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  audio_pipeline_enabled boolean NOT NULL DEFAULT true,
  max_active_duration_ms bigint NOT NULL DEFAULT 14400000 CHECK (max_active_duration_ms BETWEEN 60000 AND 14400000),
  max_session_audio_bytes bigint NOT NULL DEFAULT 536870912 CHECK (max_session_audio_bytes BETWEEN 1048576 AND 2147483648),
  max_report_generations_per_session integer NOT NULL DEFAULT 5 CHECK (max_report_generations_per_session BETWEEN 1 AND 50),
  audio_retention_hours integer NOT NULL DEFAULT 72 CHECK (audio_retention_hours BETWEEN 1 AND 720),
  provider_paused_until timestamptz,
  provider_pause_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT ALL ON public.agenda_meeting_runtime_config TO service_role;
ALTER TABLE public.agenda_meeting_runtime_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.agenda_meeting_runtime_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
COMMENT ON TABLE public.agenda_meeting_runtime_config IS
  'Singleton. audio_pipeline_enabled=false blocks NEW audio sessions only (rollback) without touching sessions already in processing.';

CREATE OR REPLACE FUNCTION public.agenda_meeting_runtime_settings()
RETURNS public.agenda_meeting_runtime_config
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT config.* FROM public.agenda_meeting_runtime_config config WHERE config.id
  UNION ALL
  SELECT true,true,14400000,536870912,5,72,NULL,NULL,now(),NULL
   WHERE NOT EXISTS (SELECT 1 FROM public.agenda_meeting_runtime_config)
  LIMIT 1;
$$;
-- 7. Audio ingestion ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_meeting_register_audio_segment(
  p_actor_user_id uuid, p_session_id uuid, p_segment_id uuid, p_sequence integer,
  p_capture_start_ms bigint, p_capture_end_ms bigint, p_mime_type text, p_byte_size bigint,
  p_sha256 text, p_mutation_id uuid, p_storage_path text, p_client_stats jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
  receipt public.agenda_meeting_segment_receipts%ROWTYPE;
  settings public.agenda_meeting_runtime_config%ROWTYPE;
  used_bytes bigint;
  expected_prefix text;
  revived boolean := false;
BEGIN
  IF p_actor_user_id IS NULL OR p_session_id IS NULL OR p_segment_id IS NULL OR p_mutation_id IS NULL
     OR p_sequence IS NULL OR p_sequence < 0 OR p_sequence > 10000
     OR p_capture_start_ms IS NULL OR p_capture_end_ms IS NULL
     OR p_capture_start_ms < 0 OR p_capture_end_ms <= p_capture_start_ms
     OR p_capture_end_ms > 14400000
     OR p_byte_size IS NULL OR p_byte_size <= 44 OR p_byte_size > 2097152
     OR lower(COALESCE(p_sha256,'')) !~ '^[0-9a-f]{64}$'
     OR lower(COALESCE(p_mime_type,'')) <> 'audio/wav'
     OR NULLIF(btrim(p_storage_path),'') IS NULL
     OR jsonb_typeof(COALESCE(p_client_stats,'{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_SEGMENT';
  END IF;

  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR meeting.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;
  IF meeting.pipeline <> 'audio_gemini_v1' THEN RAISE EXCEPTION 'AGENDA_MEETING_PIPELINE_CONFLICT'; END IF;
  IF NOT public.agenda_meeting_actor_allowed(
    p_actor_user_id,'transcribe_segment',meeting.org_id,meeting.event_id,meeting.id
  ) THEN RAISE EXCEPTION 'AGENDA_MEETING_FORBIDDEN'; END IF;
  IF meeting.capture_state = 'cancelled' OR meeting.processing_state IN ('cancelled','completed') THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION';
  END IF;
  IF meeting.closed_sequence IS NOT NULL AND p_sequence > meeting.closed_sequence THEN
    RAISE EXCEPTION 'AGENDA_MEETING_SEQUENCE_CLOSED';
  END IF;
  expected_prefix := meeting.org_id::text || '/' || meeting.event_id::text || '/' || meeting.id::text || '/';
  IF left(p_storage_path, length(expected_prefix)) <> expected_prefix THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_SEGMENT';
  END IF;

  settings := public.agenda_meeting_runtime_settings();
  IF p_capture_end_ms > settings.max_active_duration_ms THEN
    RAISE EXCEPTION 'AGENDA_MEETING_DURATION_LIMIT_REACHED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text || ':' || p_sequence::text, 0));
  SELECT * INTO receipt FROM public.agenda_meeting_segment_receipts
   WHERE session_id = p_session_id AND (sequence = p_sequence OR segment_id = p_segment_id)
   FOR UPDATE;

  IF FOUND THEN
    IF receipt.sequence <> p_sequence OR receipt.segment_id <> p_segment_id
       OR receipt.capture_start_ms <> p_capture_start_ms OR receipt.capture_end_ms <> p_capture_end_ms
       OR (receipt.sha256 IS NOT NULL AND receipt.sha256 <> lower(p_sha256))
       OR (receipt.byte_size IS NOT NULL AND receipt.byte_size <> p_byte_size) THEN
      RAISE EXCEPTION 'AGENDA_MEETING_SEGMENT_CONFLICT';
    END IF;
    -- A part declared lost by the client janitor can still be recovered while the
    -- transcript has not been assembled; afterwards the gap stays explicit.
    IF receipt.status = 'lost' AND NOT EXISTS (
      SELECT 1 FROM public.agenda_meeting_transcript_versions version WHERE version.session_id = meeting.id
    ) THEN
      UPDATE public.agenda_meeting_segment_receipts
         SET status='accepted', mime_type=lower(p_mime_type), byte_size=p_byte_size, sha256=lower(p_sha256),
             audio_storage_path=p_storage_path, audio_deleted_at=NULL, lost_at=NULL, error_code=NULL,
             client_audio_stats=COALESCE(p_client_stats,'{}'::jsonb), attempt_count=attempt_count+1, updated_at=now()
       WHERE id = receipt.id RETURNING * INTO receipt;
      revived := true;
    ELSIF receipt.audio_storage_path IS NULL AND receipt.status <> 'lost' THEN
      RAISE EXCEPTION 'AGENDA_MEETING_PIPELINE_CONFLICT';
    END IF;
  ELSE
    SELECT COALESCE(sum(byte_size),0) INTO used_bytes
      FROM public.agenda_meeting_segment_receipts WHERE session_id = meeting.id AND audio_storage_path IS NOT NULL;
    IF used_bytes + p_byte_size > settings.max_session_audio_bytes THEN
      RAISE EXCEPTION 'AGENDA_MEETING_AUDIO_BUDGET_EXCEEDED';
    END IF;
    INSERT INTO public.agenda_meeting_segment_receipts (
      session_id, org_id, event_id, segment_id, sequence, capture_start_ms, capture_end_ms,
      mime_type, byte_size, sha256, mutation_id, status, audio_storage_path, client_audio_stats
    ) VALUES (
      meeting.id, meeting.org_id, meeting.event_id, p_segment_id, p_sequence, p_capture_start_ms, p_capture_end_ms,
      lower(p_mime_type), p_byte_size, lower(p_sha256), p_mutation_id, 'accepted', p_storage_path,
      COALESCE(p_client_stats,'{}'::jsonb)
    ) RETURNING * INTO receipt;
    revived := true;
  END IF;

  IF revived THEN
    INSERT INTO public.agenda_meeting_processing_jobs (session_id, org_id, event_id, kind, dedupe_key, receipt_id)
    VALUES (meeting.id, meeting.org_id, meeting.event_id, 'transcribe_segment',
            'receipt:' || receipt.id::text || ':' || receipt.attempt_count::text, receipt.id)
    ON CONFLICT (session_id, kind, dedupe_key) DO NOTHING;
    UPDATE public.agenda_meeting_sessions
       SET last_received_sequence = GREATEST(last_received_sequence, p_sequence),
           active_duration_ms = GREATEST(active_duration_ms, LEAST(p_capture_end_ms, 14400000)),
           heartbeat_at = CASE WHEN capture_state IN ('recording','paused') THEN now() ELSE heartbeat_at END,
           processing_state = CASE WHEN processing_state = 'accepting_segments' THEN 'transcribing' ELSE processing_state END,
           updated_at = now()
     WHERE id = meeting.id;
    PERFORM public.agenda_meeting_write_audit(
      meeting.id, p_actor_user_id, 'user', 'audio_segment_accepted', 'segment', p_segment_id, p_mutation_id,
      jsonb_build_object('sequence', p_sequence, 'byteSize', p_byte_size, 'durationMs', p_capture_end_ms - p_capture_start_ms)
    );
  END IF;

  RETURN jsonb_build_object(
    'receiptId', receipt.id,
    'segmentId', receipt.segment_id,
    'sequence', receipt.sequence,
    'status', CASE WHEN receipt.status = 'lost' THEN 'terminal_error' ELSE receipt.status END,
    'canonicalReceiptId', CASE WHEN receipt.status = 'transcribed' THEN receipt.id ELSE NULL END,
    'retryAfterMs', NULL,
    'errorCode', receipt.error_code,
    'durable', receipt.audio_storage_path IS NOT NULL OR receipt.status = 'transcribed'
  );
END;
$$;

-- 8. Queue claim with kind filter and provider pause ---------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_meeting_claim_jobs_v2(
  p_batch_size integer DEFAULT 2, p_lease_seconds integer DEFAULT 360, p_kinds text[] DEFAULT NULL
) RETURNS SETOF public.agenda_meeting_processing_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE
  expired_job public.agenda_meeting_processing_jobs%ROWTYPE;
  batch_size integer := LEAST(8, GREATEST(1, COALESCE(p_batch_size, 2)));
  lease_seconds integer := LEAST(390, GREATEST(30, COALESCE(p_lease_seconds, 360)));
  paused boolean;
BEGIN
  FOR expired_job IN
    SELECT * FROM public.agenda_meeting_processing_jobs job
     WHERE job.status='in_flight' AND job.lease_expires_at <= now() AND job.attempts >= job.max_attempts
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.agenda_meeting_processing_jobs
       SET status='dead_letter', lease_token=NULL, lease_expires_at=NULL,
           last_error_code=COALESCE(last_error_code,'worker_lease_exhausted'), updated_at=now()
     WHERE id=expired_job.id;
    IF expired_job.kind = 'transcribe_segment' THEN
      UPDATE public.agenda_meeting_segment_receipts
         SET status='retryable_error', error_code='worker_lease_exhausted', updated_at=now()
       WHERE id=expired_job.receipt_id AND status IN ('accepted','processing');
      UPDATE public.agenda_meeting_sessions
         SET last_error_code='transcription_worker_lease_exhausted', last_error_at=now(),
             processing_state=CASE WHEN closed_sequence IS NOT NULL THEN 'failed' ELSE processing_state END,
             version=version+1, updated_at=now()
       WHERE id=expired_job.session_id AND processing_state NOT IN ('completed','cancelled');
    ELSE
      UPDATE public.agenda_meeting_sessions
         SET processing_state='failed', last_error_code='worker_lease_exhausted', last_error_at=now(),
             version=version+1, updated_at=now()
       WHERE id=expired_job.session_id AND processing_state NOT IN ('completed','cancelled');
    END IF;
    PERFORM public.agenda_meeting_write_audit(
      expired_job.session_id,NULL,'service','processing_job_dead_lettered','processing_job',
      expired_job.id,NULL,jsonb_build_object('errorCode','worker_lease_exhausted','attempts',expired_job.attempts,'kind',expired_job.kind)
    );
  END LOOP;

  SELECT COALESCE(config.provider_paused_until > now(), false) INTO paused
    FROM public.agenda_meeting_runtime_settings() config;

  RETURN QUERY
  WITH candidates AS (
    SELECT job.id FROM public.agenda_meeting_processing_jobs job
     WHERE ((job.status IN ('queued','retry_wait') AND job.available_at <= now())
            OR (job.status='in_flight' AND job.lease_expires_at <= now() AND job.attempts < job.max_attempts))
       AND job.attempts < job.max_attempts
       AND (p_kinds IS NULL OR job.kind = ANY (p_kinds))
       AND (NOT paused OR job.kind = 'assemble_transcript')
     ORDER BY CASE job.kind WHEN 'assemble_transcript' THEN 0 WHEN 'transcribe_segment' THEN 1 ELSE 2 END,
              job.available_at, job.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT batch_size
  )
  UPDATE public.agenda_meeting_processing_jobs job
     SET status='in_flight', attempts=job.attempts+1, lease_token=gen_random_uuid(),
         lease_expires_at=now()+make_interval(secs => lease_seconds), updated_at=now()
    FROM candidates WHERE job.id=candidates.id
  RETURNING job.*;
END;
$$;

-- 9. Transcription job outcome ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_meeting_complete_transcription_job(
  p_job_id uuid, p_lease_token uuid, p_transcript text, p_provider_request_id text,
  p_provider_model text, p_usage jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE
  job public.agenda_meeting_processing_jobs%ROWTYPE;
  meeting public.agenda_meeting_sessions%ROWTYPE;
  receipt public.agenda_meeting_segment_receipts%ROWTYPE;
  normalized text;
  transcript_hash text;
  segment_row_id uuid;
BEGIN
  SELECT * INTO job FROM public.agenda_meeting_processing_jobs
   WHERE id=p_job_id AND lease_token=p_lease_token AND status='in_flight' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_JOB_LEASE_CONFLICT'; END IF;
  IF job.kind <> 'transcribe_segment' OR job.receipt_id IS NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_JOB_KIND_CONFLICT'; END IF;
  IF NULLIF(btrim(p_provider_request_id),'') IS NULL OR NULLIF(btrim(p_provider_model),'') IS NULL THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_CALLBACK';
  END IF;

  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id=job.session_id FOR UPDATE;
  SELECT * INTO receipt FROM public.agenda_meeting_segment_receipts
   WHERE id=job.receipt_id AND session_id=job.session_id FOR UPDATE;
  -- Late results never recreate content of a cancelled/deleted session or a part already resolved.
  IF meeting.id IS NULL OR meeting.deleted_at IS NOT NULL OR meeting.processing_state='cancelled'
     OR receipt.id IS NULL OR receipt.status NOT IN ('accepted','processing','retryable_error','transcribed') THEN
    UPDATE public.agenda_meeting_processing_jobs
       SET status='cancelled', lease_token=NULL, lease_expires_at=NULL, updated_at=now()
     WHERE id=job.id;
    RETURN jsonb_build_object('jobId',job.id,'discarded',true);
  END IF;

  normalized := btrim(regexp_replace(COALESCE(p_transcript,''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'));
  IF length(normalized) > 60000 THEN RAISE EXCEPTION 'AGENDA_MEETING_TRANSCRIPT_TOO_LARGE'; END IF;

  IF receipt.status <> 'transcribed' THEN
    transcript_hash := encode(extensions.digest(convert_to(normalized,'UTF8'),'sha256'),'hex');
    INSERT INTO public.agenda_meeting_transcript_segments (
      session_id, org_id, event_id, receipt_id, segment_id, sequence, transcript_text, words,
      duration_ms, confidence, provider_request_id, provider_model, provider_language, content_hash
    ) VALUES (
      receipt.session_id, receipt.org_id, receipt.event_id, receipt.id, receipt.segment_id, receipt.sequence,
      normalized, '[]'::jsonb, receipt.capture_end_ms - receipt.capture_start_ms, NULL,
      left(btrim(p_provider_request_id),200), left(btrim(p_provider_model),120), 'pt-BR', transcript_hash
    ) ON CONFLICT (receipt_id) DO NOTHING
    RETURNING id INTO segment_row_id;

    UPDATE public.agenda_meeting_segment_receipts
       SET status='transcribed', provider_request_id=left(btrim(p_provider_request_id),200),
           provider_accepted_at=COALESCE(provider_accepted_at,now()), transcribed_at=now(),
           transcription_model=left(btrim(p_provider_model),120),
           transcription_usage=CASE WHEN jsonb_typeof(COALESCE(p_usage,'{}'::jsonb))='object' THEN COALESCE(p_usage,'{}'::jsonb) ELSE '{}'::jsonb END,
           speech_detected=(normalized <> ''), retry_after_ms=NULL, error_code=NULL, updated_at=now()
     WHERE id=receipt.id;
  END IF;

  UPDATE public.agenda_meeting_processing_jobs
     SET status='succeeded', lease_token=NULL, lease_expires_at=NULL, completed_at=now(),
         provider_request_id=left(btrim(p_provider_request_id),200), last_error_code=NULL, updated_at=now()
   WHERE id=job.id;

  meeting := public.agenda_meeting_refresh_sequence_state(meeting.id);
  IF meeting.closed_sequence IS NOT NULL AND cardinality(meeting.unresolved_sequences)=0
     AND NOT EXISTS (
       SELECT 1 FROM public.agenda_meeting_processing_jobs existing
        WHERE existing.session_id=meeting.id AND existing.kind='assemble_transcript'
          AND existing.dedupe_key='closed:' || meeting.closed_sequence::text
     ) THEN
    PERFORM public.agenda_meeting_enqueue_job(meeting.id,'assemble_transcript','closed:' || meeting.closed_sequence::text);
    UPDATE public.agenda_meeting_sessions
       SET processing_state='assembling', last_error_code=NULL, last_error_at=NULL, version=version+1, updated_at=now()
     WHERE id=meeting.id;
  END IF;

  IF segment_row_id IS NOT NULL THEN
    PERFORM public.agenda_meeting_write_audit(
      meeting.id,NULL,'provider','segment_transcribed','transcript_segment',segment_row_id,NULL,
      jsonb_build_object('sequence',receipt.sequence,'speechDetected',normalized <> '','model',left(btrim(p_provider_model),120))
    );
  END IF;
  RETURN jsonb_build_object('jobId',job.id,'receiptId',receipt.id,'sequence',receipt.sequence,'speechDetected',normalized <> '');
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_fail_transcription_job(
  p_job_id uuid, p_lease_token uuid, p_error_code text, p_retry_after_seconds integer DEFAULT 30,
  p_provider_request_id text DEFAULT NULL, p_pause_provider boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  job public.agenda_meeting_processing_jobs%ROWTYPE;
  sanitized_error text;
  retry_delay integer;
  terminal boolean;
BEGIN
  SELECT * INTO job FROM public.agenda_meeting_processing_jobs
   WHERE id=p_job_id AND lease_token=p_lease_token AND status='in_flight' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_JOB_LEASE_CONFLICT'; END IF;
  IF job.kind <> 'transcribe_segment' THEN RAISE EXCEPTION 'AGENDA_MEETING_JOB_KIND_CONFLICT'; END IF;
  sanitized_error := left(regexp_replace(lower(COALESCE(NULLIF(btrim(p_error_code),''),'transcription_failed')),'[^a-z0-9_-]+','_','g'),120);
  terminal := COALESCE(p_retry_after_seconds,0) <= 0 OR job.attempts >= job.max_attempts;
  retry_delay := LEAST(900, GREATEST(COALESCE(p_retry_after_seconds,30), (power(2, LEAST(job.attempts,8))*5)::integer));

  UPDATE public.agenda_meeting_processing_jobs
     SET status=CASE WHEN terminal THEN 'dead_letter' ELSE 'retry_wait' END,
         available_at=CASE WHEN terminal THEN available_at ELSE now()+make_interval(secs => retry_delay) END,
         lease_token=NULL, lease_expires_at=NULL, last_error_code=sanitized_error,
         provider_request_id=COALESCE(left(NULLIF(btrim(p_provider_request_id),''),200), provider_request_id),
         updated_at=now()
   WHERE id=job.id;

  IF terminal THEN
    UPDATE public.agenda_meeting_segment_receipts
       SET status='retryable_error', error_code=sanitized_error, updated_at=now()
     WHERE id=job.receipt_id AND status IN ('accepted','processing');
    UPDATE public.agenda_meeting_sessions
       SET last_error_code=sanitized_error, last_error_at=now(),
           processing_state=CASE WHEN closed_sequence IS NOT NULL THEN 'failed' ELSE processing_state END,
           version=version+1, updated_at=now()
     WHERE id=job.session_id AND processing_state NOT IN ('completed','cancelled');
  ELSE
    UPDATE public.agenda_meeting_segment_receipts
       SET error_code=sanitized_error, updated_at=now()
     WHERE id=job.receipt_id AND status IN ('accepted','processing');
  END IF;

  IF p_pause_provider THEN
    UPDATE public.agenda_meeting_runtime_config
       SET provider_paused_until=now()+interval '15 minutes', provider_pause_reason=sanitized_error, updated_at=now()
     WHERE id;
  END IF;

  PERFORM public.agenda_meeting_write_audit(
    job.session_id,NULL,'service',
    CASE WHEN terminal THEN 'processing_job_dead_lettered' ELSE 'processing_job_retry_scheduled' END,
    'processing_job',job.id,NULL,
    jsonb_build_object('kind',job.kind,'errorCode',sanitized_error,'attempts',job.attempts,
                       'retryAfterSeconds',CASE WHEN terminal THEN NULL ELSE retry_delay END)
  );
  RETURN jsonb_build_object('jobId',job.id,'terminal',terminal,'retryAfterSeconds',CASE WHEN terminal THEN NULL ELSE retry_delay END);
END;
$$;
-- 10. Structured report completion ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_meeting_complete_report_job(
  p_job_id uuid, p_lease_token uuid, p_transcript_version_id uuid, p_result jsonb,
  p_provider_response_id text, p_usage jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  job public.agenda_meeting_processing_jobs%ROWTYPE;
  meeting public.agenda_meeting_sessions%ROWTYPE;
  transcript public.agenda_meeting_transcript_versions%ROWTYPE;
  minutes_id uuid;
  minutes_version integer;
  insight_group record;
  analysis_item jsonb;
  analysis_position bigint;
  evidence jsonb;
  due_date_value date;
  partial boolean;
BEGIN
  SELECT * INTO job FROM public.agenda_meeting_processing_jobs
   WHERE id=p_job_id AND lease_token=p_lease_token AND status='in_flight' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_JOB_LEASE_CONFLICT'; END IF;
  IF job.kind <> 'analysis_generate' OR job.transcript_version_id IS DISTINCT FROM p_transcript_version_id THEN
    RAISE EXCEPTION 'AGENDA_MEETING_JOB_KIND_CONFLICT';
  END IF;
  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id=job.session_id FOR UPDATE;
  IF NOT FOUND OR meeting.deleted_at IS NOT NULL THEN
    UPDATE public.agenda_meeting_processing_jobs SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=job.id;
    RETURN jsonb_build_object('jobId',job.id,'discarded',true);
  END IF;
  SELECT * INTO transcript FROM public.agenda_meeting_transcript_versions
   WHERE id=p_transcript_version_id AND session_id=meeting.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_TRANSCRIPT_NOT_READY'; END IF;
  partial := cardinality(transcript.missing_sequences) > 0;
  IF partial AND meeting.partial_analysis_confirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'AGENDA_MEETING_PARTIAL_ANALYSIS_CONFIRMATION_REQUIRED';
  END IF;
  IF jsonb_typeof(p_result) <> 'object'
     OR jsonb_typeof(p_result->'report') <> 'object'
     OR NULLIF(btrim(p_result->>'title'),'') IS NULL
     OR NULLIF(btrim(p_result->>'executiveSummary'),'') IS NULL
     OR NULLIF(btrim(p_result->>'minutesMarkdown'),'') IS NULL
     OR NULLIF(btrim(p_result->>'analysisModel'),'') IS NULL
     OR NULLIF(btrim(p_result->>'promptVersion'),'') IS NULL
     OR NULLIF(btrim(p_result->>'schemaVersion'),'') IS NULL
     OR jsonb_typeof(p_result->'decisions') <> 'array'
     OR jsonb_typeof(p_result->'pendingItems') <> 'array'
     OR jsonb_typeof(p_result->'risks') <> 'array'
     OR jsonb_typeof(p_result->'importantPoints') <> 'array'
     OR jsonb_typeof(p_result->'nextSteps') <> 'array'
     OR jsonb_typeof(p_result->'nextMeetings') <> 'array'
     OR jsonb_typeof(p_result->'actionItems') <> 'array' THEN
    RAISE EXCEPTION 'AGENDA_MEETING_ANALYSIS_SCHEMA_INVALID';
  END IF;

  -- One logical report per job (automatic: one per transcript version; regenerations are explicit jobs).
  SELECT id INTO minutes_id FROM public.agenda_meeting_minutes_versions
   WHERE session_id=meeting.id AND generation_key='job:' || job.id::text;
  IF minutes_id IS NOT NULL THEN
    UPDATE public.agenda_meeting_processing_jobs SET status='succeeded',lease_token=NULL,lease_expires_at=NULL,completed_at=now(),updated_at=now() WHERE id=job.id;
    RETURN jsonb_build_object('jobId',job.id,'minutesVersionId',minutes_id,'duplicate',true);
  END IF;

  UPDATE public.agenda_meeting_minutes_versions SET status='superseded'
   WHERE session_id=meeting.id AND status IN ('draft','changes_requested');
  SELECT COALESCE(max(version),0)+1 INTO minutes_version
    FROM public.agenda_meeting_minutes_versions WHERE session_id=meeting.id;
  INSERT INTO public.agenda_meeting_minutes_versions (
    session_id,org_id,event_id,transcript_version_id,version,status,title,summary,
    minutes_markdown,transcript_coverage,analysis_model,reasoning_effort,prompt_version,schema_version,
    provider_response_id,provider_usage,report,report_format,is_partial,generation_key
  ) VALUES (
    meeting.id,meeting.org_id,meeting.event_id,transcript.id,minutes_version,'draft',
    btrim(p_result->>'title'),btrim(p_result->>'executiveSummary'),btrim(p_result->>'minutesMarkdown'),
    CASE WHEN partial THEN 'with_gaps' ELSE 'complete' END,
    btrim(p_result->>'analysisModel'),COALESCE(NULLIF(btrim(p_result->>'reasoningEffort'),''),'medium'),
    btrim(p_result->>'promptVersion'),btrim(p_result->>'schemaVersion'),
    NULLIF(btrim(p_provider_response_id),''),
    CASE WHEN jsonb_typeof(COALESCE(p_usage,'{}'::jsonb))='object' THEN COALESCE(p_usage,'{}'::jsonb) ELSE '{}'::jsonb END,
    p_result->'report','structured_v3',partial,'job:' || job.id::text
  ) RETURNING id INTO minutes_id;

  FOR insight_group IN
    SELECT * FROM (VALUES
      ('decisions','decision'),('pendingItems','pending_item'),('risks','risk'),
      ('importantPoints','important_point'),('nextSteps','next_step'),('nextMeetings','next_meeting')
    ) AS groups(json_key,insight_type)
  LOOP
    FOR analysis_item,analysis_position IN
      SELECT item.value,item.ordinality FROM jsonb_array_elements(p_result -> (insight_group.json_key)) WITH ORDINALITY item(value,ordinality)
    LOOP
      IF jsonb_typeof(analysis_item) <> 'object' OR NULLIF(btrim(analysis_item->>'title'),'') IS NULL
         OR NULLIF(btrim(analysis_item->>'detail'),'') IS NULL THEN
        RAISE EXCEPTION 'AGENDA_MEETING_ANALYSIS_SCHEMA_INVALID';
      END IF;
      evidence := public.agenda_meeting_analysis_evidence(meeting.id,analysis_item->'evidenceSegmentIds');
      INSERT INTO public.agenda_meeting_insights (
        session_id,org_id,event_id,minutes_version_id,insight_type,position,title,description,evidence
      ) VALUES (
        meeting.id,meeting.org_id,meeting.event_id,minutes_id,insight_group.insight_type,
        analysis_position-1,btrim(analysis_item->>'title'),btrim(analysis_item->>'detail'),evidence
      );
    END LOOP;
  END LOOP;

  FOR analysis_item,analysis_position IN
    SELECT item.value,item.ordinality FROM jsonb_array_elements(p_result->'actionItems') WITH ORDINALITY item(value,ordinality)
  LOOP
    IF jsonb_typeof(analysis_item) <> 'object' OR NULLIF(btrim(analysis_item->>'title'),'') IS NULL
       OR NULLIF(btrim(analysis_item->>'description'),'') IS NULL THEN
      RAISE EXCEPTION 'AGENDA_MEETING_ANALYSIS_SCHEMA_INVALID';
    END IF;
    evidence := public.agenda_meeting_analysis_evidence(meeting.id,analysis_item->'evidenceSegmentIds');
    due_date_value := CASE WHEN NULLIF(btrim(analysis_item->>'dueDate'),'') IS NULL THEN NULL ELSE (analysis_item->>'dueDate')::date END;
    INSERT INTO public.agenda_meeting_action_items (
      session_id,org_id,event_id,minutes_version_id,position,title,description,responsible_text,
      suggested_user_id,due_date_text,due_date,due_date_confirmed,status,evidence
    ) VALUES (
      meeting.id,meeting.org_id,meeting.event_id,minutes_id,analysis_position-1,
      btrim(analysis_item->>'title'),btrim(analysis_item->>'description'),
      NULLIF(btrim(analysis_item->>'responsibleText'),''),NULL,
      NULLIF(btrim(analysis_item->>'dueDateText'),''),due_date_value,false,'proposed',evidence
    );
  END LOOP;

  UPDATE public.agenda_meeting_processing_jobs
     SET status='succeeded',lease_token=NULL,lease_expires_at=NULL,completed_at=now(),
         provider_request_id=NULLIF(btrim(p_provider_response_id),''),updated_at=now()
   WHERE id=job.id;
  UPDATE public.agenda_meeting_sessions
     SET processing_state='review_required',analysis_model=btrim(p_result->>'analysisModel'),
         analysis_reasoning_effort=COALESCE(NULLIF(btrim(p_result->>'reasoningEffort'),''),'medium'),
         last_error_code=NULL,last_error_at=NULL,version=version+1,updated_at=now()
   WHERE id=meeting.id RETURNING * INTO meeting;
  PERFORM public.agenda_meeting_write_audit(
    meeting.id,NULL,'service','analysis_version_created','minutes_version',minutes_id,NULL,
    jsonb_build_object('minutesVersion',minutes_version,'analysisModel',meeting.analysis_model,
      'promptVersion',p_result->>'promptVersion','schemaVersion',p_result->>'schemaVersion',
      'coverage',CASE WHEN partial THEN 'with_gaps' ELSE 'complete' END,
      'providerResponseId',NULLIF(btrim(p_provider_response_id),''))
  );
  RETURN jsonb_build_object('jobId',job.id,'minutesVersionId',minutes_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_pause_provider(p_reason text, p_minutes integer DEFAULT 15)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  UPDATE public.agenda_meeting_runtime_config
     SET provider_paused_until = now() + make_interval(mins => LEAST(120, GREATEST(1, COALESCE(p_minutes,15)))),
         provider_pause_reason = left(regexp_replace(lower(COALESCE(p_reason,'provider_paused')),'[^a-z0-9_-]+','_','g'),120),
         updated_at = now()
   WHERE id;
$$;

-- 11. Artifacts and storage housekeeping -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_meeting_register_artifact(
  p_session_id uuid, p_kind text, p_source_version_id uuid, p_source_hash text, p_renderer_version text,
  p_storage_path text, p_byte_size bigint, p_sha256 text, p_actor_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
  artifact public.agenda_meeting_artifacts%ROWTYPE;
BEGIN
  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR meeting.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;
  IF p_kind = 'report_pdf' THEN
    IF NOT EXISTS (SELECT 1 FROM public.agenda_meeting_minutes_versions m WHERE m.id=p_source_version_id AND m.session_id=meeting.id) THEN
      RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND';
    END IF;
  ELSIF p_kind IN ('transcript_pdf','transcript_txt') THEN
    IF NOT EXISTS (SELECT 1 FROM public.agenda_meeting_transcript_versions t WHERE t.id=p_source_version_id AND t.session_id=meeting.id) THEN
      RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND';
    END IF;
  ELSE
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_REQUEST';
  END IF;
  INSERT INTO public.agenda_meeting_artifacts (
    session_id,org_id,event_id,kind,source_version_id,source_content_hash,renderer_version,
    storage_path,byte_size,sha256,created_by
  ) VALUES (
    meeting.id,meeting.org_id,meeting.event_id,p_kind,p_source_version_id,lower(p_source_hash),p_renderer_version,
    p_storage_path,p_byte_size,lower(p_sha256),p_actor_user_id
  ) ON CONFLICT (session_id,kind,source_version_id,renderer_version) DO NOTHING
  RETURNING * INTO artifact;
  IF artifact.id IS NULL THEN
    SELECT * INTO artifact FROM public.agenda_meeting_artifacts
     WHERE session_id=meeting.id AND kind=p_kind AND source_version_id=p_source_version_id AND renderer_version=p_renderer_version;
    RETURN jsonb_build_object('id',artifact.id,'storagePath',artifact.storage_path,'created',false);
  END IF;
  PERFORM public.agenda_meeting_write_audit(
    meeting.id,p_actor_user_id,'user','artifact_exported','artifact',artifact.id,NULL,
    jsonb_build_object('kind',p_kind,'sourceVersionId',p_source_version_id,'byteSize',p_byte_size)
  );
  RETURN jsonb_build_object('id',artifact.id,'storagePath',artifact.storage_path,'created',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_audio_cleanup_candidates(p_limit integer DEFAULT 100)
RETURNS TABLE(receipt_id uuid, storage_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT receipt.id, receipt.audio_storage_path
    FROM public.agenda_meeting_segment_receipts receipt
    JOIN public.agenda_meeting_sessions meeting ON meeting.id = receipt.session_id
    CROSS JOIN LATERAL (SELECT audio_retention_hours FROM public.agenda_meeting_runtime_settings()) settings
   WHERE receipt.audio_storage_path IS NOT NULL
     AND receipt.audio_deleted_at IS NULL
     AND (
       meeting.processing_state = 'cancelled' OR meeting.capture_state = 'cancelled'
       OR receipt.created_at < now() - interval '14 days'
       OR (receipt.status IN ('transcribed','lost') AND EXISTS (
         SELECT 1 FROM public.agenda_meeting_transcript_versions version
          WHERE version.session_id = meeting.id AND version.kind = 'canonical'
            AND version.created_at < now() - make_interval(hours => settings.audio_retention_hours)
       ))
     )
   ORDER BY receipt.created_at
   LIMIT LEAST(500, GREATEST(1, COALESCE(p_limit, 100)));
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_mark_audio_deleted(p_receipt_ids uuid[])
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH updated AS (
    UPDATE public.agenda_meeting_segment_receipts
       SET audio_deleted_at = now(), updated_at = now()
     WHERE id = ANY (COALESCE(p_receipt_ids, '{}'::uuid[])) AND audio_deleted_at IS NULL
    RETURNING id
  ) SELECT count(*)::integer FROM updated;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_recent_deleted_sessions(p_since timestamptz)
RETURNS TABLE(org_id uuid, event_id uuid, session_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT tombstone.org_id, tombstone.event_id, tombstone.session_id
    FROM public.agenda_meeting_administrative_tombstones tombstone
   WHERE tombstone.deleted_at >= COALESCE(p_since, now() - interval '1 day')
   ORDER BY tombstone.deleted_at DESC
   LIMIT 200;
$$;
-- 12. Control actions of the audio pipeline ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_meeting_control_v3(
  p_action text, p_actor_user_id uuid, p_org_id uuid, p_event_id uuid, p_session_id uuid,
  p_mutation_id uuid, p_expected_version bigint DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
  settings public.agenda_meeting_runtime_config%ROWTYPE;
  target_transcript public.agenda_meeting_transcript_versions%ROWTYPE;
  target_minutes public.agenda_meeting_minutes_versions%ROWTYPE;
  existing_response jsonb;
  auth_action text;
  artifact_paths jsonb := '[]'::jsonb;
  requeued integer := 0;
  failed_receipt record;
  gap_sequence integer;
  generated_count integer;
  response jsonb;
BEGIN
  IF p_action NOT IN ('retry_transcription','accept_transcription_gaps','regenerate_report','delete_report') THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_ACTION';
  END IF;
  IF p_actor_user_id IS NULL OR p_org_id IS NULL OR p_event_id IS NULL OR p_session_id IS NULL OR p_mutation_id IS NULL THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_REQUEST';
  END IF;
  auth_action := CASE p_action
    WHEN 'accept_transcription_gaps' THEN 'finalize'
    WHEN 'delete_report' THEN 'delete'
    ELSE 'retry_analysis' END;
  IF NOT public.agenda_meeting_actor_allowed(p_actor_user_id, auth_action, p_org_id, p_event_id, p_session_id) THEN
    RAISE EXCEPTION 'AGENDA_MEETING_FORBIDDEN';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text || ':' || p_action || ':' || p_mutation_id::text, 0));
  SELECT mutation.response INTO existing_response
    FROM public.agenda_meeting_mutation_receipts mutation
   WHERE mutation.actor_user_id=p_actor_user_id AND mutation.action=p_action AND mutation.mutation_id=p_mutation_id;
  IF existing_response IS NOT NULL THEN
    RETURN COALESCE(public.agenda_meeting_detail_json(p_session_id), '{}'::jsonb)
      || jsonb_build_object('replayed', true, 'removedArtifactPaths', COALESCE(existing_response->'removedArtifactPaths','[]'::jsonb));
  END IF;

  SELECT * INTO meeting FROM public.agenda_meeting_sessions
   WHERE id=p_session_id AND org_id=p_org_id AND event_id=p_event_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;
  IF p_expected_version IS NOT NULL AND meeting.version <> p_expected_version THEN
    RAISE EXCEPTION 'AGENDA_MEETING_VERSION_CONFLICT:%', meeting.version;
  END IF;
  settings := public.agenda_meeting_runtime_settings();

  IF p_action = 'retry_transcription' THEN
    IF meeting.processing_state IN ('cancelled') THEN RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION'; END IF;
    FOR failed_receipt IN
      SELECT receipt.* FROM public.agenda_meeting_segment_receipts receipt
       WHERE receipt.session_id=meeting.id
         AND receipt.audio_storage_path IS NOT NULL AND receipt.audio_deleted_at IS NULL
         AND (receipt.status='retryable_error'
              OR (receipt.status IN ('accepted','processing') AND NOT EXISTS (
                    SELECT 1 FROM public.agenda_meeting_processing_jobs job
                     WHERE job.receipt_id=receipt.id AND job.status IN ('queued','retry_wait','in_flight'))))
       FOR UPDATE OF receipt
    LOOP
      UPDATE public.agenda_meeting_segment_receipts
         SET status='accepted', error_code=NULL, attempt_count=attempt_count+1, updated_at=now()
       WHERE id=failed_receipt.id;
      INSERT INTO public.agenda_meeting_processing_jobs (session_id,org_id,event_id,kind,dedupe_key,receipt_id)
      VALUES (meeting.id,meeting.org_id,meeting.event_id,'transcribe_segment',
              'receipt:' || failed_receipt.id::text || ':retry:' || p_mutation_id::text, failed_receipt.id)
      ON CONFLICT (session_id,kind,dedupe_key) DO NOTHING;
      requeued := requeued + 1;
    END LOOP;
    IF meeting.closed_sequence IS NOT NULL THEN
      meeting := public.agenda_meeting_refresh_sequence_state(meeting.id);
      IF cardinality(meeting.unresolved_sequences)=0 AND EXISTS (
           SELECT 1 FROM public.agenda_meeting_processing_jobs job
            WHERE job.session_id=meeting.id AND job.kind='assemble_transcript' AND job.status='dead_letter')
         AND NOT EXISTS (
           SELECT 1 FROM public.agenda_meeting_processing_jobs job
            WHERE job.session_id=meeting.id AND job.kind='assemble_transcript' AND job.status IN ('queued','retry_wait','in_flight')) THEN
        PERFORM public.agenda_meeting_enqueue_job(meeting.id,'assemble_transcript','closed:' || meeting.closed_sequence::text || ':retry:' || p_mutation_id::text);
        requeued := requeued + 1;
      END IF;
    END IF;
    UPDATE public.agenda_meeting_runtime_config SET provider_paused_until=NULL, provider_pause_reason=NULL, updated_at=now(), updated_by=p_actor_user_id
     WHERE id AND provider_paused_until IS NOT NULL;
    UPDATE public.agenda_meeting_sessions
       SET processing_state=CASE
             WHEN processing_state='failed' AND closed_sequence IS NOT NULL THEN 'awaiting_client_replay'
             WHEN processing_state='failed' THEN 'transcribing'
             ELSE processing_state END,
           last_error_code=NULL, last_error_at=NULL, version=version+1, updated_at=now()
     WHERE id=meeting.id RETURNING * INTO meeting;
    PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','transcription_retry_requested','session',meeting.id,p_mutation_id,
      jsonb_build_object('requeued',requeued));

  ELSIF p_action = 'accept_transcription_gaps' THEN
    IF meeting.closed_sequence IS NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION'; END IF;
    meeting := public.agenda_meeting_refresh_sequence_state(meeting.id);
    FOREACH gap_sequence IN ARRAY meeting.unresolved_sequences LOOP
      UPDATE public.agenda_meeting_processing_jobs
         SET status='cancelled', lease_token=NULL, lease_expires_at=NULL, updated_at=now()
       WHERE session_id=meeting.id AND kind='transcribe_segment' AND status IN ('queued','retry_wait')
         AND receipt_id IN (SELECT id FROM public.agenda_meeting_segment_receipts WHERE session_id=meeting.id AND sequence=gap_sequence);
      INSERT INTO public.agenda_meeting_segment_receipts (
        session_id,org_id,event_id,segment_id,sequence,capture_start_ms,capture_end_ms,mutation_id,status,lost_at,error_code
      ) VALUES (
        meeting.id,meeting.org_id,meeting.event_id,gen_random_uuid(),gap_sequence,0,1,gen_random_uuid(),'lost',now(),'gap_accepted_by_user'
      )
      ON CONFLICT (session_id,sequence) DO UPDATE
        SET status=CASE WHEN public.agenda_meeting_segment_receipts.status='transcribed' THEN 'transcribed' ELSE 'lost' END,
            lost_at=CASE WHEN public.agenda_meeting_segment_receipts.status='transcribed' THEN public.agenda_meeting_segment_receipts.lost_at ELSE now() END,
            error_code=CASE WHEN public.agenda_meeting_segment_receipts.status='transcribed' THEN public.agenda_meeting_segment_receipts.error_code
                            ELSE COALESCE(public.agenda_meeting_segment_receipts.error_code,'gap_accepted_by_user') END,
            updated_at=now();
    END LOOP;
    meeting := public.agenda_meeting_refresh_sequence_state(meeting.id);
    IF cardinality(meeting.unresolved_sequences)=0 THEN
      PERFORM public.agenda_meeting_enqueue_job(meeting.id,'assemble_transcript','closed:' || meeting.closed_sequence::text || ':gaps:' || p_mutation_id::text);
      UPDATE public.agenda_meeting_sessions
         SET processing_state='assembling', last_error_code=NULL, last_error_at=NULL, version=version+1, updated_at=now()
       WHERE id=meeting.id RETURNING * INTO meeting;
    END IF;
    PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','transcription_gaps_accepted','session',meeting.id,p_mutation_id,
      jsonb_build_object('missingSequences',to_jsonb(meeting.missing_sequences)));

  ELSIF p_action = 'regenerate_report' THEN
    SELECT * INTO target_transcript FROM public.agenda_meeting_transcript_versions
     WHERE session_id=meeting.id
       AND (NULLIF(p_payload->>'transcriptVersionId','') IS NULL OR id=(p_payload->>'transcriptVersionId')::uuid)
     ORDER BY version DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_TRANSCRIPT_NOT_READY'; END IF;
    IF NULLIF(btrim(target_transcript.transcript_text),'') IS NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_TRANSCRIPT_HAS_NO_SPEECH'; END IF;
    IF cardinality(target_transcript.missing_sequences)>0 AND meeting.partial_analysis_confirmed IS NOT TRUE
       AND COALESCE((p_payload->>'allowPartial')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'AGENDA_MEETING_PARTIAL_ANALYSIS_CONFIRMATION_REQUIRED';
    END IF;
    SELECT count(*) INTO generated_count FROM public.agenda_meeting_processing_jobs
     WHERE session_id=meeting.id AND kind='analysis_generate' AND status<>'cancelled';
    IF generated_count >= settings.max_report_generations_per_session THEN
      RAISE EXCEPTION 'AGENDA_MEETING_REPORT_LIMIT_REACHED';
    END IF;
    IF EXISTS (SELECT 1 FROM public.agenda_meeting_processing_jobs WHERE session_id=meeting.id AND kind='analysis_generate' AND status IN ('queued','retry_wait','in_flight')) THEN
      RAISE EXCEPTION 'AGENDA_MEETING_REPORT_ALREADY_QUEUED';
    END IF;
    PERFORM public.agenda_meeting_enqueue_job(meeting.id,'analysis_generate','regenerate:' || p_mutation_id::text,target_transcript.id);
    UPDATE public.agenda_meeting_sessions
       SET processing_state='analysis_queued', last_error_code=NULL, last_error_at=NULL,
           partial_analysis_confirmed=partial_analysis_confirmed OR COALESCE((p_payload->>'allowPartial')::boolean,false),
           version=version+1, updated_at=now()
     WHERE id=meeting.id RETURNING * INTO meeting;
    PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','report_regeneration_requested','transcript_version',target_transcript.id,p_mutation_id);

  ELSIF p_action = 'delete_report' THEN
    SELECT * INTO target_minutes FROM public.agenda_meeting_minutes_versions
     WHERE id=(p_payload->>'minutesVersionId')::uuid AND session_id=meeting.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;
    SELECT COALESCE(jsonb_agg(artifact.storage_path),'[]'::jsonb) INTO artifact_paths
      FROM public.agenda_meeting_artifacts artifact
     WHERE artifact.session_id=meeting.id AND artifact.source_version_id=target_minutes.id;
    DELETE FROM public.agenda_meeting_artifacts WHERE session_id=meeting.id AND source_version_id=target_minutes.id;
    DELETE FROM public.agenda_meeting_minutes_versions WHERE id=target_minutes.id;
    UPDATE public.agenda_meeting_sessions
       SET processing_state=CASE
             WHEN processing_state IN ('review_required','completed')
                  AND NOT EXISTS (SELECT 1 FROM public.agenda_meeting_minutes_versions m WHERE m.session_id=meeting.id)
             THEN CASE WHEN cardinality(missing_sequences)>0 THEN 'partial_transcript' ELSE 'transcript_complete' END
             ELSE processing_state END,
           version=version+1, updated_at=now()
     WHERE id=meeting.id RETURNING * INTO meeting;
    PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','minutes_version_deleted','minutes_version',target_minutes.id,p_mutation_id,
      jsonb_build_object('version',target_minutes.version,'artifactCount',jsonb_array_length(artifact_paths)));
  END IF;

  response := jsonb_build_object('sessionId',meeting.id,'sessionVersion',meeting.version,'action',p_action,'removedArtifactPaths',artifact_paths);
  INSERT INTO public.agenda_meeting_mutation_receipts (actor_user_id,org_id,event_id,action,mutation_id,session_id,response)
  VALUES (p_actor_user_id,p_org_id,p_event_id,p_action,p_mutation_id,meeting.id,response);
  RETURN public.agenda_meeting_detail_json(meeting.id) || jsonb_build_object('removedArtifactPaths',artifact_paths);
END;
$$;
-- 13. Detail/summary payloads (wrappers keep the audited base bodies intact)
ALTER FUNCTION public.agenda_meeting_session_summary_json(uuid) RENAME TO agenda_meeting_session_summary_json_base;
ALTER FUNCTION public.agenda_meeting_detail_json(uuid) RENAME TO agenda_meeting_detail_json_base;

CREATE FUNCTION public.agenda_meeting_session_summary_json(p_session_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.agenda_meeting_session_summary_json_base(meeting.id) || jsonb_build_object(
    'pipeline',meeting.pipeline,'sttProvider',meeting.stt_provider,'sttModel',meeting.stt_model,
    'analysisModel',meeting.analysis_model,'errorCode',meeting.last_error_code)
  FROM public.agenda_meeting_sessions meeting WHERE meeting.id=p_session_id;
$$;

CREATE FUNCTION public.agenda_meeting_detail_json(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  base jsonb;
  meeting public.agenda_meeting_sessions%ROWTYPE;
  settings public.agenda_meeting_runtime_config%ROWTYPE;
  extra jsonb;
  minutes_payload jsonb;
  artifacts_payload jsonb;
BEGIN
  base := public.agenda_meeting_detail_json_base(p_session_id);
  IF base IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id=p_session_id;
  settings := public.agenda_meeting_runtime_settings();
  SELECT jsonb_build_object(
      'unresolvedSequences',to_jsonb(meeting.unresolved_sequences),
      'missingSequences',to_jsonb(meeting.missing_sequences),
      'closedSequence',meeting.closed_sequence,
      'partialAnalysisConfirmed',meeting.partial_analysis_confirmed,
      'providerPaused',COALESCE(settings.provider_paused_until > now(),false),
      'audioRetentionHours',settings.audio_retention_hours,
      'coverageStats',jsonb_build_object(
        'expectedSegments',CASE WHEN meeting.closed_sequence IS NULL THEN NULL ELSE meeting.closed_sequence + 1 END,
        'receivedSegments',count(*) FILTER (WHERE receipt.status <> 'lost'),
        'transcribedSegments',count(*) FILTER (WHERE receipt.status='transcribed'),
        'silentSegments',count(*) FILTER (WHERE receipt.status='transcribed' AND receipt.speech_detected IS FALSE),
        'pendingSegments',count(*) FILTER (WHERE receipt.status IN ('accepted','processing')),
        'failedSegments',count(*) FILTER (WHERE receipt.status IN ('retryable_error','terminal_error')),
        'lostSegments',count(*) FILTER (WHERE receipt.status='lost'),
        'audioBytes',COALESCE(sum(receipt.byte_size) FILTER (WHERE receipt.audio_storage_path IS NOT NULL),0),
        'audioRetainedSegments',count(*) FILTER (WHERE receipt.audio_storage_path IS NOT NULL AND receipt.audio_deleted_at IS NULL),
        'transcribedDurationMs',COALESCE(sum(receipt.capture_end_ms - receipt.capture_start_ms) FILTER (WHERE receipt.status='transcribed'),0)
      ),
      'retryableStage',CASE
        WHEN bool_or(receipt.status='retryable_error') THEN 'transcription'
        WHEN meeting.processing_state='failed' AND EXISTS (
          SELECT 1 FROM public.agenda_meeting_processing_jobs job
           WHERE job.session_id=meeting.id AND job.kind='assemble_transcript' AND job.status='dead_letter') THEN 'assembly'
        WHEN meeting.processing_state='failed' AND EXISTS (
          SELECT 1 FROM public.agenda_meeting_processing_jobs job
           WHERE job.session_id=meeting.id AND job.kind='analysis_generate' AND job.status='dead_letter') THEN 'analysis'
        ELSE NULL END,
      'reportQueued',EXISTS (
        SELECT 1 FROM public.agenda_meeting_processing_jobs job
         WHERE job.session_id=meeting.id AND job.kind='analysis_generate' AND job.status IN ('queued','retry_wait','in_flight'))
    ) INTO extra
    FROM public.agenda_meeting_segment_receipts receipt WHERE receipt.session_id=meeting.id;

  SELECT COALESCE(jsonb_agg(item.value || COALESCE((
           SELECT jsonb_build_object('report',minutes.report,'reportFormat',minutes.report_format,
                                     'isPartial',minutes.is_partial,'providerResponseId',minutes.provider_response_id)
             FROM public.agenda_meeting_minutes_versions minutes WHERE minutes.id=(item.value->>'id')::uuid
         ),'{}'::jsonb) ORDER BY item.ordinality),'[]'::jsonb)
    INTO minutes_payload
    FROM jsonb_array_elements(COALESCE(base->'minutesVersions','[]'::jsonb)) WITH ORDINALITY item(value,ordinality);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id',artifact.id,'kind',artifact.kind,'sourceVersionId',artifact.source_version_id,
           'byteSize',artifact.byte_size,'createdAt',artifact.created_at) ORDER BY artifact.created_at DESC),'[]'::jsonb)
    INTO artifacts_payload
    FROM public.agenda_meeting_artifacts artifact WHERE artifact.session_id=meeting.id;

  RETURN jsonb_set(jsonb_set(base,'{session}',(base->'session') || COALESCE(extra,'{}'::jsonb)),'{minutesVersions}',minutes_payload)
         || jsonb_build_object('artifacts',artifacts_payload);
END;
$$;
-- 14. Execution privileges: service-only routines are no longer callable by browser roles.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'agenda_meeting%' OR p.proname = 'invoke_agenda_meeting_worker')
       AND p.prokind = 'f'
       AND p.proname NOT IN ('agenda_meeting_authorize','agenda_meeting_session_readable')
       AND pg_get_function_result(p.oid) <> 'trigger'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.agenda_meeting_session_readable(uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_session_readable(uuid,uuid,uuid,uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.agenda_meeting_authorize(text,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_authorize(text,uuid,uuid,uuid) TO authenticated, service_role;