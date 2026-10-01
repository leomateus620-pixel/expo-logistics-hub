DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.map_entities e
  JOIN public.commercial_lots l ON l.entity_id = e.id
  WHERE e.public_identifier IN ('B5-M100','B5-M101','B5-M102','B5-M103','B5-M104')
    AND l.public_identifier = e.public_identifier
    AND e.metadata->>'moduleNumber' = substring(e.public_identifier from 5)
    AND (l.lot_number = '10' OR e.name = 'Módulo 10' OR e.metadata->>'lotNumber' = '10');

  IF v_count = 0 THEN
    RAISE NOTICE 'P13 boxes 100-104 already corrected; nothing to do';
    RETURN;
  END IF;
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'Expected 5 P13 boxes to correct, found %', v_count;
  END IF;

  INSERT INTO public.map_activity_logs (org_id, project_id, entity_id, lot_id, action, before_state, after_state, reason)
  SELECT p.org_id, e.project_id, e.id, l.id, 'LOT_NUMBER_CORRECTED',
    jsonb_build_object('entityName', e.name, 'metadataLotNumber', e.metadata->>'lotNumber', 'lotNumber', l.lot_number, 'displayName', l.display_name),
    jsonb_build_object('entityName', 'Módulo ' || (e.metadata->>'moduleNumber'), 'metadataLotNumber', e.metadata->>'moduleNumber', 'lotNumber', e.metadata->>'moduleNumber', 'displayName', 'Módulo ' || (e.metadata->>'moduleNumber')),
    'Correção de numeração truncada (lpad) dos boxes 100–104 do Pavilhão 13, autorizada pelo usuário em 01/10/2026'
  FROM public.map_entities e
  JOIN public.commercial_lots l ON l.entity_id = e.id
  JOIN public.map_projects p ON p.id = e.project_id
  WHERE e.public_identifier IN ('B5-M100','B5-M101','B5-M102','B5-M103','B5-M104')
    AND l.public_identifier = e.public_identifier;

  UPDATE public.map_entities e
  SET name = 'Módulo ' || (e.metadata->>'moduleNumber'),
      metadata = jsonb_set(e.metadata, '{lotNumber}', to_jsonb(e.metadata->>'moduleNumber')),
      updated_at = now()
  WHERE e.public_identifier IN ('B5-M100','B5-M101','B5-M102','B5-M103','B5-M104')
    AND e.metadata->>'moduleNumber' = substring(e.public_identifier from 5);

  UPDATE public.commercial_lots l
  SET lot_number = e.metadata->>'moduleNumber',
      display_name = 'Módulo ' || (e.metadata->>'moduleNumber'),
      updated_at = now()
  FROM public.map_entities e
  WHERE l.entity_id = e.id
    AND l.public_identifier IN ('B5-M100','B5-M101','B5-M102','B5-M103','B5-M104')
    AND e.metadata->>'moduleNumber' = substring(e.public_identifier from 5);
END $$;