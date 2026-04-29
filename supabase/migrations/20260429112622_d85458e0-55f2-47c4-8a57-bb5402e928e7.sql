-- 1) Relax publish_transport_location: any active org member can publish GPS for an active trip
CREATE OR REPLACE FUNCTION public.publish_transport_location(
  _transport_id uuid,
  _latitude double precision,
  _longitude double precision,
  _accuracy double precision DEFAULT NULL,
  _speed double precision DEFAULT NULL,
  _heading double precision DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.publish_transport_location(uuid,double precision,double precision,double precision,double precision,double precision) TO authenticated;

-- 2) Relax UPDATE/DELETE policies on transport_locations so any active org member can overwrite
DROP POLICY IF EXISTS location_update ON public.transport_locations;
CREATE POLICY location_update ON public.transport_locations
  FOR UPDATE
  USING (public.is_org_member(auth.uid(), org_id));

DROP POLICY IF EXISTS location_delete ON public.transport_locations;
CREATE POLICY location_delete ON public.transport_locations
  FOR DELETE
  USING (public.is_org_member(auth.uid(), org_id));

-- 3) Ensure realtime sends full row payloads
ALTER TABLE public.transport_locations REPLICA IDENTITY FULL;

-- 4) Backfill missing origem_lat/lng for active/pending transports
UPDATE public.transports
SET origem_lat = -27.8708, origem_lng = -54.4814
WHERE status IN ('em_andamento','em_retorno','chegou_destino','pendente')
  AND (origem_lat IS NULL OR origem_lng IS NULL);

-- 5) Backfill missing destino coords for known airports
UPDATE public.transports SET destino_lat = -27.1342, destino_lng = -52.6566
WHERE status IN ('em_andamento','em_retorno','chegou_destino','pendente')
  AND (destino_lat IS NULL OR destino_lng IS NULL)
  AND titulo = 'Aeroporto' AND voo_cidade = 'Chapecó';

UPDATE public.transports SET destino_lat = -28.2434, destino_lng = -52.3261
WHERE status IN ('em_andamento','em_retorno','chegou_destino','pendente')
  AND (destino_lat IS NULL OR destino_lng IS NULL)
  AND titulo = 'Aeroporto' AND voo_cidade = 'Passo Fundo';

UPDATE public.transports SET destino_lat = -28.2823, destino_lng = -54.1693
WHERE status IN ('em_andamento','em_retorno','chegou_destino','pendente')
  AND (destino_lat IS NULL OR destino_lng IS NULL)
  AND titulo = 'Aeroporto' AND voo_cidade = 'Santo Ângelo';

UPDATE public.transports SET destino_lat = -29.9939, destino_lng = -51.1714
WHERE status IN ('em_andamento','em_retorno','chegou_destino','pendente')
  AND (destino_lat IS NULL OR destino_lng IS NULL)
  AND titulo = 'Aeroporto' AND voo_cidade = 'Porto Alegre';

-- 6) Clean only ghost rows from finalized/cancelled trips (keep active ones intact)
DELETE FROM public.transport_locations tl
USING public.transports t
WHERE tl.transport_id = t.id
  AND t.status NOT IN ('em_andamento','em_retorno','chegou_destino');