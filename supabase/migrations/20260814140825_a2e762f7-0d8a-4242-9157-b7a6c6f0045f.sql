-- ---------------------------------------------------------------------------
-- Internal audit, aggregation and queue helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agenda_meeting_write_audit(
  p_session_id uuid,
  p_actor_user_id uuid,
  p_actor_kind text,
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_mutation_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
BEGIN
  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;
  INSERT INTO public.agenda_meeting_audit_events (
    session_id, org_id, event_id, actor_user_id, actor_kind, action,
    entity_type, entity_id, mutation_id, metadata
  ) VALUES (
    meeting.id, meeting.org_id, meeting.event_id, p_actor_user_id, p_actor_kind,
    p_action, p_entity_type, p_entity_id, p_mutation_id, COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_enqueue_job(
  p_session_id uuid,
  p_kind text,
  p_dedupe_key text,
  p_transcript_version_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
  job_id uuid;
BEGIN
  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;
  INSERT INTO public.agenda_meeting_processing_jobs (
    session_id, org_id, event_id, transcript_version_id, kind, dedupe_key
  ) VALUES (
    meeting.id, meeting.org_id, meeting.event_id, p_transcript_version_id, p_kind, p_dedupe_key
  )
  ON CONFLICT (session_id, kind, dedupe_key) DO UPDATE
    SET updated_at = public.agenda_meeting_processing_jobs.updated_at
  RETURNING id INTO job_id;
  RETURN job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_refresh_sequence_state(p_session_id uuid)
RETURNS public.agenda_meeting_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
  max_sequence integer;
  first_gap integer;
  known_gaps integer[];
  unresolved integer[];
BEGIN
  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;

  SELECT COALESCE(max(sequence), -1) INTO max_sequence
    FROM public.agenda_meeting_segment_receipts WHERE session_id = p_session_id;

  SELECT min(candidate.sequence) INTO first_gap
    FROM generate_series(0, GREATEST(max_sequence, 0)) AS candidate(sequence)
    LEFT JOIN public.agenda_meeting_segment_receipts receipt
      ON receipt.session_id = p_session_id
     AND receipt.sequence = candidate.sequence
     AND receipt.status IN ('transcribed','lost')
   WHERE receipt.id IS NULL;

  IF meeting.closed_sequence IS NULL OR meeting.closed_sequence < 0 THEN
    known_gaps := '{}'::integer[];
    unresolved := '{}'::integer[];
  ELSE
    SELECT COALESCE(array_agg(candidate.sequence ORDER BY candidate.sequence), '{}'::integer[])
      INTO unresolved
      FROM generate_series(0, meeting.closed_sequence) AS candidate(sequence)
      LEFT JOIN public.agenda_meeting_segment_receipts receipt
        ON receipt.session_id = p_session_id
       AND receipt.sequence = candidate.sequence
       AND receipt.status IN ('transcribed','lost')
     WHERE receipt.id IS NULL;

    SELECT COALESCE(array_agg(receipt.sequence ORDER BY receipt.sequence), '{}'::integer[])
      INTO known_gaps
      FROM public.agenda_meeting_segment_receipts receipt
     WHERE receipt.session_id = p_session_id
       AND receipt.sequence BETWEEN 0 AND meeting.closed_sequence
       AND receipt.status = 'lost';
  END IF;

  UPDATE public.agenda_meeting_sessions
     SET last_received_sequence = max_sequence,
         last_contiguous_sequence = CASE
           WHEN max_sequence < 0 THEN -1
           WHEN first_gap IS NULL THEN max_sequence
           ELSE first_gap - 1
         END,
         missing_sequences = known_gaps,
         unresolved_sequences = unresolved,
         processing_state = CASE
           WHEN closed_sequence IS NOT NULL AND cardinality(unresolved) > 0 THEN 'awaiting_client_replay'
           WHEN closed_sequence IS NOT NULL AND cardinality(known_gaps) > 0
             AND processing_state IN ('awaiting_client_replay','transcribing','accepting_segments')
             THEN 'partial_transcript'
           ELSE processing_state
         END,
         updated_at = now()
   WHERE id = p_session_id
   RETURNING * INTO meeting;
  RETURN meeting;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_session_summary_json(p_session_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',meeting.id,
    'orgId',meeting.org_id,
    'eventId',meeting.event_id,
    'state',CASE
      WHEN meeting.deleted_at IS NOT NULL THEN 'deleted'
      WHEN meeting.processing_state='failed' THEN 'failed'
      WHEN meeting.processing_state='cancelled' OR meeting.capture_state='cancelled' THEN 'cancelled'
      WHEN meeting.processing_state='completed' THEN 'completed'
      WHEN meeting.processing_state='review_required' THEN 'review_required'
      WHEN meeting.processing_state='analyzing' THEN 'analyzing'
      WHEN meeting.processing_state='analysis_queued' THEN 'analysis_queued'
      WHEN meeting.processing_state='partial_transcript' THEN 'transcript_ready_with_gaps'
      WHEN meeting.processing_state='transcript_complete' THEN 'transcript_ready'
      WHEN meeting.capture_state='stopped' THEN 'finalizing_transcript'
      WHEN meeting.capture_state='interrupted' THEN 'capture_interrupted'
      WHEN meeting.capture_state='paused' THEN 'paused'
      WHEN meeting.capture_state='recording' THEN 'recording'
      ELSE 'created'
    END,
    'captureState',CASE meeting.capture_state
      WHEN 'recording' THEN 'recording'
      WHEN 'paused' THEN 'paused'
      WHEN 'interrupted' THEN 'interrupted'
      WHEN 'idle' THEN 'idle'
      ELSE 'ended'
    END,
    'processingState',CASE meeting.processing_state
      WHEN 'assembling' THEN 'finalizing_transcript'
      WHEN 'awaiting_client_replay' THEN 'finalizing_transcript'
      WHEN 'transcript_complete' THEN 'transcript_ready'
      WHEN 'partial_transcript' THEN 'transcript_ready_with_gaps'
      WHEN 'analysis_queued' THEN 'analysis_queued'
      WHEN 'analyzing' THEN 'analyzing'
      WHEN 'review_required' THEN 'review_required'
      WHEN 'completed' THEN 'completed'
      WHEN 'failed' THEN 'failed'
      ELSE 'idle'
    END,
    'createdBy',meeting.started_by,
    'createdAt',meeting.created_at,
    'startedAt',meeting.started_at,
    'endedAt',meeting.ended_at,
    'activeDurationMs',meeting.active_duration_ms,
    'transcriptCoverage',CASE
      WHEN latest.id IS NULL THEN 'pending'
      WHEN cardinality(latest.missing_sequences)>0 THEN 'with_gaps'
      ELSE 'complete'
    END,
    'transcriptSegmentCount',(
      SELECT count(*) FROM public.agenda_meeting_transcript_segments segment
       WHERE segment.session_id=meeting.id
    ),
    'actionItemCount',(
      SELECT count(*) FROM public.agenda_meeting_action_items action_item
       WHERE action_item.session_id=meeting.id
    ),
    'pendingActionItemCount',(
      SELECT count(*) FROM public.agenda_meeting_action_items action_item
       WHERE action_item.session_id=meeting.id
         AND action_item.status NOT IN ('completed','dismissed')
    ),
    'version',meeting.version
  )
  FROM public.agenda_meeting_sessions meeting
  LEFT JOIN LATERAL (
    SELECT transcript.id,transcript.kind,transcript.missing_sequences
      FROM public.agenda_meeting_transcript_versions transcript
     WHERE transcript.session_id=meeting.id
     ORDER BY transcript.version DESC LIMIT 1
  ) latest ON true
  WHERE meeting.id=p_session_id;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_detail_json(p_session_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'session',public.agenda_meeting_session_summary_json(meeting.id) || jsonb_build_object(
      'eventSnapshot',jsonb_build_object(
        'title',COALESCE(meeting.event_context->>'title',''),
        'description',meeting.event_context->>'description',
        'startsAt',COALESCE(meeting.event_context->>'startsAt',meeting.event_context->>'startDate'),
        'endsAt',COALESCE(meeting.event_context->>'endsAt',meeting.event_context->>'endDate'),
        'location',meeting.event_context->>'location',
        'responsibleNames',COALESCE((
          SELECT jsonb_agg(item->>'name')
            FROM jsonb_array_elements(COALESCE(meeting.event_context->'responsibles','[]'::jsonb)) item
           WHERE NULLIF(btrim(item->>'name'),'') IS NOT NULL
        ),'[]'::jsonb),
        'commissionNames',COALESCE((
          SELECT jsonb_agg(item->>'name')
            FROM jsonb_array_elements(COALESCE(meeting.event_context->'commissions','[]'::jsonb)) item
           WHERE NULLIF(btrim(item->>'name'),'') IS NOT NULL
        ),'[]'::jsonb)
      ),
      'failedStage',COALESCE((
        SELECT job.kind
          FROM public.agenda_meeting_processing_jobs job
         WHERE job.session_id=meeting.id AND job.last_error_code IS NOT NULL
         ORDER BY job.updated_at DESC LIMIT 1
      ),CASE WHEN meeting.last_error_code IS NOT NULL THEN 'transcription' ELSE NULL END),
      'errorCode',meeting.last_error_code,
      'retryable',EXISTS (
        SELECT 1 FROM public.agenda_meeting_processing_jobs job
         WHERE job.session_id=meeting.id AND job.status='retry_wait'
        UNION ALL
        SELECT 1 FROM public.agenda_meeting_segment_receipts receipt
         WHERE receipt.session_id=meeting.id AND receipt.status='retryable_error'
      )
    ),
    'receipts',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'segmentId',receipt.segment_id,
        'sequence',receipt.sequence,
        'status',CASE WHEN receipt.status='lost' THEN 'terminal_error' ELSE receipt.status END,
        'canonicalReceiptId',CASE WHEN receipt.status='transcribed' THEN receipt.id ELSE NULL END,
        'retryAfterMs',receipt.retry_after_ms,
        'errorCode',receipt.error_code
      ) ORDER BY receipt.sequence)
      FROM public.agenda_meeting_segment_receipts receipt
      WHERE receipt.session_id=meeting.id
    ),'[]'::jsonb),
    'transcriptVersions',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',transcript.id,
        'version',transcript.version,
        'kind',CASE WHEN transcript.kind='manual_revision' THEN 'normalized_manual' ELSE 'canonical' END,
        'coverage',CASE WHEN cardinality(transcript.missing_sequences)>0 THEN 'with_gaps'
                        ELSE 'complete' END,
        'language',meeting.language,
        'sha256',transcript.content_hash,
        'createdAt',transcript.created_at,
        'createdBy',transcript.created_by
      ) ORDER BY transcript.version ASC)
      FROM public.agenda_meeting_transcript_versions transcript
      WHERE transcript.session_id=meeting.id
    ),'[]'::jsonb),
    'transcriptSegments',COALESCE((
      SELECT jsonb_agg(segment_view.payload ORDER BY segment_view.version_number,segment_view.sequence,segment_view.sort_order)
      FROM (
        SELECT transcript.version AS version_number,source.sequence,0 AS sort_order,
          jsonb_build_object(
            'id',source.id,
            'transcriptVersionId',transcript.id,
            'sequence',source.sequence,
            'kind','speech',
            'captureStartMs',receipt.capture_start_ms,
            'captureEndMs',receipt.capture_end_ms,
            'text',source.transcript_text,
            'confidence',source.confidence,
            'speakerLabel',NULL,
            -- Revisions reference the immutable canonical transcript row, not
            -- the browser-generated upload identifier.
            'sourceSegmentId',source.id
          ) AS payload
        FROM public.agenda_meeting_transcript_versions transcript
        JOIN public.agenda_meeting_transcript_segments source ON source.session_id=transcript.session_id
        JOIN public.agenda_meeting_segment_receipts receipt ON receipt.id=source.receipt_id
        WHERE transcript.session_id=meeting.id AND transcript.kind='canonical'
        UNION ALL
        SELECT transcript.version,gap.sequence,1,
          jsonb_build_object(
            'id',transcript.id::text || ':gap:' || gap.sequence::text,
            'transcriptVersionId',transcript.id,
            'sequence',gap.sequence,
            'kind','gap',
            'captureStartMs',COALESCE(receipt.capture_start_ms,0),
            'captureEndMs',COALESCE(receipt.capture_end_ms,0),
            'text','',
            'confidence',NULL,
            'speakerLabel',NULL,
            'sourceSegmentId',NULL
          )
        FROM public.agenda_meeting_transcript_versions transcript
        JOIN LATERAL unnest(transcript.missing_sequences) gap(sequence) ON true
        LEFT JOIN public.agenda_meeting_segment_receipts receipt
          ON receipt.session_id=transcript.session_id AND receipt.sequence=gap.sequence
        WHERE transcript.session_id=meeting.id
        UNION ALL
        SELECT transcript.version,revision.sequence,0,
          jsonb_build_object(
            'id',revision.id,
            'transcriptVersionId',transcript.id,
            'sequence',revision.sequence,
            'kind','manual',
            'captureStartMs',receipt.capture_start_ms,
            'captureEndMs',receipt.capture_end_ms,
            'text',revision.revised_text,
            'confidence',source.confidence,
            'speakerLabel',NULL,
            'sourceSegmentId',revision.source_segment_id
          )
        FROM public.agenda_meeting_transcript_versions transcript
        JOIN public.agenda_meeting_transcript_revision_segments revision
          ON revision.transcript_version_id=transcript.id
        JOIN public.agenda_meeting_transcript_segments source ON source.id=revision.source_segment_id
        JOIN public.agenda_meeting_segment_receipts receipt ON receipt.id=source.receipt_id
        WHERE transcript.session_id=meeting.id AND transcript.kind='manual_revision'
      ) segment_view
    ),'[]'::jsonb),
    'minutesVersions',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',minutes.id,
        'version',minutes.version,
        'state',CASE WHEN minutes.status='reviewed' THEN 'reviewed'
                     WHEN minutes.status='superseded' THEN 'superseded'
                     ELSE 'ai_draft' END,
        'title',minutes.title,
        'executiveSummary',minutes.summary,
        'minutesMarkdown',minutes.minutes_markdown,
        'sourceTranscriptVersionId',minutes.transcript_version_id,
        'coverage',minutes.transcript_coverage,
        'model',minutes.analysis_model,
        'promptVersion',minutes.prompt_version,
        'schemaVersion',minutes.schema_version,
        'createdAt',minutes.created_at,
        'reviewedAt',minutes.reviewed_at,
        'reviewedBy',minutes.reviewed_by
      ) ORDER BY minutes.version ASC)
      FROM public.agenda_meeting_minutes_versions minutes
      WHERE minutes.session_id=meeting.id
    ),'[]'::jsonb),
    'insights',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',insight.id,
        'kind',CASE insight.insight_type
          WHEN 'pending_item' THEN 'pending'
          WHEN 'important_point' THEN 'important'
          ELSE insight.insight_type END,
        'title',insight.title,
        'detail',insight.description,
        'evidence',insight.evidence
      ) ORDER BY insight.created_at DESC,insight.position)
      FROM public.agenda_meeting_insights insight
      WHERE insight.session_id=meeting.id
    ),'[]'::jsonb),
    'actions',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',action_item.id,
        'title',action_item.title,
        'description',NULLIF(action_item.description,''),
        'status',action_item.status,
        'responsibleText',action_item.responsible_text,
        'suggestedMemberId',action_item.suggested_user_id,
        'confirmedMemberId',action_item.confirmed_user_id,
        'responsibleResolution',CASE
          WHEN action_item.confirmed_user_id IS NOT NULL THEN 'confirmed'
          WHEN action_item.suggested_user_id IS NOT NULL THEN 'suggested'
          ELSE 'unresolved' END,
        'dueDateText',action_item.due_date_text,
        'dueDate',action_item.due_date,
        'dueDateConfirmed',action_item.due_date_confirmed,
        'evidence',action_item.evidence
      ) ORDER BY action_item.created_at DESC,action_item.position)
      FROM public.agenda_meeting_action_items action_item
      WHERE action_item.session_id=meeting.id
    ),'[]'::jsonb)
  )
  FROM public.agenda_meeting_sessions meeting
  WHERE meeting.id=p_session_id;
$$;

REVOKE ALL ON FUNCTION public.agenda_meeting_write_audit(uuid,uuid,text,text,text,uuid,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_enqueue_job(uuid,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_refresh_sequence_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_detail_json(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_write_audit(uuid,uuid,text,text,text,uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_enqueue_job(uuid,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_refresh_sequence_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_detail_json(uuid) TO service_role;
