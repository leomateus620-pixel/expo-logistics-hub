DO $$
DECLARE
  v_project uuid := '0538d132-34dd-4347-a33c-526edac7339c';
  src text; new_src text;
  v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids FROM map_entities
   WHERE project_id = v_project AND public_identifier IN ('Q-G-03','Q-G-04');

  IF v_ids IS NOT NULL THEN
    DELETE FROM commercial_lots WHERE project_id = v_project AND entity_id = ANY(v_ids);
    DELETE FROM map_entity_geometries WHERE project_id = v_project AND entity_id = ANY(v_ids);
    DELETE FROM map_entities WHERE project_id = v_project AND id = ANY(v_ids);
  END IF;

  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname = 'resolve_commission_map_segment_slug' AND pronamespace = 'public'::regnamespace;
  new_src := replace(src, '''QUADRA-N'', ''B7'', ''B28''', '''Q-G-03'', ''Q-G-04'', ''QUADRA-N'', ''B7'', ''B28''');
  IF new_src <> src THEN EXECUTE new_src; END IF;

  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname = 'ensure_commission_map_segments' AND pronamespace = 'public'::regnamespace;
  new_src := replace(src, '"excludedIdentifiers":["QUADRA-N"', '"excludedIdentifiers":["Q-G-03","Q-G-04","QUADRA-N"');
  new_src := replace(new_src, '"expectedEntityCount":1205,"expectedLotCount":1168', '"expectedEntityCount":1203,"expectedLotCount":1166');
  IF new_src <> src THEN EXECUTE new_src; END IF;

  PERFORM public.ensure_commission_map_segments(v_project);
END $$;