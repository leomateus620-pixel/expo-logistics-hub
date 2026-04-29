-- 1) Limpar localizações erradas e liberar ownership de GPS dos 3 transportes ativos
DELETE FROM public.transport_locations
WHERE transport_id IN (
  'f0888ff8-4064-48ce-acc4-b0c63222c8fc', -- Marcelo
  'e299a0b3-cf17-4473-a818-2852429d0101', -- Micael
  '2f77c66c-23ce-4ae8-bd25-97d4b48ec979'  -- Ricardo
);

UPDATE public.transports
SET tracking_started_by_user_id = NULL,
    tracking_started_at = NULL
WHERE id IN (
  'f0888ff8-4064-48ce-acc4-b0c63222c8fc',
  'e299a0b3-cf17-4473-a818-2852429d0101',
  '2f77c66c-23ce-4ae8-bd25-97d4b48ec979'
);

-- 2) Defesa em profundidade: só o motorista designado pode publicar GPS
CREATE OR REPLACE FUNCTION public.publish_transport_location(
  _transport_id uuid,
  _latitude double precision,
  _longitude double precision,
  _accuracy double precision DEFAULT NULL::double precision,
  _speed double precision DEFAULT NULL::double precision,
  _heading double precision DEFAULT NULL::double precision
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_transport public.transports%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_transport FROM public.transports WHERE id = _transport_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transporte não encontrado';
  END IF;

  IF NOT public.is_org_member(v_user, v_transport.org_id) THEN
    RAISE EXCEPTION 'Sem acesso ao transporte';
  END IF;

  IF v_transport.status NOT IN ('em_andamento','em_retorno','chegou_destino') THEN
    RAISE EXCEPTION 'Transporte não está ativo';
  END IF;

  -- Apenas o motorista designado pode publicar GPS, quando houver motorista atribuído.
  -- Coordenadores podem iniciar a viagem administrativamente, mas não viram fonte de localização.
  IF v_transport.motorista_user_id IS NOT NULL
     AND v_transport.motorista_user_id <> v_user THEN
    RAISE EXCEPTION 'Apenas o motorista designado pode publicar a localização desta viagem';
  END IF;

  -- Reivindica ownership do GPS na primeira publicação
  IF v_transport.tracking_started_by_user_id IS NULL THEN
    UPDATE public.transports
       SET tracking_started_by_user_id = v_user,
           tracking_started_at = now()
     WHERE id = _transport_id
       AND tracking_started_by_user_id IS NULL;
    v_transport.tracking_started_by_user_id := v_user;
  END IF;

  -- Apenas o dono do GPS publica
  IF v_transport.tracking_started_by_user_id <> v_user THEN
    RAISE EXCEPTION 'Outro usuário já está publicando a localização desta viagem';
  END IF;

  INSERT INTO public.transport_locations (
    transport_id, org_id, driver_user_id,
    latitude, longitude, accuracy, speed, heading, updated_at
  ) VALUES (
    _transport_id, v_transport.org_id, v_user,
    _latitude, _longitude, _accuracy, _speed, _heading, now()
  )
  ON CONFLICT (transport_id) DO UPDATE
    SET driver_user_id = EXCLUDED.driver_user_id,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        accuracy = EXCLUDED.accuracy,
        speed = EXCLUDED.speed,
        heading = EXCLUDED.heading,
        updated_at = now();
END;
$function$;