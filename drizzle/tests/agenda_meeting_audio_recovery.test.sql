-- Run with psql -v ON_ERROR_STOP=1 on a disposable database with Agenda Meeting v2 and Drizzle migrations 0028 and 0029.
BEGIN;
SET LOCAL search_path = public, extensions;

DO $test$
DECLARE
  org uuid := gen_random_uuid();
  actor uuid := gen_random_uuid();
  event uuid := gen_random_uuid();
  mixed_session uuid := gen_random_uuid();
  missing_session uuid := gen_random_uuid();
  silent_session uuid := gen_random_uuid();
  first_mutation uuid := gen_random_uuid();
  lease uuid := gen_random_uuid();
  selected_job uuid;
  current_job record;
  current_session record;
  expected_code text;
  expected_state text;
  meeting_version bigint;
BEGIN
  INSERT INTO organizations (id,nome) VALUES (org,'Agenda transcription recovery test');
  INSERT INTO org_members (org_id,user_id,role,nome_exibicao,is_active) VALUES (org,actor,'admin','Test',true);
  INSERT INTO cronograma_eventos (id,org_id,source_key,title) VALUES (event,org,'meeting-recovery-'||event,'Reunião de teste');
  INSERT INTO agenda_meeting_sessions (
    id,org_id,event_id,started_by,client_session_key,capture_state,processing_state,closed_sequence
  ) VALUES
    (mixed_session,org,event,actor,gen_random_uuid(),'stopped','awaiting_client_replay',4),
    (missing_session,org,event,actor,gen_random_uuid(),'stopped','awaiting_client_replay',0),
    (silent_session,org,event,actor,gen_random_uuid(),'stopped','awaiting_client_replay',0);

  -- This session had its audio requeued after an earlier incomplete empty transcript.
  INSERT INTO agenda_meeting_transcript_versions (
    session_id,org_id,event_id,version,kind,transcript_text,content_hash,is_complete,missing_sequences
  ) VALUES (
    silent_session,org,event,1,'canonical','',encode(extensions.digest(''::text,'sha256'),'hex'),false,ARRAY[0]
  );

  INSERT INTO agenda_meeting_segment_receipts (
    session_id,org_id,event_id,segment_id,sequence,capture_start_ms,capture_end_ms,mutation_id,
    status,audio_storage_path,mime_type,byte_size,sha256
  )
  SELECT scenario.session_id,org,event,gen_random_uuid(),scenario.seq,scenario.seq*5000,(scenario.seq+1)*5000,gen_random_uuid(),
         scenario.status,org||'/'||scenario.session_id||'/'||scenario.seq||'.wav','audio/wav',160044,repeat('a',64)
    FROM (VALUES (mixed_session,0,'accepted'),(mixed_session,1,'processing'),(mixed_session,2,'retryable_error'),
                 (mixed_session,3,'terminal_error'),(silent_session,0,'accepted')) scenario(session_id,seq,status);
  INSERT INTO agenda_meeting_processing_jobs (session_id,org_id,event_id,kind,dedupe_key,status,receipt_id,lease_token)
  SELECT receipt.session_id,org,event,'transcribe_segment','fixture:'||receipt.id,
         CASE WHEN receipt.sequence=1 THEN 'in_flight' ELSE 'queued' END,receipt.id,
         CASE WHEN receipt.sequence=1 THEN lease END
    FROM agenda_meeting_segment_receipts receipt
   WHERE (receipt.session_id=mixed_session AND receipt.sequence IN (0,1)) OR receipt.session_id=silent_session;

  PERFORM agenda_meeting_control_v3('accept_transcription_gaps',actor,org,event,mixed_session,first_mutation);
  IF (SELECT array_agg(status ORDER BY sequence) FROM agenda_meeting_segment_receipts
       WHERE session_id=mixed_session)
      IS DISTINCT FROM ARRAY['accepted','processing','retryable_error','lost','lost'] THEN
    RAISE EXCEPTION 'Accepting gaps altered uploaded, recoverable audio or failed to record a true gap';
  END IF;
  IF EXISTS (
    SELECT 1 FROM agenda_meeting_processing_jobs
     WHERE session_id=mixed_session AND (kind='assemble_transcript' OR status='cancelled')
  ) THEN
    RAISE EXCEPTION 'Accepting gaps cancelled a transcription job or queued premature assembly';
  END IF;
  SELECT version INTO meeting_version FROM agenda_meeting_sessions WHERE id=mixed_session;
  PERFORM agenda_meeting_control_v3('accept_transcription_gaps',actor,org,event,mixed_session,first_mutation);
  PERFORM agenda_meeting_control_v3('accept_transcription_gaps',actor,org,event,mixed_session,gen_random_uuid());
  IF (SELECT version FROM agenda_meeting_sessions WHERE id=mixed_session) IS DISTINCT FROM meeting_version THEN
    RAISE EXCEPTION 'Replayed or stale gap acceptance changed the meeting version';
  END IF;

  -- Recover the retained part whose earlier worker left no active job.
  PERFORM agenda_meeting_control_v3('retry_transcription',actor,org,event,mixed_session,gen_random_uuid());
  FOR current_job IN
    SELECT job.id,receipt.sequence,job.session_id
      FROM agenda_meeting_processing_jobs job JOIN agenda_meeting_segment_receipts receipt ON receipt.id=job.receipt_id
     WHERE job.session_id IN (mixed_session,silent_session) AND job.kind='transcribe_segment'
     ORDER BY job.session_id,receipt.sequence
  LOOP
    UPDATE agenda_meeting_processing_jobs SET status='in_flight',lease_token=lease WHERE id=current_job.id;
    PERFORM agenda_meeting_complete_transcription_job(
      current_job.id,lease,CASE WHEN current_job.session_id=silent_session THEN '' ELSE 'Áudio recebido '||current_job.sequence END,
      'fixture:'||current_job.id,'gemini-3.5-transcribe'
    );
    IF current_job.session_id=mixed_session AND current_job.sequence<2 AND EXISTS (
      SELECT 1 FROM agenda_meeting_processing_jobs WHERE session_id=mixed_session AND kind='assemble_transcript'
    ) THEN
      RAISE EXCEPTION 'Assembly was queued before all retained audio was transcribed';
    END IF;
  END LOOP;

  PERFORM agenda_meeting_control_v3('accept_transcription_gaps',actor,org,event,missing_session,gen_random_uuid());
  FOR current_session IN
    SELECT * FROM (VALUES (mixed_session),(missing_session),(silent_session)) AS scenario(id)
  LOOP
    UPDATE agenda_meeting_processing_jobs
       SET status='in_flight',lease_token=lease
     WHERE session_id=current_session.id AND kind='assemble_transcript'
    RETURNING id INTO selected_job;
    IF NOT FOUND THEN RAISE EXCEPTION 'Resolved meeting has no assembly job'; END IF;
    PERFORM agenda_meeting_complete_assemble_job(selected_job,lease);

    expected_state := CASE WHEN current_session.id=silent_session THEN 'review_required' ELSE 'partial_transcript' END;
    expected_code := CASE
      WHEN current_session.id=missing_session THEN 'analysis_transcript_missing_audio'
      WHEN current_session.id=silent_session THEN 'analysis_transcript_has_no_speech'
    END;
    IF NOT EXISTS (
      SELECT 1 FROM agenda_meeting_sessions WHERE id=current_session.id
        AND processing_state=expected_state AND last_error_code IS NOT DISTINCT FROM expected_code
    ) THEN
      RAISE EXCEPTION 'Assembly represented missing audio or real silence incorrectly';
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM agenda_meeting_transcript_versions WHERE session_id=mixed_session
      AND NOT is_complete AND missing_sequences=ARRAY[3,4]
      AND transcript_text=E'Áudio recebido 0\nÁudio recebido 1\nÁudio recebido 2'
  ) THEN
    RAISE EXCEPTION 'The partial transcript lost speech or reported the wrong gaps';
  END IF;
  IF (SELECT array_agg(is_complete ORDER BY version) FROM agenda_meeting_transcript_versions
       WHERE session_id=silent_session) IS DISTINCT FROM ARRAY[false,true] THEN
    RAISE EXCEPTION 'Recovering silent audio failed to retain the earlier incomplete transcript';
  END IF;
END
$test$;

ROLLBACK;
