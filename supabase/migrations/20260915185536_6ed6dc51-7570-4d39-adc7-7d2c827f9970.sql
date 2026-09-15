-- 0) Regras internas: Q-G-03 / Q-G-04 deixam de ser suprimidos (B40 arquivado em 30/08/2026).
DO $$
DECLARE src text; new_src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname = 'resolve_commission_map_segment_slug'
     AND pronamespace = 'public'::regnamespace;
  new_src := replace(src, '''Q-G-03'', ''Q-G-04'', ''QUADRA-N''', '''QUADRA-N''');
  IF new_src = src THEN
    RAISE EXCEPTION 'resolve_commission_map_segment_slug: exclusao Q-G-03/Q-G-04 nao encontrada';
  END IF;
  EXECUTE new_src;

  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname = 'ensure_commission_map_segments'
     AND pronamespace = 'public'::regnamespace;
  new_src := replace(src, '"excludedIdentifiers":["Q-G-03","Q-G-04",', '"excludedIdentifiers":[');
  new_src := replace(new_src, '"expectedEntityCount":1203,"expectedLotCount":1166', '"expectedEntityCount":1205,"expectedLotCount":1168');
  IF new_src = src THEN
    RAISE EXCEPTION 'ensure_commission_map_segments: baseline 1203/1166 nao encontrada';
  END IF;
  EXECUTE new_src;
END $$;

-- 1) Metragens documentais + reabertura cadastral da Quadra G.
DO $$
DECLARE
  v_project uuid := '0538d132-34dd-4347-a33c-526edac7339c';
  v_source text := 'A1 - Fenasoja - Parque - Lotes sem imagem.pdf, p.1';
  v_revision text := '2026.4-external-areas.1';
  v_payload text := 'Q-D-01=208.20 Q-D-02=207.38 Q-D-03=209.11 Q-D-04=209.11 Q-D-05=208.96 Q-D-06=208.96 Q-D-07=208.80 Q-D-08=208.80 Q-D-09=208.64 Q-D-10=208.64 Q-D-11=263.74 Q-D-12=248.99 Q-E-01=197.41 Q-E-02=243.12 Q-E-03=199.81 Q-E-04=245.39 Q-E-05=199.81 Q-E-06=245.79 Q-E-07=199.81 Q-E-08=246.19 Q-E-09=199.81 Q-E-10=246.58 Q-E-11=179.49 Q-E-12=175.72 Q-E-13=165.88 Q-F-01=168.00 Q-F-02=168.00 Q-F-03=168.00 Q-F-04=168.00 Q-F-05=168.00 Q-F-06=168.00 Q-F-07=168.00 Q-F-08=168.00 Q-G-01=168.00 Q-G-02=168.00 Q-G-03=168.00 Q-G-04=168.00 Q-G-05=168.00 Q-G-06=168.00 Q-G-07=168.00 Q-G-08=168.00 Q-I-01=205.97 Q-I-02=208.36 Q-I-03=210.03 Q-I-04=210.03 Q-I-05=209.95 Q-I-06=209.95 Q-I-07=209.87 Q-I-08=209.87 Q-I-09=209.79 Q-I-10=209.79 Q-I-11=209.71 Q-I-12=209.71 Q-I-13=209.62 Q-I-14=209.62 Q-I-15=209.31 Q-I-16=210.09 Q-J-01=201.46 Q-J-02=255.71 Q-J-03=203.40 Q-J-04=258.15 Q-J-05=203.40 Q-J-06=258.63 Q-J-07=203.40 Q-J-08=259.11 Q-J-09=203.40 Q-J-10=259.59 Q-J-11=203.40 Q-J-12=260.08 Q-J-13=203.40 Q-J-14=260.56 Q-J-15=212.24 Q-J-16=272.96 Q-L-01=191.61 Q-L-02=191.61 Q-L-03=187.00 Q-L-04=187.00 Q-L-05=187.00 Q-L-06=187.00 Q-L-07=187.00 Q-L-08=187.00 Q-L-09=187.00 Q-L-10=187.00 Q-L-11=187.00 Q-L-12=187.00 Q-L-13=187.00 Q-L-14=187.00 Q-L-15=191.61 Q-L-16=191.61 Q-M-01=191.61 Q-M-02=191.61 Q-M-03=187.00 Q-M-04=187.00 Q-M-05=187.00 Q-M-06=187.00 Q-M-07=187.00 Q-M-08=187.00 Q-M-09=187.00 Q-M-10=187.00 Q-M-11=187.00 Q-M-12=187.00 Q-M-13=187.00 Q-M-14=187.00 Q-M-15=191.61 Q-M-16=191.61 Q-O-01=192.91 Q-O-02=192.91 Q-O-03=191.00 Q-O-04=191.00 Q-O-05=191.00 Q-O-06=191.00 Q-O-07=191.00 Q-O-08=191.00 Q-O-09=191.00 Q-O-10=191.00 Q-O-11=191.00 Q-O-12=191.00 Q-O-13=192.91 Q-O-14=192.91 Q-P-01=192.91 Q-P-02=192.91 Q-P-03=191.00 Q-P-04=191.00 Q-P-05=191.00 Q-P-06=191.00 Q-P-07=191.00 Q-P-08=191.00 Q-P-09=191.00 Q-P-10=191.00 Q-P-11=191.00 Q-P-12=191.00 Q-P-13=192.91 Q-P-14=192.91 Q-Q-01=283.00 Q-Q-02=191.00 Q-Q-03=191.00 Q-Q-04=191.00 Q-Q-05=191.00 Q-Q-06=190.98 Q-T-01=192.91 Q-T-02=192.91 Q-T-03=191.00 Q-T-04=191.00 Q-T-05=191.00 Q-T-06=191.00 Q-T-07=191.00 Q-T-08=191.00 Q-T-09=192.91 Q-T-10=192.91 Q-T-11=244.51 Q-T-12=244.51 Q-U-01=192.91 Q-U-02=192.91 Q-U-03=191.00 Q-U-04=191.00 Q-U-05=191.00 Q-U-06=191.00 Q-U-07=191.00 Q-U-08=191.00 Q-U-09=192.91 Q-U-10=192.91 Q-U-11=244.51 Q-U-12=244.51 Q-V-01=190.98 Q-V-02=191.00 Q-V-03=191.00 Q-V-04=191.00 Q-V-05=190.98 Q-V-06=240.65';
  v_layer uuid;
  v_parent uuid;
  v_segment uuid;
  v_actor uuid;
  v_updated int := 0;
  v_created int := 0;
  v_conflict int;
  v_count int;
  r record;
  v_entity uuid;
