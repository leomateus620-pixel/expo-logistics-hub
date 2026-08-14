-- ---------------------------------------------------------------------------
-- Coherent control-plane RPC. Called only after JWT-scoped authorization.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agenda_meeting_control(
  p_action text,
  p_actor_user_id uuid,
  p_org_id uuid,
  p_event_id uuid,
  p_session_id uuid DEFAULT NULL,
  p_mutation_id uuid DEFAULT NULL,
  p_expected_version bigint DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
  existing_response jsonb;
  existing_session_id uuid;
  existing_org_id uuid;
  existing_event_id uuid;
  receipt_response jsonb;
  result jsonb;
  event_context_value jsonb;
  target_sequence integer;
  target_segment_id uuid;
  target_minutes_id uuid;
  target_action_id uuid;
  target_transcript public.agenda_meeting_transcript_versions%ROWTYPE;
  new_transcript_id uuid;
  transcript_content text;
  transcript_hash text;
  next_version integer;
  decision text;
  assignee uuid;
  deletion_session_id uuid;
  gap_error_code text;
BEGIN
  IF p_action NOT IN (
    'start','list','detail','heartbeat','pause','resume','finalize','cancel','mark_lost',
    'get_segment_receipt','create_revision','review_minutes','update_action',
    'retry_analysis','delete'
  ) THEN RAISE EXCEPTION 'AGENDA_MEETING_INVALID_ACTION'; END IF;

  IF p_actor_user_id IS NULL OR p_org_id IS NULL OR p_event_id IS NULL THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_REQUEST';
  END IF;

  IF p_action = 'list' THEN
    IF NOT public.agenda_meeting_actor_allowed(p_actor_user_id, p_action, p_org_id, p_event_id, NULL) THEN
      RAISE EXCEPTION 'AGENDA_MEETING_FORBIDDEN';
    END IF;
    RETURN jsonb_build_object('sessions', COALESCE((
      SELECT jsonb_agg(public.agenda_meeting_session_summary_json(listed.id) ORDER BY listed.created_at DESC)
      FROM public.agenda_meeting_sessions listed
      WHERE listed.org_id = p_org_id AND listed.event_id = p_event_id AND listed.deleted_at IS NULL
        AND public.agenda_meeting_session_readable(
          p_actor_user_id,listed.org_id,listed.event_id,listed.id
        )
    ), '[]'::jsonb));
  END IF;

  IF p_action IN ('detail','get_segment_receipt') THEN
    IF p_session_id IS NULL OR NOT public.agenda_meeting_actor_allowed(
      p_actor_user_id, p_action, p_org_id, p_event_id, p_session_id
    ) THEN RAISE EXCEPTION 'AGENDA_MEETING_FORBIDDEN'; END IF;
    IF p_action = 'detail' THEN
      result := public.agenda_meeting_detail_json(p_session_id);
      IF result IS NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;
      RETURN result;
    END IF;
    RETURN jsonb_build_object('receipt', (
      SELECT jsonb_build_object(
        'id', receipt.id,
        'canonicalReceiptId', CASE WHEN receipt.status='transcribed' THEN receipt.id ELSE NULL END,
        'segmentId', receipt.segment_id,
        'attemptId', receipt.attempt_id,
        'sequence', receipt.sequence,
        'status', receipt.status,
        'retryAfterMs', receipt.retry_after_ms,
        'errorCode', receipt.error_code,
        'transcribedAt', receipt.transcribed_at,
        'updatedAt', receipt.updated_at
      )
      FROM public.agenda_meeting_segment_receipts receipt
      WHERE receipt.session_id = p_session_id
        AND (
          (p_payload ? 'segmentId' AND receipt.segment_id = (p_payload->>'segmentId')::uuid)
          OR (p_payload ? 'sequence' AND receipt.sequence = (p_payload->>'sequence')::integer)
        )
      LIMIT 1
    ));
  END IF;

  IF p_mutation_id IS NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_MUTATION_ID_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_actor_user_id::text || ':' || p_action || ':' || p_mutation_id::text, 0
  ));

  SELECT mutation.response,mutation.session_id,mutation.org_id,mutation.event_id
    INTO existing_response,existing_session_id,existing_org_id,existing_event_id
    FROM public.agenda_meeting_mutation_receipts mutation
   WHERE mutation.actor_user_id = p_actor_user_id
     AND mutation.action = p_action
     AND mutation.mutation_id = p_mutation_id;
  IF existing_response IS NOT NULL THEN
    IF existing_org_id <> p_org_id OR existing_event_id <> p_event_id
       OR (p_session_id IS NOT NULL AND existing_session_id IS DISTINCT FROM p_session_id) THEN
      RAISE EXCEPTION 'AGENDA_MEETING_IDEMPOTENCY_CONFLICT';
    END IF;
    IF p_action = 'delete' THEN RETURN existing_response; END IF;
    result := public.agenda_meeting_detail_json(existing_session_id);
    IF result IS NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_IDEMPOTENCY_TARGET_NOT_FOUND'; END IF;
    RETURN result;
  END IF;

  IF p_action = 'start' THEN
    IF NOT public.agenda_meeting_actor_allowed(p_actor_user_id, p_action, p_org_id, p_event_id, NULL) THEN
      RAISE EXCEPTION 'AGENDA_MEETING_FORBIDDEN';
    END IF;
    IF COALESCE((p_payload->>'consentConfirmed')::boolean, false) IS NOT TRUE
       OR COALESCE((p_payload->>'participantsInformed')::boolean, false) IS NOT TRUE
       OR NULLIF(btrim(p_payload->>'consentPolicyVersion'), '') IS NULL THEN
      RAISE EXCEPTION 'AGENDA_MEETING_CONSENT_REQUIRED';
    END IF;

    SELECT jsonb_build_object(
      'title', event.title,
      'description', event.description,
      'startDate', event.start_date,
      'endDate', event.end_date,
      'startTime', event.start_time,
      'endTime', event.end_time,
      'startsAt', CASE
        WHEN event.start_date IS NULL THEN NULL
        WHEN event.start_time IS NULL THEN event.start_date::text
        ELSE (event.start_date + event.start_time)::text
      END,
      'endsAt', CASE
        WHEN COALESCE(event.end_date,event.start_date) IS NULL THEN NULL
        WHEN event.end_time IS NULL THEN COALESCE(event.end_date,event.start_date)::text
        ELSE (COALESCE(event.end_date,event.start_date) + event.end_time)::text
      END,
      'location', event.location,
      'status', event.status,
      'commissions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'commissionId', link.commission_id,
          'name', link.commission_name_snapshot,
          'slug', link.commission_slug,
          'role', link.relation_role
        ) ORDER BY link.relation_role, link.created_at)
        FROM public.cronograma_evento_comissoes link
        WHERE link.event_id = event.id AND link.org_id = event.org_id
      ), '[]'::jsonb),
      'responsibles', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'userId', responsible.org_member_user_id,
          'name', responsible.name_snapshot,
          'role', responsible.role,
          'type', responsible.responsible_type,
          'primary', responsible.is_primary
        ) ORDER BY responsible.is_primary DESC, responsible.created_at)
        FROM public.cronograma_evento_responsaveis responsible
        WHERE responsible.event_id = event.id AND responsible.org_id = event.org_id
      ), '[]'::jsonb)
    ) INTO event_context_value
    FROM public.cronograma_eventos event
    WHERE event.id = p_event_id AND event.org_id = p_org_id;
    IF event_context_value IS NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_EVENT_NOT_FOUND'; END IF;

    INSERT INTO public.agenda_meeting_sessions (
      org_id, event_id, started_by, client_session_key, capture_state,
      processing_state, consent_confirmed, consent_policy_version,
      consent_confirmed_at, event_context, heartbeat_at, started_at
    ) VALUES (
      p_org_id, p_event_id, p_actor_user_id, p_mutation_id, 'recording',
      'accepting_segments', true, btrim(p_payload->>'consentPolicyVersion'),
      now(), event_context_value, now(), now()
    )
    ON CONFLICT (started_by, client_session_key) DO NOTHING
    RETURNING * INTO meeting;
    IF NOT FOUND THEN
      SELECT * INTO meeting FROM public.agenda_meeting_sessions
       WHERE started_by = p_actor_user_id AND client_session_key = p_mutation_id;
      IF meeting.org_id <> p_org_id OR meeting.event_id <> p_event_id THEN
        RAISE EXCEPTION 'AGENDA_MEETING_IDEMPOTENCY_CONFLICT';
      END IF;
    END IF;
    INSERT INTO public.agenda_meeting_user_consents (
      session_id,org_id,event_id,user_id,policy_version,consent_version,decision,recorded_by
    ) VALUES (
      meeting.id,meeting.org_id,meeting.event_id,p_actor_user_id,
      meeting.consent_policy_version,1,'consented',p_actor_user_id
    ) ON CONFLICT (session_id,user_id,policy_version,decision) DO NOTHING;
    PERFORM public.agenda_meeting_write_audit(
      meeting.id, p_actor_user_id, 'user', 'session_started', 'session',
      meeting.id, p_mutation_id, jsonb_build_object(
        'consentPolicyVersion', meeting.consent_policy_version,
        'participantsInformed', true
      )
    );
    result := public.agenda_meeting_detail_json(meeting.id);
  ELSE
    IF p_session_id IS NULL OR NOT public.agenda_meeting_actor_allowed(
      p_actor_user_id, p_action, p_org_id, p_event_id, p_session_id
    ) THEN RAISE EXCEPTION 'AGENDA_MEETING_FORBIDDEN'; END IF;
    SELECT * INTO meeting FROM public.agenda_meeting_sessions
     WHERE id = p_session_id AND org_id = p_org_id AND event_id = p_event_id AND deleted_at IS NULL
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;
    IF p_expected_version IS NOT NULL AND meeting.version <> p_expected_version THEN
      RAISE EXCEPTION 'AGENDA_MEETING_VERSION_CONFLICT:%', meeting.version;
    END IF;

    CASE p_action
      WHEN 'heartbeat' THEN
        IF meeting.capture_state NOT IN ('recording','paused','interrupted') THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION';
        END IF;
        IF COALESCE((p_payload->>'activeDurationMs')::bigint,meeting.active_duration_ms) NOT BETWEEN 0 AND 14400000 THEN
          RAISE EXCEPTION 'AGENDA_MEETING_ACTIVE_DURATION_INVALID';
        END IF;
        UPDATE public.agenda_meeting_sessions
           SET heartbeat_at=now(),
               active_duration_ms=GREATEST(
                 active_duration_ms,COALESCE((p_payload->>'activeDurationMs')::bigint,active_duration_ms)
               ),
               updated_at=now()
         WHERE id = meeting.id RETURNING * INTO meeting;

      WHEN 'pause' THEN
        IF meeting.capture_state <> 'recording' THEN RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION'; END IF;
        UPDATE public.agenda_meeting_sessions
           SET capture_state = 'paused', paused_at = now(), heartbeat_at = now(),
               version = version + 1, updated_at = now()
         WHERE id = meeting.id RETURNING * INTO meeting;
        PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','session_paused','session',meeting.id,p_mutation_id);

      WHEN 'resume' THEN
        IF meeting.capture_state NOT IN ('paused','interrupted')
           AND NOT (
             meeting.capture_state='recording'
             AND COALESCE((p_payload->>'resumedAfterInterruption')::boolean,false)
           ) THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION';
        END IF;
        UPDATE public.agenda_meeting_sessions
           SET capture_state = 'recording', paused_at = NULL, heartbeat_at = now(),
               version = version + 1, updated_at = now()
         WHERE id = meeting.id RETURNING * INTO meeting;
        PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','session_resumed','session',meeting.id,p_mutation_id);

      WHEN 'finalize' THEN
        IF meeting.capture_state NOT IN ('recording','paused','interrupted') THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION';
        END IF;
        target_sequence := COALESCE((p_payload->>'lastSequence')::integer, meeting.last_received_sequence);
        IF target_sequence < -1 OR target_sequence > 10000
           OR target_sequence < meeting.last_received_sequence THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_SEQUENCE';
        END IF;
        IF COALESCE((p_payload->>'activeDurationMs')::bigint,meeting.active_duration_ms) NOT BETWEEN 0 AND 14400000 THEN
          RAISE EXCEPTION 'AGENDA_MEETING_ACTIVE_DURATION_INVALID';
        END IF;
        UPDATE public.agenda_meeting_sessions
           SET capture_state = 'stopped', closed_sequence = target_sequence,
               active_duration_ms=GREATEST(
                 active_duration_ms,COALESCE((p_payload->>'activeDurationMs')::bigint,active_duration_ms)
               ),
               partial_analysis_confirmed=COALESCE((p_payload->>'allowPartial')::boolean,false),
               ended_at = now(), finalized_at = now(), version = version + 1, updated_at = now()
         WHERE id = meeting.id;
        meeting := public.agenda_meeting_refresh_sequence_state(meeting.id);
        IF cardinality(meeting.unresolved_sequences) = 0 THEN
          PERFORM public.agenda_meeting_enqueue_job(meeting.id, 'assemble_transcript', 'closed:' || meeting.closed_sequence::text);
          UPDATE public.agenda_meeting_sessions SET processing_state = 'assembling', updated_at = now()
           WHERE id = meeting.id RETURNING * INTO meeting;
        ELSE
          UPDATE public.agenda_meeting_sessions SET processing_state = 'awaiting_client_replay', updated_at = now()
           WHERE id = meeting.id RETURNING * INTO meeting;
        END IF;
        PERFORM public.agenda_meeting_write_audit(
          meeting.id,p_actor_user_id,'user','session_finalized','session',meeting.id,p_mutation_id,
          jsonb_build_object('closedSequence',meeting.closed_sequence,'missingSequences',to_jsonb(meeting.missing_sequences))
        );

      WHEN 'cancel' THEN
        IF meeting.capture_state NOT IN ('recording','paused','interrupted') THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION';
        END IF;
        UPDATE public.agenda_meeting_processing_jobs
           SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,updated_at=now()
         WHERE session_id=meeting.id AND status IN ('queued','retry_wait','in_flight');
        UPDATE public.agenda_meeting_sessions
           SET capture_state='cancelled',processing_state='cancelled',ended_at=now(),finalized_at=now(),
               version=version+1,updated_at=now()
         WHERE id=meeting.id RETURNING * INTO meeting;
        PERFORM public.agenda_meeting_write_audit(
          meeting.id,p_actor_user_id,'user','session_cancelled','session',meeting.id,p_mutation_id
        );

      WHEN 'mark_lost' THEN
        target_sequence := (p_payload->>'sequence')::integer;
        target_segment_id := (p_payload->>'segmentId')::uuid;
        IF target_sequence < 0 OR target_sequence > 10000 OR target_segment_id IS NULL
           OR (p_payload->>'captureStartMs')::bigint < 0
           OR (p_payload->>'captureEndMs')::bigint <= (p_payload->>'captureStartMs')::bigint
           OR (p_payload->>'captureEndMs')::bigint > 14400000 THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_SEGMENT';
        END IF;
        gap_error_code := CASE
          WHEN NULLIF(btrim(p_payload->>'reason'),'') IS NULL THEN 'client_segment_lost'
          ELSE left('client_gap_' || regexp_replace(lower(p_payload->>'reason'),'[^a-z0-9_-]+','_','g'),120)
        END;
        IF EXISTS (
          SELECT 1 FROM public.agenda_meeting_segment_receipts existing
           WHERE existing.session_id=meeting.id
             AND (
               (existing.sequence=target_sequence AND existing.segment_id<>target_segment_id)
               OR (existing.segment_id=target_segment_id AND existing.sequence<>target_sequence)
             )
        ) THEN
          RAISE EXCEPTION 'AGENDA_MEETING_SEGMENT_CONFLICT';
        END IF;
        INSERT INTO public.agenda_meeting_segment_receipts (
          session_id, org_id, event_id, segment_id, sequence, capture_start_ms,
          capture_end_ms, mime_type, sha256, mutation_id, status, lost_at, error_code
        ) VALUES (
          meeting.id, meeting.org_id, meeting.event_id, target_segment_id, target_sequence,
          COALESCE((p_payload->>'captureStartMs')::bigint, 0),
          GREATEST(COALESCE((p_payload->>'captureEndMs')::bigint, 1), COALESCE((p_payload->>'captureStartMs')::bigint, 0) + 1),
          NULLIF(p_payload->>'mimeType',''), NULLIF(lower(p_payload->>'sha256'),''),
          p_mutation_id, 'lost', now(), gap_error_code
        )
        ON CONFLICT (session_id, sequence) DO UPDATE
          SET status = CASE WHEN public.agenda_meeting_segment_receipts.status = 'transcribed'
                            THEN 'transcribed' ELSE 'lost' END,
              lost_at = CASE WHEN public.agenda_meeting_segment_receipts.status = 'transcribed'
                             THEN public.agenda_meeting_segment_receipts.lost_at ELSE now() END,
              error_code = CASE WHEN public.agenda_meeting_segment_receipts.status = 'transcribed'
                                 THEN public.agenda_meeting_segment_receipts.error_code ELSE gap_error_code END,
              updated_at = now();
        meeting := public.agenda_meeting_refresh_sequence_state(meeting.id);
        IF meeting.closed_sequence IS NOT NULL AND cardinality(meeting.unresolved_sequences)=0 THEN
          PERFORM public.agenda_meeting_enqueue_job(
            meeting.id,'assemble_transcript','closed:' || meeting.closed_sequence::text
          );
          UPDATE public.agenda_meeting_sessions
             SET processing_state='assembling',version=version+1,updated_at=now()
           WHERE id=meeting.id RETURNING * INTO meeting;
        ELSE
          UPDATE public.agenda_meeting_sessions
             SET processing_state=CASE WHEN closed_sequence IS NULL THEN processing_state ELSE 'awaiting_client_replay' END,
                 version=version+1,updated_at=now()
           WHERE id=meeting.id RETURNING * INTO meeting;
        END IF;
        PERFORM public.agenda_meeting_write_audit(
          meeting.id,p_actor_user_id,'user','segment_marked_lost','segment',target_segment_id,p_mutation_id,
          jsonb_build_object('sequence',target_sequence,'reason',NULLIF(p_payload->>'reason',''))
        );

      WHEN 'create_revision' THEN
        IF jsonb_typeof(p_payload->'segments') <> 'array'
           OR jsonb_array_length(p_payload->'segments') = 0 THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_REVISION';
        END IF;
        SELECT * INTO target_transcript FROM public.agenda_meeting_transcript_versions
         WHERE session_id = meeting.id ORDER BY version DESC LIMIT 1;
        IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_TRANSCRIPT_NOT_READY'; END IF;
        IF jsonb_array_length(p_payload->'segments') <> (
          SELECT count(*) FROM public.agenda_meeting_transcript_segments source
           WHERE source.session_id=meeting.id
        ) OR EXISTS (
          SELECT 1
            FROM jsonb_array_elements(p_payload->'segments') item
           GROUP BY item->>'sourceSegmentId'
          HAVING count(*) <> 1
        ) THEN
          RAISE EXCEPTION 'AGENDA_MEETING_REVISION_SEGMENTS_INCOMPLETE';
        END IF;
        SELECT string_agg(btrim(item->>'text'), E'\n' ORDER BY source.sequence)
          INTO transcript_content
          FROM jsonb_array_elements(p_payload->'segments') item
          JOIN public.agenda_meeting_transcript_segments source
            ON source.id=(item->>'sourceSegmentId')::uuid
           AND source.session_id=meeting.id
         WHERE NULLIF(btrim(item->>'text'),'') IS NOT NULL;
        IF transcript_content IS NULL OR (
          SELECT count(*)
            FROM jsonb_array_elements(p_payload->'segments') item
            JOIN public.agenda_meeting_transcript_segments source
              ON source.id=(item->>'sourceSegmentId')::uuid
             AND source.session_id=meeting.id
           WHERE NULLIF(btrim(item->>'text'),'') IS NOT NULL
        ) <> jsonb_array_length(p_payload->'segments') THEN
          RAISE EXCEPTION 'AGENDA_MEETING_INVALID_REVISION_SEGMENT';
        END IF;
        SELECT COALESCE(max(version),0)+1 INTO next_version
          FROM public.agenda_meeting_transcript_versions WHERE session_id = meeting.id;
        transcript_hash := encode(extensions.digest(convert_to(transcript_content,'UTF8'),'sha256'),'hex');
        INSERT INTO public.agenda_meeting_transcript_versions (
          session_id,org_id,event_id,version,kind,parent_version_id,transcript_text,
          content_hash,is_complete,missing_sequences,revision_reason,created_by
        ) VALUES (
          meeting.id,meeting.org_id,meeting.event_id,next_version,'manual_revision',target_transcript.id,
          transcript_content,transcript_hash,target_transcript.is_complete,target_transcript.missing_sequences,
          NULLIF(btrim(p_payload->>'reason'),''),p_actor_user_id
        ) RETURNING id INTO new_transcript_id;
        INSERT INTO public.agenda_meeting_transcript_revision_segments (
          transcript_version_id,session_id,org_id,event_id,source_segment_id,sequence,
          revised_text,source_content_hash,revised_content_hash
        )
        SELECT new_transcript_id,meeting.id,meeting.org_id,meeting.event_id,source.id,source.sequence,
               btrim(item->>'text'),source.content_hash,
               encode(extensions.digest(convert_to(btrim(item->>'text'),'UTF8'),'sha256'),'hex')
          FROM jsonb_array_elements(p_payload->'segments') item
          JOIN public.agenda_meeting_transcript_segments source
            ON source.id=(item->>'sourceSegmentId')::uuid
           AND source.session_id=meeting.id
         ORDER BY source.sequence;
        PERFORM public.agenda_meeting_enqueue_job(
          meeting.id,'analysis_generate','revision:' || new_transcript_id::text,new_transcript_id
        );
        UPDATE public.agenda_meeting_sessions
           SET processing_state='analysis_queued',version=version+1,updated_at=now()
         WHERE id=meeting.id RETURNING * INTO meeting;
        PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','transcript_revision_created','transcript_version',new_transcript_id,p_mutation_id);

      WHEN 'review_minutes' THEN
        target_minutes_id := (p_payload->>'minutesVersionId')::uuid;
        decision := p_payload->>'decision';
        IF decision NOT IN ('approve','request_changes') THEN RAISE EXCEPTION 'AGENDA_MEETING_INVALID_REVIEW'; END IF;
        UPDATE public.agenda_meeting_minutes_versions
           SET status = CASE WHEN decision='approve' THEN 'reviewed' ELSE 'changes_requested' END,
               reviewed_by=p_actor_user_id,reviewed_at=now(),review_note=NULLIF(btrim(p_payload->>'note'),'')
         WHERE id=target_minutes_id AND session_id=meeting.id
           AND status IN ('draft','changes_requested')
           AND NOT EXISTS (
             SELECT 1 FROM public.agenda_meeting_minutes_versions newer
              WHERE newer.session_id=meeting.id
                AND newer.version > agenda_meeting_minutes_versions.version
           );
        IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_MINUTES_NOT_FOUND'; END IF;
        UPDATE public.agenda_meeting_sessions
           SET processing_state=CASE WHEN decision='approve' THEN 'completed' ELSE 'review_required' END,
               completed_at=CASE WHEN decision='approve' THEN now() ELSE NULL END,
               version=version+1,updated_at=now()
         WHERE id=meeting.id RETURNING * INTO meeting;
        PERFORM public.agenda_meeting_write_audit(
          meeting.id,p_actor_user_id,'user',CASE WHEN decision='approve' THEN 'minutes_approved' ELSE 'minutes_changes_requested' END,
          'minutes_version',target_minutes_id,p_mutation_id
        );

      WHEN 'update_action' THEN
        target_action_id := (p_payload->>'actionId')::uuid;
        IF p_payload ? 'confirmedUserId' AND NULLIF(p_payload->>'confirmedUserId','') IS NOT NULL THEN
          assignee := (p_payload->>'confirmedUserId')::uuid;
          IF NOT EXISTS (
            SELECT 1 FROM public.org_members member
             WHERE member.org_id=meeting.org_id AND member.user_id=assignee AND member.is_active=true
          ) THEN RAISE EXCEPTION 'AGENDA_MEETING_INVALID_ASSIGNEE'; END IF;
        END IF;
        UPDATE public.agenda_meeting_action_items action_item
           SET title=CASE WHEN p_payload ? 'title' THEN NULLIF(btrim(p_payload->>'title'),'') ELSE action_item.title END,
               description=CASE WHEN p_payload ? 'description' THEN COALESCE(p_payload->>'description','') ELSE action_item.description END,
               confirmed_user_id=CASE WHEN p_payload ? 'confirmedUserId' THEN assignee ELSE action_item.confirmed_user_id END,
               due_date=CASE WHEN p_payload ? 'dueDate' AND NULLIF(p_payload->>'dueDate','') IS NOT NULL
                              THEN (p_payload->>'dueDate')::date
                              WHEN p_payload ? 'dueDate' THEN NULL ELSE action_item.due_date END,
               due_date_confirmed=CASE WHEN p_payload ? 'dueDate'
                                       THEN NULLIF(p_payload->>'dueDate','') IS NOT NULL
                                       ELSE action_item.due_date_confirmed END,
               status=CASE WHEN p_payload ? 'status' THEN p_payload->>'status' ELSE action_item.status END,
               confirmed_by=CASE WHEN p_payload ? 'confirmedUserId' THEN p_actor_user_id ELSE action_item.confirmed_by END,
               confirmed_at=CASE WHEN p_payload ? 'confirmedUserId' THEN now() ELSE action_item.confirmed_at END,
               updated_by=p_actor_user_id,updated_at=now()
         WHERE action_item.id=target_action_id AND action_item.session_id=meeting.id
           AND action_item.minutes_version_id = (
             SELECT latest_minutes.id
               FROM public.agenda_meeting_minutes_versions latest_minutes
              WHERE latest_minutes.session_id=meeting.id
                AND latest_minutes.status <> 'superseded'
              ORDER BY latest_minutes.version DESC
              LIMIT 1
           );
        IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_ACTION_NOT_FOUND'; END IF;
        UPDATE public.agenda_meeting_sessions SET version=version+1,updated_at=now()
         WHERE id=meeting.id RETURNING * INTO meeting;
        PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','action_item_updated','action_item',target_action_id,p_mutation_id);

      WHEN 'retry_analysis' THEN
        SELECT * INTO target_transcript FROM public.agenda_meeting_transcript_versions
         WHERE session_id=meeting.id ORDER BY version DESC LIMIT 1;
        IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_TRANSCRIPT_NOT_READY'; END IF;
        IF cardinality(target_transcript.missing_sequences)>0
           AND meeting.partial_analysis_confirmed IS NOT TRUE
           AND COALESCE((p_payload->>'confirmPartial')::boolean,false) IS NOT TRUE THEN
          RAISE EXCEPTION 'AGENDA_MEETING_PARTIAL_ANALYSIS_CONFIRMATION_REQUIRED';
        END IF;
        PERFORM public.agenda_meeting_enqueue_job(
          meeting.id,'analysis_generate','manual-retry:' || p_mutation_id::text,target_transcript.id
        );
        UPDATE public.agenda_meeting_sessions
           SET processing_state='analysis_queued',last_error_code=NULL,last_error_at=NULL,
               partial_analysis_confirmed=partial_analysis_confirmed
                 OR COALESCE((p_payload->>'confirmPartial')::boolean,false),
               version=version+1,updated_at=now()
         WHERE id=meeting.id RETURNING * INTO meeting;
        PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','analysis_retry_requested','session',meeting.id,p_mutation_id);

      WHEN 'delete' THEN
        UPDATE public.agenda_meeting_processing_jobs SET status='cancelled',lease_token=NULL,lease_expires_at=NULL,updated_at=now()
         WHERE session_id=meeting.id AND status IN ('queued','retry_wait','in_flight');
        PERFORM public.agenda_meeting_write_audit(meeting.id,p_actor_user_id,'user','session_deleted','session',meeting.id,p_mutation_id);
        deletion_session_id := meeting.id;
        PERFORM public.agenda_meeting_capture_tombstone(meeting.id,'session',p_actor_user_id);
        DELETE FROM public.agenda_meeting_sessions WHERE id=meeting.id;
        result := jsonb_build_object('deletedSessionId',deletion_session_id);
    END CASE;
    IF p_action <> 'delete' THEN
      result := public.agenda_meeting_detail_json(meeting.id);
    END IF;
  END IF;

  receipt_response := CASE WHEN p_action='delete' THEN result ELSE jsonb_build_object(
    'sessionId',COALESCE(meeting.id,p_session_id),
    'sessionVersion',meeting.version,
    'action',p_action
  ) END;
  INSERT INTO public.agenda_meeting_mutation_receipts (
    actor_user_id,org_id,event_id,action,mutation_id,session_id,response
  ) VALUES (
    p_actor_user_id,p_org_id,p_event_id,p_action,p_mutation_id,
    COALESCE(deletion_session_id,meeting.id,p_session_id),receipt_response
  );
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.agenda_meeting_control(text,uuid,uuid,uuid,uuid,uuid,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_control(text,uuid,uuid,uuid,uuid,uuid,bigint,jsonb) TO service_role;
