-- ---------------------------------------------------------------------------
-- Lease-based textual assembly and analysis worker RPCs. These jobs never
-- reference audio: only canonical transcript rows and structured JSON enter.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agenda_meeting_expire_stale_captures(
  p_stale_seconds integer DEFAULT 180
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stale_session record;
  affected integer := 0;
BEGIN
  IF p_stale_seconds NOT BETWEEN 60 AND 86400 THEN
    RAISE EXCEPTION 'AGENDA_MEETING_STALE_WINDOW_INVALID';
  END IF;
  FOR stale_session IN
    UPDATE public.agenda_meeting_sessions meeting
       SET capture_state='interrupted',paused_at=now(),
           last_error_code='capture_heartbeat_expired',last_error_at=now(),
           version=version+1,updated_at=now()
     WHERE meeting.deleted_at IS NULL
       AND meeting.capture_state='recording'
       AND COALESCE(meeting.heartbeat_at,meeting.started_at,meeting.created_at)
           <= now()-make_interval(secs => p_stale_seconds)
     RETURNING meeting.id
  LOOP
    affected := affected + 1;
    PERFORM public.agenda_meeting_write_audit(
      stale_session.id,NULL,'service','capture_heartbeat_expired','session',stale_session.id
    );
  END LOOP;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_claim_jobs(
  p_batch_size integer DEFAULT 2,
  p_lease_seconds integer DEFAULT 360
)
RETURNS SETOF public.agenda_meeting_processing_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  expired_job public.agenda_meeting_processing_jobs%ROWTYPE;
  batch_size integer := LEAST(5,GREATEST(1,COALESCE(p_batch_size,2)));
  lease_seconds integer := LEAST(390,GREATEST(30,COALESCE(p_lease_seconds,360)));
BEGIN
  -- Exhausted stale leases are dead-lettered before the next claim. This makes
  -- worker termination recoverable without allowing an infinite poison loop.
  FOR expired_job IN
    SELECT *
      FROM public.agenda_meeting_processing_jobs job
     WHERE job.status='in_flight'
       AND job.lease_expires_at <= now()
       AND job.attempts >= job.max_attempts
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.agenda_meeting_processing_jobs
       SET status='dead_letter',lease_token=NULL,lease_expires_at=NULL,
           last_error_code=COALESCE(last_error_code,'worker_lease_exhausted'),updated_at=now()
     WHERE id=expired_job.id;
    UPDATE public.agenda_meeting_sessions
       SET processing_state='failed',last_error_code='worker_lease_exhausted',last_error_at=now(),
           version=version+1,updated_at=now()
     WHERE id=expired_job.session_id AND processing_state NOT IN ('completed','cancelled');
    PERFORM public.agenda_meeting_write_audit(
      expired_job.session_id,NULL,'service','processing_job_dead_lettered','processing_job',
      expired_job.id,NULL,jsonb_build_object('errorCode','worker_lease_exhausted','attempts',expired_job.attempts)
    );
  END LOOP;

  RETURN QUERY
  WITH candidates AS (
    SELECT job.id
      FROM public.agenda_meeting_processing_jobs job
     WHERE (
       (job.status IN ('queued','retry_wait') AND job.available_at <= now())
       OR (
         job.status='in_flight'
         AND job.lease_expires_at <= now()
         AND job.attempts < job.max_attempts
       )
     )
       AND job.attempts < job.max_attempts
     ORDER BY job.available_at,job.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT batch_size
  )
  UPDATE public.agenda_meeting_processing_jobs job
     SET status='in_flight',attempts=job.attempts+1,lease_token=gen_random_uuid(),
         lease_expires_at=now()+make_interval(secs => lease_seconds),updated_at=now()
    FROM candidates
   WHERE job.id=candidates.id
  RETURNING job.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_fail_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_retry_after_seconds integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.agenda_meeting_processing_jobs%ROWTYPE;
  sanitized_error text;
  retry_delay integer;
  terminal boolean;
BEGIN
  SELECT * INTO job
    FROM public.agenda_meeting_processing_jobs
   WHERE id=p_job_id AND lease_token=p_lease_token AND status='in_flight'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_JOB_LEASE_CONFLICT'; END IF;

  sanitized_error := left(regexp_replace(
    lower(COALESCE(NULLIF(btrim(p_error_code),''),'meeting_job_failed')),
    '[^a-z0-9_-]+','_','g'
  ),120);
  terminal := COALESCE(p_retry_after_seconds,0) <= 0 OR job.attempts >= job.max_attempts;
  retry_delay := LEAST(900,GREATEST(
    COALESCE(p_retry_after_seconds,30),
    (power(2,LEAST(job.attempts,8))*5)::integer
  ));

  UPDATE public.agenda_meeting_processing_jobs
     SET status=CASE WHEN terminal THEN 'dead_letter' ELSE 'retry_wait' END,
         available_at=CASE WHEN terminal THEN available_at ELSE now()+make_interval(secs => retry_delay) END,
         lease_token=NULL,lease_expires_at=NULL,last_error_code=sanitized_error,updated_at=now()
   WHERE id=job.id RETURNING * INTO job;

  IF terminal THEN
    UPDATE public.agenda_meeting_sessions
       SET processing_state='failed',last_error_code=sanitized_error,last_error_at=now(),
           version=version+1,updated_at=now()
     WHERE id=job.session_id AND processing_state NOT IN ('completed','cancelled');
  ELSE
    UPDATE public.agenda_meeting_sessions
       SET last_error_code=sanitized_error,last_error_at=now(),updated_at=now()
     WHERE id=job.session_id AND processing_state NOT IN ('completed','cancelled');
  END IF;
  PERFORM public.agenda_meeting_write_audit(
    job.session_id,NULL,'service',
    CASE WHEN terminal THEN 'processing_job_dead_lettered' ELSE 'processing_job_retry_scheduled' END,
    'processing_job',job.id,NULL,
    jsonb_build_object('errorCode',sanitized_error,'attempts',job.attempts,'retryAfterSeconds',CASE WHEN terminal THEN NULL ELSE retry_delay END)
  );
  RETURN jsonb_build_object(
    'jobId',job.id,'status',job.status,'attempts',job.attempts,
    'retryAfterSeconds',CASE WHEN terminal THEN NULL ELSE retry_delay END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_strip_text_overlap(
  p_previous text,
  p_current text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  previous_words text[];
  current_words text[];
  previous_count integer;
  current_count integer;
  overlap_size integer;
  previous_tail text;
  current_head text;
BEGIN
  IF NULLIF(btrim(COALESCE(p_current,'')),'') IS NULL THEN RETURN ''; END IF;
  IF NULLIF(btrim(COALESCE(p_previous,'')),'') IS NULL THEN RETURN btrim(p_current); END IF;
  previous_words := regexp_split_to_array(btrim(p_previous), E'\\s+');
  current_words := regexp_split_to_array(btrim(p_current), E'\\s+');
  previous_count := cardinality(previous_words);
  current_count := cardinality(current_words);
  IF LEAST(previous_count,current_count) < 3 THEN RETURN btrim(p_current); END IF;

  FOR overlap_size IN REVERSE LEAST(64,previous_count,current_count)..3 LOOP
    previous_tail := regexp_replace(
      lower(array_to_string(previous_words[(previous_count-overlap_size+1):previous_count],' ')),
      '[^[:alnum:]]+','','g'
    );
    current_head := regexp_replace(
      lower(array_to_string(current_words[1:overlap_size],' ')),
      '[^[:alnum:]]+','','g'
    );
    IF previous_tail <> '' AND previous_tail = current_head THEN
      IF overlap_size = current_count THEN RETURN ''; END IF;
      RETURN array_to_string(current_words[(overlap_size+1):current_count],' ');
    END IF;
  END LOOP;
  RETURN btrim(p_current);
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_complete_assemble_job(
  p_job_id uuid,
  p_lease_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  job public.agenda_meeting_processing_jobs%ROWTYPE;
  meeting public.agenda_meeting_sessions%ROWTYPE;
  transcript_content text;
  transcript_hash text;
  transcript_id uuid;
  transcript_version integer;
  analysis_job_id uuid;
  has_speech boolean;
BEGIN
  SELECT * INTO job
    FROM public.agenda_meeting_processing_jobs
   WHERE id=p_job_id AND lease_token=p_lease_token AND status='in_flight'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_JOB_LEASE_CONFLICT'; END IF;
  IF job.kind <> 'assemble_transcript' THEN RAISE EXCEPTION 'AGENDA_MEETING_JOB_KIND_CONFLICT'; END IF;

  meeting := public.agenda_meeting_refresh_sequence_state(job.session_id);
  IF meeting.closed_sequence IS NULL OR cardinality(meeting.unresolved_sequences)>0 THEN
    RAISE EXCEPTION 'AGENDA_MEETING_ASSEMBLY_INCOMPLETE';
  END IF;

  WITH ordered_segments AS (
    SELECT segment.sequence,segment.transcript_text,receipt.capture_start_ms,
           lag(segment.transcript_text) OVER (ORDER BY segment.sequence) AS previous_text,
           lag(receipt.capture_end_ms) OVER (ORDER BY segment.sequence) AS previous_end_ms
      FROM public.agenda_meeting_transcript_segments segment
      JOIN public.agenda_meeting_segment_receipts receipt ON receipt.id=segment.receipt_id
     WHERE segment.session_id=meeting.id
       AND segment.sequence BETWEEN 0 AND meeting.closed_sequence
  )
  SELECT COALESCE(string_agg(NULLIF(btrim(
           CASE WHEN capture_start_ms < previous_end_ms
                THEN public.agenda_meeting_strip_text_overlap(previous_text,transcript_text)
                ELSE transcript_text END
         ),''),E'\n' ORDER BY sequence),'')
    INTO transcript_content
    FROM ordered_segments;
  transcript_hash := encode(extensions.digest(convert_to(transcript_content,'UTF8'),'sha256'),'hex');
  SELECT COALESCE(max(version),0)+1 INTO transcript_version
    FROM public.agenda_meeting_transcript_versions WHERE session_id=meeting.id;
  INSERT INTO public.agenda_meeting_transcript_versions (
    session_id,org_id,event_id,version,kind,transcript_text,content_hash,is_complete,
    missing_sequences,created_by
  ) VALUES (
    meeting.id,meeting.org_id,meeting.event_id,transcript_version,'canonical',
    transcript_content,transcript_hash,cardinality(meeting.missing_sequences)=0,
    meeting.missing_sequences,NULL
  ) RETURNING id INTO transcript_id;

  has_speech := NULLIF(btrim(transcript_content),'') IS NOT NULL;
  IF has_speech AND (
    cardinality(meeting.missing_sequences)=0 OR meeting.partial_analysis_confirmed
  ) THEN
    analysis_job_id := public.agenda_meeting_enqueue_job(
      meeting.id,'analysis_generate','transcript:' || transcript_id::text,transcript_id
    );
    UPDATE public.agenda_meeting_sessions
       SET processing_state='analysis_queued',last_error_code=NULL,last_error_at=NULL,
           version=version+1,updated_at=now()
     WHERE id=meeting.id RETURNING * INTO meeting;
  ELSE
    UPDATE public.agenda_meeting_sessions
       SET processing_state=CASE
             WHEN NOT has_speech THEN 'review_required'
             WHEN cardinality(missing_sequences)>0 THEN 'partial_transcript'
             ELSE 'transcript_complete'
           END,
           last_error_code=CASE WHEN NOT has_speech THEN 'analysis_transcript_has_no_speech' ELSE NULL END,
           last_error_at=CASE WHEN NOT has_speech THEN now() ELSE NULL END,
           version=version+1,updated_at=now()
     WHERE id=meeting.id RETURNING * INTO meeting;
  END IF;
  UPDATE public.agenda_meeting_processing_jobs
     SET status='succeeded',lease_token=NULL,lease_expires_at=NULL,completed_at=now(),updated_at=now()
   WHERE id=job.id;
  PERFORM public.agenda_meeting_write_audit(
    meeting.id,NULL,'service','transcript_version_assembled','transcript_version',transcript_id,NULL,
    jsonb_build_object(
      'version',transcript_version,'coverage',CASE WHEN cardinality(meeting.missing_sequences)>0 THEN 'with_gaps' ELSE 'complete' END,
      'analysisJobId',analysis_job_id
    )
  );
  RETURN jsonb_build_object(
    'jobId',job.id,'transcriptVersionId',transcript_id,'analysisJobId',analysis_job_id,
    'coverage',CASE WHEN cardinality(meeting.missing_sequences)>0 THEN 'with_gaps' ELSE 'complete' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_analysis_evidence(
  p_session_id uuid,
  p_segment_ids jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_count integer;
  matched_count integer;
  evidence jsonb;
BEGIN
  IF jsonb_typeof(p_segment_ids) <> 'array' OR jsonb_array_length(p_segment_ids)=0 THEN
    RAISE EXCEPTION 'AGENDA_MEETING_ANALYSIS_EVIDENCE_REQUIRED';
  END IF;
  requested_count := jsonb_array_length(p_segment_ids);
  SELECT count(*),jsonb_agg(jsonb_build_object(
           'transcriptSegmentId',segment.id,
           'quoteStartMs',receipt.capture_start_ms,
           'quoteEndMs',receipt.capture_end_ms
         ) ORDER BY receipt.capture_start_ms,segment.sequence)
    INTO matched_count,evidence
    FROM jsonb_array_elements_text(p_segment_ids) requested(segment_id)
    JOIN public.agenda_meeting_transcript_segments segment
      ON segment.id=requested.segment_id::uuid AND segment.session_id=p_session_id
    JOIN public.agenda_meeting_segment_receipts receipt ON receipt.id=segment.receipt_id;
  IF matched_count <> requested_count OR (
    SELECT count(DISTINCT item) FROM jsonb_array_elements_text(p_segment_ids) item
  ) <> requested_count THEN
    RAISE EXCEPTION 'AGENDA_MEETING_ANALYSIS_EVIDENCE_INVALID';
  END IF;
  RETURN evidence;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_complete_analysis_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_transcript_version_id uuid,
  p_result jsonb,
  p_provider_response_id text,
  p_usage jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  suggested_user uuid;
BEGIN
  SELECT * INTO job
    FROM public.agenda_meeting_processing_jobs
   WHERE id=p_job_id AND lease_token=p_lease_token AND status='in_flight'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_JOB_LEASE_CONFLICT'; END IF;
  IF job.kind <> 'analysis_generate' OR job.transcript_version_id IS DISTINCT FROM p_transcript_version_id THEN
    RAISE EXCEPTION 'AGENDA_MEETING_JOB_KIND_CONFLICT';
  END IF;
  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id=job.session_id FOR UPDATE;
  SELECT * INTO transcript FROM public.agenda_meeting_transcript_versions
   WHERE id=p_transcript_version_id AND session_id=meeting.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_TRANSCRIPT_NOT_READY'; END IF;
  IF cardinality(transcript.missing_sequences)>0 AND meeting.partial_analysis_confirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'AGENDA_MEETING_PARTIAL_ANALYSIS_CONFIRMATION_REQUIRED';
  END IF;
  IF jsonb_typeof(p_result) <> 'object'
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

  UPDATE public.agenda_meeting_minutes_versions
     SET status='superseded'
   WHERE session_id=meeting.id AND status IN ('draft','changes_requested');
  SELECT COALESCE(max(version),0)+1 INTO minutes_version
    FROM public.agenda_meeting_minutes_versions WHERE session_id=meeting.id;
  INSERT INTO public.agenda_meeting_minutes_versions (
    session_id,org_id,event_id,transcript_version_id,version,status,title,summary,
    minutes_markdown,transcript_coverage,analysis_model,reasoning_effort,prompt_version,schema_version,
    provider_response_id,provider_usage
  ) VALUES (
    meeting.id,meeting.org_id,meeting.event_id,transcript.id,minutes_version,'draft',
    btrim(p_result->>'title'),btrim(p_result->>'executiveSummary'),btrim(p_result->>'minutesMarkdown'),
    CASE WHEN cardinality(transcript.missing_sequences)>0 THEN 'with_gaps' ELSE 'complete' END,
    btrim(p_result->>'analysisModel'),COALESCE(NULLIF(btrim(p_result->>'reasoningEffort'),''),'medium'),
    btrim(p_result->>'promptVersion'),btrim(p_result->>'schemaVersion'),
    NULLIF(btrim(p_provider_response_id),''),
    CASE WHEN jsonb_typeof(COALESCE(p_usage,'{}'::jsonb))='object' THEN COALESCE(p_usage,'{}'::jsonb) ELSE '{}'::jsonb END
  ) RETURNING id INTO minutes_id;

  FOR insight_group IN
    SELECT * FROM (VALUES
      ('decisions','decision'),('pendingItems','pending_item'),('risks','risk'),
      ('importantPoints','important_point'),('nextSteps','next_step'),('nextMeetings','next_meeting')
    ) AS groups(json_key,insight_type)
  LOOP
    FOR analysis_item,analysis_position IN
      SELECT item.value,item.ordinality
        FROM jsonb_array_elements(p_result -> (insight_group.json_key)) WITH ORDINALITY item(value,ordinality)
    LOOP
      IF jsonb_typeof(analysis_item) <> 'object'
         OR NULLIF(btrim(analysis_item->>'title'),'') IS NULL
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
    SELECT item.value,item.ordinality
      FROM jsonb_array_elements(p_result->'actionItems') WITH ORDINALITY item(value,ordinality)
  LOOP
    IF jsonb_typeof(analysis_item) <> 'object'
       OR NULLIF(btrim(analysis_item->>'title'),'') IS NULL
       OR NULLIF(btrim(analysis_item->>'description'),'') IS NULL THEN
      RAISE EXCEPTION 'AGENDA_MEETING_ANALYSIS_SCHEMA_INVALID';
    END IF;
    evidence := public.agenda_meeting_analysis_evidence(meeting.id,analysis_item->'evidenceSegmentIds');
    due_date_value := CASE WHEN NULLIF(btrim(analysis_item->>'dueDate'),'') IS NULL
                           THEN NULL ELSE (analysis_item->>'dueDate')::date END;
    suggested_user := CASE WHEN NULLIF(btrim(analysis_item->>'suggestedMemberId'),'') IS NULL
                           THEN NULL ELSE (analysis_item->>'suggestedMemberId')::uuid END;
    INSERT INTO public.agenda_meeting_action_items (
      session_id,org_id,event_id,minutes_version_id,position,title,description,responsible_text,
      suggested_user_id,due_date_text,due_date,due_date_confirmed,status,evidence
    ) VALUES (
      meeting.id,meeting.org_id,meeting.event_id,minutes_id,analysis_position-1,
      btrim(analysis_item->>'title'),btrim(analysis_item->>'description'),
      NULLIF(btrim(analysis_item->>'responsibleText'),''),suggested_user,
      NULLIF(btrim(analysis_item->>'dueDateText'),''),due_date_value,false,'proposed',evidence
    );
  END LOOP;

  UPDATE public.agenda_meeting_processing_jobs
     SET status='succeeded',lease_token=NULL,lease_expires_at=NULL,completed_at=now(),updated_at=now()
   WHERE id=job.id;
  UPDATE public.agenda_meeting_sessions
     SET processing_state='review_required',analysis_model=btrim(p_result->>'analysisModel'),
         analysis_reasoning_effort=COALESCE(NULLIF(btrim(p_result->>'reasoningEffort'),''),'medium'),
         last_error_code=NULL,last_error_at=NULL,version=version+1,updated_at=now()
   WHERE id=meeting.id RETURNING * INTO meeting;
  PERFORM public.agenda_meeting_write_audit(
    meeting.id,NULL,'service','analysis_version_created','minutes_version',minutes_id,NULL,
    jsonb_build_object(
      'minutesVersion',minutes_version,'analysisModel',meeting.analysis_model,
      'promptVersion',p_result->>'promptVersion','schemaVersion',p_result->>'schemaVersion',
      'coverage',CASE WHEN cardinality(transcript.missing_sequences)>0 THEN 'with_gaps' ELSE 'complete' END
    )
  );
  RETURN jsonb_build_object('jobId',job.id,'minutesVersionId',minutes_id,'session',public.agenda_meeting_session_summary_json(meeting.id));
END;
$$;

REVOKE ALL ON FUNCTION public.agenda_meeting_claim_jobs(integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_expire_stale_captures(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_fail_job(uuid,uuid,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_complete_assemble_job(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_strip_text_overlap(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_analysis_evidence(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_complete_analysis_job(uuid,uuid,uuid,jsonb,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_claim_jobs(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_expire_stale_captures(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_fail_job(uuid,uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_complete_assemble_job(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_strip_text_overlap(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_analysis_evidence(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_complete_analysis_job(uuid,uuid,uuid,jsonb,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_agenda_meeting_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  worker_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret INTO worker_secret
    FROM vault.decrypted_secrets
   WHERE name='agenda_meeting_worker_service_role_key'
   LIMIT 1;
  IF NULLIF(worker_secret,'') IS NULL THEN RETURN NULL; END IF;
  SELECT net.http_post(
    url := 'https://btfaumhroqtqzxomqorx.supabase.co/functions/v1/agenda-meeting-worker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || worker_secret
    ),
    body := '{}'::jsonb
  ) INTO request_id;
  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_agenda_meeting_worker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_agenda_meeting_worker() TO service_role;

DO $schedule$
DECLARE existing_job bigint;
BEGIN
  SELECT jobid INTO existing_job FROM cron.job WHERE jobname='agenda-meeting-worker-every-minute';
  IF existing_job IS NOT NULL THEN PERFORM cron.unschedule(existing_job); END IF;
  PERFORM cron.schedule(
    'agenda-meeting-worker-every-minute','* * * * *',
    'SELECT public.invoke_agenda_meeting_worker();'
  );
END
$schedule$;
