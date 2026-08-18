CREATE OR REPLACE FUNCTION public.venue_delete_event(
  _event_id uuid,
  _reason text DEFAULT NULL,
  _expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.venue_events%ROWTYPE;
  actor_id uuid;
  doc_paths text[];
BEGIN
  SELECT * INTO target FROM public.venue_events WHERE id = _event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VENUE_EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  actor_id := public.venue_assert_capability(target.org_id, 'venue_events_manage');

  IF _expected_version IS NOT NULL AND _expected_version <> target.version THEN
    RAISE EXCEPTION 'VENUE_EVENT_VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;

  IF coalesce(length(trim(coalesce(_reason, ''))), 0) < 8 THEN
    RAISE EXCEPTION 'VENUE_DELETE_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(storage_path), ARRAY[]::text[])
    INTO doc_paths
  FROM public.venue_event_documents
  WHERE event_id = _event_id;

  PERFORM public.venue_log_audit(
    target.org_id,
    'venue_event_deletion',
    _event_id,
    'delete'::public.audit_action,
    to_jsonb(target),
    jsonb_build_object(
      'event_id', _event_id,
      'title', target.title,
      'start_at', target.start_at,
      'end_at', target.end_at,
      'deleted_at', now(),
      'deleted_by', actor_id
    ),
    'delete_event',
    _reason,
    NULL
  );

  DELETE FROM public.venue_counterpart_ledger WHERE event_id = _event_id;
  DELETE FROM public.venue_events WHERE id = _event_id;

  RETURN jsonb_build_object(
    'event_id', _event_id,
    'storage_paths', to_jsonb(doc_paths)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.venue_delete_event(uuid, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.venue_delete_event(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venue_delete_event(uuid, text, integer) TO service_role;