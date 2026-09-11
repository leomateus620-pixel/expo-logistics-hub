-- 1. Free-text event type
ALTER TABLE public.venue_events DROP CONSTRAINT IF EXISTS venue_events_type_check;

UPDATE public.venue_events
SET event_type = upper(btrim(event_type))
WHERE event_type IS NOT NULL AND event_type <> upper(btrim(event_type));

UPDATE public.venue_events
SET requester_name = upper(btrim(requester_name))
WHERE requester_name IS NOT NULL AND requester_name <> upper(btrim(requester_name));

ALTER TABLE public.venue_events
  ADD CONSTRAINT venue_events_type_check
  CHECK (length(btrim(event_type)) BETWEEN 2 AND 80);

CREATE INDEX IF NOT EXISTS venue_events_event_type_idx
  ON public.venue_events (org_id, event_type);

-- 2. Patch venue_save_event validation (fixed list -> free text)
DO $do$
DECLARE
  src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src
  FROM pg_proc
  WHERE proname = 'venue_save_event' AND pronamespace = 'public'::regnamespace;

  IF src IS NULL THEN
    RAISE EXCEPTION 'venue_save_event not found';
  END IF;

  src := regexp_replace(
    src,
    'IF event_type_value IS NULL OR event_type_value NOT IN \([^)]*\) THEN RAISE EXCEPTION ''VENUE_EVENT_TYPE_INVALID'' USING ERRCODE = ''23514''; END IF;',
    $repl$requester_value := upper(requester_value);
  event_type_value := upper(btrim(coalesce(event_type_value, '')));
  IF length(event_type_value) < 2 OR length(event_type_value) > 80 THEN
    RAISE EXCEPTION 'VENUE_EVENT_TYPE_INVALID' USING ERRCODE = '23514';
  END IF;$repl$,
    'g'
  );

  IF src NOT LIKE '%length(event_type_value) > 80%' THEN
    RAISE EXCEPTION 'venue_save_event event_type validation block not found';
  END IF;

  EXECUTE src;
END
$do$;