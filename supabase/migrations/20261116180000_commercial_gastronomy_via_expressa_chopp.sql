BEGIN;

-- The food points sell individually. D2 keeps its existing cartographic identity.
DO $seed$
DECLARE
  v_project constant uuid := '0538d132-34dd-4347-a33c-526edac7339c';
  v_workbook constant text := 'Sugestão COMERCIALIZAÇÃO PONTOS ALIMENTAÇÃO fenasoja 2028 - resumido (1).xlsx';
  v_segment uuid;
  v_layer uuid;
  v_d2 uuid;
  v_truck uuid;
  v_anchor uuid;
  v_point record;
  v_candidates uuid[];
  v_entity_id uuid;
  v_lot_id uuid;
  v_point_code text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('commercial-gastronomy-via-expressa-chopp-2028', 0));

  SELECT s.id INTO STRICT v_segment
    FROM public.map_segments s JOIN public.map_projects p ON p.id = s.project_id
   WHERE p.id = v_project AND NOT p.is_archived AND s.slug = 'gastronomia' AND s.is_active;

  SELECT e.id, e.layer_id INTO STRICT v_d2, v_layer
    FROM public.map_entities e
    JOIN public.map_layers layer ON layer.id = e.layer_id AND layer.project_id = e.project_id
    JOIN public.map_entity_geometries g ON g.entity_id = e.id AND g.project_id = e.project_id AND g.is_current
   WHERE e.project_id = v_project AND e.public_identifier = 'D2'
     AND e.classification = 'ATTRACTION' AND NOT e.is_sellable AND NOT e.is_archived
     AND layer.layer_key = 'structures';

  IF EXISTS (
    SELECT 1 FROM public.map_entities e
     WHERE e.project_id = v_project AND e.public_identifier <> 'GAST-CHOPP'
       AND NOT e.is_archived AND e.classification <> 'FOOD_POINT'
       AND lower(trim(e.name)) IN ('caminhão de chopp', 'caminhão chopp (novo)', 'caminhão de chope')
  ) OR EXISTS (
    SELECT 1 FROM public.commercial_lots l
     WHERE l.project_id = v_project AND l.public_identifier = 'GAST-CHOPP'
  ) THEN
    RAISE EXCEPTION 'GASTRONOMY_STRUCTURE_IDENTITY_CONFLICT:GAST-CHOPP';
  END IF;

  SELECT e.id INTO v_truck FROM public.map_entities e
   WHERE e.project_id = v_project AND e.public_identifier = 'GAST-CHOPP';
  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.map_entities e
      JOIN public.map_entity_geometries g ON g.entity_id = e.id AND g.project_id = e.project_id AND g.is_current
       WHERE e.id = v_truck AND e.classification = 'FOOD_AREA' AND e.layer_id = v_layer
         AND NOT e.is_sellable AND NOT e.is_archived AND e.parent_entity_id IS NULL AND e.segment_id IS NULL
         AND (e.metadata->>'structureModel' = 'chopp-truck'
              OR (e.metadata->>'structureModel' IS NULL AND e.name = 'Caminhão de Chopp'))
         AND NOT EXISTS (SELECT 1 FROM public.commercial_lots l WHERE l.entity_id = e.id)
    ) THEN
      RAISE EXCEPTION 'GASTRONOMY_STRUCTURE_IDENTITY_CONFLICT:GAST-CHOPP';
    END IF;
  ELSE
    INSERT INTO public.map_entities
      (project_id, layer_id, public_identifier, name, description, classification, verification_status, metadata)
    VALUES
      (v_project, v_layer, 'GAST-CHOPP', 'Caminhão de Chopp',
       'Veículo de atendimento junto à Via Expressa e ao Pavilhão 4.', 'FOOD_AREA', 'VERIFIED',
       '{"structureModel":"chopp-truck","source":"Implantação Via Expressa e Caminhão de Chopp · Fenasoja 2028","officialMeasurements":false}'::jsonb)
    RETURNING id INTO v_truck;

    -- Camera, selection and model use the same perimeter, including the open hatch.
    -- Elevation is relative to the park terrain. Dimensions are visual estimates in map units.
    INSERT INTO public.map_entity_geometries
      (project_id, entity_id, geometry, elevation, extrusion_height, rotation, change_reason)
    VALUES
      (v_project, v_truck,
       '{"type":"Polygon","coordinates":[[[10.339090909091,-10.445454595181],[12.439090909091,-10.445454595181],[12.439090909091,-9.365454595181],[10.339090909091,-9.365454595181],[10.339090909091,-10.445454595181]]]}'::jsonb,
       0, 0.96, 0, 'Implantação Fenasoja 2028 na faixa entre Via Expressa, Pavilhão 4 e Espaço Mirante');
  END IF;

  FOR v_point IN SELECT * FROM (VALUES
    ('D2', 'GAST-D2-01', 1, 'Ponto 01 · Crepes', 'Crepes', 20965.00, 14, 12, 'CREPS', 'VIA EXPRESSA - Ponto 1 - CREPS'),
    ('D2', 'GAST-D2-02', 2, 'Ponto 02 · Churros', 'Churros', 13100.00, 15, 13, 'CHURROS', 'VIA EXPRESSA - Ponto 2 - CHURROS'),
    ('D2', 'GAST-D2-03', 3, 'Ponto 03 · Sanduíche natural', 'Lanche', 7050.00, 16, 14, 'LANCHE', 'VIA EXPRESSA - Ponto 3 - SAND NATURAL'),
    ('D2', 'GAST-D2-04', 4, 'Ponto 04 · Sorvete', 'Sorvete', 8260.00, 17, 15, 'SORVETE', 'VIA EXPRESSA - Ponto 4 - SORV/MILK/ALG'),
    ('D2', 'GAST-D2-05', 5, 'Ponto 05 · Crepes', 'Crepes', 20965.00, 18, 16, 'CREPS', 'VIA EXPRESSA - Ponto 5 - CREPS'),
    ('D2', 'GAST-D2-06', 6, 'Ponto 06 · Churros', 'Churros', 13100.00, 19, 17, 'CHURROS', 'VIA EXPRESSA - Ponto 6 - CHURROS'),
    ('D2', 'GAST-D2-07', 7, 'Ponto 07 · Cocada', 'Cocada', 8018.00, 20, 18, 'COCADA', 'VIA EXPRESSA - Ponto 7 - COCADA'),
    ('D2', 'GAST-D2-08', 8, 'Ponto 08 · Espetinho', 'Espetinho', 12000.00, 21, 19, 'ESPETINHO', 'VIA EXPRESSA - Ponto 8 - ESPETINHO'),
    ('D2', 'GAST-D2-09', 9, 'Ponto 09 · Espetinho', 'Espetinho', 12000.00, 22, 20, 'ESPETINHO', 'VIA EXPRESSA - Ponto 9 - ESPETINHO'),
    ('D2', 'GAST-D2-10', 10, 'Ponto 10 · Morango com chocolate', 'Morango', 19150.00, 23, 21, 'MORANGO', 'VIA EXPRESSA - Ponto 10 - MORANGO C/CHOC'),
    ('D2', 'GAST-D2-11', 11, 'Ponto 11 · Crepes', 'Crepes', 21072.00, 24, 22, 'CREPS (gery)', 'VIA EXPRESSA - Ponto 11 - KREPS'),
    ('GAST-CHOPP', 'GAST-CHOPP-01', 1, 'CAMINHÃO CHOPP (NOVO)', 'Chope', 24500.00, 32, 30, NULL, 'CAMINHÃO CHOPP (NOVO)')
  ) AS initial(anchor_code, point_code, sort_order, display_name, food_type, price, source_row,
               source_number, raw_category, raw_label)
  LOOP
    v_anchor := CASE v_point.anchor_code WHEN 'D2' THEN v_d2 ELSE v_truck END;

    -- Match the persisted identifier or the same worksheet row. Flag competing
    -- children in the same position, including the other Ponto 1 from J11.
    SELECT array_agg(e.id) INTO v_candidates
      FROM public.map_entities e
      LEFT JOIN public.commercial_lots l ON l.entity_id = e.id AND l.project_id = e.project_id
     WHERE e.project_id = v_project AND (
       e.public_identifier = v_point.point_code OR l.public_identifier = v_point.point_code
       OR (l.price_source->>'sheet' = 'Plan1' AND l.price_source->>'cell' = 'J' || v_point.source_row
           AND l.price_source->>'workbook' IN (v_workbook, replace(v_workbook, ' (1)', '')))
       OR (e.parent_entity_id = v_anchor AND e.classification = 'FOOD_POINT'
           AND (l.display_order = v_point.sort_order OR (l.id IS NULL AND e.name = v_point.display_name)))
     );

    IF coalesce(cardinality(v_candidates), 0) > 1 THEN
      RAISE EXCEPTION 'GASTRONOMY_POINT_IDENTITY_CONFLICT:%', v_point.point_code;
    END IF;

    v_entity_id := v_candidates[1];
    IF v_entity_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.map_entities e
        LEFT JOIN public.commercial_lots l ON l.entity_id = e.id AND l.project_id = e.project_id
        WHERE e.id = v_entity_id AND e.parent_entity_id = v_anchor AND e.segment_id = v_segment
          AND e.classification = 'FOOD_POINT' AND e.is_sellable AND NOT e.is_archived
          AND NOT EXISTS (SELECT 1 FROM public.map_entity_geometries g WHERE g.entity_id = e.id)
          AND (
            (l.id IS NULL AND e.name = v_point.display_name)
            OR (l.public_identifier = e.public_identifier AND l.commercial_unit = 'FOOD_POINT'
                AND l.unit_quantity = 1 AND l.archived_at IS NULL AND l.display_order = v_point.sort_order
                AND (
                  (l.price_source->>'sheet' = 'Plan1' AND l.price_source->>'cell' = 'J' || v_point.source_row
                    AND l.price_source->>'workbook' IN (v_workbook, replace(v_workbook, ' (1)', '')))
                  OR (nullif(l.price_source->>'cell', '') IS NULL AND l.display_name = v_point.display_name
                    AND l.food_type = v_point.food_type)
                ))
          )
      ) THEN
        RAISE EXCEPTION 'GASTRONOMY_POINT_IDENTITY_CONFLICT:%', v_point.point_code;
      END IF;
      IF EXISTS (SELECT 1 FROM public.commercial_lots l WHERE l.entity_id = v_entity_id) THEN
        CONTINUE;
      END IF;
      SELECT e.public_identifier INTO STRICT v_point_code FROM public.map_entities e WHERE e.id = v_entity_id;
    ELSE
      v_point_code := v_point.point_code;
      INSERT INTO public.map_entities
        (project_id, layer_id, parent_entity_id, segment_id, public_identifier, name, classification, verification_status, is_sellable)
      VALUES
        (v_project, v_layer, v_anchor, v_segment, v_point.point_code, v_point.display_name, 'FOOD_POINT', 'VERIFIED', true)
      RETURNING id INTO v_entity_id;
    END IF;

    INSERT INTO public.commercial_lots
      (project_id, entity_id, public_identifier, display_name, status, commercial_unit, unit_quantity,
       display_order, food_type, price_source)
    VALUES
      (v_project, v_entity_id, v_point_code, v_point.display_name, 'AVAILABLE', 'FOOD_POINT', 1,
       v_point.sort_order, v_point.food_type, jsonb_strip_nulls(jsonb_build_object(
         'workbook', v_workbook, 'sheet', 'Plan1', 'cell', 'J' || v_point.source_row, 'column', 'TOTAL',
         'exercise', 2028, 'initialTotal', v_point.price, 'structure', v_point.anchor_code,
         'originalNumber', CASE WHEN v_point.anchor_code = 'D2' THEN v_point.sort_order END,
         'sourceNumber', v_point.source_number, 'originalLabel', v_point.raw_label,
         'labelCell', 'C' || v_point.source_row, 'originalCategory', v_point.raw_category,
         'categoryCell', (CASE WHEN v_point.raw_category IS NULL THEN 'C' ELSE 'B' END) || v_point.source_row)))
    RETURNING id INTO v_lot_id;

    INSERT INTO public.lot_prices (lot_id, pricing_mode, base_price, is_active)
    VALUES (v_lot_id, 'FIXED_TOTAL', v_point.price, true);
  END LOOP;
END $seed$;

COMMIT;
