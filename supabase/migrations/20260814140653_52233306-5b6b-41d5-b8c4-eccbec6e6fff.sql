-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agenda_meeting_event_accessible(
  p_user_id uuid,
  p_org_id uuid,
  p_event_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.cronograma_eventos event
     WHERE event.id = p_event_id
       AND event.org_id = p_org_id
       AND (auth.role() = 'service_role' OR p_user_id = auth.uid())
       AND public.is_org_member(p_user_id, p_org_id)
       AND (
         public.get_user_org_role(p_user_id, p_org_id)::text IN ('admin','gestor')
         OR public.cronograma_scoped_event_visible(p_event_id, p_user_id)
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_session_readable(
  p_user_id uuid,
  p_org_id uuid,
  p_event_id uuid,
  p_session_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.agenda_meeting_sessions meeting
     WHERE meeting.id = p_session_id
       AND meeting.org_id = p_org_id
       AND meeting.event_id = p_event_id
       AND meeting.deleted_at IS NULL
       AND (auth.role() = 'service_role' OR p_user_id = auth.uid())
       AND public.is_org_member(p_user_id, p_org_id)
       AND (
         public.get_user_org_role(p_user_id, p_org_id)::text IN ('admin','gestor')
         OR meeting.started_by = p_user_id
         OR public.cronograma_scoped_event_visible(p_event_id, p_user_id)
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_has_explicit_capability(
  p_user_id uuid,
  p_org_id uuid,
  p_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_capabilities capability
     WHERE capability.user_id = p_user_id
       AND capability.org_id = p_org_id
       AND capability.capability = p_capability
  );
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_actor_allowed(
  p_user_id uuid,
  p_action text,
  p_org_id uuid,
  p_event_id uuid,
  p_session_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_owner uuid;
  org_role_text text;
  is_member boolean;
  event_exists boolean;
  operational_profile boolean;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;
  is_member := public.is_org_member(p_user_id, p_org_id);
  IF NOT is_member THEN RETURN false; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.cronograma_eventos event
     WHERE event.id = p_event_id AND event.org_id = p_org_id
  ) INTO event_exists;
  IF NOT event_exists THEN RETURN false; END IF;

  org_role_text := public.get_user_org_role(p_user_id, p_org_id)::text;
  operational_profile := org_role_text IN ('admin','gestor','operador')
    OR public.agenda_meeting_has_explicit_capability(p_user_id, p_org_id, 'cronograma_eventos_write');

  -- Listing is additionally filtered row-by-row with session_readable.
  IF p_action = 'list' THEN RETURN true; END IF;
  IF p_action IN ('detail','get_segment_receipt') THEN
    RETURN p_session_id IS NOT NULL
      AND public.agenda_meeting_session_readable(p_user_id,p_org_id,p_event_id,p_session_id);
  END IF;
  IF p_action = 'start' THEN
    RETURN operational_profile
      AND public.agenda_meeting_event_accessible(p_user_id,p_org_id,p_event_id);
  END IF;

  IF p_session_id IS NULL THEN RETURN false; END IF;
  SELECT started_by INTO session_owner
    FROM public.agenda_meeting_sessions
   WHERE id = p_session_id AND org_id = p_org_id AND event_id = p_event_id AND deleted_at IS NULL;
  IF session_owner IS NULL THEN RETURN false; END IF;

  IF p_action IN ('heartbeat','pause','resume','finalize','cancel','mark_lost','transcribe_segment') THEN
    RETURN operational_profile
      AND (
        session_owner = p_user_id
        OR public.agenda_meeting_event_accessible(p_user_id,p_org_id,p_event_id)
      );
  END IF;
  IF p_action IN ('create_revision','review_minutes','update_action','retry_analysis') THEN
    RETURN operational_profile
      AND (
        session_owner = p_user_id
        OR public.agenda_meeting_event_accessible(p_user_id,p_org_id,p_event_id)
      );
  END IF;
  IF p_action = 'delete' THEN
    RETURN org_role_text IN ('admin','gestor')
      OR (
        session_owner = p_user_id
        AND public.agenda_meeting_has_explicit_capability(
          p_user_id,p_org_id,'meeting_intelligence_delete'
        )
      );
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_authorize(
  p_action text,
  p_org_id uuid,
  p_event_id uuid,
  p_session_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.agenda_meeting_actor_allowed(auth.uid(), p_action, p_org_id, p_event_id, p_session_id);
$$;

REVOKE ALL ON FUNCTION public.agenda_meeting_event_accessible(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_session_readable(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_has_explicit_capability(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_actor_allowed(uuid,text,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_authorize(text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_authorize(text,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_event_accessible(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_session_readable(uuid,uuid,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_actor_allowed(uuid,text,uuid,uuid,uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS: readable only in the effective Agenda event scope; all writes are RPC.
-- ---------------------------------------------------------------------------

ALTER TABLE public.agenda_meeting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_segment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_transcript_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_transcript_revision_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_minutes_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_mutation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_meeting_administrative_tombstones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_meeting_sessions_select ON public.agenda_meeting_sessions;
CREATE POLICY agenda_meeting_sessions_select ON public.agenda_meeting_sessions
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, id));

DROP POLICY IF EXISTS agenda_meeting_receipts_select ON public.agenda_meeting_segment_receipts;
CREATE POLICY agenda_meeting_receipts_select ON public.agenda_meeting_segment_receipts
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_segments_select ON public.agenda_meeting_transcript_segments;
CREATE POLICY agenda_meeting_segments_select ON public.agenda_meeting_transcript_segments
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_transcript_versions_select ON public.agenda_meeting_transcript_versions;
CREATE POLICY agenda_meeting_transcript_versions_select ON public.agenda_meeting_transcript_versions
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_revision_segments_select ON public.agenda_meeting_transcript_revision_segments;
CREATE POLICY agenda_meeting_revision_segments_select ON public.agenda_meeting_transcript_revision_segments
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_minutes_select ON public.agenda_meeting_minutes_versions;
CREATE POLICY agenda_meeting_minutes_select ON public.agenda_meeting_minutes_versions
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_insights_select ON public.agenda_meeting_insights;
CREATE POLICY agenda_meeting_insights_select ON public.agenda_meeting_insights
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_actions_select ON public.agenda_meeting_action_items;
CREATE POLICY agenda_meeting_actions_select ON public.agenda_meeting_action_items
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_consents_select ON public.agenda_meeting_user_consents;
CREATE POLICY agenda_meeting_consents_select ON public.agenda_meeting_user_consents
FOR SELECT TO authenticated
USING (public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id));

DROP POLICY IF EXISTS agenda_meeting_audit_select ON public.agenda_meeting_audit_events;
CREATE POLICY agenda_meeting_audit_select ON public.agenda_meeting_audit_events
FOR SELECT TO authenticated
USING (
  public.agenda_meeting_session_readable(auth.uid(), org_id, event_id, session_id)
  OR (
    public.is_org_member(auth.uid(), org_id)
    AND public.get_user_org_role(auth.uid(), org_id)::text IN ('admin','gestor')
  )
);

DROP POLICY IF EXISTS agenda_meeting_tombstones_select ON public.agenda_meeting_administrative_tombstones;
CREATE POLICY agenda_meeting_tombstones_select ON public.agenda_meeting_administrative_tombstones
FOR SELECT TO authenticated
USING (
  public.is_org_member(auth.uid(), org_id)
  AND public.get_user_org_role(auth.uid(), org_id)::text IN ('admin','gestor')
);

GRANT SELECT ON public.agenda_meeting_sessions,
  public.agenda_meeting_segment_receipts,
  public.agenda_meeting_transcript_segments,
  public.agenda_meeting_transcript_versions,
  public.agenda_meeting_transcript_revision_segments,
  public.agenda_meeting_minutes_versions,
  public.agenda_meeting_insights,
  public.agenda_meeting_action_items,
  public.agenda_meeting_user_consents,
  public.agenda_meeting_audit_events,
  public.agenda_meeting_administrative_tombstones TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.agenda_meeting_sessions,
  public.agenda_meeting_segment_receipts,
  public.agenda_meeting_transcript_segments,
  public.agenda_meeting_transcript_versions,
  public.agenda_meeting_transcript_revision_segments,
  public.agenda_meeting_minutes_versions,
  public.agenda_meeting_insights,
  public.agenda_meeting_action_items,
  public.agenda_meeting_user_consents,
  public.agenda_meeting_processing_jobs,
  public.agenda_meeting_audit_events,
  public.agenda_meeting_mutation_receipts,
  public.agenda_meeting_administrative_tombstones FROM authenticated;

GRANT ALL ON public.agenda_meeting_sessions,
  public.agenda_meeting_segment_receipts,
  public.agenda_meeting_transcript_segments,
  public.agenda_meeting_transcript_versions,
  public.agenda_meeting_transcript_revision_segments,
  public.agenda_meeting_minutes_versions,
  public.agenda_meeting_insights,
  public.agenda_meeting_action_items,
  public.agenda_meeting_user_consents,
  public.agenda_meeting_processing_jobs,
  public.agenda_meeting_audit_events,
  public.agenda_meeting_mutation_receipts,
  public.agenda_meeting_administrative_tombstones TO service_role;

-- Realtime intentionally exposes only lifecycle state and metadata receipts.
-- Transcript/minutes/insight/action tables are never added to the publication.
DO $realtime$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_meeting_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_meeting_segment_receipts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END
$realtime$;

-- The audit trail and administrative tombstones are physically append-only.
CREATE OR REPLACE FUNCTION public.agenda_meeting_reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cascades from a meeting/session delete are the only valid way to remove
  -- audit rows. Direct UPDATE/DELETE remains physically rejected.
  IF TG_TABLE_NAME = 'agenda_meeting_audit_events'
     AND TG_OP = 'DELETE'
     AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AGENDA_MEETING_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS agenda_meeting_audit_append_only
  ON public.agenda_meeting_audit_events;
CREATE TRIGGER agenda_meeting_audit_append_only
BEFORE UPDATE OR DELETE ON public.agenda_meeting_audit_events
FOR EACH ROW EXECUTE FUNCTION public.agenda_meeting_reject_append_only_mutation();

DROP TRIGGER IF EXISTS agenda_meeting_tombstones_append_only
  ON public.agenda_meeting_administrative_tombstones;
CREATE TRIGGER agenda_meeting_tombstones_append_only
BEFORE UPDATE OR DELETE ON public.agenda_meeting_administrative_tombstones
FOR EACH ROW EXECUTE FUNCTION public.agenda_meeting_reject_append_only_mutation();

CREATE OR REPLACE FUNCTION public.agenda_meeting_validate_action_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.suggested_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members member
     WHERE member.org_id = NEW.org_id
       AND member.user_id = NEW.suggested_user_id
       AND member.is_active = true
  ) THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_SUGGESTED_ASSIGNEE';
  END IF;
  IF NEW.confirmed_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members member
     WHERE member.org_id = NEW.org_id
       AND member.user_id = NEW.confirmed_user_id
       AND member.is_active = true
  ) THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_ASSIGNEE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agenda_meeting_actions_validate_membership
  ON public.agenda_meeting_action_items;
CREATE TRIGGER agenda_meeting_actions_validate_membership
BEFORE INSERT OR UPDATE OF org_id, suggested_user_id, confirmed_user_id
ON public.agenda_meeting_action_items
FOR EACH ROW EXECUTE FUNCTION public.agenda_meeting_validate_action_membership();

CREATE OR REPLACE FUNCTION public.agenda_meeting_validate_consent_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members member
     WHERE member.org_id = NEW.org_id
       AND member.user_id = NEW.user_id
       AND member.is_active = true
  ) OR NOT EXISTS (
    SELECT 1 FROM public.org_members member
     WHERE member.org_id = NEW.org_id
       AND member.user_id = NEW.recorded_by
       AND member.is_active = true
  ) THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_CONSENT_ACTOR';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agenda_meeting_consents_validate_membership
  ON public.agenda_meeting_user_consents;
CREATE TRIGGER agenda_meeting_consents_validate_membership
BEFORE INSERT OR UPDATE OF org_id, user_id, recorded_by
ON public.agenda_meeting_user_consents
FOR EACH ROW EXECUTE FUNCTION public.agenda_meeting_validate_consent_membership();

CREATE OR REPLACE FUNCTION public.agenda_meeting_capture_tombstone(
  p_session_id uuid,
  p_deletion_scope text,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  meeting public.agenda_meeting_sessions%ROWTYPE;
  latest_transcript_hash text;
  latest_minutes_hash text;
BEGIN
  IF p_deletion_scope NOT IN ('session','event') THEN
    RAISE EXCEPTION 'AGENDA_MEETING_INVALID_DELETION_SCOPE';
  END IF;
  SELECT * INTO meeting
    FROM public.agenda_meeting_sessions
   WHERE id = p_session_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT transcript.content_hash INTO latest_transcript_hash
    FROM public.agenda_meeting_transcript_versions transcript
   WHERE transcript.session_id = meeting.id
   ORDER BY transcript.version DESC
   LIMIT 1;
  SELECT encode(extensions.digest(convert_to(
           jsonb_build_array(minutes.title,minutes.summary,minutes.minutes_markdown)::text,
           'UTF8'
         ),'sha256'),'hex')
    INTO latest_minutes_hash
    FROM public.agenda_meeting_minutes_versions minutes
   WHERE minutes.session_id = meeting.id
   ORDER BY minutes.version DESC
   LIMIT 1;

  INSERT INTO public.agenda_meeting_administrative_tombstones (
    org_id,event_id,session_id,deletion_scope,actor_user_id,session_version,
    capture_state,processing_state,receipt_count,transcript_segment_count,
    transcript_version_count,minutes_version_count,event_context_hash,
    latest_transcript_hash,latest_minutes_hash,session_created_at
  ) VALUES (
    meeting.org_id,meeting.event_id,meeting.id,p_deletion_scope,
    COALESCE(p_actor_user_id,auth.uid()),meeting.version,
    meeting.capture_state,meeting.processing_state,
    (SELECT count(*)::integer FROM public.agenda_meeting_segment_receipts receipt WHERE receipt.session_id=meeting.id),
    (SELECT count(*)::integer FROM public.agenda_meeting_transcript_segments segment WHERE segment.session_id=meeting.id),
    (SELECT count(*)::integer FROM public.agenda_meeting_transcript_versions transcript WHERE transcript.session_id=meeting.id),
    (SELECT count(*)::integer FROM public.agenda_meeting_minutes_versions minutes WHERE minutes.session_id=meeting.id),
    encode(extensions.digest(convert_to(meeting.event_context::text,'UTF8'),'sha256'),'hex'),
    latest_transcript_hash,latest_minutes_hash,meeting.created_at
  )
  ON CONFLICT (session_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_meeting_session_delete_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.agenda_meeting_capture_tombstone(OLD.id,'session',auth.uid());
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS agenda_meeting_sessions_before_delete
  ON public.agenda_meeting_sessions;
CREATE TRIGGER agenda_meeting_sessions_before_delete
BEFORE DELETE ON public.agenda_meeting_sessions
FOR EACH ROW EXECUTE FUNCTION public.agenda_meeting_session_delete_tombstone();

CREATE OR REPLACE FUNCTION public.agenda_meeting_event_delete_tombstones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE session_row record;
BEGIN
  FOR session_row IN
    SELECT meeting.id
      FROM public.agenda_meeting_sessions meeting
     WHERE meeting.event_id=OLD.id AND meeting.org_id=OLD.org_id
  LOOP
    PERFORM public.agenda_meeting_capture_tombstone(session_row.id,'event',auth.uid());
  END LOOP;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS agenda_meeting_event_before_delete
  ON public.cronograma_eventos;
CREATE TRIGGER agenda_meeting_event_before_delete
BEFORE DELETE ON public.cronograma_eventos
FOR EACH ROW EXECUTE FUNCTION public.agenda_meeting_event_delete_tombstones();

REVOKE ALL ON FUNCTION public.agenda_meeting_reject_append_only_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_validate_action_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_validate_consent_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_capture_tombstone(uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_session_delete_tombstone() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agenda_meeting_event_delete_tombstones() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_meeting_capture_tombstone(uuid,text,uuid) TO service_role;