BEGIN
  CREATE TEMP TABLE _external_areas ON COMMIT DROP AS
  SELECT split_part(token, '=', 1) AS public_identifier,
         split_part(split_part(token, '=', 1), '-', 2) AS block,
         split_part(split_part(token, '=', 1), '-', 3) AS lot_number,
         round(split_part(token, '=', 2)::numeric, 2) AS official_area_sqm
    FROM regexp_split_to_table(v_payload, '\s+') AS token
   WHERE token <> '';

  SELECT count(*) INTO v_count FROM _external_areas;
  IF v_count <> 169 THEN
    RAISE EXCEPTION 'Tabela documental invalida: % linhas (esperado 169)', v_count;
  END IF;
  IF (SELECT round(sum(official_area_sqm), 2) FROM _external_areas) <> 33733.77 THEN
    RAISE EXCEPTION 'Total documental divergente';
  END IF;

  -- Areas documentais dos lotes externos ja cadastrados.
  WITH target AS (
    SELECT cl.id AS lot_id, a.official_area_sqm
      FROM _external_areas a
      JOIN map_entities e
        ON e.project_id = v_project
       AND e.public_identifier = a.public_identifier
       AND e.classification = 'SELLABLE_LOT'
       AND e.is_archived = false
       AND e.metadata->>'block' = a.block
       AND e.metadata->>'lotNumber' = a.lot_number
      JOIN commercial_lots cl
        ON cl.entity_id = e.id
       AND cl.project_id = v_project
       AND cl.public_identifier = a.public_identifier
       AND cl.block = a.block
       AND cl.lot_number = a.lot_number
       AND cl.archived_at IS NULL
     WHERE cl.official_area_sqm IS DISTINCT FROM a.official_area_sqm
        OR cl.area_validation_status IS DISTINCT FROM 'VALIDATED'
  ), lots_updated AS (
    UPDATE commercial_lots cl
       SET official_area_sqm = t.official_area_sqm,
           area_validation_status = 'VALIDATED',
           updated_at = now()
      FROM target t
     WHERE cl.id = t.lot_id
    RETURNING cl.id
  )
  SELECT count(*) INTO v_updated FROM lots_updated;

  UPDATE map_entities e
     SET metadata = e.metadata
       || jsonb_build_object(
            'officialAreaSqm', a.official_area_sqm,
            'areaSource', v_source,
            'areaSourceRevision', v_revision,
            'areaValidationScope', 'CADASTRAL_DOCUMENT',
            'officialMeasurements', false,
            'previousOfficialAreaSqm', COALESCE(e.metadata->'officialAreaSqm', 'null'::jsonb)),
         updated_at = now()
    FROM _external_areas a
   WHERE e.project_id = v_project
     AND e.public_identifier = a.public_identifier
     AND e.classification = 'SELLABLE_LOT'
     AND e.is_archived = false
     AND (e.metadata->>'areaSourceRevision') IS DISTINCT FROM v_revision;

  -- Quadra G: lotes 03 e 04.
  SELECT id INTO v_parent FROM map_entities
   WHERE project_id = v_project AND public_identifier = 'QUADRA-G' AND is_archived = false;
  SELECT layer_id, segment_id, created_by INTO v_layer, v_segment, v_actor
    FROM map_entities WHERE project_id = v_project AND public_identifier = 'Q-G-05';

  IF v_parent IS NULL OR v_layer IS NULL THEN
    RAISE EXCEPTION 'Quadra G ou camada comercial nao encontrada no projeto %', v_project;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('Q-G-03','03', 4.460727272727269, -5.281090935602414, 5.902909090909105, -3.0207272878915603,
       '[[3554.45, 2732.95], [3620.55, 2732.95], [3620.55, 2836.55], [3554.45, 2836.55]]'),
      ('Q-G-04','04', 4.460727272727269, -7.60472731090362, 5.902909090909105, -5.344363663192766,
       '[[3554.45, 2626.45], [3620.55, 2626.45], [3620.55, 2730.05], [3554.45, 2730.05]]')
    ) AS t(identifier, lot_number, min_x, min_y, max_x, max_y, pdf_polygon)
  LOOP
    IF EXISTS (SELECT 1 FROM map_entities WHERE project_id = v_project AND public_identifier = r.identifier) THEN
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_conflict
      FROM map_entity_geometries g
      JOIN map_entities e ON e.id = g.entity_id
     WHERE g.project_id = v_project
       AND g.is_current
       AND e.is_archived = false
       AND e.classification IN ('SELLABLE_LOT','INTERNAL_STAND','BUILDING','PAVILION')
       AND extensions.st_intersects(
             g.native_geometry,
             extensions.st_setsrid(extensions.st_makeenvelope(r.min_x + 0.01, r.min_y + 0.01, r.max_x - 0.01, r.max_y - 0.01), 0));
    IF v_conflict > 0 THEN
      RAISE EXCEPTION 'Ocupacao ativa detectada no espaco de % (% sobreposicoes)', r.identifier, v_conflict;
    END IF;

    INSERT INTO map_entities (
      project_id, layer_id, parent_entity_id, public_identifier, name, description,
      classification, verification_status, is_sellable, is_archived, metadata, created_by, updated_by, segment_id)
    VALUES (
      v_project, v_layer, v_parent, r.identifier, 'Lote ' || r.lot_number, NULL,
      'SELLABLE_LOT', 'NEEDS_REVIEW', true, false,
      jsonb_build_object(
        'block','G','lotNumber', r.lot_number,
        'source','Mapa oficial Fenasoja 2026 — PDF Mapa do Parque 300x200',
        'segmentId','industria-comercio-servicos',
        'seedManaged', true,
        'segmentCode','INDUSTRIA_COMERCIO_SERVICOS',
        'segmentName','Indústria, Comércio e Serviços',
        'sourceRevision','2026.4',
        'sourcePdfPolygon', r.pdf_polygon::jsonb,
        'buyerDataImported', false,
        'cartographicAreaOnly', true,
        'officialMeasurements', false,
        'officialLabelVerified', true,
        'cartographicConfidence','official_visual_reference',
        'parentPublicIdentifier','QUADRA-G',
        'officialAreaSqm', 168.00,
        'areaSource', v_source,
        'areaSourceRevision', v_revision,
        'areaValidationScope','CADASTRAL_DOCUMENT',
        'restoredFrom','Supressao historica por B40 (Espaco Institucional - Emater/Ascar), arquivado em 30/08/2026'),
      v_actor, v_actor, v_segment)
    RETURNING id INTO v_entity;

    INSERT INTO map_entity_geometries (
      project_id, entity_id, geometry, elevation, extrusion_height, rotation,
      calibration_version, version, is_current, change_reason, created_by)
    VALUES (
      v_project, v_entity,
      jsonb_build_object('type','Polygon','coordinates', jsonb_build_array(jsonb_build_array(
        jsonb_build_array(r.min_x, r.min_y), jsonb_build_array(r.max_x, r.min_y),
        jsonb_build_array(r.max_x, r.max_y), jsonb_build_array(r.min_x, r.max_y),
        jsonb_build_array(r.min_x, r.min_y)))),
      0, 0.13, 0, 1, 1, true,
      'Reabertura cadastral dos lotes 03/04 da Quadra G (revisao 2026.4-external-areas.1)', v_actor);

    INSERT INTO commercial_lots (
      project_id, entity_id, public_identifier, block, lot_number, display_name, description,
      status, official_area_sqm, calculated_area_sqm, area_validation_status,
      infrastructure, created_by, updated_by)
    VALUES (
      v_project, v_entity, r.identifier, 'G', r.lot_number, 'Lote ' || r.lot_number,
      'Unidade numerada da Quadra G conforme a planta oficial Fenasoja 2026.',
      'BLOCKED', 168.00, NULL, 'VALIDATED', '{}', v_actor, v_actor);

    v_created := v_created + 1;
  END LOOP;

  PERFORM public.ensure_commission_map_segments(v_project);

  RAISE NOTICE 'Lotes com area documental atualizada: %; lotes da Quadra G criados: %', v_updated, v_created;
END $$;