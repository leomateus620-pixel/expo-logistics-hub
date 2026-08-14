DO $do$
DECLARE
  src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'agenda_meeting_control'
   LIMIT 1;
  IF src IS NULL THEN
    RAISE EXCEPTION 'agenda_meeting_control not found';
  END IF;

  src := replace(src, E'  decision text;', E'  review_decision text;');
  src := replace(src, 'decision := p_payload->>''decision''', 'review_decision := p_payload->>''decision''');
  src := replace(src, 'IF decision NOT IN', 'IF review_decision NOT IN');
  src := replace(src, 'WHEN decision=''approve''', 'WHEN review_decision=''approve''');

  IF src LIKE '%  decision text;%' THEN
    RAISE EXCEPTION 'rename incomplete';
  END IF;

  EXECUTE src;
END
$do$;