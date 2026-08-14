-- ---------------------------------------------------------------------------
-- Ephemeral segment handoff and replay-safe callback persistence
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agenda_meeting_prepare_segment(
  p_actor_user_id uuid,
  p_session_id uuid,
  p_segment_id uuid,
  p_sequence integer,
  p_capture_start_ms bigint,
  p_capture_end_ms bigint,
  p_mime_type text,
  p_byte_size bigint,
  p_sha256 text,
  p_mutation_id uuid,
  p_callback_token_hash text,
  p_callback_token_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
  receipt public.agenda_meeting_segment_receipts%ROWTYPE;
  should_forward boolean := true;
  keyterms jsonb;
BEGIN
  IF p_actor_user_id IS NULL OR p_session_id IS NULL OR p_segment_id IS NULL OR p_mutation_id IS NULL
     OR p_sequence < 0 OR p_sequence > 10000
     OR p_capture_start_ms < 0 OR p_capture_end_ms <= p_capture_start_ms
     OR p_capture_end_ms > 14400000
     OR p_byte_size <= 0 OR p_byte_size > 2097152
     OR lower(p_sha256) !~ '^[0-9a-f]{64}$'
     OR lower(p_callback_token_hash) !~ '^[0-9a-f]{64}$'
     OR p_callback_token_expires_at <= now()
     OR lower(p_mime_type) !~ '^audio/(webm|ogg|mp4|wav|wave|x-wav)(;.*)?$' THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_SEGMENT';
  END IF;

  SELECT * INTO meeting FROM public.agenda_meeting_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND OR meeting.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_NOT_FOUND'; END IF;
  IF NOT public.agenda_meeting_actor_allowed(
    p_actor_user_id,'transcribe_segment',meeting.org_id,meeting.event_id,meeting.id
  ) THEN RAISE EXCEPTION 'AGENDA_MEETING_FORBIDDEN'; END IF;
  IF meeting.capture_state IN ('cancelled') OR meeting.processing_state IN ('cancelled','completed') THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION';
  END IF;
  IF meeting.closed_sequence IS NOT NULL AND p_sequence > meeting.closed_sequence THEN
    RAISE EXCEPTION 'AGENDA_MEETING_SEQUENCE_CLOSED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text || ':' || p_sequence::text,0));
  SELECT * INTO receipt
    FROM public.agenda_meeting_segment_receipts
   WHERE session_id=p_session_id AND (sequence=p_sequence OR segment_id=p_segment_id)
   FOR UPDATE;

  IF FOUND THEN
    IF receipt.sequence <> p_sequence OR receipt.segment_id <> p_segment_id
       OR receipt.sha256 IS DISTINCT FROM lower(p_sha256)
       OR receipt.byte_size IS DISTINCT FROM p_byte_size
       OR receipt.capture_start_ms <> p_capture_start_ms
       OR receipt.capture_end_ms <> p_capture_end_ms THEN
      RAISE EXCEPTION 'AGENDA_MEETING_SEGMENT_CONFLICT';
    END IF;
    IF receipt.status = 'transcribed' THEN
      should_forward := false;
    ELSIF receipt.status = 'terminal_error' OR receipt.status = 'lost' THEN
      should_forward := false;
    ELSIF receipt.attempt_count >= 5 OR receipt.created_at <= now() - interval '15 minutes' THEN
      UPDATE public.agenda_meeting_segment_receipts
         SET status='terminal_error',retry_after_ms=NULL,
             error_code='segment_retry_exhausted',updated_at=now()
       WHERE id=receipt.id RETURNING * INTO receipt;
      should_forward := false;
      PERFORM public.agenda_meeting_write_audit(
        receipt.session_id,p_actor_user_id,'user','segment_failed','segment',receipt.segment_id,p_mutation_id,
        jsonb_build_object('sequence',receipt.sequence,'errorCode',receipt.error_code,'terminal',true)
      );
    ELSIF receipt.status = 'processing' AND receipt.provider_request_id IS NOT NULL THEN
      should_forward := false;
    ELSIF receipt.status = 'accepted' AND receipt.updated_at > now() - interval '2 minutes' THEN
      should_forward := false;
    ELSE
      UPDATE public.agenda_meeting_segment_receipts
         SET attempt_id=gen_random_uuid(),mutation_id=p_mutation_id,status='accepted',
             attempt_count=attempt_count+1,retry_after_ms=NULL,
             callback_token_hash=lower(p_callback_token_hash),
             callback_token_expires_at=p_callback_token_expires_at,
             callback_digest=NULL,callback_received_at=NULL,
             provider_request_id=NULL,provider_accepted_at=NULL,
             error_code=NULL,updated_at=now()
       WHERE id=receipt.id RETURNING * INTO receipt;
    END IF;
  ELSE
    INSERT INTO public.agenda_meeting_segment_receipts (
      session_id,org_id,event_id,segment_id,sequence,capture_start_ms,capture_end_ms,
      mime_type,byte_size,sha256,mutation_id,status,callback_token_hash,callback_token_expires_at
    ) VALUES (
      meeting.id,meeting.org_id,meeting.event_id,p_segment_id,p_sequence,p_capture_start_ms,p_capture_end_ms,
      lower(p_mime_type),p_byte_size,lower(p_sha256),p_mutation_id,'accepted',
      lower(p_callback_token_hash),p_callback_token_expires_at
    ) RETURNING * INTO receipt;
  END IF;

  UPDATE public.agenda_meeting_sessions
     SET last_received_sequence=GREATEST(last_received_sequence,p_sequence),
         processing_state=CASE WHEN processing_state='accepting_segments' THEN 'transcribing' ELSE processing_state END,
         updated_at=now()
   WHERE id=meeting.id;

  SELECT jsonb_build_array(event_context->>'title',event_context->>'location')
         || COALESCE(event_context->'responsibles','[]'::jsonb)
         || COALESCE(event_context->'commissions','[]'::jsonb)
    INTO keyterms
    FROM public.agenda_meeting_sessions WHERE id=meeting.id;

  IF should_forward THEN
    PERFORM public.agenda_meeting_write_audit(
      meeting.id,p_actor_user_id,'user','segment_accepted','segment',p_segment_id,p_mutation_id,
      jsonb_build_object('sequence',p_sequence,'byteSize',p_byte_size,'mimeType',lower(p_mime_type))
    );
  END IF;
  RETURN jsonb_build_object(
    'receiptId',receipt.id,
    'canonicalReceiptId',CASE WHEN receipt.status='transcribed' THEN receipt.id ELSE NULL END,
    'attemptId',receipt.attempt_id,
    'segmentId',receipt.segment_id,
    'sequence',receipt.sequence,
    'status',receipt.status,
    'retryAfterMs',receipt.retry_after_ms,
    'shouldForward',should_forward,
    'keyterms',keyterms
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_accept_segment(
  p_receipt_id uuid,
  p_provider_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE receipt public.agenda_meeting_segment_receipts%ROWTYPE;
BEGIN
  IF NULLIF(btrim(p_provider_request_id),'') IS NULL THEN RAISE EXCEPTION 'AGENDA_MEETING_PROVIDER_REQUEST_REQUIRED'; END IF;
  SELECT * INTO receipt FROM public.agenda_meeting_segment_receipts WHERE id=p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_RECEIPT_NOT_FOUND'; END IF;
  IF receipt.status='transcribed' THEN
    RETURN jsonb_build_object('receiptId',receipt.id,'canonicalReceiptId',receipt.id,'status','transcribed');
  END IF;
  IF receipt.status NOT IN ('accepted','processing') THEN RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION'; END IF;
  IF receipt.provider_request_id IS NOT NULL AND receipt.provider_request_id <> p_provider_request_id THEN
    RAISE EXCEPTION 'AGENDA_MEETING_PROVIDER_REQUEST_CONFLICT';
  END IF;
  UPDATE public.agenda_meeting_segment_receipts
     SET status='processing',provider_request_id=p_provider_request_id,
         provider_accepted_at=COALESCE(provider_accepted_at,now()),updated_at=now()
   WHERE id=receipt.id RETURNING * INTO receipt;
  RETURN jsonb_build_object(
    'receiptId',receipt.id,'attemptId',receipt.attempt_id,'segmentId',receipt.segment_id,
    'sequence',receipt.sequence,'status',receipt.status,'providerRequestId',receipt.provider_request_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_fail_segment(
  p_receipt_id uuid,
  p_error_code text,
  p_terminal boolean,
  p_retry_after_ms integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE receipt public.agenda_meeting_segment_receipts%ROWTYPE;
BEGIN
  SELECT * INTO receipt FROM public.agenda_meeting_segment_receipts WHERE id=p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_RECEIPT_NOT_FOUND'; END IF;
  IF receipt.status='transcribed' THEN
    RETURN jsonb_build_object('receiptId',receipt.id,'canonicalReceiptId',receipt.id,'status','transcribed');
  END IF;
  UPDATE public.agenda_meeting_segment_receipts
     SET status=CASE WHEN p_terminal THEN 'terminal_error' ELSE 'retryable_error' END,
         retry_after_ms=CASE WHEN p_terminal THEN NULL ELSE GREATEST(0,COALESCE(p_retry_after_ms,15000)) END,
         error_code=left(COALESCE(NULLIF(p_error_code,''),'provider_request_failed'),120),updated_at=now()
   WHERE id=receipt.id RETURNING * INTO receipt;
  PERFORM public.agenda_meeting_write_audit(
    receipt.session_id,NULL,'service','segment_failed','segment',receipt.segment_id,NULL,
    jsonb_build_object('sequence',receipt.sequence,'errorCode',receipt.error_code,'terminal',p_terminal)
  );
  RETURN jsonb_build_object(
    'receiptId',receipt.id,'segmentId',receipt.segment_id,'sequence',receipt.sequence,
    'status',receipt.status,'retryAfterMs',receipt.retry_after_ms,'errorCode',receipt.error_code
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_complete_segment(
  p_callback_token_hash text,
  p_callback_digest text,
  p_provider_request_id text,
  p_attempt_id uuid,
  p_transcript text,
  p_words jsonb DEFAULT '[]'::jsonb,
  p_duration_ms bigint DEFAULT NULL,
  p_confidence numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  receipt public.agenda_meeting_segment_receipts%ROWTYPE;
  meeting public.agenda_meeting_sessions%ROWTYPE;
  segment_id_value uuid;
  transcript_hash text;
BEGIN
  IF lower(p_callback_token_hash) !~ '^[0-9a-f]{64}$'
     OR lower(p_callback_digest) !~ '^[0-9a-f]{64}$'
     OR NULLIF(btrim(p_provider_request_id),'') IS NULL
     OR p_attempt_id IS NULL
     OR jsonb_typeof(COALESCE(p_words,'[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_CALLBACK';
  END IF;
  SELECT * INTO receipt FROM public.agenda_meeting_segment_receipts
   WHERE callback_token_hash=lower(p_callback_token_hash) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENDA_MEETING_CALLBACK_NOT_FOUND'; END IF;

  IF receipt.status='transcribed' THEN
    IF receipt.callback_digest=lower(p_callback_digest)
       AND receipt.provider_request_id=p_provider_request_id
       AND receipt.attempt_id=p_attempt_id THEN
      RETURN jsonb_build_object(
        'receiptId',receipt.id,'canonicalReceiptId',receipt.id,'segmentId',receipt.segment_id,
        'sequence',receipt.sequence,'status','transcribed','duplicate',true
      );
    END IF;
    RAISE EXCEPTION 'AGENDA_MEETING_CALLBACK_REPLAY_CONFLICT';
  END IF;
  IF receipt.callback_token_expires_at < now() THEN RAISE EXCEPTION 'AGENDA_MEETING_CALLBACK_EXPIRED'; END IF;
  IF receipt.attempt_id <> p_attempt_id THEN RAISE EXCEPTION 'AGENDA_MEETING_CALLBACK_ATTEMPT_CONFLICT'; END IF;
  IF receipt.provider_request_id IS NOT NULL AND receipt.provider_request_id <> p_provider_request_id THEN
    RAISE EXCEPTION 'AGENDA_MEETING_PROVIDER_REQUEST_CONFLICT';
  END IF;
  IF receipt.status NOT IN ('accepted','processing') THEN RAISE EXCEPTION 'AGENDA_MEETING_INVALID_TRANSITION'; END IF;

  transcript_hash := encode(extensions.digest(convert_to(COALESCE(p_transcript,''),'UTF8'),'sha256'),'hex');
  INSERT INTO public.agenda_meeting_transcript_segments (
    session_id,org_id,event_id,receipt_id,segment_id,sequence,transcript_text,words,
    duration_ms,confidence,provider_request_id,content_hash
  ) VALUES (
    receipt.session_id,receipt.org_id,receipt.event_id,receipt.id,receipt.segment_id,receipt.sequence,
    COALESCE(p_transcript,''),COALESCE(p_words,'[]'::jsonb),p_duration_ms,p_confidence,
    p_provider_request_id,transcript_hash
  )
  ON CONFLICT (receipt_id) DO NOTHING
  RETURNING id INTO segment_id_value;
  IF segment_id_value IS NULL THEN
    SELECT id INTO segment_id_value FROM public.agenda_meeting_transcript_segments WHERE receipt_id=receipt.id;
  END IF;

  UPDATE public.agenda_meeting_segment_receipts
     SET status='transcribed',callback_digest=lower(p_callback_digest),callback_received_at=now(),
         provider_request_id=p_provider_request_id,transcribed_at=now(),retry_after_ms=NULL,error_code=NULL,updated_at=now()
   WHERE id=receipt.id RETURNING * INTO receipt;
  meeting := public.agenda_meeting_refresh_sequence_state(receipt.session_id);
  IF meeting.closed_sequence IS NOT NULL AND cardinality(meeting.unresolved_sequences)=0 THEN
    PERFORM public.agenda_meeting_enqueue_job(
      meeting.id,'assemble_transcript','closed:' || meeting.closed_sequence::text
    );
    UPDATE public.agenda_meeting_sessions SET processing_state='assembling',updated_at=now()
     WHERE id=meeting.id;
  END IF;
  PERFORM public.agenda_meeting_write_audit(
    receipt.session_id,NULL,'provider','segment_transcribed','transcript_segment',segment_id_value,NULL,
    jsonb_build_object('sequence',receipt.sequence,'providerRequestId',p_provider_request_id)
  );
  RETURN jsonb_build_object(
    'receiptId',receipt.id,'canonicalReceiptId',receipt.id,'segmentId',receipt.segment_id,
    'sequence',receipt.sequence,'status','transcribed','duplicate',false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.agenda_meeting_prepare_segment(uuid,uuid,uuid,integer,bigint,bigint,text,bigint,text,uuid,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_accept_segment(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_fail_segment(uuid,text,boolean,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_complete_segment(text,text,text,uuid,text,jsonb,bigint,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_prepare_segment(uuid,uuid,uuid,integer,bigint,bigint,text,bigint,text,uuid,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_accept_segment(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_fail_segment(uuid,text,boolean,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_complete_segment(text,text,text,uuid,text,jsonb,bigint,numeric) TO service_role;
