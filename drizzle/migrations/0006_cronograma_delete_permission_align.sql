CREATE OR REPLACE FUNCTION public._cronograma_require_deleter(_org_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $f$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(auth.uid(), _org_id) THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: não autenticado' USING ERRCODE='P0001';
  END IF;
  IF public.get_user_org_role(auth.uid(), _org_id) NOT IN ('admin','gestor')
     AND NOT public.has_capability(auth.uid(), _org_id, 'cronograma_eventos_write') THEN
    RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED: sem permissão para excluir eventos' USING ERRCODE='P0001';
  END IF;
END $f$;

CREATE OR REPLACE FUNCTION agenda_private.cronograma_begin_delete(_event_id uuid, _org_id uuid, _expected bigint, _source_key text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE source public.cronograma_eventos;
BEGIN
  PERFORM public._cronograma_require_deleter(_org_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(_org_id::text,28701));
  SELECT * INTO source FROM public.cronograma_eventos WHERE org_id=_org_id
    AND (id=_event_id OR (_event_id IS NULL AND source_key=_source_key)) FOR UPDATE;
  IF source.id IS NULL THEN RETURN; END IF;
  PERFORM public._cronograma_require_deleter(_org_id);
  IF agenda_private.source_visible(source) IS NOT TRUE THEN RAISE EXCEPTION 'CRONOGRAMA_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
  IF (_expected IS NOT NULL AND source.lock_version <> _expected)
    OR (_expected IS NULL AND EXISTS(SELECT 1 FROM agenda_private.cronograma_restaurant_links WHERE org_id=_org_id AND source_event_id=source.id)) THEN
    RAISE EXCEPTION 'CRONOGRAMA_CONFLICT: recarregue antes de excluir' USING ERRCODE='40001';
  END IF;
  INSERT INTO agenda_private.cronograma_source_write_context VALUES(pg_backend_pid(),txid_current(),_org_id,source.id,source.source_key,_expected)
  ON CONFLICT(backend_pid,transaction_id) DO UPDATE SET org_id=EXCLUDED.org_id,
    source_event_id=EXCLUDED.source_event_id,source_key=EXCLUDED.source_key,expected_version=EXCLUDED.expected_version;
END $function$;