CREATE OR REPLACE FUNCTION public.agenda_meeting_ingest_text_segment(
  p_actor_user_id uuid,
  p_session_id uuid,
  p_segment_id uuid,
  p_sequence integer,
  p_capture_start_ms bigint,
  p_capture_end_ms bigint,
  p_transcript text,
  p_mutation_id uuid,
  p_confidence numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
  receipt public.agenda_meeting_segment_receipts%ROWTYPE;
  normalized_text text;
  text_bytes bigint;
  text_hash text;
  segment_row_id uuid;
BEGIN
  normalized_text := COALESCE(p_transcript, '');
  IF length(normalized_text) > 100000 THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_SEGMENT';
  END IF;
  IF p_actor_user_id IS NULL OR p_session_id IS NULL OR p_segment_id IS NULL OR p_mutation_id IS NULL
     OR p_sequence < 0 OR p_sequence > 10000
     OR p_capture_start_ms < 0 OR p_capture_end_ms <= p_capture_start_ms
     OR p_capture_end_ms > 14400000 THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_SEGMENT';
  END IF;

  text_bytes := GREATEST(1, octet_length(normalized_text));
  text_hash := encode(extensions.digest(convert_to(normalized_text, 'UTF8'), 'sha256'), 'hex');

  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR meeting.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;
  IF NOT public.agenda_meeting_actor_allowed(
    p_actor_user_id, 'transcribe_segment', meeting.org_id, meeting.event_id, meeting.id
  ) THEN RAISE EXCEPTION 'AGENDA_MEETING_FORBIDDEN'; END IF;
  IF meeting.capture_state IN ('cancelled') OR meeting.processing_state IN ('cancelled','completed') THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION';
  END IF;
  IF meeting.closed_sequence IS NOT NULL AND p_sequence > meeting.closed_sequence THEN
    RAISE EXCEPTION 'AGENDA_MEETING_SEQUENCE_CLOSED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text || ':' || p_sequence::text, 0));
  SELECT * INTO receipt
    FROM public.agenda_meeting_segment_receipts
   WHERE session_id = p_session_id AND (sequence = p_sequence OR segment_id = p_segment_id)
   FOR UPDATE;

  IF FOUND THEN
    IF receipt.sequence <> p_sequence OR receipt.segment_id <> p_segment_id THEN
      RAISE EXCEPTION 'AGENDA_MEETING_SEGMENT_CONFLICT';
    END IF;
    IF receipt.status = 'transcribed' THEN
      RETURN jsonb_build_object(
        'receiptId', receipt.id, 'canonicalReceiptId', receipt.id, 'segmentId', receipt.segment_id,
        'sequence', receipt.sequence, 'status', 'transcribed', 'duplicate', true
      );
    END IF;
    UPDATE public.agenda_meeting_segment_receipts
       SET attempt_id = gen_random_uuid(),
           mutation_id = p_mutation_id,
           status = 'transcribed',
           attempt_count = attempt_count + 1,
           mime_type = 'text/plain',
           byte_size = text_bytes,
           sha256 = text_hash,
           capture_start_ms = p_capture_start_ms,
           capture_end_ms = p_capture_end_ms,
           callback_digest = text_hash,
           callback_received_at = now(),
           provider_request_id = 'native-speech:' || p_segment_id::text,
           provider_accepted_at = COALESCE(provider_accepted_at, now()),
           transcribed_at = now(),
           retry_after_ms = NULL,
           error_code = NULL,
           updated_at = now()
     WHERE id = receipt.id RETURNING * INTO receipt;
  ELSE
    INSERT INTO public.agenda_meeting_segment_receipts (
      session_id, org_id, event_id, segment_id, sequence, capture_start_ms, capture_end_ms,
      mime_type, byte_size, sha256, mutation_id, status,
      callback_token_hash, callback_token_expires_at, callback_digest, callback_received_at,
      provider_request_id, provider_accepted_at, transcribed_at
    ) VALUES (
      meeting.id, meeting.org_id, meeting.event_id, p_segment_id, p_sequence, p_capture_start_ms, p_capture_end_ms,
      'text/plain', text_bytes, text_hash, p_mutation_id, 'transcribed',
      encode(extensions.digest(convert_to(p_segment_id::text || ':' || p_mutation_id::text, 'UTF8'), 'sha256'), 'hex'),
      now() + interval '30 minutes', text_hash, now(),
      'native-speech:' || p_segment_id::text, now(), now()
    ) RETURNING * INTO receipt;
  END IF;

  INSERT INTO public.agenda_meeting_transcript_segments (
    session_id, org_id, event_id, receipt_id, segment_id, sequence, transcript_text, words,
    duration_ms, confidence, provider_request_id, content_hash
  ) VALUES (
    receipt.session_id, receipt.org_id, receipt.event_id, receipt.id, receipt.segment_id, receipt.sequence,
    normalized_text, '[]'::jsonb, (p_capture_end_ms - p_capture_start_ms), p_confidence,
    receipt.provider_request_id, text_hash
  )
  ON CONFLICT (receipt_id) DO NOTHING
  RETURNING id INTO segment_row_id;
  IF segment_row_id IS NULL THEN
    SELECT id INTO segment_row_id FROM public.agenda_meeting_transcript_segments WHERE receipt_id = receipt.id;
  END IF;

  UPDATE public.agenda_meeting_sessions
     SET last_received_sequence = GREATEST(last_received_sequence, p_sequence),
         processing_state = CASE WHEN processing_state = 'accepting_segments' THEN 'transcribing' ELSE processing_state END,
         updated_at = now()
   WHERE id = meeting.id;

  meeting := public.agenda_meeting_refresh_sequence_state(receipt.session_id);
  IF meeting.closed_sequence IS NOT NULL AND cardinality(meeting.unresolved_sequences) = 0 THEN
    PERFORM public.agenda_meeting_enqueue_job(
      meeting.id, 'assemble_transcript', 'closed:' || meeting.closed_sequence::text
    );
    UPDATE public.agenda_meeting_sessions SET processing_state = 'assembling', updated_at = now()
     WHERE id = meeting.id;
  END IF;

  PERFORM public.agenda_meeting_write_audit(
    receipt.session_id, p_actor_user_id, 'user', 'segment_transcribed', 'transcript_segment', segment_row_id, p_mutation_id,
    jsonb_build_object('sequence', receipt.sequence, 'source', 'native_speech_recognition')
  );

  RETURN jsonb_build_object(
    'receiptId', receipt.id, 'canonicalReceiptId', receipt.id, 'segmentId', receipt.segment_id,
    'sequence', receipt.sequence, 'status', 'transcribed', 'duplicate', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.agenda_meeting_ingest_text_segment(uuid,uuid,uuid,integer,bigint,bigint,text,uuid,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_ingest_text_segment(uuid,uuid,uuid,integer,bigint,bigint,text,uuid,numeric) TO service_role;