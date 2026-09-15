CREATE OR REPLACE FUNCTION public.resolve_commission_map_segment_slug(_public_identifier text, _metadata jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN (
      upper(COALESCE(_public_identifier, ''))
        ~ '^B1-M(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-9])$'
      OR upper(COALESCE(_public_identifier, ''))
        ~ '^B2-M(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-6])$'
      OR upper(COALESCE(_public_identifier, ''))
        ~ '^B3-M(00[1-9]|0[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-7])$'
      OR upper(COALESCE(_public_identifier, ''))
        ~ '^B4-M(00[1-9]|0[1-9][0-9]|10[0-9]|11[0-4])$'
      OR upper(COALESCE(_public_identifier, ''))
        ~ '^B5-M(00[1-9]|0[1-9][0-9]|10[0-3])$'
      OR upper(COALESCE(_public_identifier, ''))
        ~ '^B6-M(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$'
      OR (
        upper(COALESCE(_public_identifier, '')) IN (
          '', replace(upper(COALESCE(_metadata->>'pavilionModuleKey', '')), ':MODULE:', '-M')
        )
        AND (
          (upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B1'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B1:MODULE:(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-9])$')
          OR (upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B2'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B2:MODULE:(00[1-9]|0[1-9][0-9]|1[0-7][0-9]|18[0-6])$')
          OR (upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B3'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B3:MODULE:(00[1-9]|0[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-7])$')
          OR (upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B4'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B4:MODULE:(00[1-9]|0[1-9][0-9]|10[0-9]|11[0-4])$')
          OR (upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B5'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B5:MODULE:(00[1-9]|0[1-9][0-9]|10[0-3])$')
          OR (upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B6'
            AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
              ~ '^B6:MODULE:(00[1-9]|0[1-9][0-9]|1[0-9]{2}|20[0-9]|21[0-4])$')
        )
      )
    ) THEN 'industria-comercio-servicos'
    WHEN (
      upper(COALESCE(_public_identifier, ''))
        ~ '^B8-M(00[1-9]|0[1-7][0-9]|08[01])$'
      OR (
        upper(COALESCE(_public_identifier, '')) IN (
          '', replace(upper(COALESCE(_metadata->>'pavilionModuleKey', '')), ':MODULE:', '-M')
        )
        AND upper(COALESCE(_metadata->>'pavilionPublicIdentifier', '')) = 'B8'
        AND upper(COALESCE(_metadata->>'pavilionModuleKey', ''))
          ~ '^B8:MODULE:(00[1-9]|0[1-7][0-9]|08[01])$'
      )
    ) THEN NULL
    WHEN upper(COALESCE(_public_identifier, '')) = ANY (ARRAY[
      'B35', 'B36', 'D6-01', 'D6-02', 'D6-03'
    ]) THEN NULL
    WHEN upper(COALESCE(_public_identifier, '')) <> ALL (ARRAY['B7', 'B8', 'D3'])
      AND (
        upper(COALESCE(_public_identifier, '')) IN (
          'EXPORURAL', 'QUADRA-R', 'QUADRA-S',
          'RUA-BRUNO-SCHWARTZ', 'RUA-JOHAN-MULLER', 'RUA-GUSTAVO-BESSEL',
          'RUA-15-NOVEMBRO', 'RUA-EMANUEL-BRACHMANN',
          'RUA-PASTOR-ALBERT-LEHENBAUER', 'RUA-UBIRETAMA',
          'B37', 'B38', 'C4', 'E-01', 'E-02', 'E-06'
        )
        OR upper(COALESCE(_public_identifier, '')) ~ '^Q-[RS]-[0-9]{2}$'
        OR upper(COALESCE(_metadata->>'block', '')) IN ('R', 'S')
        OR upper(COALESCE(_metadata->>'areaCode', '')) = 'EXPORURAL'
      )
    THEN 'exporural'
    WHEN upper(COALESCE(_public_identifier, '')) <> ALL (ARRAY[
      'QUADRA-N', 'B7', 'B28', 'D4',
      'QUADRA-C', 'QUADRA-B', 'QUADRA-A', 'C1',
      'B11', 'B12', 'B13', 'B14', 'B15', 'B18', 'B21',
      'B25', 'B26', 'B27', 'B30', 'B31', 'B32', 'B42-02',
      'G', 'B8', 'B9', 'B10', 'B39'
    ])
      AND (
        upper(COALESCE(_public_identifier, '')) IN (
          'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
          'B16', 'B17', 'B19', 'B23', 'B24', 'B33', 'B34', 'B40', 'B41',
          'C2', 'C3', 'D1', 'D2', 'D3',
          'E-18', 'E-19', 'E-20', 'E-22', 'E-23', 'E-24',
          'RUA-URUGUAI', 'RUA-MONTEVIDEU', 'CALCADA-ARVOREDO'
        )
        OR upper(COALESCE(_public_identifier, '')) ~ '^QUADRA-(M|G|L|F|J|E|I|D)$'
        OR upper(COALESCE(_public_identifier, '')) ~ '^Q-(M|G|L|F|J|E|I|D)-[0-9]{2}$'
        OR upper(COALESCE(_metadata->>'block', '')) IN ('M', 'G', 'L', 'F', 'J', 'E', 'I', 'D')
      )
    THEN 'industria-comercio-servicos'
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_commission_map_segments(_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.map_projects WHERE id = _project_id) THEN
    RAISE EXCEPTION 'MAP_PROJECT_NOT_FOUND';
  END IF;

  INSERT INTO public.map_segments (
    project_id, slug, name, display_name, source_reference, boundary_data,
    camera_config, visual_config, required_capability
  )
  VALUES
    (
      _project_id,
      'exporural',
      'Exporural',
      'Exporural',
      'Perímetro cadastral oficial Exporural 2026.4',
      '{"resolution":"explicit-entity-union","expectedEntityCount":111,"expectedLotCount":95,"blockIdentifiers":["QUADRA-R","QUADRA-S"],"perimeter":["Rua Ubiretama","Rua Bruno Schwartz","Rua Gustavo Bessel","Rua Emanuel Brachmann"],"excludedIdentifiers":["B7","B8","D3","B35","B36","D6-01","D6-02","D6-03"]}'::jsonb
        || jsonb_build_object('lineageBaselineAt', transaction_timestamp()),
      '{"direction":[0.62,0.72,0.46],"padding":1.08,"minDistanceRatio":0.12,"maxDistanceRatio":2.2,"bounds":{"minX":-2.9,"maxX":57.8,"minZ":-37.6,"maxZ":-7.7}}'::jsonb,
      '{"surface":"#657F3F","edge":"#405527","accent":"#A8BE72","foreground":"#1F2C16"}'::jsonb,
      'exporural_access'
    ),
    (
      _project_id,
      'industria-comercio-servicos',
      'Indústria, Comércio e Serviços',
      'Indústria, Comércio e Serviços',
      'Plantas oficiais dos Pavilhões 1, 3, 5, 8, 12, 13 e 14 — Fenasoja 2026',
      '{"resolution":"explicit-entity-union","expectedEntityCount":1205,"expectedLotCount":1168,"blockIdentifiers":["QUADRA-M","QUADRA-G","QUADRA-L","QUADRA-F","QUADRA-J","QUADRA-E","QUADRA-I","QUADRA-D"],"excludedIdentifiers":["QUADRA-N","B7","B28","D4","QUADRA-C","QUADRA-B","QUADRA-A","C1","B11","B12","B13","B14","B15","B18","B21","B25","B26","B27","B30","B31","B32","B42-02","G","B8","B9","B10","B39"]}'::jsonb
        || jsonb_build_object('lineageBaselineAt', transaction_timestamp()),
      '{"direction":[0.58,0.7,0.64],"padding":1.12,"minDistanceRatio":0.1,"maxDistanceRatio":2.05,"bounds":{"minX":-24.4582,"maxX":16.3636,"minZ":-11.6727,"maxZ":25.4182}}'::jsonb,
      '{"surface":"#347786","edge":"#173F4A","accent":"#70A9B4","foreground":"#10292F"}'::jsonb,
      'industria_comercio_servicos_access'
    )
  ON CONFLICT (project_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    source_reference = EXCLUDED.source_reference,
    boundary_data = EXCLUDED.boundary_data || jsonb_build_object(
      'lineageBaselineAt', COALESCE(
        map_segments.boundary_data->'lineageBaselineAt',
        EXCLUDED.boundary_data->'lineageBaselineAt'
      )
    ),
    camera_config = EXCLUDED.camera_config,
    visual_config = EXCLUDED.visual_config,
    required_capability = EXCLUDED.required_capability,
    is_active = true;
END;
$function$;

DO $mig$
DECLARE
  v_project uuid := '0538d132-34dd-4347-a33c-526edac7339c';
  v_layer uuid;
  v_parent uuid;
  v_road uuid;
  v_entity uuid;
  r record;
  v_conflict int;
BEGIN
  SELECT id INTO v_road FROM public.map_entities
   WHERE project_id = v_project AND public_identifier = 'RUA-INTERNA-QUADRA-G' AND is_archived = false;

  IF v_road IS NOT NULL THEN
    UPDATE public.map_entities
       SET is_archived = true,
           metadata = metadata || jsonb_build_object(
             'archivedReason', 'Via inexistente na planta oficial A1; coluna central da Quadra G devolvida aos lotes 03 e 04.',
             'archivedRevision', '2026.4-external-areas.2',
             'archivedAt', to_char(now(), 'YYYY-MM-DD')),
           updated_at = now()
     WHERE id = v_road;
    UPDATE public.map_entity_geometries SET is_current = false WHERE entity_id = v_road AND is_current = true;
  END IF;

  SELECT layer_id, parent_entity_id INTO v_layer, v_parent
    FROM public.map_entities
   WHERE project_id = v_project AND public_identifier = 'Q-G-05';

  FOR r IN
    SELECT * FROM (VALUES
      ('Q-G-03','03', 4.460727272727269::numeric, -5.281090935602414::numeric, 5.902909090909105::numeric, -3.0207272878915603::numeric,
       '[[3554.45, 2732.95], [3620.55, 2732.95], [3620.55, 2836.55], [3554.45, 2836.55]]'::jsonb),
      ('Q-G-04','04', 4.460727272727269::numeric, -7.60472731090362::numeric, 5.902909090909105::numeric, -5.344363663192766::numeric,
       '[[3554.45, 2626.45], [3620.55, 2626.45], [3620.55, 2730.05], [3554.45, 2730.05]]'::jsonb)
    ) AS t(ident, lotnum, min_x, min_y, max_x, max_y, pdf)
  LOOP
    SELECT count(*) INTO v_conflict
      FROM public.map_entities e
      JOIN public.map_entity_geometries g ON g.entity_id = e.id AND g.is_current
     WHERE e.project_id = v_project
       AND e.is_archived = false
       AND e.classification NOT IN ('QUADRA','GREEN_AREA')
       AND e.public_identifier <> r.ident
       AND extensions.ST_Intersects(
             g.native_geometry,
             extensions.ST_MakeEnvelope(r.min_x, r.min_y, r.max_x, r.max_y, 0))
       AND extensions.ST_Area(extensions.ST_Intersection(
             g.native_geometry,
             extensions.ST_MakeEnvelope(r.min_x, r.min_y, r.max_x, r.max_y, 0))) > 0.05;

    IF v_conflict > 0 THEN
      RAISE EXCEPTION 'OCUPACAO_ATIVA_NO_VAO_%: % entidades', r.ident, v_conflict;
    END IF;

    SELECT id INTO v_entity FROM public.map_entities
     WHERE project_id = v_project AND public_identifier = r.ident;

    IF v_entity IS NULL THEN
      INSERT INTO public.map_entities (
        project_id, layer_id, parent_entity_id, public_identifier, name, description,
        classification, verification_status, is_sellable, is_archived, metadata
      ) VALUES (
        v_project, v_layer, v_parent, r.ident, 'Lote ' || r.lotnum, '',
        'SELLABLE_LOT', 'NEEDS_REVIEW', true, false,
        jsonb_build_object(
          'block','G','lotNumber', r.lotnum,
          'source','Mapa oficial Fenasoja 2026 — PDF Mapa do Parque 300x200',
          'segmentId','industria-comercio-servicos',
          'segmentCode','INDUSTRIA_COMERCIO_SERVICOS',
          'segmentName','Indústria, Comércio e Serviços',
          'areaSource','A1 - Fenasoja - Parque - Lotes sem imagem.pdf, p.1',
          'areaSourceRevision','2026.4-external-areas.2',
          'areaValidationScope','CADASTRAL_DOCUMENT',
          'officialAreaSqm', 168.00,
          'previousOfficialAreaSqm', NULL,
          'cartographicAreaOnly', true,
          'officialMeasurements', false,
          'officialLabelVerified', true,
          'cartographicConfidence','official_visual_reference',
          'seedManaged', true,
          'sourceRevision','2026.4',
          'sourcePdfPolygon', r.pdf,
          'buyerDataImported', false,
          'parentPublicIdentifier','QUADRA-G',
          'restoredFrom', jsonb_build_object(
            'reason','B40 (Emater/Ascar) ocupou a coluna central até 30/08/2026; em seguida a Rua Interna da Quadra G, removida em 2026.4 por não constar da planta oficial.',
            'revision','2026.4-external-areas.2')
        )
      ) RETURNING id INTO v_entity;

      INSERT INTO public.map_entity_geometries (
        project_id, entity_id, geometry, elevation, extrusion_height, rotation,
        calibration_version, version, is_current, change_reason
      ) VALUES (
        v_project, v_entity,
        jsonb_build_object('type','Polygon','coordinates', jsonb_build_array(jsonb_build_array(
          jsonb_build_array(r.min_x, r.min_y), jsonb_build_array(r.max_x, r.min_y),
          jsonb_build_array(r.max_x, r.max_y), jsonb_build_array(r.min_x, r.max_y),
          jsonb_build_array(r.min_x, r.min_y)))),
        0, 0.13, 0, 1, 1, true,
        'Restauração cartográfica 2026.4: remoção da Rua Interna da Quadra G e retorno dos lotes 03/04'
      );
    END IF;

    INSERT INTO public.commercial_lots (
      project_id, entity_id, public_identifier, block, lot_number, level_label,
      display_name, description, status, official_area_sqm, area_validation_status
    ) VALUES (
      v_project, v_entity, r.ident, 'G', r.lotnum, '',
      'Lote ' || r.lotnum,
      'Unidade numerada da Quadra G conforme a planta oficial Fenasoja 2026.',
      'BLOCKED', 168.00, 'VALIDATED'
    )
    ON CONFLICT (entity_id) DO UPDATE SET
      official_area_sqm = 168.00,
      area_validation_status = 'VALIDATED',
      updated_at = now();
  END LOOP;

  PERFORM public.ensure_commission_map_segments(v_project);
END;
$mig$;