DO $validation$
DECLARE
  target_event record;
BEGIN
  SELECT event.id, event.org_id
    INTO target_event
    FROM public.cronograma_eventos event
    JOIN public.cronograma_evento_comissoes link
      ON link.event_id = event.id
     AND link.org_id = event.org_id
   WHERE link.commission_id = 'd85594df-142b-46f1-a5af-598b7d504efd'::uuid
     AND event.start_date >= current_date
   ORDER BY event.start_date, event.start_time NULLS LAST, event.id
   LIMIT 1;

  IF target_event.id IS NULL THEN
    RAISE EXCEPTION 'No future Central Commission event available for eligibility validation';
  END IF;

  IF NOT public.google_user_eligible_for_event(
    'c00d04b3-6b33-48f7-80c8-14c28bf7c90a'::uuid,
    target_event.org_id,
    target_event.id
  ) THEN
    RAISE EXCEPTION 'Fernanda is not eligible for future Central Commission event %', target_event.id;
  END IF;
END;
$validation$;