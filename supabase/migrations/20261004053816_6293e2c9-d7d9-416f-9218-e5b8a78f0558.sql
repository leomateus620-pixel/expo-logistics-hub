DO $migration$
DECLARE v_definition text;
BEGIN
  v_definition := pg_get_viewdef('public.cronograma_eventos_full'::regclass, true);
  IF v_definition NOT LIKE '%e.location_code%' THEN
    IF v_definition NOT LIKE '%origin_commission_id%FROM cronograma_eventos e%' THEN
      RAISE EXCEPTION 'Unexpected cronograma view shape';
    END IF;
    v_definition := regexp_replace(v_definition, 'origin_commission_id([[:space:]]+)FROM cronograma_eventos e', 'origin_commission_id, e.location_code\1FROM cronograma_eventos e');
    EXECUTE 'CREATE OR REPLACE VIEW public.cronograma_eventos_full AS ' || v_definition;
  END IF;
END $migration$;
NOTIFY pgrst, 'reload schema';