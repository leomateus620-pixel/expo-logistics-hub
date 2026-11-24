BEGIN;

-- Plan1, coluna TOTAL. As posições são da cena oficial em coordenadas X/Y/Z.
-- A unidade comercial mantém o próprio UUID e usa a estrutura só como vínculo.
DO $seed$
DECLARE
  v_project constant uuid := '0538d132-34dd-4347-a33c-526edac7339c';
  v_workbook constant text := 'Sugestão COMERCIALIZAÇÃO PONTOS ALIMENTAÇÃO fenasoja 2028 - resumido (2).xlsx';
  v_workbook_family constant text := 'sugestão comercialização pontos alimentação fenasoja 2028 - resumido.xlsx';
  v_segment uuid;
  v_point record;
  v_anchor public.map_entities%ROWTYPE;
  v_entity public.map_entities%ROWTYPE;
  v_lot public.commercial_lots%ROWTYPE;
  v_price public.lot_prices%ROWTYPE;
  v_candidate_ids uuid[];
  v_candidate_details jsonb;
  v_source jsonb;
  v_workbook_matches boolean;
  v_input_number text;
  v_source_matches boolean;
  v_metadata jsonb;
  v_keywords jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('commercial-gastronomy-site-points-2028', 0));

  SELECT s.id INTO STRICT v_segment
    FROM public.map_segments s JOIN public.map_projects p ON p.id = s.project_id
   WHERE p.id = v_project AND NOT p.is_archived AND s.slug = 'gastronomia' AND s.is_active;

  FOR v_point IN SELECT * FROM (VALUES
    ('D2', 'ATTRACTION', NULL::text, 1, 'Via Expressa · Ponto 1 · Sorvete', 'SORVETE',
      10680.00, 11, 9, 'VIA EXPRESSA - ponto 1 - SORVETE', NULL::jsonb, true),
    ('J', 'ATTRACTION', 'GAST-J-01', 1, 'Parque de Diversões · Pipo/Maçã/Crepes/Alg', 'Pipo/Maçã/Crepes/Alg',
      19040.00, 35, 33, 'PARQUE DE DIVERSÕES', '[-39.2,0.11,-9.0]', false),
    ('J', 'ATTRACTION', 'GAST-J-02', 2, 'Parque de Diversões · Lanches/Bebidas', 'Lanches/Bebidas',
      22560.00, 36, 34, 'PARQUE DE DIVERSÕES', '[-39.2,0.11,-5.1]', false),
    ('J', 'ATTRACTION', 'GAST-J-03', 3, 'Parque de Diversões · Sorvete', 'SORVETE',
      10680.00, 37, 35, 'PARQUE DE DIVERSÕES', '[-39.2,0.11,-1.25]', false),
    ('B1', 'PAVILION', 'GAST-B1-01', 1, 'Ponto 12 · Morango com chocolate', 'MORANGO',
      17500.00, 25, 23, 'PONTO 12 - morango c/ choc. - ao lado Pav. 1', '[-16.75,0.055,17.32]', false),
    ('B3', 'PAVILION', 'GAST-B3-01', 1, 'Ponto Sanduíche · Lanche', 'LANCHE',
      14915.00, 10, 8, 'PONTO SANDUÍCHE - entre pav.8 e 12 ', '[-4.16,0.04,18.34]', false),
    ('D1', 'FOOD_AREA', 'GAST-D1-03', 3, 'Balão · Ponto 1 (Lateral Alameda)', NULL,
      2815.00, 13, 11, 'BALÃO - ponto 1 (Lateral Alameda)', '[12.58,0.04,0.3]', false),
    ('CALCADA-ARVOREDO', 'PEDESTRIAN_PATH', 'GAST-ARVOREDO-02', 1, 'SORVETES – ponto 2 – Arvoredo', 'SORVETE',
      10680.00, 12, 10, 'SORVETES - ponto 2 - Arvoredo', '[-15.06,0.064,9.45]', false),
    ('D5', 'LIVESTOCK_AREA', 'GAST-D5-01', 1, 'Cavalo Crioulo – Ponto de Alimentação', 'Hamburger, Bifê',
      23107.00, 31, 29, 'PRIMUS / NCCCrioulos', '"structure-roof"', false)
  ) AS target(anchor_code, anchor_kind, point_code, sort_order, display_name, category, price, source_row,
              source_number, raw_label, marker_position, correction_only)
  LOOP
    SELECT a.* INTO STRICT v_anchor
      FROM public.map_entities a
      JOIN public.map_entity_geometries g ON g.entity_id = a.id AND g.project_id = a.project_id AND g.is_current
     WHERE a.project_id = v_project AND a.public_identifier = v_point.anchor_code
       AND a.classification = v_point.anchor_kind AND NOT a.is_sellable AND NOT a.is_archived;

    -- Use the worksheet address and the number from column A. The older D2
    -- import stores its local sequence in originalNumber and column A in sourceNumber.
    SELECT array_agg(e.id ORDER BY e.id),
           jsonb_agg(jsonb_build_object('entity', e.id, 'lot', l.id, 'code', e.public_identifier,
             'parent', a.public_identifier, 'cell', l.price_source->>'cell',
             'number', coalesce(l.price_source->>'sourceNumber', l.price_source->>'originalNumber'),
             'category', l.food_type))
      INTO v_candidate_ids, v_candidate_details
      FROM public.map_entities e
      LEFT JOIN public.commercial_lots l ON l.entity_id = e.id AND l.project_id = e.project_id
      LEFT JOIN public.map_entities a ON a.id = e.parent_entity_id
     WHERE e.project_id = v_project AND (
       v_point.point_code IN (e.public_identifier, l.public_identifier)
       OR (
         lower(regexp_replace(normalize(trim(l.price_source->>'workbook'), NFD),
           '[[:space:]]*[(][0-9]+[)][.]xlsx$', '.xlsx', 'i')) = normalize(v_workbook_family, NFD)
         AND lower(trim(l.price_source->>'sheet')) = 'plan1'
         AND (upper(trim(l.price_source->>'cell')) = 'J' || v_point.source_row
           OR coalesce(l.price_source->>'sourceNumber',
             CASE WHEN nullif(l.price_source->>'cell', '') IS NULL THEN l.price_source->>'originalNumber' END)
             = v_point.source_number::text)
       )
       OR ((e.classification = 'FOOD_POINT' OR l.commercial_unit = 'FOOD_POINT') AND (
         lower(trim(v_point.display_name)) IN (lower(trim(e.name)), lower(trim(l.display_name)))
         OR (lower(trim(v_point.raw_label)) IN (lower(trim(e.name)), lower(trim(l.display_name)))
             AND (v_point.anchor_code <> 'J' OR lower(trim(l.food_type)) = lower(trim(v_point.category))))
         OR (v_point.correction_only AND a.public_identifier IN ('D2', 'CALCADA-ARVOREDO')
           AND lower(trim(l.food_type)) = 'sorvete'
           AND concat_ws(' ', e.name, l.display_name) ~* 'ponto[[:space:]]+0?1\M')
       ))
     );

    IF cardinality(v_candidate_ids) > 1 THEN
      RAISE EXCEPTION 'GASTRONOMY_POINT_IDENTITY_CONFLICT:J% candidates=%', v_point.source_row, v_candidate_details;
    END IF;

    IF v_candidate_ids IS NULL THEN
      IF v_point.correction_only THEN CONTINUE; END IF;
      INSERT INTO public.map_entities
        (project_id, layer_id, parent_entity_id, segment_id, public_identifier, name, classification,
         verification_status, is_sellable, metadata)
      VALUES (v_project, v_anchor.layer_id, v_anchor.id, v_segment, v_point.point_code, v_point.display_name,
        'FOOD_POINT', 'VERIFIED', true, jsonb_build_object('gastronomyMarkerPosition', v_point.marker_position,
          'searchKeywords', jsonb_build_array(v_point.raw_label)))
      RETURNING * INTO v_entity;
      v_lot := NULL;
    ELSE
      SELECT * INTO STRICT v_entity FROM public.map_entities WHERE id = v_candidate_ids[1] FOR UPDATE;
      SELECT * INTO v_lot FROM public.commercial_lots WHERE entity_id = v_entity.id FOR UPDATE;
      v_source := coalesce(v_lot.price_source, '{}'::jsonb);
      v_workbook_matches := lower(regexp_replace(normalize(trim(v_source->>'workbook'), NFD),
        '[[:space:]]*[(][0-9]+[)][.]xlsx$', '.xlsx', 'i')) = normalize(v_workbook_family, NFD);
      v_input_number := coalesce(v_source->>'sourceNumber', v_source->>'originalNumber');
      v_source_matches := v_workbook_matches AND lower(trim(v_source->>'sheet')) = 'plan1'
        AND (upper(trim(v_source->>'cell')) = 'J' || v_point.source_row
          OR (nullif(v_source->>'cell', '') IS NULL AND v_input_number = v_point.source_number::text))
        AND coalesce(v_input_number, v_point.source_number::text) = v_point.source_number::text
        AND coalesce(v_source->>'exercise', '2028') = '2028'
        AND coalesce(lower(trim(v_source->>'originalLabel')), lower(trim(v_point.raw_label))) = lower(trim(v_point.raw_label))
        AND coalesce(lower(trim(v_source->>'originalCategory')), lower(trim(v_point.category)))
          IS NOT DISTINCT FROM lower(trim(v_point.category));

      IF v_entity.classification <> 'FOOD_POINT' OR NOT v_entity.is_sellable OR v_entity.is_archived
        OR EXISTS (SELECT 1 FROM public.map_entity_geometries WHERE entity_id = v_entity.id)
        OR (v_lot.id IS NOT NULL AND (
          v_lot.project_id <> v_project OR v_lot.public_identifier <> v_entity.public_identifier
          OR v_lot.commercial_unit <> 'FOOD_POINT' OR v_lot.unit_quantity IS DISTINCT FROM 1
          OR v_lot.archived_at IS NOT NULL
          OR (v_lot.food_type IS NOT NULL AND lower(trim(v_lot.food_type)) IS DISTINCT FROM lower(trim(v_point.category)))
        ))
        OR NOT (
          coalesce(v_source_matches, false)
          OR (NOT v_point.correction_only AND v_source = '{}'::jsonb AND v_entity.parent_entity_id = v_anchor.id
            AND lower(trim(v_entity.name)) IN (lower(trim(v_point.display_name)), lower(trim(v_point.raw_label)))
            AND (v_point.anchor_code <> 'J' OR v_entity.public_identifier = v_point.point_code
              OR lower(trim(v_lot.food_type)) = lower(trim(v_point.category))))
        )
      THEN
        RAISE EXCEPTION 'GASTRONOMY_POINT_IDENTITY_CONFLICT:J% candidates=%', v_point.source_row, v_candidate_details;
      END IF;

      IF v_point.correction_only THEN
        IF v_entity.parent_entity_id = v_anchor.id THEN CONTINUE; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.map_entities a
          WHERE a.id = v_entity.parent_entity_id AND a.project_id = v_project
            AND a.public_identifier = 'CALCADA-ARVOREDO') THEN
          RAISE EXCEPTION 'GASTRONOMY_POINT_IDENTITY_CONFLICT:J% candidates=%', v_point.source_row, v_candidate_details;
        END IF;
        UPDATE public.map_entities
           SET parent_entity_id = v_anchor.id, layer_id = v_anchor.layer_id, segment_id = v_segment,
               metadata = metadata - 'gastronomyMarkerPosition'
         WHERE id = v_entity.id;
        CONTINUE;
      END IF;

      v_keywords := CASE WHEN jsonb_typeof(v_entity.metadata->'searchKeywords') = 'array'
        THEN v_entity.metadata->'searchKeywords' ELSE '[]'::jsonb END;
      IF NOT (v_keywords ? v_point.raw_label) THEN
        v_keywords := v_keywords || jsonb_build_array(v_point.raw_label);
      END IF;
      v_metadata := v_entity.metadata || jsonb_build_object(
        'gastronomyMarkerPosition', v_point.marker_position, 'searchKeywords', v_keywords);
      UPDATE public.map_entities
         SET parent_entity_id = v_anchor.id, layer_id = v_anchor.layer_id, segment_id = v_segment,
             name = v_point.display_name, metadata = v_metadata
       WHERE id = v_entity.id AND (parent_entity_id, layer_id, segment_id, name, metadata)
         IS DISTINCT FROM (v_anchor.id, v_anchor.layer_id, v_segment, v_point.display_name, v_metadata);
    END IF;

    v_source := coalesce(v_lot.price_source, '{}'::jsonb) || jsonb_build_object(
      'exercise', 2028, 'workbook', coalesce(v_lot.price_source->>'workbook', v_workbook), 'sheet', 'Plan1',
      'cell', 'J' || v_point.source_row, 'column', 'TOTAL', 'structure', v_point.anchor_code,
      'sourceNumber', v_point.source_number, 'originalNumber', v_point.source_number, 'numberCell', 'A' || v_point.source_row,
      'originalLabel', v_point.raw_label, 'labelCell', 'C' || v_point.source_row,
      'originalCategory', v_point.category, 'categoryCell', 'B' || v_point.source_row, 'initialTotal', v_point.price);
    IF v_lot.id IS NULL THEN
      INSERT INTO public.commercial_lots
        (project_id, entity_id, public_identifier, display_name, status, commercial_unit, unit_quantity,
         display_order, food_type, price_source)
      VALUES (v_project, v_entity.id, v_entity.public_identifier, v_point.display_name, 'AVAILABLE',
        'FOOD_POINT', 1, v_point.sort_order, v_point.category, v_source)
      RETURNING * INTO v_lot;
    ELSE
      UPDATE public.commercial_lots
         SET price_source = v_source, display_name = v_point.display_name, food_type = v_point.category
       WHERE id = v_lot.id AND (price_source, display_name, food_type)
         IS DISTINCT FROM (v_source, v_point.display_name, v_point.category);
    END IF;

    SELECT * INTO v_price FROM public.lot_prices WHERE lot_id = v_lot.id AND is_active FOR UPDATE;
    IF FOUND THEN
      IF v_price.pricing_mode <> 'FIXED_TOTAL' OR coalesce(v_price.base_price, 0) <= 0 OR v_price.price_per_sqm IS NOT NULL THEN
        RAISE EXCEPTION 'GASTRONOMY_POINT_PRICE_CONFLICT:J% lot=% price=%', v_point.source_row, v_lot.id, v_price.id;
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM public.lot_prices WHERE lot_id = v_lot.id) THEN
        RAISE EXCEPTION 'GASTRONOMY_POINT_INACTIVE_PRICE_HISTORY:J% lot=%', v_point.source_row, v_lot.id;
      END IF;
      INSERT INTO public.lot_prices (lot_id, pricing_mode, base_price, is_active)
      VALUES (v_lot.id, 'FIXED_TOTAL', v_point.price, true);
    END IF;
  END LOOP;
END $seed$;

COMMIT;
