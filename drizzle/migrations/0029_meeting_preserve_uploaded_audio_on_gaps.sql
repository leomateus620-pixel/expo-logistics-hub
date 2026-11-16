-- Preserve audio already received by the server when the user accepts genuine gaps.
CREATE OR REPLACE FUNCTION public.agenda_meeting_control_v3(p_action text, p_actor_user_id uuid, p_org_id uuid, p_event_id uuid, p_session_id uuid, p_mutation_id uuid, p_expected_version bigint DEFAULT NULL::bigint, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  accepted_gaps integer;
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
    IF meeting.closed_sequence IS NULL OR meeting.capture_state <> 'stopped'
       OR meeting.processing_state = 'cancelled' THEN
      RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION';
    END IF;

    -- Uploaded audio with an active job or a possible retry is still usable.
    -- A user accepting gaps only resolves missing or permanently failed parts.
    INSERT INTO public.agenda_meeting_segment_receipts AS existing (
      session_id,org_id,event_id,segment_id,sequence,capture_start_ms,capture_end_ms,mutation_id,status,lost_at,error_code
    )
    SELECT meeting.id,meeting.org_id,meeting.event_id,gen_random_uuid(),candidate.sequence,0,1,gen_random_uuid(),
           'lost',now(),'gap_accepted_by_user'
      FROM generate_series(0, meeting.closed_sequence) AS candidate(sequence)
      LEFT JOIN public.agenda_meeting_segment_receipts receipt
        ON receipt.session_id=meeting.id AND receipt.sequence=candidate.sequence
     WHERE (receipt.id IS NULL OR (
              receipt.status NOT IN ('transcribed','lost')
              AND (receipt.audio_storage_path IS NULL OR receipt.audio_deleted_at IS NOT NULL OR receipt.status='terminal_error')
           ))
       AND NOT EXISTS (
         SELECT 1 FROM public.agenda_meeting_processing_jobs job
          WHERE job.receipt_id=receipt.id AND job.kind='transcribe_segment'
            AND job.status IN ('queued','retry_wait','in_flight')
       )
    ON CONFLICT (session_id,sequence) DO UPDATE
      SET status='lost', lost_at=now(), error_code=COALESCE(existing.error_code,'gap_accepted_by_user'), updated_at=now()
      WHERE existing.status NOT IN ('transcribed','lost');
    GET DIAGNOSTICS accepted_gaps = ROW_COUNT;

    IF accepted_gaps > 0 THEN
      meeting := public.agenda_meeting_refresh_sequence_state(meeting.id);
      IF cardinality(meeting.unresolved_sequences)=0 THEN
        PERFORM public.agenda_meeting_enqueue_job(
          meeting.id,'assemble_transcript','closed:' || meeting.closed_sequence::text || ':gaps:' || p_mutation_id::text
        );
        UPDATE public.agenda_meeting_sessions
           SET processing_state='assembling', last_error_code=NULL, last_error_at=NULL, version=version+1, updated_at=now()
         WHERE id=meeting.id RETURNING * INTO meeting;
      ELSE
        UPDATE public.agenda_meeting_sessions SET version=version+1, updated_at=now()
         WHERE id=meeting.id RETURNING * INTO meeting;
      END IF;
      PERFORM public.agenda_meeting_write_audit(
        meeting.id,p_actor_user_id,'user','transcription_gaps_accepted','session',meeting.id,p_mutation_id,
        jsonb_build_object('missingSequences',to_jsonb(meeting.missing_sequences),'acceptedGapCount',accepted_gaps)
      );
    END IF;

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
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.agenda_meeting_complete_assemble_job(p_job_id uuid, p_lease_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  IF EXISTS (
    SELECT 1 FROM public.agenda_meeting_transcript_versions version
     WHERE version.session_id=meeting.id AND version.content_hash=transcript_hash
  ) THEN
    -- New coverage can produce identical text, including silence after gaps were recovered.
    -- Preserve the old version and identify the new assembly by its text and coverage.
    transcript_hash := encode(extensions.digest(convert_to(
      jsonb_build_array('canonical_reassembly',transcript_version,meeting.missing_sequences,transcript_content)::text,
      'UTF8'
    ),'sha256'),'hex');
  END IF;
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
             WHEN cardinality(missing_sequences)>0 THEN 'partial_transcript'
             WHEN NOT has_speech THEN 'review_required'
             ELSE 'transcript_complete'
           END,
           last_error_code=CASE
             WHEN NOT has_speech AND cardinality(missing_sequences)>0 THEN 'analysis_transcript_missing_audio'
             WHEN NOT has_speech THEN 'analysis_transcript_has_no_speech'
             ELSE NULL
           END,
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
$function$;
