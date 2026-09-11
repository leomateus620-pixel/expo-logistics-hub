CREATE TABLE public.venue_event_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.venue_events(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 2 AND 2000),
  author_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX venue_event_notes_event_idx ON public.venue_event_notes (org_id, event_id, created_at DESC);

GRANT SELECT ON public.venue_event_notes TO authenticated;
GRANT ALL ON public.venue_event_notes TO service_role;

ALTER TABLE public.venue_event_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY venue_event_notes_select ON public.venue_event_notes
FOR SELECT TO authenticated
USING (public.venue_can_view_event(org_id, event_id));

CREATE OR REPLACE FUNCTION public.venue_event_notes_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER venue_event_notes_touch
BEFORE UPDATE ON public.venue_event_notes
FOR EACH ROW EXECUTE FUNCTION public.venue_event_notes_touch();

CREATE OR REPLACE FUNCTION public.venue_save_event_note(
  p_event_id uuid,
  p_body text,
  p_note_id uuid DEFAULT NULL
)
RETURNS public.venue_event_notes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_body text;
  v_note public.venue_event_notes;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'VENUE_UNAUTHENTICATED';
  END IF;

  SELECT org_id INTO v_org_id FROM public.venue_events WHERE id = p_event_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'VENUE_EVENT_NOT_FOUND';
  END IF;

  IF NOT public.venue_can_view_event(v_org_id, p_event_id) THEN
    RAISE EXCEPTION 'VENUE_FORBIDDEN';
  END IF;

  IF NOT (
    public.venue_has_capability(v_org_id, 'venue_events_manage')
    OR public.venue_has_capability(v_org_id, 'venue_operations_manage')
  ) THEN
    RAISE EXCEPTION 'VENUE_FORBIDDEN';
  END IF;

  v_body := btrim(coalesce(p_body, ''));
  IF char_length(v_body) < 2 THEN
    RAISE EXCEPTION 'VENUE_NOTE_TOO_SHORT';
  END IF;
  IF char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'VENUE_NOTE_TOO_LONG';
  END IF;

  IF p_note_id IS NULL THEN
    INSERT INTO public.venue_event_notes (org_id, event_id, body, author_user_id)
    VALUES (v_org_id, p_event_id, v_body, auth.uid())
    RETURNING * INTO v_note;

    INSERT INTO public.audit_log (org_id, actor_user_id, entity, entity_id, action, before_data, after_data)
    VALUES (v_org_id, auth.uid(), 'venue_event_note', v_note.id, 'create', NULL,
      jsonb_build_object('venue_action', 'apontamento_registrado', 'event_id', p_event_id, 'body', v_body));
  ELSE
    SELECT * INTO v_note FROM public.venue_event_notes WHERE id = p_note_id AND event_id = p_event_id;
    IF v_note.id IS NULL OR v_note.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'VENUE_NOTE_NOT_FOUND';
    END IF;
    IF v_note.author_user_id <> auth.uid()
       AND NOT public.venue_has_capability(v_org_id, 'venue_events_manage') THEN
      RAISE EXCEPTION 'VENUE_FORBIDDEN';
    END IF;

    INSERT INTO public.audit_log (org_id, actor_user_id, entity, entity_id, action, before_data, after_data)
    VALUES (v_org_id, auth.uid(), 'venue_event_note', v_note.id, 'update',
      jsonb_build_object('body', v_note.body),
      jsonb_build_object('venue_action', 'apontamento_editado', 'event_id', p_event_id, 'body', v_body));

    UPDATE public.venue_event_notes SET body = v_body WHERE id = p_note_id
    RETURNING * INTO v_note;
  END IF;

  RETURN v_note;
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_delete_event_note(p_note_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note public.venue_event_notes;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'VENUE_UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_note FROM public.venue_event_notes WHERE id = p_note_id;
  IF v_note.id IS NULL OR v_note.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'VENUE_NOTE_NOT_FOUND';
  END IF;

  IF NOT (
    v_note.author_user_id = auth.uid()
    OR public.venue_has_capability(v_note.org_id, 'venue_events_manage')
  ) THEN
    RAISE EXCEPTION 'VENUE_FORBIDDEN';
  END IF;

  UPDATE public.venue_event_notes SET deleted_at = now() WHERE id = p_note_id;

  INSERT INTO public.audit_log (org_id, actor_user_id, entity, entity_id, action, before_data, after_data)
  VALUES (v_note.org_id, auth.uid(), 'venue_event_note', v_note.id, 'delete',
    jsonb_build_object('body', v_note.body),
    jsonb_build_object('venue_action', 'apontamento_removido', 'event_id', v_note.event_id));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.venue_save_event_note(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venue_delete_event_note(uuid) TO authenticated;