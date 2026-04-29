-- 1) Novas colunas para fingerprint do dispositivo do motorista
ALTER TABLE public.transports
  ADD COLUMN IF NOT EXISTS tracking_device_id text,
  ADD COLUMN IF NOT EXISTS tracking_user_agent text;

-- 2) Atualiza publish_transport_location para validar device_id
CREATE OR REPLACE FUNCTION public.publish_transport_location(
  _transport_id uuid,
  _latitude double precision,
  _longitude double precision,
  _accuracy double precision DEFAULT NULL,
  _speed double precision DEFAULT NULL,
  _heading double precision DEFAULT NULL,
  _device_id text DEFAULT NULL,
  _user_agent text DEFAULT NULL
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

  -- Apenas o motorista designado pode publicar GPS, quando houver motorista atribuído
  IF v_transport.motorista_user_id IS NOT NULL
     AND v_transport.motorista_user_id <> v_user THEN
    RAISE EXCEPTION 'Apenas o motorista designado pode publicar a localização desta viagem';
  END IF;

  -- Reivindica ownership (user + device) na primeira publicação
  IF v_transport.tracking_started_by_user_id IS NULL THEN
    UPDATE public.transports
       SET tracking_started_by_user_id = v_user,
           tracking_started_at = now(),
           tracking_device_id = COALESCE(_device_id, tracking_device_id),
           tracking_user_agent = COALESCE(_user_agent, tracking_user_agent)
     WHERE id = _transport_id
       AND tracking_started_by_user_id IS NULL;
    v_transport.tracking_started_by_user_id := v_user;
    v_transport.tracking_device_id := COALESCE(_device_id, v_transport.tracking_device_id);
  ELSIF v_transport.tracking_device_id IS NULL AND _device_id IS NOT NULL THEN
    -- Backfill device_id se ainda não existir (usuário já era dono mas device veio depois)
    UPDATE public.transports
       SET tracking_device_id = _device_id,
           tracking_user_agent = COALESCE(_user_agent, tracking_user_agent)
     WHERE id = _transport_id;
    v_transport.tracking_device_id := _device_id;
  END IF;

  -- Apenas o usuário dono do GPS publica
  IF v_transport.tracking_started_by_user_id <> v_user THEN
    RAISE EXCEPTION 'Outro usuário já está publicando a localização desta viagem';
  END IF;

  -- Apenas o dispositivo dono publica
  IF v_transport.tracking_device_id IS NOT NULL
     AND _device_id IS NOT NULL
     AND v_transport.tracking_device_id <> _device_id THEN
    RAISE EXCEPTION 'Outro dispositivo já está enviando a localização desta viagem';
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

-- 3) Função auxiliar para resetar tracking entre fases (idempotente, usada pelo edge function)
CREATE OR REPLACE FUNCTION public.reset_transport_tracking(_transport_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Limpa marcador ao vivo da fase anterior
  DELETE FROM public.transport_locations WHERE transport_id = _transport_id;
  -- Libera ownership para a próxima fase reiniciar GPS limpo
  UPDATE public.transports
     SET tracking_started_by_user_id = NULL,
         tracking_started_at = NULL,
         tracking_device_id = NULL,
         tracking_user_agent = NULL
   WHERE id = _transport_id;
END;
$function$;