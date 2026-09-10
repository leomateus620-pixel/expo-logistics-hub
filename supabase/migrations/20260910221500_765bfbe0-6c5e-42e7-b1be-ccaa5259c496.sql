CREATE OR REPLACE FUNCTION public._cronograma_apply_event_responsibles(_event_id uuid, _org_id uuid, _items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb;
  member_ids uuid[] := '{}';
  v_user uuid;
  v_updated int;
BEGIN
  IF _items IS NULL THEN RETURN; END IF;

  -- Reconciliação: mantém vínculos existentes para não reemitir aviso de "novo vínculo".
  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_user := NULLIF(item->>'user_id','')::uuid;
    IF v_user IS NOT NULL THEN
      member_ids := array_append(member_ids, v_user);
    END IF;
  END LOOP;

  -- Remove membros que saíram e todos os externos (externos não disparam aviso).
  DELETE FROM public.cronograma_evento_responsaveis
   WHERE event_id = _event_id
     AND (
       org_member_user_id IS NULL
       OR member_ids = '{}'
       OR NOT (org_member_user_id = ANY (member_ids))
     );

  -- Evita colisão com o índice único parcial de is_primary durante a reaplicação.
  UPDATE public.cronograma_evento_responsaveis
     SET is_primary = false
   WHERE event_id = _event_id AND is_primary IS TRUE;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_user := NULLIF(item->>'user_id','')::uuid;

    IF v_user IS NOT NULL THEN
      UPDATE public.cronograma_evento_responsaveis
         SET responsible_type = COALESCE(item->>'responsible_type', 'member'),
             name_snapshot = item->>'name',
             role = item->>'role',
             is_primary = COALESCE((item->>'is_primary')::boolean, false),
             org_id = _org_id,
             updated_at = now()
       WHERE event_id = _event_id
         AND org_member_user_id = v_user;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated > 0 THEN
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO public.cronograma_evento_responsaveis
      (event_id, org_id, org_member_user_id, responsible_type, name_snapshot, role, is_primary)
    VALUES (
      _event_id, _org_id,
      v_user,
      COALESCE(item->>'responsible_type', CASE WHEN v_user IS NOT NULL THEN 'member' ELSE 'external' END),
      item->>'name',
      item->>'role',
      COALESCE((item->>'is_primary')::boolean, false)
    );
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.enqueue_event_assignment_notifications(_event_id uuid, _org_id uuid, _user_ids uuid[], _source text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _event RECORD;
  _start_local timestamp;
BEGIN
  IF _event_id IS NULL OR _user_ids IS NULL OR array_length(_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT id, org_id, status, start_date, start_time, has_exact_date, event_type
    INTO _event
  FROM public.cronograma_eventos
  WHERE id = _event_id;

  IF NOT FOUND THEN RETURN; END IF;
  IF COALESCE(_event.status, '') IN ('completed', 'cancelled', 'concluido', 'cancelado') THEN RETURN; END IF;
  IF COALESCE(_event.event_type, '') = 'feriado' THEN RETURN; END IF;

  -- Não avisa evento que já começou/passou (data + hora, fuso de Brasília).
  IF _event.has_exact_date IS TRUE AND _event.start_date IS NOT NULL THEN
    _start_local := _event.start_date + COALESCE(_event.start_time, TIME '23:59');
    IF _start_local <= (now() AT TIME ZONE 'America/Sao_Paulo') THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.event_assignment_notifications (event_id, user_id, org_id, source)
  SELECT _event_id, m.user_id, COALESCE(_org_id, _event.org_id), _source
  FROM public.org_members m
  WHERE m.user_id = ANY(_user_ids)
    AND m.org_id = COALESCE(_org_id, _event.org_id)
    AND m.is_active IS TRUE
    AND (auth.uid() IS NULL OR m.user_id <> auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM public.event_assignment_notifications n
      WHERE n.event_id = _event_id
        AND n.user_id = m.user_id
        AND n.status IN ('pending', 'sent')
    )
  GROUP BY m.user_id
  ON CONFLICT (event_id, user_id) WHERE status = 'pending' DO NOTHING;
END;
$function$;